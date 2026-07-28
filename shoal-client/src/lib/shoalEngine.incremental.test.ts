/**
 * Task 5 fixup. Run: npx tsx src/lib/shoalEngine.incremental.test.ts
 *
 * The original version of this file asserted ONE thing: that folding N ticks
 * via `foldTick`, one call per tick, produces byte-identical state to folding
 * the same N ticks in one `foldShoal` call. That assertion is real, but it
 * cannot be load-bearing for correctness, because `foldShoal` IS now defined
 * as `while (state.nowMs <= untilMs) foldTick(state, entries)` (see
 * shoalEngine.ts). Batch and incremental are the same composition of the
 * same function, called the same number of times, over the same entries. For
 * any deterministic `f`, `f(f(f(...f(s))))` computed one way and computed
 * another way — calling the SAME `f` the SAME number of times — cannot
 * produce different output, no matter what `f` computes internally, buggy or
 * not. This was proven empirically in task-5-report.md: a real step-order
 * mutation inside `foldTick` (moving hunger before the sweep) produced ZERO
 * failures anywhere in the suite, including in this file's own comparison.
 *
 * So this file is rebuilt around two tests that CAN fail on a `foldTick`
 * bug:
 *
 *   Test A — an absolute, hand-derived expectation. Every size, position and
 *   bite count below is worked out from the CONSENSUS constants and
 *   `reckon`'s formula, in the comments, before the code that checks them.
 *   This is the only kind of test that can catch a bug shared by both the
 *   batch and incremental paths, because it does not compare the engine to
 *   itself — it compares the engine to arithmetic done by hand.
 *
 *   Test B — a structural round trip. `cursor`, `outsideTicks`, `tickCount`
 *   and `touchedIds` all live on `ShoalState` specifically so a fold can be
 *   suspended and resumed one tick at a time (shoalTypes.ts's own doc on
 *   those fields). A same-object pause-and-resume can never expose a bug
 *   where one of them is accidentally NOT carried on `state` — nothing ever
 *   left the object, so nothing was ever at risk of being lost. The shell's
 *   real use case is a page reload: the state gets serialised, reconstructed,
 *   and resumed as a DIFFERENT object built from DIFFERENT Maps. This test
 *   reproduces that with `structuredClone`, which performs a genuine deep
 *   copy (new Map/array instances, no shared references) — the same class of
 *   round trip a JSON-serialise-and-rebuild would be. Anything `foldTick`
 *   needs that is not reachable from `state` would silently not make the
 *   trip, and the clone would resume from an incomplete world while a
 *   same-object resume kept working right next to it.
 *
 * The old incremental-vs-batch comparison is kept at the bottom, trimmed,
 * with an explicit note that it is a consistency check only.
 */
import { foldShoal, foldTick, emptyState } from './shoalEngine';
import type { LogEntry, Presence } from './shoalTypes';
import { cellCentre } from './bloom';
import {
  TICK_MS, START_SIZE, MIN_SIZE, BITE_GROWTH, HUNGER_AMOUNT,
  BLOOM_BITES, BLOOM_COLS,
} from './shoalConst';
import { epochOf, epochStartMs } from './epoch';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

