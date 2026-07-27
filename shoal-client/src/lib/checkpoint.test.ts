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
}

// --- Malformed input -------------------------------------------------------
// A hostile or corrupt checkpoint must be rejected, never crash or half-parse.
check('garbage parses to null', parseCheckpoint('not a checkpoint') === null);
check('empty string parses to null', parseCheckpoint('') === null);
check('valid JSON of the wrong shape parses to null', parseCheckpoint('{"epoch":1}') === null);
check('a non-integer size is rejected', parseCheckpoint('{"epoch":1,"sizes":[["a",1.5]]}') === null);
check('an unsorted checkpoint is rejected',
  parseCheckpoint('{"epoch":1,"sizes":[["b",100],["a",100]]}') === null);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
