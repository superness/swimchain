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
import { epochOf } from './epoch';
import { type Body } from './shelter';
import { stepTension, topContributor, outsideCore } from './tension';
import { shouldStartHush, isResolveTick, selectTaken } from './sweep';
import { markVisits, canEat, isBloomReady } from './bloom';
import type { LogEntry, ShoalState } from './shoalTypes';
import {
  TICK_MS, PRESENCE_TTL_MS, START_SIZE, MIN_SIZE, BITE_GROWTH, SCATTER_COST,
  HUNGER_TICK_INTERVAL, HUNGER_AMOUNT, BLOOM_BITES, VOID_WINDOW_MS, LOCK_MS,
  MAX_FOLD_TICKS,
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

/** A world with nobody in it. */
export function emptyState(startMs: number): ShoalState {
  return {
    epoch: epochOf(startMs),
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
 * Fold the log forward to `untilMs`, advancing in fixed TICK_MS steps.
 *
 * The tick is fixed rather than event-driven because hunger, tension and the
 * hush all advance with time, not with writes — an idle sea still gets hungry
 * and still calms down.
 */
export function foldShoal(entries: readonly LogEntry[], untilMs: number): ShoalState {
  const log = orderLog(entries);
  const state = emptyState(log.length > 0 ? log[0].ms : 0);
  const outsideTicks = new Map<string, number>();

  // Refuse an absurd span up front rather than hanging. The loop below runs
  // floor((untilMs - start) / TICK_MS) + 1 times; against an empty log the
  // start is 0, so a caller passing a wall-clock untilMs asks for ~7.1e9
  // ticks and gets no output for over an hour. Fail loudly and immediately
  // instead — the caller's epoch is wrong, and there is no answer worth
  // waiting for.
  const span = untilMs - state.nowMs;
  const plannedTicks = span < 0 ? 0 : Math.floor(span / TICK_MS) + 1;
  if (plannedTicks > MAX_FOLD_TICKS) {
    throw new RangeError(
      `foldShoal: refusing to run ${plannedTicks} ticks (max ${MAX_FOLD_TICKS}). ` +
      `untilMs ${untilMs} is ${span} ms after the log's first entry at ${state.nowMs}. ` +
      `Fold from the log's own epoch, not a wall clock.`,
    );
  }

  let cursor = 0;
  let tickCount = 0;

  for (let t = state.nowMs; t <= untilMs; t += TICK_MS) {
    state.nowMs = t;

    // 1. Apply every entry authored at or before this tick.
    while (cursor < log.length && log[cursor].ms <= t) {
      const e = log[cursor++];
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
        outsideTicks.delete(id);
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
      outsideTicks.set(b.id, out.has(b.id) ? (outsideTicks.get(b.id) ?? 0) + 1 : 0);
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
        state.lockedPreferred = topContributor(bodies, outsideTicks);
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
          : topContributor(bodies, outsideTicks);
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
    tickCount++;
    if (tickCount % HUNGER_TICK_INTERVAL === 0) {
      for (const f of state.fish.values()) {
        if (f.lastBiteMs >= 0 && t - f.lastBiteMs < HUNGER_TICK_INTERVAL * TICK_MS) continue;
        f.size = clampSize(f.size - HUNGER_AMOUNT);
      }
    }
  }

  state.nowMs = untilMs;
  return state;
}