// =============================================================================
// Test A — absolute expected state, hand-derived
// =============================================================================
//
// Three swimmers, one bite, 1000ms. Every number below is derived from the
// CONSENSUS constants and reckon's formula BEFORE the fold ever runs.
//
// --- The cell -----------------------------------------------------------
// col=5, row=5 of the BLOOM_COLS(32) grid -> cell = row*BLOOM_COLS + col
//   = 5*32 + 5 = 165
// cellCentre's formula is col*BLOOM_CELL(128) + BLOOM_CELL/2, so its centre
// is (5*128+64, 5*128+64) = (704, 704) — arithmetic on BLOOM_CELL alone,
// independent of anything the library's cellCentre() computes; asserted
// against the real function below rather than assumed.
//
// --- The swimmers ---------------------------------------------------------
// p0 (the eater): parked exactly on the cell centre (704, 704), speed 0, from
//   ms=0. Distance to the centre is 0, well inside EAT_R(90) — the bite must
//   credit against a never-visited cell.
// p1 (the mover): starts at (1000, 1000) — a multiple of QUANT(8), so its
//   seed position is exact — heading 0 (so COS[0] is exactly TRIG_SCALE(4096)
//   and SIN[0] is exactly 0: reckon's trig factor cancels to exactly 1 on the
//   x-axis and exactly 0 on the y-axis) at speed 40 cu/s.
//   reckon's dx = trunc(speed * COS[0] * dtMs / (TRIG_SCALE*1000))
//              = trunc(40 * dtMs / 1000)   (exact cancellation, no rounding)
//   at t=1000 (the last tick folded, see below): dt=1000, dx=trunc(40)=40,
//   x_raw = 1040 -- itself a multiple of QUANT(8), so quantize is a no-op.
//   y is unchanged (dy=0 always, since SIN[0]=0): y=1000.
// p2 (the bystander): parked at (2000, 2000), speed 0, present only to prove
//   "a handful of fish" and to give hunger a second untouched target to act
//   on identically to p1.
//
// --- Ordering within tick t=0 ----------------------------------------------
// All four log entries (p0 presence, p0's eat claim, p1 presence, p2
// presence) share ms=0, so orderLog's hash tiebreak decides the order. Using
// the same `id + ms` / `id + 'e' + ms` convention as shoalEngine.test.ts:
//   p0 presence hash 'p00', p0 eat hash 'p0e0', p1 presence hash 'p10',
//   p2 presence hash 'p20'.
// 'p00' < 'p0e0' (comparing the third character, '0' < 'e') so p0's presence
// is applied before its own eat claim, and 'p0e0' < 'p10' < 'p20' by the
// first differing character. Applied order: p0 presence, p0 eat, p1
// presence, p2 presence — the fold sees a live p0 before it judges the bite.
//
// --- The bite (tick t=0, step 1) --------------------------------------
// claimedAt = reckon(p0.vec, 0): dt=0, so claimedAt = (704, 704), exactly the
// cell centre (dist2 = 0 <= EAT_R2). lastVisit is empty (never visited) so
// isBloomReady is true; bitesTaken is empty so bitesLeft is BLOOM_BITES(6);
// p0.lastBiteMs is -1 so the cooldown check is skipped. The bite credits:
//   bitesTaken.set(165, 1)          -- 1 of 6, cell stays latched afterward
//   bloomSinceMs.set(165, 0)        -- opens the latch (1 < BLOOM_BITES)
//   p0.size = START_SIZE(100) + BITE_GROWTH(12) = 112
//   p0.lastBiteMs = 0, p0.recentBites = [0]
// p0 stands on the cell every tick afterward (speed 0), so markVisits
// re-stamps lastVisit(165) = t on every tick -- it can never go fallow inside
// this short window, so bitesTaken/bloomSinceMs never reset.
//
// --- Hunger -----------------------------------------------------------------
// Ticks land at t=0,250,500,750,1000 (five ticks folded to UNTIL_MS=1000,
// tickCount 1,2,3,4,5 in order). Hunger fires only when tickCount %
// HUNGER_TICK_INTERVAL(4) === 0 -- that is exactly ONE firing, at the tick
// processing t=750 (tickCount=4). No other tick in this window fires it.
//   p0: lastBiteMs=0, and at t=750, t-lastBiteMs = 750 < HUNGER_TICK_INTERVAL
//       * TICK_MS (4*250=1000) -- EXEMPT. p0's size never moves from 112.
//   p1, p2: lastBiteMs=-1 (never ate) -- NOT exempt. Each loses HUNGER_AMOUNT
//       (1) exactly once: size = START_SIZE(100) - 1 = 99.
//
// --- Final expectation at UNTIL_MS=1000 --------------------------------
//   p0: size=112, x=704,  y=704  (stationary)
//   p1: size=99,  x=1040, y=1000 (moved, hand-derived above)
//   p2: size=99,  x=2000, y=2000 (stationary)
//   bitesTaken.get(165) === 1
//   bloomSinceMs.has(165) === true (still latched: 1 of 6 bites taken)
{
  const cell = 165;
  const centre = cellCentre(cell);
  check('cell 165 is centred where BLOOM_CELL arithmetic says (independent of the library call)',
    centre.x === 704 && centre.y === 704, centre);
  check('col/row recover the same cell (5*BLOOM_COLS+5)', 5 * BLOOM_COLS + 5 === 165, 5 * BLOOM_COLS + 5);

  const pres = (id: string, x: number, y: number, heading: number, speed: number): Presence => ({
    kind: 'presence', id, ms: 0, hash: `${id}0`,
    vec: { x, y, heading, speed, t: 0 },
  });
  const log: LogEntry[] = [
    pres('p0', centre.x, centre.y, 0, 0),
    { kind: 'eat', id: 'p0', cell, ms: 0, hash: 'p0e0' },
    pres('p1', 1000, 1000, 0, 40),
    pres('p2', 2000, 2000, 0, 0),
  ];
  check('the ordering within tick 0 is presence, eat, presence, presence (hash tiebreak)',
    JSON.stringify([...log].sort((a, b) => (a.hash < b.hash ? -1 : 1)).map((e) => e.hash)) ===
    JSON.stringify(['p00', 'p0e0', 'p10', 'p20']));

  const UNTIL_MS = 1_000;
  const s = foldShoal(log, UNTIL_MS);

  const p0 = s.fish.get('p0')!;
  const p1 = s.fish.get('p1')!;
  const p2 = s.fish.get('p2')!;

  check('p0 (the eater) ends at the hand-derived size: START_SIZE+BITE_GROWTH, hunger-exempt',
    p0.size === START_SIZE + BITE_GROWTH, { got: p0.size, expected: START_SIZE + BITE_GROWTH });
  check('p0 stays put (speed 0): position unchanged',
    p0.x === 704 && p0.y === 704, { x: p0.x, y: p0.y });
  check('p0 carries the credited bite in its ledger', p0.lastBiteMs === 0 && JSON.stringify(p0.recentBites) === '[0]',
    { lastBiteMs: p0.lastBiteMs, recentBites: p0.recentBites });

  check('p1 (the mover) ends at the hand-derived position: reckon dead-reckoned to t=1000',
    p1.x === 1040 && p1.y === 1000, { x: p1.x, y: p1.y });
  check('p1 ends at the hand-derived size: START_SIZE minus exactly one hunger tick',
    p1.size === START_SIZE - HUNGER_AMOUNT, { got: p1.size, expected: START_SIZE - HUNGER_AMOUNT });

  check('p2 (the bystander) stays put: position unchanged',
    p2.x === 2000 && p2.y === 2000, { x: p2.x, y: p2.y });
  check('p2 ends at the hand-derived size: identical hunger loss to p1, never ate',
    p2.size === START_SIZE - HUNGER_AMOUNT, { got: p2.size, expected: START_SIZE - HUNGER_AMOUNT });

  check('exactly one bite is credited on the hand-derived cell',
    s.bitesTaken.get(cell) === 1 && s.bitesTaken.size === 1,
    { bitesTaken: [...s.bitesTaken.entries()] });
  check('the bloom stays latched: 1 of BLOOM_BITES(6) taken',
    s.bloomSinceMs.has(cell) && BLOOM_BITES - (s.bitesTaken.get(cell) ?? 0) === 5,
    { latched: s.bloomSinceMs.has(cell), remaining: BLOOM_BITES - (s.bitesTaken.get(cell) ?? 0) });

  // Non-degeneracy: MIN_SIZE and BITE_GROWTH really are different values, and
  // this scenario really did move sizes away from START_SIZE in both
  // directions (up for the eater, down for the idle pair) -- so the checks
  // above are discriminating, not accidentally true for any size at all.
  check('the derivation is discriminating: eater size, idle size and START_SIZE are three distinct values',
    p0.size !== START_SIZE && p1.size !== START_SIZE && p0.size !== p1.size,
    { p0: p0.size, p1: p1.size, START_SIZE });
  check('MIN_SIZE never binds in this scenario (sanity on the fixture itself)',
    p1.size > MIN_SIZE && p2.size > MIN_SIZE, { p1: p1.size, p2: p2.size, MIN_SIZE });
}

