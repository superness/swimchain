/**
 * The fold: an ordered log becomes a world.
 *
 * Presence is last-write-wins per swimmer with a TTL, so a shoal of twenty
 * folds to twenty rows no matter how long the session has run. Size folds from
 * durable eat-claims, which credit only when the deterministic bloom map had
 * food there and the claimant was not taken by the covering sweep — so being
 * scattered costs zero writes. The world simply stops crediting a fish that was
 * out alone.
 */
import { reckon } from './fixed';
import { epochOf, epochStartMs, epochEndMs, epochWarmStartMs } from './epoch';
import { type Body } from './shelter';
import { stepTension, topContributor, outsideCore } from './tension';
import { shouldStartHush, isResolveTick, selectTaken } from './sweep';
import { markVisits, canEat, isBloomReady, stampVisit } from './bloom';
import type { LogEntry, ShoalState, Checkpoint, ReadonlyVisitMap } from './shoalTypes';
import { checkpointFrom } from './checkpoint';
import {
  TICK_MS, PRESENCE_TTL_MS, START_SIZE, MIN_SIZE, BITE_GROWTH, SCATTER_COST,
  HUNGER_TICK_INTERVAL, HUNGER_AMOUNT, BLOOM_BITES, VOID_WINDOW_MS, LOCK_MS,
  MAX_FOLD_TICKS, WARMUP_MS,
} from './shoalConst';

/**
 * A cell absent from `lastVisit` already reads as ready ("the sea starts
 * full" — see bloom.ts's isBloomReady). Passing this empty, frozen map in
 * place of the real `lastVisit` is an honest way to tell canEat "readiness
 * for this cell is already settled (it latched), don't re-run the fallow
 * test" without touching canEat's signature or lying about real visit data.
 *
 * INVARIANT: this Map is EMPTY FOREVER. It is a module-level singleton shared
 * by every fold in the process, so a single `.set` on it would silently
 * poison every latched-bloom check everywhere — including in another client's
 * fold running in the same page. The `ReadonlyMap` type is the whole
 * enforcement: `Map`'s mutators are simply not on that interface, so nothing
 * can write to it through this binding, and nothing else in this file ever
 * aliases it into a mutable position (it is only ever passed as canEat's
 * `lastVisit`, which is itself declared `ReadonlyMap`). Stated rather than
 * assumed, matching the "copied, not aliased" notes elsewhere in this file —
 * a frozen empty Map cannot be expressed in TypeScript any more strongly than
 * this, so the invariant has to live in a comment.
 */
const NEVER_VISITED: ReadonlyVisitMap = new Map();

/**
 * Total order over the log: authoring ms, then content hash.
 *
 * The hash tiebreak is not decoration. Two writes can share a millisecond, and
 * without a total order two clients sort them differently and diverge.
 */
export function orderLog(entries: readonly LogEntry[]): LogEntry[] {
  return entries.slice().sort((a, b) => {
    if (a.ms !== b.ms) return a.ms - b.ms;
    return a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0;
  });
}

/**
 * A world with nobody in it, starting at `startMs`.
 *
 * `epoch` defaults to the epoch `startMs` falls in, which is right for every
 * caller EXCEPT one: a fold begins ticking at `epochWarmStartMs(e)`, which is
 * in epoch `e - 1` by construction (spec 3.9 point 3's warm-up replay), while
 * the state it builds is folding epoch `e`. `state.epoch` must name the epoch
 * being folded, not the epoch the first tick happens to land in, so that path
 * passes it explicitly.
 */
export function emptyState(startMs: number, epoch = epochOf(startMs)): ShoalState {
  return {
    epoch,
    nowMs: startMs,
    fish: new Map(),
    departed: new Map(),
    tension: 0,
    hushStartMs: -1,
    lockedPositions: null,
    lockedPreferred: null,
    lastTaken: [],
    lastSweepMs: -1,
    lastVisit: new Map(),
    bitesTaken: new Map(),
    bloomSinceMs: new Map(),
    cursor: 0,
    outsideTicks: new Map(),
    tickCount: 0,
    touchedIds: new Set(),
  };
}

