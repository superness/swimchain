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
import { type Body } from './shelter';
import { stepTension, topContributor, outsideCore } from './tension';
import { hushPhase, shouldStartHush, isResolveTick, selectTaken } from './sweep';
import { markVisits, canEat, cellCentre, isBloomReady } from './bloom';
import type { LogEntry, ShoalState, Fish } from './shoalTypes';
import {
  TICK_MS, PRESENCE_TTL_MS, START_SIZE, MIN_SIZE, BITE_GROWTH, SCATTER_COST,
  HUNGER_TICK_INTERVAL, HUNGER_AMOUNT, BLOOM_BITES, VOID_WINDOW_MS, LOCK_MS,
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
    nowMs: startMs,
    fish: new Map(),
    tension: 0,
    hushStartMs: -1,
    lockedPositions: null,
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
        state.fish.set(e.id, {
          id: e.id,
          x: seed.x,
          y: seed.y,
          size: existing ? existing.size : START_SIZE,
          vec: e.vec,
          expiresMs: e.ms + PRESENCE_TTL_MS,
          lastScatterMs: existing ? existing.lastScatterMs : -1,
          lastBiteMs: existing ? existing.lastBiteMs : -1,
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
        const ok = canEat({
          lastVisit: latched ? NEVER_VISITED : state.lastVisit,
          bitesTaken: state.bitesTaken,
          cell: e.cell,
          fishX: f.x,
          fishY: f.y,
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
      }
    }

    // 2. Drop expired presence, then dead-reckon everyone forward.
    for (const [id, f] of [...state.fish]) {
      if (t > f.expiresMs) { state.fish.delete(id); outsideTicks.delete(id); continue; }
      const p = reckon(f.vec, t);
      f.x = p.x;
      f.y = p.y;
    }

    const bodies = bodiesOf(state);

    // 3. Blooms: mark where the school has been, and reset exhausted cells
    //    whose bloom has regrown.
    //
    // Gated on isBloomReady, NOT merely "recently visited": the eat branch
    // above already stamps lastVisit at the moment a bloom is exhausted, so
    // a naive "lastVisit(cell) >= t" check would fire on that very same
    // tick (the exhausting fish is necessarily still within BLOOM_VISIT_R,
    // since EAT_R < BLOOM_VISIT_R) and erase bitesTaken before it was ever
    // observable. Gating on real fallow completion keeps an exhausted cell
    // reading as spent (bitesTaken === BLOOM_BITES) for the whole dormant
    // window, and clears it exactly when the cell becomes ready again — the
    // same instant a fresh claim's own isBloomReady check would also pass —
    // rather than early.
    markVisits(state.lastVisit, bodies, t);
    for (const [cell, used] of [...state.bitesTaken]) {
      if (used >= BLOOM_BITES && isBloomReady(state.lastVisit, cell, t)) {
        state.bitesTaken.delete(cell);
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
    }
    if (state.hushStartMs >= 0) {
      // Lock inputs the moment the commit window closes.
      if (state.lockedPositions === null && t - state.hushStartMs >= LOCK_MS) {
        state.lockedPositions = new Map(bodies.map((b) => [b.id, { x: b.x, y: b.y, size: b.size }]));
      }
      if (isResolveTick(state.hushStartMs, t, TICK_MS)) {
        const locked: Body[] = state.lockedPositions
          ? [...state.lockedPositions.entries()]
              .map(([id, p]) => ({ id, x: p.x, y: p.y, size: p.size }))
              .sort((a, b) => (a.id < b.id ? -1 : 1))
          : bodies;
        const preferred = topContributor(locked, outsideTicks);
        const taken = selectTaken(locked, preferred);
        for (const id of taken) {
          const f = state.fish.get(id);
          if (!f) continue;
          f.size = clampSize(f.size - SCATTER_COST);
          f.lastScatterMs = t;
          // Void the food this fish took in the run-up: being caught costs you
          // what you were out there for.
          if (f.lastBiteMs >= 0 && t - f.lastBiteMs <= VOID_WINDOW_MS) {
            f.size = clampSize(f.size - BITE_GROWTH);
          }
        }
        state.lastTaken = taken;
        state.lastSweepMs = t;
        state.tension = 0;
        state.hushStartMs = -1;
        state.lockedPositions = null;
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