// =============================================================================
// richSession() and fingerprint(), copied verbatim from
// shoalEngine.determinism.test.ts -- rather than imported, deliberately: that
// file is a runnable script whose own top-level code ends in `process.exit()`,
// so importing anything from it would execute (and then terminate the process
// inside) its entire test suite as a side effect of the import. Keep both in
// sync with the originals by hand if either changes.
// =============================================================================
function richSession(): LogEntry[] {
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
  const offsets: Array<[string, number, number]> = [
    ['o0', -896, 496], ['o1', -704, -304], ['o2', -496, 896], ['o3', -304, -704],
    ['o4', 304, -896], ['o5', 496, 704], ['o6', 704, -496], ['o7', 896, 304],
  ];
  for (const [id, dx, dy] of offsets) out.push(pres(id, centre.x + dx, centre.y + dy, 0));

  return out;
}

const fingerprint = (s: ReturnType<typeof foldShoal>) =>
  JSON.stringify({
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
    lastVisit: [...s.lastVisit.entries()].sort(([a], [b]) => a - b),
    bloomSince: [...s.bloomSinceMs.entries()].sort(([a], [b]) => a - b),
    hushStartMs: s.hushStartMs,
    lockedPositions: s.lockedPositions === null
      ? null
      : [...s.lockedPositions.entries()]
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([k, p]) => [k, p.x, p.y, p.size]),
    lockedPreferred: s.lockedPreferred,
  });