/** Live fish as bodies, sorted by id so every caller sees the same order. */
export function bodiesOf(state: ShoalState): Body[] {
  const out: Body[] = [];
  for (const f of state.fish.values()) out.push({ id: f.id, x: f.x, y: f.y, size: f.size });
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function clampSize(n: number): number {
  return n < MIN_SIZE ? MIN_SIZE : n;
}

/**
 * Advance `state` by exactly one TICK_MS: apply every log entry authored at
 * or before the new tick, then run the same tension/hush/bloom/hunger
 * machinery `foldShoal` used to run inline in its own loop.
 *
 * The tick is fixed rather than event-driven because hunger, tension and the
 * hush all advance with time, not with writes — an idle sea still gets
 * hungry and still calms down.
 *
 * `foldShoal` is defined as a loop over this function (see below) so the two
 * can never drift apart: there is exactly one tick body in this file.
 *
 * THE STEP ORDER, and exactly how much of it is actually pinned. An earlier
 * version of this comment claimed two things that were not true; both are
 * corrected here rather than deleted, because the false versions are the ones
 * a reader would otherwise reconstruct.
 *
 *  - Step 1 (apply entries) before steps 2 and 3 IS observable, but not for
 *    the reason once given. The old rationale was that a same-tick eat claim
 *    would otherwise be judged against a stale position; that stopped being
 *    true when the eat branch started computing `claimedAt = reckon(f.vec,
 *    e.ms)` explicitly, which no longer depends on when `f.x/f.y` were last
 *    written. What the order still decides is membership: a presence write
 *    applied in step 1 puts its swimmer into `bodies`, so it marks bloom
 *    cells (step 3), counts toward the median and the spread (step 4) and
 *    can be swept (step 5) on the very tick it arrives — and step 1 running
 *    before step 3's `markVisits` is what lets a bite land on a cell that is
 *    still genuinely fallow, which several tests in shoalEngine.test.ts turn
 *    on directly.
 *  - Step 5 (the hush) before step 6 (hunger) is NOT observable at the
 *    current CONSENSUS constants, and no test can pin it. The two steps share
 *    exactly one piece of state, `f.size`, and every mutation either makes to
 *    it is a clamped subtraction against the same floor —
 *    `max(max(x-a, F) - b, F) = max(x-a-b, F) = max(max(x-b, F) - a, F)` for
 *    any positive a, b — so scatter, void and hunger commute however they are
 *    arranged, including when `clampSize` binds. `lockedPositions`, the one
 *    place a size is copied for later use, is built from `bodies`, which is
 *    snapshotted back at step 2, before either step. This was verified by
 *    actually performing the swap: the whole suite still passes. See
 *    shoalEngine.test.ts's "Scatter, void and hunger on ONE tick" section,
 *    which states the proof and pins the commutativity itself, so that a
 *    future size mutation which is NOT a plain clamped subtraction (a
 *    percentage scatter, a different floor, a multiplier) makes the ordering
 *    observable again and fails there.
 *
 * Do not reorder any of them regardless: the order is CONSENSUS, and "no
 * current test can see the difference" is a fact about today's constants, not
 * a licence.
 *
 * `ordered` MUST ALREADY BE `orderLog(entries)`, and MUST be the same log —
 * same content, same order — across every `foldTick` call within one fold;
 * see `cursor`'s doc in shoalTypes.ts for why (a caller that re-applies an
 * already-applied entry silently double-credits its bite). `foldShoal` sorts
 * once and hands the identical array to every call for exactly this reason.
 * An incremental caller (the shell) whose log grows between calls is safe as
 * long as growth is append-only relative to what has already been folded, and
 * re-sorts once per append rather than once per tick.
 *
 * Sorting here instead was measured at 18 ms of 29 ms for an 801-tick fold
 * over a 2_000-entry log — a full epoch would be ~0.3 s of pure sorting and
 * 14_400 throwaway arrays, scaling with log length, which undercuts the
 * entire reason `foldTick` exists (a shell re-sorting the whole epoch on
 * every frame).
 */
export function foldTick(state: ShoalState, ordered: readonly LogEntry[]): ShoalState {
  const log = ordered;
  const t = state.nowMs;

  // A fold covers exactly one epoch (spec 3.9). Ticking past its end would
  // keep accumulating into a state whose `epoch` no longer describes it: no
  // checkpoint would ever be taken, `departed` and `touchedIds` would grow
  // without bound, and `checkpointFrom`'s cutoff would be measured against
  // the wrong hour. An incremental driver has no loop bound of its own to
  // catch this, so the bound lives here.
  //
  // Ticks BEFORE the epoch's start are fine and expected -- that is the
  // warm-up replay (spec 3.9 point 3), which deliberately runs while
  // `nowMs < epochStartMs(state.epoch)`.
  if (t >= epochEndMs(state.epoch)) {
    throw new RangeError(
      `foldTick: tick ${t} is at or past the end of epoch ${state.epoch} ` +
      `(${epochEndMs(state.epoch)}). A fold covers exactly one epoch: call ` +
      'rollEpoch(state) to publish the boundary checkpoint, then start the ' +
      'next epoch with foldShoal(log, t, { epoch: e + 1, seed: checkpoint }) ' +
      '— there is exactly one way to start an epoch, and it is the warm-up ' +
      'path a cold joiner uses.',
    );
  }

  // 1. Apply every entry authored at or before this tick.
  while (state.cursor < log.length && log[state.cursor].ms <= t) {
    const e = log[state.cursor++];
    if (e.kind === 'presence') {
      const existing = state.fish.get(e.id);
      // Seed the position through reckon, NOT from the raw vector. Authored
      // vectors are not grid-aligned; reckon is the single place
      // quantization happens. Assigning e.vec.x directly would leave this
      // fish on unquantized coordinates for the rest of the tick, and an
      // eat-claim landing on the same tick is judged against those
      // coordinates before the reckon pass below runs — enough to flip an
      // EAT_R2 boundary.
      const seed = reckon(e.vec, e.ms);
      // Three sources, in strict priority. A live fish carries its own
      // state forward. A fish whose presence lapsed is rebuilt from its
      // durable `departed` record — "you return the size you left"
      // (spec 2.7). Only a genuinely new swimmer starts at START_SIZE.
      // Reading START_SIZE for a returning fish is what turned time away
      // into a punishment: it silently confiscated everything above
      // START_SIZE and refunded everything below it.
      const prior = existing ?? state.departed.get(e.id);
      state.fish.set(e.id, {
        id: e.id,
        x: seed.x,
        y: seed.y,
        size: prior ? prior.size : START_SIZE,
        vec: e.vec,
        expiresMs: e.ms + PRESENCE_TTL_MS,
        lastScatterMs: prior ? prior.lastScatterMs : -1,
        lastBiteMs: prior ? prior.lastBiteMs : -1,
        // Copied, not aliased. `prior` is either the Fish being replaced or a
        // Departed record; sharing the array would make three owners of one
        // object. It happens to be safe today because every write to
        // recentBites REPLACES the array rather than mutating it in place —
        // but that is an invariant nobody states and one `push` would break,
        // and the failure would be a silent cross-record corruption of the
        // scatter-void ledger. One copy per presence write is nothing.
        recentBites: prior ? [...prior.recentBites] : [],
      });
      state.touchedIds.add(e.id);
      // Task 2's carry-forward: this revival path reads `departed` but
      // (before this fix) never cleared it, so a stale record — whether
      // banked by a real eviction earlier this fold or loaded straight
      // from the seed above — could coexist with the now-live fish for the
      // rest of the fold. checkpointFrom already prefers `fish` over
      // `departed` for the same id, so the stale record could never win on
      // SIZE, but it would still survive as garbage, and it is exactly the
      // kind of leftover row the seed-pruning step at the end of foldShoal
      // must not mistake for "still genuinely untouched." Fixed at the one
      // place a fish is revived, generally, rather than special-cased for
      // seeded ids only.
      state.departed.delete(e.id);
    } else {
      const f = state.fish.get(e.id);
      if (!f) continue; // a bite from a fish with no live presence never credits
      // A latched bloom (one that has already yielded at least one credited
      // bite and is not yet exhausted) bypasses the fallow test: it stays
      // edible for whoever gets to it, regardless of who has swum over the
      // cell since. An unlatched bloom must still pass canEat's real
      // isBloomReady check against state.lastVisit — including the case of
      // a fish that just arrived and is about to self-consume the fallow
      // clock on its very next tick's markVisits.
      const latched = state.bloomSinceMs.has(e.cell);
      // Judge the claim at the instant it was CLAIMED, not at whatever
      // f.x/f.y happen to hold. This step runs before the tick's reckon
      // pass, so f.x/f.y are still the previous tick's positions — up to
      // TICK_MS(250) stale, which at SPEED_DART(220) is 55 cu against an
      // EAT_R of 90. A darting fish could be credited for a cell it had
      // already left, or refused one it had already reached.
      const claimedAt = reckon(f.vec, e.ms);
      const ok = canEat({
        lastVisit: latched ? NEVER_VISITED : state.lastVisit,
        bitesTaken: state.bitesTaken,
        cell: e.cell,
        // The claimant, so the fallow test can ignore this fish's OWN visits
        // and honour everyone else's. Without it a swimmer's approach kills
        // the bloom it is approaching and nobody can ever eat — see bloom.ts's
        // header.
        id: e.id,
        fishX: claimedAt.x,
        fishY: claimedAt.y,
        lastBiteMs: f.lastBiteMs,
        nowMs: e.ms,
      });
      if (!ok) continue;
      const count = (state.bitesTaken.get(e.cell) ?? 0) + 1;
      state.bitesTaken.set(e.cell, count);
      // This is the bite that opens the bloom: latch it so the next five
      // don't have to re-pass the fallow test just because someone is
      // standing on the cell.
      if (!latched) state.bloomSinceMs.set(e.cell, e.ms);
      // This is the bite that empties it: the bloom is gone. Unlatch, and
      // restart the fallow clock from this exact moment so the existing
      // exhausted-cell reset below (and any later isBloomReady check) sees
      // a genuinely fresh "last visited" stamp rather than a stale one.
      //
      // The stamp is attributed to the CLAIMANT, which is both honest (it is
      // the fish that was there) and sufficient: the reset below runs
      // isBloomReady with NO exceptId, so it sees this stamp and holds the
      // cell spent for the full BLOOM_READY_MS even if the claimant is the
      // only fish that has ever been near it. A claimant-exempt re-claim
      // inside that window is separately impossible — bitesLeft is 0 until
      // the reset clears the count — so attributing it to the claimant and
      // attributing it to nobody are behaviourally identical, and this way
      // needs no reserved id in the consensus rules.
      if (count >= BLOOM_BITES) {
        state.bloomSinceMs.delete(e.cell);
        stampVisit(state.lastVisit, e.cell, e.id, e.ms);
      }
      f.size = f.size + BITE_GROWTH;
      f.lastBiteMs = e.ms;
      // Track the bite for scatter voiding, pruned to VOID_WINDOW_MS so
      // this can never grow across a long session: a fish that keeps
      // biting only ever carries the tail of its own recent foraging
      // trip, not its whole history.
      f.recentBites = [...f.recentBites, e.ms].filter((ms) => e.ms - ms <= VOID_WINDOW_MS);
    }
  }

  // 2. Drop expired presence, then dead-reckon everyone forward.
  //
  // Eviction banks the swimmer's durable state before deleting the row, so
  // hunger stops (a present-only cost) but nothing durable is lost. This is
  // the single write site for `departed`: it captures everything applied to
  // the fish up to and including this tick's step 1, which a bank-at-
  // end-of-tick sweep would miss for a fish evicted on the same tick a
  // backdated bite credited to it.
  for (const [id, f] of [...state.fish]) {
    if (t > f.expiresMs) {
      state.departed.set(id, {
        size: f.size,
        lastScatterMs: f.lastScatterMs,
        lastBiteMs: f.lastBiteMs,
        recentBites: [...f.recentBites], // copied, not aliased; see step 1
      });
      state.fish.delete(id);
      state.outsideTicks.delete(id);
      continue;
    }
    const p = reckon(f.vec, t);
    f.x = p.x;
    f.y = p.y;
  }

  const bodies = bodiesOf(state);

  // 3. Blooms: mark where the school has been, and reset every FALLOW cell
  //    — not merely the exhausted ones.
  //
  // The condition is fallowness alone. Gating on `used >= BLOOM_BITES` as
  // well stranded every partially eaten cell forever: take one to five
  // bites and swim away, and both the count AND the latch survived for the
  // rest of the session however long the cell lay untouched. Two
  // consequences, both fatal. The sea depleted monotonically, breaking
  // spec 2.5 ("the sea refills exactly the places you were too scared to
  // go"). And a permanently latched cell bypasses the fallow test forever,
  // so it stayed edible under a pile of hiding fish — re-enabling the
  // tight-blob strategy bloom.ts's own header says rivalry exists to
  // prevent. Clearing on fallowness is a strict generalisation: every
  // latched cell necessarily has a bitesTaken entry (the bite that latches
  // it is the same bite that writes the count), so the two maps are always
  // cleared together and never drift apart.
  //
  // Gated on isBloomReady, NOT merely "recently visited": the eat branch
  // above already stamps lastVisit at the moment a bloom is exhausted, so
  // a naive "lastVisit(cell) >= t" check would fire on that very same
  // tick (the exhausting fish is necessarily still within BLOOM_VISIT_R,
  // since EAT_R < BLOOM_VISIT_R) and erase bitesTaken before it was ever
  // observable. Gating on real fallow completion keeps a part-eaten or
  // spent cell reading as it stands for the whole dormant window, and
  // clears it exactly when the cell becomes ready again — the same instant
  // a fresh claim's own isBloomReady check would also pass — not early.
  //
  // NO `exceptId` HERE, and that is the load-bearing half of the
  // claimant-exemption rule (bloom.ts's header). Regrowth asks whether the
  // cell has lain fallow to EVERYONE; only a CLAIM ignores the claimant's own
  // visits. Passing a claimant here would let a lone fish parked on a cell
  // empty it, wait out the clock without moving, and empty it again forever —
  // the parked-blob feed with one fish instead of six.
  markVisits(state.lastVisit, bodies, t);
  for (const [cell] of [...state.bitesTaken]) {
    if (isBloomReady(state.lastVisit, cell, t)) {
      state.bitesTaken.delete(cell);
      state.bloomSinceMs.delete(cell);
    }
  }

  // 4. Tension, and who has been out in the open longest.
  const out = new Set(outsideCore(bodies));
  for (const b of bodies) {
    state.outsideTicks.set(b.id, out.has(b.id) ? (state.outsideTicks.get(b.id) ?? 0) + 1 : 0);
  }
  state.tension = stepTension(state.tension, bodies);

  // 5. The hush.
  if (shouldStartHush(state.tension, state.hushStartMs)) {
    state.hushStartMs = t;
    state.lockedPositions = null;
    state.lockedPreferred = null;
  }
  if (state.hushStartMs >= 0) {
    // Lock inputs the moment the commit window closes. BOTH halves of the
    // resolution's input are frozen here, in the same branch: the positions
    // AND the preferred target. Freezing positions alone is not enough --
    // topContributor reads `outsideTicks`, a live accumulator this loop
    // rewrites on every tick of the dread window, so recomputing the
    // preferred target at the resolve tick would let a presence write
    // authored after T+LOCK change who is preferred. `preferred` jumps the
    // queue in selectTaken, so that changes WHO IS TAKEN -- the "shark ate
    // the wrong fish" divergence class, guaranteed to bite whenever two
    // clients hold different post-lock write sets (spec 2.12 rule 2).
    if (state.lockedPositions === null && t - state.hushStartMs >= LOCK_MS) {
      state.lockedPositions = new Map(bodies.map((b) => [b.id, { x: b.x, y: b.y, size: b.size }]));
      state.lockedPreferred = topContributor(bodies, state.outsideTicks);
    }
    if (isResolveTick(state.hushStartMs, t, TICK_MS)) {
      const locked: Body[] = state.lockedPositions
        ? [...state.lockedPositions.entries()]
            .map(([id, p]) => ({ id, x: p.x, y: p.y, size: p.size }))
            .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        : bodies;
      // Read the frozen answer, never recompute it. The `: topContributor`
      // arm is reachable only if the lock tick never ran, which the fixed
      // tick schedule makes impossible (LOCK_MS < HUSH_MS and both are
      // multiples of TICK_MS); it is kept so the two arms stay symmetric --
      // locked positions with the locked preferred, live bodies with a live
      // preferred -- rather than pairing live bodies with a null.
      const preferred = state.lockedPositions
        ? state.lockedPreferred
        : topContributor(bodies, state.outsideTicks);
      const taken = selectTaken(locked, preferred);
      for (const id of taken) {
        const f = state.fish.get(id);
        if (!f) continue;
        f.size = clampSize(f.size - SCATTER_COST);
        f.lastScatterMs = t;
        // Void the WHOLE recent foraging trip, not just the single most
        // recent bite: with the bloom latch, a fish can bank several
        // bites inside one VOID_WINDOW_MS window (EAT_COOLDOWN_MS spacing
        // makes up to 5 possible), and voiding only the last one would
        // leave getting caught net-positive — exactly the "being caught
        // while feeding is profitable" bug the fold must not have. Voided
        // entries are removed from recentBites so a second sweep shortly
        // after cannot void the same bites again.
        const voided = f.recentBites.filter((ms) => t - ms <= VOID_WINDOW_MS);
        if (voided.length > 0) {
          f.size = clampSize(f.size - voided.length * BITE_GROWTH);
          f.recentBites = f.recentBites.filter((ms) => t - ms > VOID_WINDOW_MS);
        }
      }
      state.lastTaken = taken;
      state.lastSweepMs = t;
      state.tension = 0;
      state.hushStartMs = -1;
      state.lockedPositions = null;
      state.lockedPreferred = null;
    }
  }

  // 6. Hunger — but only while present, never while away.
  state.tickCount++;
  if (state.tickCount % HUNGER_TICK_INTERVAL === 0) {
    for (const f of state.fish.values()) {
      if (f.lastBiteMs >= 0 && t - f.lastBiteMs < HUNGER_TICK_INTERVAL * TICK_MS) continue;
      f.size = clampSize(f.size - HUNGER_AMOUNT);
    }
  }

  state.nowMs = t + TICK_MS;
  return state;
}

/**
 * Fold the log forward to `untilMs`, advancing in fixed TICK_MS steps.
 *
 * The tick origin is the ABSOLUTE start of an epoch (spec section 3.9), never
 * `log[0].ms`. Two clients holding different slices of the same history — one
 * with an extra long-expired entry, say — must land on the same tick phase and
 * fold the same accumulated ticks for the live entries; anchoring to whichever
 * entry a client happened to hold first is exactly what broke that (measured:
 * one stale entry moved a sweep by 1213ms and tension by 3120).
 *
 * THE TICK LOOP STARTS AT `epochWarmStartMs(epoch)` — `WARMUP_MS` BEFORE the
 * epoch's own first ms (spec 3.9 point 3) — and replays the pre-origin tail,
 * discarding nothing. `emptyState` used to BE the epoch boundary: everything
 * outside the checkpoint read as zero at a predictable, publicly-readable
 * instant, which is a clock a player can aim at rather than a random
 * interruption. Three defects, one root cause, all fixed by the replay
 * instead of by widening the checkpoint:
 *
 *  - THE BLOOM MAP. `lastVisit` started empty, and `isBloomReady` reads an
 *    absent cell as ready ("the sea starts full"). Six fish parked on one
 *    cell took 0 bites all epoch, then BLOOM_BITES at exactly `epochStart`,
 *    then 0 again one tick later — the parked-blob feed the rivalry rules
 *    exist to prevent, for one tick, every hour, on schedule. The warm-up
 *    replays their own markVisits, so the cell reads correctly fallow.
 *  - AN IN-FLIGHT HUSH. A hush 2 s in and 6 s from resolving simply vanished
 *    (tension 33_280 -> 0), so any hush starting within HUSH_MS of a
 *    boundary was free. WARMUP_MS covers the whole tension ramp, so the hush
 *    is reconstructed mid-flight, lock and all.
 *  - LIVE PRESENCE. Entries before the origin were skipped outright, so a
 *    vector authored 10 s before the boundary — still live for another 80 s
 *    — yielded no fish at all and the sea emptied hourly.
 *
 * `opts.epoch` defaults to `epochOf(untilMs)` — the epoch `untilMs` itself
 * falls in. `opts.seed` is the previous epoch's checkpoint (spec 3.9 point
 * 5): a cold joiner adopts the newest checkpoint it can see and verifies
 * forward from there, rather than replaying from genesis.
 *
 * THE SEED IS APPLIED AT THE EPOCH START, NOT AT THE WARM-UP START — after
 * the last warm-up tick, before the tick at `originMs`. The two orders are
 * not interchangeable and only this one is correct:
 *
 *  - Applied at the warm-up start, a seeded swimmer's banked size would then
 *    be subjected to up to WARMUP_MS of extra hunger (360 ticks, 90 hunger
 *    firings, -90 size) that the previous epoch's fold already charged them
 *    for. Time is billed twice at every boundary, forever.
 *  - Worse, any eat-claim in the warm-up window would credit BITE_GROWTH a
 *    second time: those bites are already inside the checkpoint's `size`.
 *    A swimmer could farm the last 90 s of every hour twice over.
 *
 * Applying it at `originMs` overwrites `size`, `lastBiteMs` and
 * `recentBites` with the checkpoint's authoritative values for every id the
 * checkpoint names — for a swimmer the warm-up brought back to life as well
 * as for one who is still absent — while KEEPING everything the warm-up
 * reconstructed that the checkpoint does not carry: position, vector,
 * expiry, the bloom map, tension, outside-ticks and any in-flight hush. The
 * two requirements do not conflict: the checkpoint owns durable value, the
 * replay owns reconstructible state, and the epoch start is exactly the
 * instant the checkpoint describes.
 *
 * A swimmer named in `opts.seed.recent` (they ate within VOID_WINDOW_MS of
 * the checkpoint) also gets their `lastBiteMs`/`recentBites` from it rather
 * than from the replay, because the checkpoint is authoritative for those
 * too: without carrying them, a swimmer who ate right before the boundary
 * and wrote again right after got a free `EAT_COOLDOWN_MS` reset and any
 * bite still inside its void window became permanently unvoidable — the two
 * things `Departed`'s doc says a presence lapse must never cause, on a
 * schedule a player can time. Every OTHER seeded swimmer seeds with
 * `lastBiteMs: -1, recentBites: []`: a bite already outside the void window
 * carries no more protection than a brand-new arrival's.
 *
 * An id NOT named in the seed is left exactly as the warm-up reconstructed
 * it. That case only arises from a seed that is missing swimmers it should
 * have had; deleting them instead would throw away live presence, which is
 * the very defect the warm-up exists to fix.
 *
 * `opts.seed.epoch` MUST be exactly `epoch - 1` — see the check immediately
 * below. The `departed` prune (spec 3.9 point 6) does NOT happen here: it is
 * a boundary operation and lives in `rollEpoch`, which is also the only place
 * a canonical checkpoint is produced. Fold to `epochFoldEndMs(epoch)` and
 * roll.
 *
 * `untilMs` must lie inside `epoch`: before its start there is nothing
 * coherent to return, and at or past its end a fold would be covering more
 * than one epoch. Both are refused.
 *
 * This function is now a thin wrapper: it builds the seeded empty state,
 * then loops `foldTick` from the epoch's start up to `untilMs`. The tick
 * body itself lives in exactly one place (`foldTick`, above) so a
 * whole-epoch fold and an incremental, tick-at-a-time fold (the shell's use
 * case — see foldTick's doc) can never disagree about what a tick does. The
 * log is sorted ONCE here and the same array is handed to every `foldTick`
 * call.
 *
 * The RESULT IS RESUMABLE: `state.nowMs` is left on the absolute tick grid,
 * at the first tick strictly after `untilMs`, so
 * `foldTick(foldShoal(log, t), ordered)` is exactly `foldShoal(log, t +
 * TICK_MS)`. It used to be overwritten with `untilMs` after the loop, which
 * made a resumed fold re-fold the tick at `untilMs` and skip the next
 * (measured: nowMs 1250 vs 1500, a moving fish's x 1216 vs 1272) — and with
 * an off-grid `untilMs` it displaced the grid permanently, reintroducing the
 * exact phase divergence the epoch origin removed.
 */
export function foldShoal(
  entries: readonly LogEntry[],
  untilMs: number,
  opts?: { epoch?: number; seed?: Checkpoint },
): ShoalState {
  const epoch = opts?.epoch ?? epochOf(untilMs);
  if (opts?.seed && opts.seed.epoch !== epoch - 1) {
    // A seed from any other epoch is a bug or an attack: silently accepting
    // it would fold this client onto a different world than its peers (spec
    // 3.9 point 5 only licenses adopting the NEWEST checkpoint, not any
    // checkpoint). Refuse rather than guess which epoch was meant.
    throw new RangeError(
      `foldShoal: seed is from epoch ${opts.seed.epoch}, but this fold is for epoch ` +
      `${epoch} and can only be seeded from epoch ${epoch - 1} (the immediately ` +
      'preceding one). A seed from any other epoch is a bug or an attack.',
    );
  }
  const originMs = epochStartMs(epoch);
  const warmStartMs = epochWarmStartMs(epoch);
  if (untilMs < originMs) {
    // Silently folding to a tick that precedes the epoch's own start used to
    // return a state whose `nowMs` was in the PREVIOUS epoch while
    // `state.epoch` named this one — a state no caller can do anything
    // correct with, and one `checkpointFrom`/`rollEpoch` would happily
    // misread. Refuse instead.
    throw new RangeError(
      `foldShoal: untilMs ${untilMs} precedes epoch ${epoch}'s start at ${originMs}. ` +
      'A fold covers exactly one epoch; fold the epoch untilMs actually falls in.',
    );
  }
  const log = orderLog(entries);
  const state = emptyState(warmStartMs, epoch);

  // Refuse an absurd span up front rather than hanging. The loop below runs
  // floor((untilMs - warmStartMs) / TICK_MS) + 1 times. With a DEFAULTED
  // epoch this can never approach MAX_FOLD_TICKS: originMs =
  // epochStartMs(epochOf(untilMs)) always sits within [untilMs - EPOCH_MS +
  // 1, untilMs], so the span is under EPOCH_MS + WARMUP_MS and the tick count
  // under (EPOCH_MS + WARMUP_MS)/TICK_MS = 14_760, two orders of magnitude
  // below the guard. This is the change spec 3.9 describes: the old ~69h
  // wall-clock-hang ceiling is eliminated by construction, not merely guarded
  // against. The guard remains a real backstop only when a caller passes an
  // EXPLICIT `opts.epoch` that is far from `untilMs` (a caller bug: resuming
  // from a stale checkpoint's epoch against a much later untilMs) — that is
  // the one path that can still ask for an absurd span.
  const span = untilMs - warmStartMs;
  const plannedTicks = Math.floor(span / TICK_MS) + 1;
  if (plannedTicks > MAX_FOLD_TICKS) {
    throw new RangeError(
      `foldShoal: refusing to run ${plannedTicks} ticks (max ${MAX_FOLD_TICKS}). ` +
      `untilMs ${untilMs} is ${untilMs - originMs} ms after epoch ${epoch}'s start at ` +
      `${originMs} (the loop also replays ${WARMUP_MS} ms of warm-up before it). ` +
      `Fold one epoch at a time, seeded from the previous epoch's checkpoint.`,
    );
  }
  if (untilMs >= epochEndMs(epoch)) {
    // Strictly stronger than the MAX_FOLD_TICKS budget above, which is
    // therefore now unreachable from any real call and stays only as a POLICY
    // backstop against an arithmetic mistake in this very check. The budget is
    // tested first so its own error message still has a reachable case.
    throw new RangeError(
      `foldShoal: untilMs ${untilMs} is at or past the end of epoch ${epoch} ` +
      `(${epochEndMs(epoch)}). A fold covers exactly one epoch (spec 3.9); the ` +
      `last tick this epoch owns is epochFoldEndMs(${epoch}) = ` +
      `${epochEndMs(epoch) - TICK_MS}. Roll the epoch and fold the next one.`,
    );
  }

  // THE REPLAY WINDOW MUST ADMIT EVERYTHING STILL ALIVE DURING THE WARM-UP,
  // which reaches back WARMUP_MS + PRESENCE_TTL_MS — 180 s of the PRIOR
  // epoch's log (spec 3.9 point 3).
  //
  // The bound used to be `ms < warmStartMs`, justified by "entries authored
  // before the warm-up start are older than PRESENCE_TTL_MS at the epoch's
  // ORIGIN, so replaying them could not change anything." That justification
  // is true at the origin and FALSE for the 360 warm-up ticks, which is the
  // window the warm-up itself introduced: a vector authored at
  // `warmStartMs - 1` is live for every one of them. Skipping it reconstructs
  // an incomplete sea, and the bloom exploit the warm-up exists to close
  // simply moved 90 s earlier — a blob that stops refreshing before the
  // warm-up start has cell 700 absent from `lastVisit` for the whole replay
  // and is handed BLOOM_BITES at exactly `epochStart`, on the same public
  // clock, now easier to aim at deliberately. Measured on the fixture in
  // shoalEngine.test.ts, moving the park write by two milliseconds:
  //   PARK_MS = start -  89_999 -> bitesTaken(700) at epochStart = 0
  //   PARK_MS = start -  90_001 -> bitesTaken(700) at epochStart = 6
  //
  // `warmStartMs - PRESENCE_TTL_MS` is exactly the right bound, not merely a
  // safe one: an entry is skipped iff `ms + PRESENCE_TTL_MS < warmStartMs`,
  // i.e. iff its presence has ALREADY expired at the first warm-up tick, so
  // step 2 would evict it on the very tick step 1 admitted it. Skipping such
  // an entry is not just cheaper, it is more correct — admitting it would
  // leave a spurious `departed` row and a spurious `touchedIds` entry behind.
  // An entry at exactly `warmStartMs - PRESENCE_TTL_MS` expires at
  // `warmStartMs` and step 2 evicts only on `t > expiresMs`, so it is alive
  // for that one tick and is admitted; hence `<`, not `<=`.
  //
  // A joining client must HOLD that much prior history or it will silently
  // fold a different world. The fold cannot detect a missing prefix, so
  // fetching it is the client's obligation (spec 3.9 point 3).
  //
  // The tick count is unchanged by this: the loop still starts at
  // `warmStartMs` and still runs 360 warm-up ticks. Only the cursor prefix
  // moves. `log` is ms-ordered, so this is a one-time skip of a prefix — done
  // once, before the tick loop starts, rather than re-checked every tick.
  // Setting `state.cursor` here (rather than leaving it at emptyState's
  // default of 0) is what makes this skip happen exactly once: every
  // subsequent `foldTick` call resumes from wherever the cursor was left,
  // never re-scanning this prefix.
  let cursor = 0;
  while (cursor < log.length && log[cursor].ms < warmStartMs - PRESENCE_TTL_MS) cursor++;
  state.cursor = cursor;

  // The warm-up: replay the pre-origin tail so bloom fallow state, live
  // presence, tension and any in-flight hush are RECONSTRUCTED. Same tick
  // body, same absolute grid — every client replays this identically.
  while (state.nowMs < originMs) {
    foldTick(state, log);
  }

  // Now, at the epoch's own first ms, adopt the checkpoint. See this
  // function's doc for why this happens HERE and not before the warm-up.
  //
  // `opts.seed.recent` is looked up by id once, into a Map — cheaper than a
  // linear scan of `recent` per swimmer in `sizes`, and it keeps the "does
  // this id have carried bite state" check obviously O(1) rather than relying
  // on `recent` staying small (it does, by construction — see shoalTypes.ts's
  // `Checkpoint` doc — but this shouldn't depend on that).
  //
  // `state.touchedIds` records every id that authored a presence entry
  // actually applied during this fold, INCLUDING during the warm-up. It is
  // consulted once, after the tick loop, to prune seed entries nobody
  // returned to claim. Warm-up writes count as a claim on purpose: a swimmer
  // whose vector is still live at the boundary authored it no earlier than
  // the admitted cursor, i.e. within the last WARMUP_MS + PRESENCE_TTL_MS
  // (180 s), which is nothing like "absent for a full epoch."
  if (opts?.seed) {
    const recentById = new Map<string, { lastBiteMs: number; recentBites: number[] }>();
    for (const [id, lastBiteMs, recentBites] of opts.seed.recent) {
      recentById.set(id, { lastBiteMs, recentBites });
    }
    for (const [id, size] of opts.seed.sizes) {
      const r = recentById.get(id);
      const lastBiteMs = r ? r.lastBiteMs : -1;
      // Copied, never aliased: the seed is the caller's Checkpoint and must
      // not be mutated by the fold that consumed it.
      const recentBites = r ? [...r.recentBites] : [];
      const live = state.fish.get(id);
      if (live) {
        // The warm-up brought this swimmer back to life. Keep everything the
        // replay reconstructed (position, vector, expiry) and overwrite only
        // what the checkpoint owns.
        live.size = size;
        live.lastBiteMs = lastBiteMs;
        live.recentBites = recentBites;
        continue;
      }
      state.departed.set(id, {
        size,
        // `lastScatterMs` is not in the checkpoint. If the warm-up saw this
        // swimmer scattered, that observation is better than nothing; if not,
        // -1 is the same value the seed used to install unconditionally.
        lastScatterMs: state.departed.get(id)?.lastScatterMs ?? -1,
        lastBiteMs,
        recentBites,
      });
    }
  }

  while (state.nowMs <= untilMs) {
    foldTick(state, log);
  }

  return state;
}

/**
 * Close an epoch: prune, then publish the canonical checkpoint. THAT IS ALL
 * IT DOES — it deliberately does NOT produce a state for the next epoch.
 *
 * THERE IS EXACTLY ONE WAY TO START AN EPOCH (spec 3.9 point 3). A rollover is
 * not a shortcut; it is a checkpoint plus a normal start. The driver takes the
 * checkpoint returned here and re-enters through the SAME seeded warm-up path
 * a cold joiner uses:
 *
 *   const cp = rollEpoch(state);                       // epoch e closes
 *   state = foldShoal(log, t, { epoch: e + 1, seed: cp });   // epoch e+1 opens
 *
 * An earlier version also returned a `next` state that carried the live world
 * across the boundary as an optimisation. That created a SECOND definition of
 * an epoch's starting state, which then had to be kept in agreement with the
 * replay forever — and it was not. Measured on the fixture in
 * shoalEngine.test.ts's "one way to start an epoch" section, same log, same
 * shared epoch-40 fold, same checkpoint:
 *
 *   carried tension at the boundary  17_098   reconstructed  29_880
 *   carried outsideTicks('mate')        600   reconstructed     360
 *   carried departed('gone').lastBiteMs 144_013_500   reconstructed  -1
 *   carried lastVisit(700)      144_091_000   reconstructed  absent
 *
 * — two honest clients publishing different checkpoints for the same world and
 * landing their sweeps seconds apart, which is the "shark ate the wrong fish"
 * class directly (`outsideTicks` feeds `topContributor` -> `lockedPreferred`
 * -> `selectTaken`). The continuation was deleted rather than reconciled,
 * because reconciliation is the thing the ruling rejects.
 *
 * `state.nowMs` must be exactly `epochEndMs(state.epoch)` — the position a
 * fold is left in after its last legal tick, i.e. after folding to
 * `epochFoldEndMs(state.epoch)`. Rolling from anywhere else would checkpoint
 * a half-folded epoch: the sizes would be whatever the caller happened to
 * stop on, which is precisely the non-canonicality `checkpointFrom`'s
 * epoch-end cutoff exists to remove.
 *
 * THE `departed` PRUNE LIVES HERE (spec 3.9 point 6): "an hour away is
 * forgiveable, a week is a fresh start." It used to live at the end of
 * `foldShoal`, keyed off the seed's id list, which meant an incremental
 * driver — the shell — never ran it at all and `departed` grew forever.
 * Keying it off `touchedIds` instead is exactly equivalent and needs no seed:
 * every `departed` record is either a seeded one (untouched -> absent the
 * whole epoch -> dropped) or one this epoch's own eviction step wrote, and
 * eviction can only reach a fish that entered `state.fish`, which only a
 * presence write in this fold can do — so every self-evicted id is in
 * `touchedIds` and is correctly exempt. A swimmer evicted late in the epoch
 * must survive to be re-checked at the NEXT boundary rather than be dropped a
 * checkpoint early.
 *
 * IT FIRES EXACTLY ONCE PER BOUNDARY, and the argument is now short enough to
 * state in full:
 *  - This is the only place in the engine that drops a `departed` record for
 *    absence, and the prune's ONLY effect is on the checkpoint built two
 *    lines below it (the state is not reused — see the next paragraph), so
 *    the prune reaches the next epoch through the checkpoint or not at all.
 *  - The boundary guard above admits exactly one instant per epoch, so it
 *    cannot run mid-epoch or twice at different points.
 *  - It is idempotent: it deletes exactly `{id in departed : id not in
 *    touchedIds}` and touches neither map otherwise, so that set is empty
 *    afterwards and a second call at the same boundary returns a
 *    byte-identical checkpoint. Pinned by "rolling twice at the same boundary
 *    is idempotent" in shoalEngine.test.ts.
 *
 * THIS CALL CONSUMES `state`. It mutates `state.departed` in place and the
 * state must not be folded further: `state.nowMs` is `epochEndMs(state.epoch)`
 * and `state.epoch` is left unchanged, so the very next `foldTick` throws (see
 * the guard at the top of this file). That is deliberate — the only way
 * onward is `foldShoal` with this checkpoint as the seed, which builds a fresh
 * state from `emptyState`.
 */
export function rollEpoch(state: ShoalState): Checkpoint {
  const boundaryMs = epochEndMs(state.epoch);
  if (state.nowMs !== boundaryMs) {
    throw new RangeError(
      `rollEpoch: state is at ${state.nowMs}, not epoch ${state.epoch}'s boundary ` +
      `at ${boundaryMs}. Fold to epochFoldEndMs(${state.epoch}) = ` +
      `${boundaryMs - TICK_MS} first; a checkpoint taken anywhere else is not ` +
      'the canonical one every other client will compute.',
    );
  }
  for (const [id] of [...state.departed]) {
    if (!state.touchedIds.has(id)) state.departed.delete(id);
  }
  return checkpointFrom(state, state.epoch);
}
