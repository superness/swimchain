/**
 * Shared test fixtures for the Shoal engine.
 *
 * NON-EXECUTING BY DESIGN. This module declares functions and returns values;
 * it runs no checks and calls no `process.exit`. That is the whole reason it
 * exists: `richSession` and `fingerprint` were previously copied verbatim
 * into both shoalEngine.determinism.test.ts and
 * shoalEngine.incremental.test.ts, with a comment in the copy explaining that
 * importing from the original would execute (and then terminate the process
 * inside) an entire test suite as a side effect of the import. Two hand-kept
 * copies of a load-bearing fixture is a bug waiting for the day only one of
 * them gets updated. A plain module both files import solves it properly.
 *
 * Not named `*.test.ts`, so `npm test` does not try to run it; `tsc --noEmit`
 * still typechecks it.
 */
import { cellCentre } from './bloom';
import type { LogEntry, Presence, ShoalState } from './shoalTypes';

/**
 * A hand-built, fully static session engineered so tension climbs to the
 * trigger, a sweep actually resolves, and a bloom actually credits — with
 * every number derived from the constants, not read off whatever the fold
 * happens to produce.
 *
 * `session()`-style random-walk logs only ever emit `presence`: tension there
 * peaks around 82 (nowhere near TENSION_TRIGGER, 30_000), no hush ever
 * starts, no sweep ever resolves, and with no EatClaim ever posted,
 * bitesTaken stays empty and every fish's recentBites stays []. Replay and
 * shuffle checks over such a log prove things only for presence
 * dead-reckoning and hunger, leaving the hush, the sweep resolution and bloom
 * crediting with no shuffled full-session coverage anywhere — which is
 * exactly the class of bug sweep.ts calls the most trust-destroying this game
 * can have.
 */
export function richSession(): LogEntry[] {
  const out: LogEntry[] = [];
  const pres = (id: string, x: number, y: number, ms: number): Presence => ({
    kind: 'presence', id, ms, hash: `${id}${ms}`, vec: { x, y, heading: 0, speed: 0, t: ms },
  });

  // The eat cell: col 15, row 11 of the BLOOM_COLS(32) x BLOOM_ROWS(24) grid
  // -> cell index = row*BLOOM_COLS + col = 11*32 + 15 = 367. cellCentre's own
  // formula is col*BLOOM_CELL + BLOOM_CELL/2, so its centre is
  // (15*128+64, 11*128+64) = (1984, 1472) — arithmetic on BLOOM_CELL alone,
  // independent of anything canEat/markVisits computes.
  const cell = 367;
  const centre = cellCentre(cell); // (1984, 1472)

  // --- The sheltered cluster: the eater (e0) plus three buddies, all parked
  // exactly on the cell centre (distance 0, well inside SHELTER_R and
  // EAT_R). shelterOf sums SHELTER_BASE(100) + trunc(size/40) (capped) from
  // every OTHER body within SHELTER_R(340); at distance 0 all three buddies
  // qualify. Even once hunger has floored a buddy at MIN_SIZE(60), it still
  // contributes 100 + trunc(60/40) = 101, so three of them sum to 303 —
  // still >= SHELTER_THRESHOLD(300). So this cluster is sheltered (never
  // exposed, never swept) for the fish's entire lifetime, regardless of how
  // far hunger has eaten into their size by the time the sweep fires.
  out.push(pres('e0', centre.x, centre.y, 0));
  out.push(pres('c1', centre.x, centre.y, 0));
  out.push(pres('c2', centre.x, centre.y, 0));
  out.push(pres('c3', centre.x, centre.y, 0));
  // e0's own presence must sort before its eat claim within tick 0 so the
  // fold sees a live fish before it checks the bite, and so the fallow
  // check runs before this tick's markVisits — same ms, and hash 'e00' <
  // 'e0e0' (comparing the third character, '0' < 'e'), the identical
  // convention shoalEngine.test.ts uses for the same reason.
  out.push({ kind: 'eat', id: 'e0', cell, ms: 0, hash: 'e0e0' });

  // --- Eight outsiders, spread far from the cluster in a pattern chosen so
  // the median — see coreCentre/medianInt: for an EVEN count, the LOWER of
  // the two middle sorted values, not an average — lands exactly on the
  // cluster's own coordinate on both axes independently. That puts the
  // cluster inside the core (distance 0) and every outsider outside it.
  // Offsets are multiples of 8 (QUANT) so reckon's quantization is a no-op
  // and every resulting position is exact.
  //
  // x-offsets {-896,-704,-496,-304,304,496,704,896}: paired with the
  // cluster's four copies of x=1984, the 12 sorted x-values are [4 lower
  // outsiders][4 x 1984][4 higher outsiders] — index 5 (0-indexed, the
  // "lower middle" of 12) falls inside the middle block, value 1984.
  // Likewise the y-offsets (a permutation of the same magnitude set,
  // deliberately paired with a DIFFERENT magnitude for x each time so no
  // outsider's combined 2D distance from the cluster is small) put the
  // y-median at 1472 too. Every one of the 8 combined (dx,dy) pairs below
  // has dx^2+dy^2 > CORE_R2 (620^2 = 384400) — the smallest is o1's
  // 704^2+304^2 = 588032 — so all 8 read as outside the core on every tick.
  const offsets: Array<[string, number, number]> = [
    ['o0', -896, 496], ['o1', -704, -304], ['o2', -496, 896], ['o3', -304, -704],
    ['o4', 304, -896], ['o5', 496, 704], ['o6', 704, -496], ['o7', 896, 304],
  ];
  for (const [id, dx, dy] of offsets) out.push(pres(id, centre.x + dx, centre.y + dy, 0));

  return out;
}