const richLog = richSession();
// 29_750, not the rounder 30_000 shoalEngine.determinism.test.ts uses for
// this same log: chosen by mutation-testing Test B itself (see this task's
// report). With UNTIL_MS=30_000 the post-STOP_AT continuation is 31 ticks
// long, and — with hunger's tick counter relocated off `ShoalState` onto a
// module-level variable, the exact mutation Test B exists to catch — two
// adjacent 31-tick windows happen to contain the SAME number of hunger
// firings (8 and 8) purely by residue coincidence, so the round-trip
// comparison below stayed green even with the bug live. 29_750 makes the
// post-STOP_AT window 30 ticks instead of 31, which breaks that coincidence
// (8 firings vs 7) and the same mutation now fails the comparison, verified
// empirically. The sweep (26000) and the credited bite (ms=0) are both still
// comfortably inside [0, 29_750], so nothing about the fixture's own
// richness is lost by the change.
const UNTIL_MS = 29_750;
const originMs = epochStartMs(epochOf(UNTIL_MS));
check('this file folds inside epoch 0, so the origin is 0 as assumed below',
  epochOf(UNTIL_MS) === 0 && originMs === 0, { epoch: epochOf(UNTIL_MS), originMs });

// =============================================================================
// Test B — state must survive a structural round trip
// =============================================================================
//
// STOP_AT = 22_250 is the same post-lock checkpoint shoalEngine.determinism.
// test.ts hand-derives for this exact log: strictly after the input lock
// (triggerAtMs 18000 + LOCK_MS 4000 = 22000) and strictly before the sweep
// resolves (18000 + HUSH_MS 8000 = 26000), and itself a real tick
// (22250 / TICK_MS = 89). Stopping here forces the resume to carry forward
// the trickiest live state this engine has — an in-flight hush with BOTH
// lockedPositions and lockedPreferred already frozen — not just plain fish
// positions.
{
  const STOP_AT = 22_250;
  check('the stop point is a real tick strictly inside the in-flight hush',
    STOP_AT % TICK_MS === 0 && STOP_AT > 22_000 && STOP_AT < 26_000, STOP_AT);

  let state = emptyState(originMs);
  while (state.nowMs <= STOP_AT) state = foldTick(state, richLog);

  check('the fold stopped mid-hush, with inputs already locked (non-degenerate checkpoint)',
    state.hushStartMs >= 0 && state.lockedPositions !== null && state.lockedPreferred !== null,
    { hushStartMs: state.hushStartMs, locked: state.lockedPositions !== null, preferred: state.lockedPreferred });

  // The structural round trip. structuredClone performs a genuine deep copy:
  // new Map instances, new array instances, no shared references with
  // `state`. This is deliberately NOT the same as reusing the same object —
  // it's the same class of transformation a real "serialise to JSON/IndexedDB,
  // reload the page, rebuild the Maps" round trip would be. Anything foldTick
  // needs that is not reachable from `state` (e.g. a module-level variable)
  // would silently NOT make this trip.
  const clone = structuredClone(state);

  // Prove the round trip is genuinely structural, not a same-object no-op —
  // otherwise the comparison below would pass trivially no matter what.
  check('the clone is a distinct object from the original', (clone as unknown) !== (state as unknown));
  check('the clone\'s Maps are distinct instances, not shared references',
    clone.fish !== state.fish && clone.lastVisit !== state.lastVisit &&
    clone.bitesTaken !== state.bitesTaken && clone.bloomSinceMs !== state.bloomSinceMs &&
    clone.outsideTicks !== state.outsideTicks && clone.departed !== state.departed &&
    clone.lockedPositions !== state.lockedPositions,
    { same: clone.fish === state.fish });
  check('the clone starts out equal to the original in every observable field',
    fingerprint(clone) === fingerprint(state));

  // Continue the ORIGINAL, unbroken lineage to the end of the session.
  while (state.nowMs <= UNTIL_MS) state = foldTick(state, richLog);
  state.nowMs = UNTIL_MS;

  // Non-degeneracy BEFORE comparing: this session must actually have fired a
  // hush, resolved a sweep, and credited bites, or the byte-identical
  // comparison below would just be comparing two empty worlds and proving
  // nothing (the exact defect the brief calls out as having shipped once on
  // this project already).
  check('the original continuation actually resolved a sweep (non-degenerate)',
    state.lastSweepMs >= 0 && state.lastTaken.length > 0,
    { lastSweepMs: state.lastSweepMs, lastTaken: state.lastTaken });
  check('the original continuation actually credited bites (non-degenerate)',
    state.bitesTaken.size > 0, [...state.bitesTaken.entries()]);

  // Continue the CLONE, separately, over the identical remaining span.
  let clonedState = clone;
  while (clonedState.nowMs <= UNTIL_MS) clonedState = foldTick(clonedState, richLog);
  clonedState.nowMs = UNTIL_MS;

  check('resuming from the round-tripped clone matches resuming the original, byte-for-byte',
    fingerprint(clonedState) === fingerprint(state),
    { viaClone: fingerprint(clonedState), viaOriginal: fingerprint(state) });
}

