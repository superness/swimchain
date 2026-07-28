/**
 * Checkpoints. Run: npx tsx src/lib/checkpoint.test.ts
 *
 * A checkpoint is what a joining client adopts instead of replaying from
 * genesis, so it must be CANONICAL: two clients that agree on the world must
 * produce byte-identical output, with no Map insertion order leaking in.
 */
import { checkpointFrom, serialiseCheckpoint, parseCheckpoint } from './checkpoint';
import { emptyState } from './shoalEngine';
import type { ShoalState, Fish } from './shoalTypes';
import { VOID_WINDOW_MS, TICK_MS } from './shoalConst';
import { epochStartMs, epochEndMs } from './epoch';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

function fish(id: string, size: number): Fish {
  return {
    id, x: 0, y: 0, size,
    vec: { x: 0, y: 0, heading: 0, speed: 0, t: 0 },
    expiresMs: 0, lastScatterMs: -1, lastBiteMs: -1, recentBites: [],
  };
}

/**
 * A state sitting in `epoch`, carrying the given live fish in the given
 * insertion order. `checkpointFrom` refuses a state whose `epoch` is not the
 * one being checkpointed (its recent-tail cutoff is measured against
 * `epochEndMs(epoch)`, so a mismatch would silently produce the wrong
 * `recent`), so every hand-built state here has to say which epoch it is in.
 * `emptyState(epochStartMs(e))` already derives `epoch: e` — asserted below
 * rather than assumed.
 */
function stateWith(epoch: number, pairs: Array<[string, number]>): ShoalState {
  const s = emptyState(epochStartMs(epoch));
  for (const [id, size] of pairs) s.fish.set(id, fish(id, size));
  return s;
}
check('the test helper really builds state in the epoch it claims',
  stateWith(7, []).epoch === 7 && stateWith(0, []).epoch === 0,
  { seven: stateWith(7, []).epoch, zero: stateWith(0, []).epoch });

// --- Canonical ordering ----------------------------------------------------
// The same world built in two different insertion orders must serialise
// identically. This is the property the whole design rests on.
{
  const a = stateWith(7, [['zed', 140], ['abe', 100], ['mid', 120]]);
  const b = stateWith(7, [['mid', 120], ['zed', 140], ['abe', 100]]);
  const ca = serialiseCheckpoint(checkpointFrom(a, 7));
  const cb = serialiseCheckpoint(checkpointFrom(b, 7));
  check('insertion order does not change the checkpoint', ca === cb, { ca, cb });
  check('ids are sorted ascending',
    JSON.stringify(checkpointFrom(a, 7).sizes.map((p) => p[0])) === JSON.stringify(['abe', 'mid', 'zed']),
    checkpointFrom(a, 7).sizes);
}

// --- The epoch must match the state (fix review I4) -------------------------
// Nothing used to stop checkpointing a mid-epoch-3 state as epoch 7. Now that
// the recent-tail cutoff is derived from `epoch`, a mismatch is not a
// cosmetic mislabel — it measures every swimmer's last bite against the wrong
// hour and silently emits the wrong `recent`.
{
  const s = stateWith(3, [['a', 100]]);
  let threw = false;
  let isRangeError = false;
  try { checkpointFrom(s, 7); } catch (e) { threw = true; isRangeError = e instanceof RangeError; }
  check('checkpointing a state as the wrong epoch is refused', threw && isRangeError);
  check('the matching epoch is still accepted', checkpointFrom(s, 3).epoch === 3);
}

