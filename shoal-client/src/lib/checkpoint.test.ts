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
import { VOID_WINDOW_MS } from './shoalConst';

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

/** A state carrying the given live fish, inserted in the given order. */
function stateWith(pairs: Array<[string, number]>): ShoalState {
  const s = emptyState(0);
  for (const [id, size] of pairs) s.fish.set(id, fish(id, size));
  return s;
}

// --- Canonical ordering ----------------------------------------------------
// The same world built in two different insertion orders must serialise
// identically. This is the property the whole design rests on.
{
  const a = stateWith([['zed', 140], ['abe', 100], ['mid', 120]]);
  const b = stateWith([['mid', 120], ['zed', 140], ['abe', 100]]);
  const ca = serialiseCheckpoint(checkpointFrom(a, 7));
  const cb = serialiseCheckpoint(checkpointFrom(b, 7));
  check('insertion order does not change the checkpoint', ca === cb, { ca, cb });
  check('ids are sorted ascending',
    JSON.stringify(checkpointFrom(a, 7).sizes.map((p) => p[0])) === JSON.stringify(['abe', 'mid', 'zed']),
    checkpointFrom(a, 7).sizes);
}

// --- Departed swimmers are included ---------------------------------------
// A swimmer who lapsed still owns their size, so a checkpoint that dropped
// them would reset them to START_SIZE on return — the exact bug spec 2.7 bans.
{
  const s = stateWith([['live', 130]]);
  s.departed.set('gone', { size: 155, lastScatterMs: -1, lastBiteMs: -1, recentBites: [] });
  const cp = checkpointFrom(s, 2);
  const ids = cp.sizes.map((p) => p[0]);
  check('a departed swimmer is checkpointed', ids.includes('gone'), ids);
  check('their banked size is preserved',
    cp.sizes.find((p) => p[0] === 'gone')![1] === 155, cp.sizes);
}

// --- The epoch is carried --------------------------------------------------
check('the checkpoint records its epoch', checkpointFrom(stateWith([]), 42).epoch === 42);

// --- Round trip ------------------------------------------------------------
{
  const cp = checkpointFrom(stateWith([['a', 100], ['b', 200]]), 5);
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
  const s = emptyState(50_000); // state.nowMs = 50_000
  s.fish.set('fresh', { ...fish('fresh', 120), lastBiteMs: 40_000, recentBites: [40_000] });
  s.fish.set('old', { ...fish('old', 120), lastBiteMs: 39_999, recentBites: [39_999] });
  // Hand arithmetic: age = nowMs - lastBiteMs. 'fresh': 50_000 - 40_000 =
  // VOID_WINDOW_MS(10_000) exactly -- the boundary is inclusive (`<=`, same
  // as the scatter-void filter's own convention in shoalEngine.ts), so this
  // MUST qualify. 'old': 50_000 - 39_999 = 10_001, one ms past the window --
  // this must NOT qualify.
  check('VOID_WINDOW_MS really is 10_000, matching the hand arithmetic above',
    VOID_WINDOW_MS === 10_000, VOID_WINDOW_MS);
  const cp = checkpointFrom(s, 1);
  const recentIds = cp.recent.map((r) => r[0]);
  check('a bite exactly VOID_WINDOW_MS old still qualifies (inclusive boundary)',
    recentIds.includes('fresh'), cp.recent);
  check('a bite one ms older than VOID_WINDOW_MS does not qualify',
    !recentIds.includes('old'), cp.recent);
  check('both swimmers are still checkpointed on size regardless of recent-tail eligibility',
    cp.sizes.map((p) => p[0]).sort().join(',') === 'fresh,old', cp.sizes);
  check("'fresh's carried recentBites value is exactly what was on the fish",
    JSON.stringify(cp.recent.find((r) => r[0] === 'fresh')) === JSON.stringify(['fresh', 40_000, [40_000]]),
    cp.recent);
}

// --- Round trip with a nonempty recent --------------------------------------
{
  const s = emptyState(1_000);
  s.fish.set('a', { ...fish('a', 130), lastBiteMs: 500, recentBites: [200, 500] });
  const cp = checkpointFrom(s, 9);
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