// =============================================================================
// The old incremental-vs-batch comparison, trimmed and kept.
//
// This is a CONSISTENCY check, not a coverage test: it cannot detect a bug
// confined to foldTick's own body, because foldShoal is defined as a loop
// over foldTick — the two sides are the same function composed with itself
// the same number of times, so they cannot disagree about what a tick does,
// bug or not (see the header comment above, and task-5-report.md's mutation
// evidence). It IS able to catch a bug in the LOOP-DRIVING mechanics
// themselves: wrong bounds, a caller that fails to thread `state` through
// correctly, or foldShoal drifting out of sync with foldTick in a future
// refactor. Kept for that narrower reason, not as coverage for Test A/B's job.
// =============================================================================
{
  const referenceBatch = foldShoal(richLog, UNTIL_MS);
  check('the reference batch fold actually resolved a sweep (non-degenerate)',
    referenceBatch.lastSweepMs >= 0 && referenceBatch.lastTaken.length > 0,
    { lastSweepMs: referenceBatch.lastSweepMs, lastTaken: referenceBatch.lastTaken });
  check('the reference batch fold actually credited a bite (non-degenerate)',
    referenceBatch.bitesTaken.size > 0, [...referenceBatch.bitesTaken.entries()]);

  let state = emptyState(originMs);
  let ticks = 0;
  while (state.nowMs <= UNTIL_MS) {
    state = foldTick(state, richLog);
    ticks++;
  }
  state.nowMs = UNTIL_MS;

  check('foldTick actually ran more than one tick (a real incremental fold, not a no-op loop)',
    ticks > 1, ticks);
  check('incremental folding matches the batch fold, byte-for-byte (loop-mechanics consistency check only)',
    fingerprint(state) === fingerprint(referenceBatch),
    { incremental: fingerprint(state), batch: fingerprint(referenceBatch) });
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