// --- The cutoff is the EPOCH's end, not the fold's endpoint (fix review C1) --
// checkpointFrom used to measure `recent` against state.nowMs, which foldShoal
// set to whatever untilMs the caller passed. Same epoch, same log, same world,
// three defensible endpoints -> three different serialisations. Here the two
// states are IDENTICAL except for nowMs, so under the old rule the second one
// dropped 'ate' from `recent` while the first kept it.
//
// Note which DIRECTION the divergence has to run. Every endpoint sits at or
// before the epoch's end, so `nowMs - lastBiteMs` is always <= `end -
// lastBiteMs`: a bite the canonical cutoff carries is carried at every
// endpoint too. The only observable disagreement is the other way round — a
// bite the canonical rule DROPS (older than VOID_WINDOW_MS at the epoch's
// end) that an early endpoint would still have carried. So 'stale' below is
// deliberately 11_000 ms before the end, not 10_000.
{
  const epoch = 2;
  const end = epochEndMs(epoch); // 3 * EPOCH_MS = 10_800_000
  // Hand arithmetic, against the canonical cutoff (the epoch's end):
  //   'stale' bit 11_000 ms before the end -> 11_000 > VOID_WINDOW_MS(10_000)
  //           -> never carried, at any endpoint
  //   'fresh' bit  9_000 ms before the end ->  9_000 <= 10_000
  //           -> always carried, at any endpoint
  // Against the OLD state.nowMs cutoff, 'stale's age per endpoint is
  //   end - 2_000 -> 9_000 carried | end - 1_000 -> 10_000 carried
  //   end -   250 -> 10_750 dropped
  // which is one world serialising two different ways.
  const staleMs = end - 11_000;
  const freshMs = end - 9_000;
  const atEndpoint = (nowMs: number): ShoalState => {
    const s = stateWith(epoch, []);
    s.fish.set('stale', { ...fish('stale', 130), lastBiteMs: staleMs, recentBites: [staleMs] });
    s.fish.set('fresh', { ...fish('fresh', 140), lastBiteMs: freshMs, recentBites: [freshMs] });
    s.nowMs = nowMs;
    return s;
  };
  const early = atEndpoint(end - 2_000);
  const mid = atEndpoint(end - 1_000);
  const late = atEndpoint(end - TICK_MS); // the canonical last tick of the epoch
  check('the three endpoints really differ, and all sit inside the epoch',
    early.nowMs < mid.nowMs && mid.nowMs < late.nowMs
      && early.nowMs > freshMs && late.nowMs < end,
    { early: early.nowMs, mid: mid.nowMs, late: late.nowMs, end });
  const a = serialiseCheckpoint(checkpointFrom(early, epoch));
  const b = serialiseCheckpoint(checkpointFrom(mid, epoch));
  const c = serialiseCheckpoint(checkpointFrom(late, epoch));
  check('the endpoint the fold stopped on does not change the checkpoint',
    a === b && b === c, { a, b, c });
  // Non-degenerate in both directions: the shared answer carries exactly the
  // swimmer the canonical cutoff says it should, and drops exactly the one it
  // says it should.
  check('and the shared answer is the hand-derived one: fresh carried, stale dropped',
    JSON.stringify(checkpointFrom(late, epoch).recent) === JSON.stringify([['fresh', freshMs, [freshMs]]]),
    checkpointFrom(late, epoch).recent);
}

// --- Departed swimmers are included ---------------------------------------
// A swimmer who lapsed still owns their size, so a checkpoint that dropped
// them would reset them to START_SIZE on return — the exact bug spec 2.7 bans.
{
  const s = stateWith(2, [['live', 130]]);
  s.departed.set('gone', { size: 155, lastScatterMs: -1, lastBiteMs: -1, recentBites: [] });
  const cp = checkpointFrom(s, 2);
  const ids = cp.sizes.map((p) => p[0]);
  check('a departed swimmer is checkpointed', ids.includes('gone'), ids);
  check('their banked size is preserved',
    cp.sizes.find((p) => p[0] === 'gone')![1] === 155, cp.sizes);
}

// --- The epoch is carried --------------------------------------------------
check('the checkpoint records its epoch', checkpointFrom(stateWith(42, []), 42).epoch === 42);

// --- Round trip ------------------------------------------------------------
{
  const cp = checkpointFrom(stateWith(5, [['a', 100], ['b', 200]]), 5);
  const text = serialiseCheckpoint(cp);
  const back = parseCheckpoint(text);
  check('a checkpoint round-trips through text', back !== null && serialiseCheckpoint(back) === text, text);
  check('the round trip preserves the epoch', back!.epoch === 5, back!.epoch);
  check('the round trip preserves sizes',
    JSON.stringify(back!.sizes) === JSON.stringify(cp.sizes), back!.sizes);
  check('a checkpoint with no recent bites still has a concrete (empty) recent array',
    Array.isArray(cp.recent) && cp.recent.length === 0, cp.recent);
}

