/**
 * The sweep. Run: npx tsx src/lib/sweep.test.ts
 *
 * Two properties carry the whole game:
 *  - ABSOLUTE THRESHOLD, not maximum. The sweep may take nobody. Under a
 *    take-the-loneliest rule, a group who all drift away from one person make
 *    that person permanently the victim with no counterplay. Under an absolute
 *    threshold, hugging ANYONE saves you, and two outcasts save each other.
 *  - RESOLUTION BINDS ONLY ON LOCKED INPUT. Two clients holding different
 *    input sets must not compute different answers.
 */
import { hushPhase, shouldStartHush, isResolveTick, selectTaken } from './sweep';
import type { Body } from './shelter';
import { HUSH_MS, LOCK_MS, MAX_TAKE, TENSION_TRIGGER, TICK_MS } from './shoalConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const at = (id: string, x: number, y: number, size = 100): Body => ({ id, x, y, size });

// --- Phases ----------------------------------------------------------------
// Hand-walked against HUSH_MS=8000, LOCK_MS=4000, hush starting at t=1000.
check('no hush means calm', hushPhase(-1, 5_000) === 'calm');
check('the hush opens in commit', hushPhase(1_000, 1_000) === 'commit');
check('still commit just before the lock', hushPhase(1_000, 1_000 + LOCK_MS - 1) === 'commit');
check('dread begins exactly at the lock', hushPhase(1_000, 1_000 + LOCK_MS) === 'dread');
check('still dread just before resolution', hushPhase(1_000, 1_000 + HUSH_MS - 1) === 'dread');
check('calm returns after resolution', hushPhase(1_000, 1_000 + HUSH_MS) === 'calm');
check('time before the hush is calm', hushPhase(1_000, 999) === 'calm');

// --- Firing ----------------------------------------------------------------
check('tension below the trigger does not fire', shouldStartHush(TENSION_TRIGGER - 1, -1) === false);
check('tension at the trigger fires', shouldStartHush(TENSION_TRIGGER, -1) === true);
check('a hush already running does not re-fire', shouldStartHush(TENSION_TRIGGER * 10, 5_000) === false);

// --- The resolve tick ------------------------------------------------------
check('resolution lands on the hush end', isResolveTick(1_000, 1_000 + HUSH_MS, TICK_MS) === true);
check('no resolution before the end', isResolveTick(1_000, 1_000 + HUSH_MS - TICK_MS, TICK_MS) === false);
check('no resolution after the end', isResolveTick(1_000, 1_000 + HUSH_MS + TICK_MS, TICK_MS) === false);
check('no resolution without a hush', isResolveTick(-1, 5_000, TICK_MS) === false);

// --- Absolute threshold: the sweep may take NOBODY --------------------------
{
  // Six fish piled together: everyone has five neighbours, far above the
  // threshold of three. Nobody is exposed, so nobody is taken.
  const tight: Body[] = [];
  for (let i = 0; i < 6; i++) tight.push(at(`f${i}`, 1000 + i, 1000));
  check('a tight school loses nobody', selectTaken(tight, null).length === 0, selectTaken(tight, null));
}

// --- ...and may take several ----------------------------------------------
{
  // Five fish scattered far apart: all exposed. Capped at MAX_TAKE.
  const scattered: Body[] = [];
  for (let i = 0; i < 5; i++) scattered.push(at(`f${i}`, i * 50_000, 0));
  const taken = selectTaken(scattered, null);
  check('a scattered school loses several', taken.length === MAX_TAKE, taken);
}

// --- The anti-ostracism property -------------------------------------------
{
  // Nineteen fish agree to leave one alone. Under take-the-maximum, 'victim'
  // is always taken and can do nothing. Here, joining ANY two others saves it.
  const pack: Body[] = [];
  for (let i = 0; i < 19; i++) pack.push(at(`p${i}`, 1000 + i, 1000));
  const isolated = [...pack, at('victim', 90_000, 90_000, 900)];
  check('an isolated fish is taken', selectTaken(isolated, null).includes('victim'), selectTaken(isolated, null));

  // Two other outcasts are not enough (the floor of three), but three are.
  const rescued = [...pack, at('victim', 90_000, 90_000, 900), at('o1', 90_010, 90_000),
    at('o2', 90_000, 90_010), at('o3', 90_010, 90_010)];
  check('four outcasts together are safe', !selectTaken(rescued, null).includes('victim'),
    selectTaken(rescued, null));
}

// --- Largest first, then preferred -----------------------------------------
{
  const exposed = [at('small', 0, 0, 100), at('big', 500_000, 0, 900), at('mid', 1_000_000, 0, 400)];
  const taken = selectTaken(exposed, null);
  check('the largest exposed fish is taken first', taken[0] === 'big', taken);
  check('order is by descending size', JSON.stringify(taken) === JSON.stringify(['big', 'mid', 'small']), taken);
}
{
  // The preferred target jumps the queue even when it is not the largest.
  const exposed = [at('small', 0, 0, 100), at('big', 500_000, 0, 900), at('mid', 1_000_000, 0, 400)];
  const taken = selectTaken(exposed, 'small');
  check('the preferred target is taken first', taken[0] === 'small', taken);
}
{
  // A preferred target that is NOT exposed is not taken at all — greed calls
  // the shark, but shelter still saves you.
  const pack: Body[] = [];
  for (let i = 0; i < 6; i++) pack.push(at(`p${i}`, 1000 + i, 1000));
  check('a sheltered preferred target is spared', selectTaken(pack, 'p0').length === 0, selectTaken(pack, 'p0'));
}

// --- Determinism -----------------------------------------------------------
{
  // Same fish, different array order, must give the same answer. Without a
  // total order on ties this is exactly where two clients diverge.
  const a = [at('x', 0, 0, 200), at('y', 500_000, 0, 200), at('z', 1_000_000, 0, 200)];
  const b = [a[2], a[0], a[1]];
  check('input order does not change the outcome',
    JSON.stringify(selectTaken(a, null)) === JSON.stringify(selectTaken(b, null)),
    { a: selectTaken(a, null), b: selectTaken(b, null) });
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