/**
 * Fingerprint every field of ShoalState that could diverge between two
 * clients that folded the same log in different delivery orders.
 *
 * `recentBites` is included even though presence-only sessions never post an
 * EatClaim (so it is always empty for them) — Fish carries it since the
 * scatter-voids-the-trip fix, and leaving it out would let a fold bug that
 * corrupts only that field pass undetected. Every map and array is sorted
 * before serialising, so insertion order — which the fold's own iteration
 * order does not guarantee — can never leak into a comparison.
 *
 * The bloom and hush fields were originally omitted, under a header that
 * claimed to cover "every field that could diverge". They all carry
 * divergence-capable state and none is derivable from the rest:
 *   lastVisit       decides whether a cell is fallow, so it decides whether a
 *                   future bite credits at all
 *   bloomSinceMs    the latch — whether a cell bypasses the fallow test
 *   departed        size, cooldown and void-ledger of every lapsed swimmer; a
 *                   divergence here stays invisible until they come back
 *   hushStartMs,    the in-flight hush. Two clients disagreeing mid-hush have
 *   lockedPositions, already diverged even if the resolution has not landed
 *   lockedPreferred yet; waiting for lastTaken to differ is waiting until it
 *                   is a player-visible bug.
 *
 * The fold-internal bookkeeping (`cursor`, `outsideTicks`, `tickCount`,
 * `touchedIds`, `nowMs`, `epoch`) is deliberately absent: it is not part of
 * the observable world, and two clients that stopped on different ticks
 * should still be comparable on what the world looks like.
 */
export function fingerprint(s: ShoalState): string {
  return JSON.stringify({
    fish: [...s.fish.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => [k, v.size, v.x, v.y, [...v.recentBites].sort((a, b) => a - b)]),
    departed: [...s.departed.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => [k, v.size, v.lastScatterMs, v.lastBiteMs, [...v.recentBites].sort((a, b) => a - b)]),
    tension: s.tension,
    lastTaken: [...s.lastTaken].sort(),
    lastSweepMs: s.lastSweepMs,
    bites: [...s.bitesTaken.entries()].sort(([a], [b]) => a - b),
    // Two levels, BOTH sorted — cells numerically, then each cell's visitors
    // by id. `lastVisit` is a Map of Maps since the claimant-exemption rule
    // (bloom.ts), and an inner Map's insertion order is decided by the order
    // `markVisits` happened to walk `bodies`, which is not something two
    // clients owe each other. Sorting both levels is what keeps this
    // byte-identical across delivery orders.
    lastVisit: [...s.lastVisit.entries()]
      .sort(([a], [b]) => a - b)
      .map(([cell, by]) => [cell, [...by.entries()].sort(([a], [b]) => (a < b ? -1 : 1))]),
    bloomSince: [...s.bloomSinceMs.entries()].sort(([a], [b]) => a - b),
    hushStartMs: s.hushStartMs,
    lockedPositions: s.lockedPositions === null
      ? null
      : [...s.lockedPositions.entries()]
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([k, p]) => [k, p.x, p.y, p.size]),
    lockedPreferred: s.lockedPreferred,
  });
}