// --- recent: a bounded tail of cooldown/void-window state (fix review) -----
// Spec 3.9 point 3 originally read "only size crosses an epoch boundary."
// That was wrong: it reset every seeded swimmer's lastBiteMs to -1 and
// recentBites to [], reproducing exactly the two exploits Departed's own doc
// comment says a presence LAPSE must never cause (a free EAT_COOLDOWN_MS
// reset, and a bite laundered out of reach of the next sweep) -- and worse,
// on a schedule ("eat right before the hourly boundary") a player can time
// deliberately. `recent` carries lastBiteMs/recentBites for swimmers whose
// last bite is still within VOID_WINDOW_MS of the checkpoint; see
// shoalEngine.test.ts's "the boundary reset was a real, timeable exploit"
// section for the fold-level tests (cooldown refusal across a real epoch
// boundary, and a recentBites value matching a continuous, non-boundary
// fold's own arithmetic). These are the checkpointFrom-level unit tests: the
// payload's bound (only recent bites qualify) and its canonicality.
{
  const epoch = 1;
  const end = epochEndMs(epoch); // 2 * EPOCH_MS = 7_200_000
  const s = stateWith(epoch, []);
  s.fish.set('fresh', { ...fish('fresh', 120), lastBiteMs: end - 10_000, recentBites: [end - 10_000] });
  s.fish.set('old', { ...fish('old', 120), lastBiteMs: end - 10_001, recentBites: [end - 10_001] });
  // Hand arithmetic: age = epochEndMs(epoch) - lastBiteMs. 'fresh':
  // VOID_WINDOW_MS(10_000) exactly -- the boundary is inclusive (`<=`, same
  // as the scatter-void filter's own convention in shoalEngine.ts), so this
  // MUST qualify. 'old': 10_001, one ms past the window -- this must NOT
  // qualify. state.nowMs is deliberately left at the epoch's START here, far
  // from both bites, to prove the cutoff does not read it at all.
  check('VOID_WINDOW_MS really is 10_000, matching the hand arithmetic above',
    VOID_WINDOW_MS === 10_000, VOID_WINDOW_MS);
  check('state.nowMs is nowhere near either bite, so it cannot be what decides this',
    s.nowMs === epochStartMs(epoch) && end - s.nowMs > VOID_WINDOW_MS,
    { nowMs: s.nowMs, end });
  const cp = checkpointFrom(s, 1);
  const recentIds = cp.recent.map((r) => r[0]);
  check('a bite exactly VOID_WINDOW_MS old still qualifies (inclusive boundary)',
    recentIds.includes('fresh'), cp.recent);
  check('a bite one ms older than VOID_WINDOW_MS does not qualify',
    !recentIds.includes('old'), cp.recent);
  check('both swimmers are still checkpointed on size regardless of recent-tail eligibility',
    cp.sizes.map((p) => p[0]).sort().join(',') === 'fresh,old', cp.sizes);
  check("'fresh's carried recentBites value is exactly what was on the fish",
    JSON.stringify(cp.recent.find((r) => r[0] === 'fresh'))
      === JSON.stringify(['fresh', end - 10_000, [end - 10_000]]),
    cp.recent);
  // The carried array is a COPY: a published checkpoint must not change
  // underneath its publisher because the fold kept folding.
  const liveArray = s.fish.get('fresh')!.recentBites;
  const carried = cp.recent.find((r) => r[0] === 'fresh')![2];
  check('the carried recentBites is a copy, not the live array',
    carried !== liveArray && JSON.stringify(carried) === JSON.stringify(liveArray));
}

// --- Round trip with a nonempty recent --------------------------------------
{
  const epoch = 9;
  const end = epochEndMs(epoch);
  const s = stateWith(epoch, []);
  s.fish.set('a', { ...fish('a', 130), lastBiteMs: end - 500, recentBites: [end - 800, end - 500] });
  const cp = checkpointFrom(s, epoch);
  const text = serialiseCheckpoint(cp);
  const back = parseCheckpoint(text);
  check('a checkpoint with a nonempty recent round-trips',
    back !== null && serialiseCheckpoint(back) === text, text);
  check('the round trip preserves recent',
    back !== null && JSON.stringify(back.recent) === JSON.stringify(cp.recent), back?.recent);
}

// --- Malformed input -------------------------------------------------------
// A hostile or corrupt checkpoint must be rejected, never crash or half-parse.
check('garbage parses to null', parseCheckpoint('not a checkpoint') === null);
check('empty string parses to null', parseCheckpoint('') === null);
check('valid JSON of the wrong shape parses to null', parseCheckpoint('{"epoch":1}') === null);
check('a non-integer size is rejected', parseCheckpoint('{"epoch":1,"sizes":[["a",1.5]]}') === null);
check('an unsorted checkpoint is rejected',
  parseCheckpoint('{"epoch":1,"sizes":[["b",100],["a",100]]}') === null);

// --- Malformed / absent `recent` --------------------------------------------
check('a checkpoint with no recent field at all still parses (pre-fix backward compatibility)', (() => {
  const back = parseCheckpoint('{"epoch":1,"sizes":[["a",100]]}');
  return back !== null && Array.isArray(back.recent) && back.recent.length === 0;
})());
check('an unsorted recent is rejected, same rule as sizes',
  parseCheckpoint('{"epoch":1,"sizes":[],"recent":[["b",100,[]],["a",100,[]]]}') === null);
check('a non-integer lastBiteMs in recent is rejected',
  parseCheckpoint('{"epoch":1,"sizes":[],"recent":[["a",1.5,[]]]}') === null);
check('a non-integer entry inside a recentBites array is rejected',
  parseCheckpoint('{"epoch":1,"sizes":[],"recent":[["a",100,[1.5]]]}') === null);
check('a recent entry with the wrong arity is rejected',
  parseCheckpoint('{"epoch":1,"sizes":[],"recent":[["a",100]]}') === null);
check('a recent field that is not an array at all is rejected',
  parseCheckpoint('{"epoch":1,"sizes":[],"recent":"nope"}') === null);
check('a well-formed nonempty recent parses correctly', (() => {
  const back = parseCheckpoint('{"epoch":1,"sizes":[["a",100]],"recent":[["a",50,[10,50]]]}');
  return back !== null && JSON.stringify(back.recent) === JSON.stringify([['a', 50, [10, 50]]]);
})());

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
