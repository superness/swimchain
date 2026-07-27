/**
 * Incremental vs. batch fold. Run: npx tsx src/lib/shoalEngine.incremental.test.ts
 *
 * The invariant that matters above everything else in Task 5: folding N ticks
 * via `foldTick`, one call per tick, must produce BYTE-IDENTICAL state to
 * folding the same N ticks in one `foldShoal` call. The shell calls `foldTick`
 * every frame on a live session; if the two paths ever disagree, the shell
 * shows the player a different world than every other test in this suite
 * describes the engine as producing.
 *
 * `richSession()` and `fingerprint()` are copied verbatim from
 * shoalEngine.determinism.test.ts rather than imported from it, deliberately:
 * that file is a runnable script whose own top-level code ends in
 * `process.exit()`, so importing anything from it would execute (and then
 * terminate the process inside) its entire test suite as a side effect of
 * the import, before this file's own checks ever ran. Keep both in sync with
 * the originals by hand if either changes — every field-level comment below
 * is reproduced unedited from there.
 */
import { foldShoal, foldTick, emptyState } from './shoalEngine';
import type { LogEntry, Presence } from './shoalTypes';
import { cellCentre } from './bloom';
import { TICK_MS } from './shoalConst';
import { epochOf, epochStartMs } from './epoch';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

// --- richSession(), copied verbatim from shoalEngine.determinism.test.ts ---
// A hand-built, fully static fixture (every fish stationary from t=0)
// engineered so tension climbs to the trigger, a sweep actually resolves, and
// a bloom actually credits — chosen deliberately over an inert log of pure
// presence writes, which fires no hush, no sweep and no bite and so would
// prove nothing about the hush/sweep/bloom machinery this file exists to
// cross-check between the batch and incremental paths.
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

// --- fingerprint(), copied verbatim from shoalEngine.determinism.test.ts ---
// Fingerprint every field of ShoalState that could diverge between two
// clients that folded the same log in different delivery orders — including
// the hush/bloom fields, which an earlier draft omitted and which is exactly
// the class of bug that stays invisible until it is player-visible. Every
// map and array is sorted before serialising, so insertion order can never
// leak into the comparison.
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
// Same session length shoalEngine.determinism.test.ts uses: long enough for
// tension to trigger the hush (at hand-derived t=18000), the sweep to resolve
// (t=26000), and e0's opening bite to have credited (t=0) — a hush, a sweep,
// and a credited bite, all inside [0, UNTIL_MS].
const UNTIL_MS = 30_000;
// epochOf(30_000) is 0 (EPOCH_MS is 3_600_000), so epochStartMs(0) = 0 — the
// same origin shoalEngine.determinism.test.ts relies on for this same log.
const originMs = epochStartMs(epochOf(UNTIL_MS));
check('this file folds inside epoch 0, so the origin is 0 as assumed below',
  epochOf(UNTIL_MS) === 0 && originMs === 0, { epoch: epochOf(UNTIL_MS), originMs });

// --- Non-degeneracy: the reference batch fold must actually DO something,
// or every byte-identical comparison below is comparing two empty worlds and
// proves nothing (the exact defect this plan's brief calls out as having
// already shipped once on this project).
const referenceBatch = foldShoal(richLog, UNTIL_MS);
check('the reference batch fold actually resolved a sweep',
  referenceBatch.lastSweepMs >= 0 && referenceBatch.lastTaken.length > 0,
  { lastSweepMs: referenceBatch.lastSweepMs, lastTaken: referenceBatch.lastTaken });
check('the reference batch fold actually credited a bite',
  referenceBatch.bitesTaken.size > 0, [...referenceBatch.bitesTaken.entries()]);

// --- Tick-by-tick vs. one-shot ----------------------------------------------
{
  let state = emptyState(originMs);
  let ticks = 0;
  while (state.nowMs <= UNTIL_MS) {
    state = foldTick(state, richLog);
    ticks++;
  }
  // foldShoal stamps nowMs to untilMs at the very end (shoalEngine.ts's own
  // final line); mirror that here for a fair read of `state` directly. Not
  // load-bearing for the comparison below: fingerprint() never reads nowMs.
  state.nowMs = UNTIL_MS;

  check('foldTick actually ran more than one tick (a real incremental fold, not a no-op loop)',
    ticks > 1, ticks);
  check('incremental folding matches the batch fold, byte-for-byte',
    fingerprint(state) === fingerprint(referenceBatch),
    { incremental: fingerprint(state), batch: fingerprint(referenceBatch) });
}

// --- Stop partway, resume: the shape the shell actually uses ---------------
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

  check('the fold actually stopped mid-hush, with inputs already locked (non-degenerate resume point)',
    state.hushStartMs >= 0 && state.lockedPositions !== null && state.lockedPreferred !== null,
    { hushStartMs: state.hushStartMs, locked: state.lockedPositions !== null, preferred: state.lockedPreferred });

  // Resume from exactly where it left off — no re-seeding, no rebuild.
  while (state.nowMs <= UNTIL_MS) state = foldTick(state, richLog);
  state.nowMs = UNTIL_MS;

  check('stopping partway and resuming matches folding straight through',
    fingerprint(state) === fingerprint(referenceBatch),
    { resumed: fingerprint(state), batch: fingerprint(referenceBatch) });
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
