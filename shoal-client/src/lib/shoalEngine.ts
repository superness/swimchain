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
import { epochOf, epochStartMs, epochWarmStartMs } from './epoch';
import { type Body } from './shelter';
import { stepTension, topContributor, outsideCore } from './tension';
import { shouldStartHush, isResolveTick, selectTaken } from './sweep';
import { markVisits, canEat, isBloomReady } from './bloom';
import type { LogEntry, ShoalState, Checkpoint } from './shoalTypes';
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
 */
const NEVER_VISITED: ReadonlyMap<number, number> = new Map();

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
 * can never drift apart: there is exactly one tick body in this file. The
 * numbered steps inside are CONSENSUS ordering, not incidental structure —
 * step 1 (apply entries) runs before step 2's reckon pass, which is what
 * makes a same-tick eat claim judged against the position the claimant WAS
 * at, not a stale one; step 5 (the hush) runs before step 6 (hunger), which
 * is what makes a scatter's clamped size loss and that same tick's hunger
 * loss compose in the order the hand-derived arithmetic in
 * shoalEngine.test.ts and shoalEngine.determinism.test.ts assumes. Do not
 * reorder them.
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
        recentBites: prior ? prior.recentBites : [],
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
      if (count >= BLOOM_BITES) {
        state.bloomSinceMs.delete(e.cell);
        state.lastVisit.set(e.cell, e.ms);
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
        recentBites: f.recentBites,
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
 * below. `departed` also prunes here (spec 3.9 point 6): a seeded swimmer
 * who writes no presence at all during this epoch is dropped, not carried
 * into the checkpoint this fold's result feeds into.
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

  // Entries authored before the WARM-UP start are older than PRESENCE_TTL_MS
  // at the epoch's origin, so replaying them could not change anything: any
  // presence they carry has already expired, and any eat-claim they carry is
  // long outside both EAT_COOLDOWN_MS and VOID_WINDOW_MS. That is exactly why
  // WARMUP_MS is PRESENCE_TTL_MS and not something shorter. `log` is
  // ms-ordered, so this is a one-time skip of a prefix — done once, before
  // the tick loop starts, rather than re-checked every tick. Setting
  // `state.cursor` here (rather than leaving it at emptyState's default of 0)
  // is what makes this skip happen exactly once: every subsequent `foldTick`
  // call resumes from wherever the cursor was left, never re-scanning this
  // prefix.
  let cursor = 0;
  while (cursor < log.length && log[cursor].ms < warmStartMs) cursor++;
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
  // whose vector is still live at the boundary has been in the water within
  // the last WARMUP_MS, which is nothing like "absent for a full epoch."
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

  // Prune `departed` records that were only ever a seed value nobody
  // returned to claim (spec 3.9 point 6): "an hour away is forgiveable, a
  // week is a fresh start." A seed id that WAS touched (wrote presence any
  // time this epoch) is exempt even if it is departed again by fold's end —
  // that departed record was written fresh by THIS fold's own eviction step
  // (foldTick's step 2), so as of this checkpoint that swimmer has been
  // absent less than one epoch, and must survive to be re-checked at the
  // NEXT epoch boundary rather than being dropped a checkpoint early. Only a
  // seed id absent from `state.touchedIds` — meaning its `departed` row sat
  // untouched for the whole epoch — is dropped here. This does not "fall out
  // naturally" from only carrying forward touched records: without this
  // explicit pass, every seeded id would simply remain in `state.departed`
  // forever (nothing else in the loop above ever deletes a seed record that
  // is never revived), so it has to be done here, explicitly.
  if (opts?.seed) {
    for (const [id] of opts.seed.sizes) {
      if (!state.touchedIds.has(id)) state.departed.delete(id);
    }
  }

  return state;
}
