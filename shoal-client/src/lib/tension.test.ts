/**
 * Tension: the school's own greed, measured. Run: npx tsx src/lib/tension.test.ts
 *
 * The critical property is ROBUSTNESS. Under a mean-based measure, one player
 * swimming far out spikes tension and darts back to safety while a rival is
 * caught in the open — a personal "call the shark on my enemy" button. A
 * count-based measure caps every individual's contribution at exactly one.
 */
import { coreCentre, outsideCore, spreadPerMille, stepTension, topContributor } from './tension';
import type { Body } from './shelter';
import { CORE_R, TENSION_NEUTRAL, TENSION_TRIGGER } from './shoalConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const at = (id: string, x: number, y: number, size = 100): Body => ({ id, x, y, size });

// --- The core centre -------------------------------------------------------
// medianInt takes the lower middle on even counts, so x of [0,10,20] is 10.
check('centre of a tight trio', (() => {
  const c = coreCentre([at('a', 0, 0), at('b', 10, 10), at('c', 20, 20)]);
  return c.x === 10 && c.y === 10;
})(), coreCentre([at('a', 0, 0), at('b', 10, 10), at('c', 20, 20)]));

// The median must ignore an extreme outlier entirely. A mean would not:
// mean x of [0,10,20,100000] is 25007, median (lower middle) is 10.
check('one distant fish does not move the centre', (() => {
  const c = coreCentre([at('a', 0, 0), at('b', 10, 10), at('c', 20, 20), at('z', 100_000, 100_000)]);
  return c.x === 10 && c.y === 10;
})(), coreCentre([at('a', 0, 0), at('b', 10, 10), at('c', 20, 20), at('z', 100_000, 100_000)]));

check('centre of an empty sea is the origin', coreCentre([]).x === 0 && coreCentre([]).y === 0);

// --- Who is outside --------------------------------------------------------
{
  // Centre will be (0,0). A fish exactly on CORE_R is inside; one past is out.
  const bodies = [at('a', 0, 0), at('b', 0, 0), at('c', 0, 0), at('edge', CORE_R, 0), at('far', CORE_R + 1, 0)];
  const out = outsideCore(bodies);
  check('a fish on the core radius is inside', !out.includes('edge'), out);
  check('a fish past the core radius is outside', out.includes('far'), out);
  check('outsideCore returns sorted ids', JSON.stringify(out) === JSON.stringify([...out].sort()), out);
}

// --- Spread, in per mille --------------------------------------------------
// Hand arithmetic: 1 of 4 outside = 1000*1/4 = 250 per mille.
{
  const bodies = [at('a', 0, 0), at('b', 0, 0), at('c', 0, 0), at('far', 100_000, 0)];
  check('one of four outside is 250 per mille', spreadPerMille(bodies) === 250, spreadPerMille(bodies));
}
// 2 of 4 outside = 500 per mille.
{
  const bodies = [at('a', 0, 0), at('b', 0, 0), at('f1', 100_000, 0), at('f2', 100_001, 0)];
  const s = spreadPerMille(bodies);
  check('two of four outside is at least 500 per mille', s >= 500, s);
}
check('an empty sea has no spread', spreadPerMille([]) === 0);

// --- The individual cap ----------------------------------------------------
// The whole point: moving ONE fish from far to absurdly far must not change
// the reading at all. A mean-based measure would change dramatically.
{
  const near = [at('a', 0, 0), at('b', 0, 0), at('c', 0, 0), at('z', 5_000, 0)];
  const far  = [at('a', 0, 0), at('b', 0, 0), at('c', 0, 0), at('z', 3_000_000, 0)];
  check('one fish cannot spike tension by going further', spreadPerMille(near) === spreadPerMille(far),
    { near: spreadPerMille(near), far: spreadPerMille(far) });
}

// --- Accumulation ----------------------------------------------------------
// stepTension adds (spread - NEUTRAL) and floors at zero.
{
  const tight = [at('a', 0, 0), at('b', 0, 0), at('c', 0, 0), at('d', 0, 0)];
  check('a tight school never raises tension', stepTension(0, tight) === 0, stepTension(0, tight));
  check('a tight school drains existing tension', stepTension(5_000, tight) < 5_000, stepTension(5_000, tight));
  check('tension never goes below zero', stepTension(0, tight) >= 0);
}
{
  // x-values [0,90000,180000,180001]; median x=90000; centre=(90000,0).
  // 'a' at (0,0) is 90000 away → outside; 'mid' at (90000,0) is at centre → inside;
  // 'f2' and 'f3' are ~90000 away → outside. 3 of 4 outside = 750 per mille.
  // Delta = 750 - 250 = 500, by hand.
  const loose = [at('a', 0, 0), at('mid', 90_000, 0), at('f2', 180_000, 0), at('f3', 180_001, 0)];
  check('a loose school raises tension by spread minus neutral',
    stepTension(1_000, loose) === 1_000 + (spreadPerMille(loose) - TENSION_NEUTRAL),
    { got: stepTension(1_000, loose), spread: spreadPerMille(loose), TENSION_NEUTRAL });
  check('a loose school does raise tension', stepTension(1_000, loose) > 1_000);
}
// The trigger must be reachable in a plausible number of ticks, not never.
{
  const loose = [at('a', 0, 0), at('mid', 90_000, 0), at('f2', 180_000, 0), at('f3', 180_001, 0)];
  let t = 0, ticks = 0;
  while (t < TENSION_TRIGGER && ticks < 10_000) { t = stepTension(t, loose); ticks++; }
  check('a loose school reaches the trigger', t >= TENSION_TRIGGER, { ticks });
  check('it takes more than a moment to get there', ticks > 20, { ticks });
}

// --- The preferred target --------------------------------------------------
{
  const bodies = [at('a', 0, 0), at('b', 0, 0), at('c', 0, 0), at('x', 90_000, 0, 500), at('y', 90_001, 0, 900)];
  // 'y' has been outside longer, so it is the contributor regardless of size.
  const ticks = new Map([['x', 4], ['y', 40]]);
  check('the longest-exposed fish is the contributor', topContributor(bodies, ticks) === 'y',
    topContributor(bodies, ticks));

  // Tie on time: the larger fish is preferred.
  const tied = new Map([['x', 10], ['y', 10]]);
  check('ties on time break toward the larger fish', topContributor(bodies, tied) === 'y',
    topContributor(bodies, tied));

  // Nobody outside means nobody is preferred.
  check('a tight school has no contributor', topContributor([at('a', 0, 0), at('b', 0, 0)], new Map()) === null);
}
{
  // The tertiary tiebreak: equal outside-ticks AND equal size. This is a LIVE
  // consensus decision, not a curiosity — the preferred target jumps the queue
  // in selectTaken, so whoever wins this comparison is a fish that dies. Two
  // clients resolving it differently is the "shark ate the wrong fish"
  // divergence. And a tie here is the normal case, not an edge case: a school
  // that all arrived together and has all been outside the core since is
  // exactly tied on both keys.
  //
  // x-values [0,0,0,90000,90001] sorted, odd count of 5, so medianInt takes
  // index (5-1)/2 = 2 -> 0; y is all zeros -> 0. Centre is (0,0). 'a','b','c'
  // sit on it; 'x' at 90000 and 'y' at 90001 are both far past CORE_R(620).
  // Both are size 500 and both are given 10 ticks outside, so ticks and size
  // are exhausted as discriminators and only the id is left.
  //
  // outsideCore returns ids ASCENDING and topContributor replaces its running
  // best only on a STRICT improvement, so the first id it scans survives:
  // the LOWER id, 'x'.
  const bodies = [at('a', 0, 0), at('b', 0, 0), at('c', 0, 0), at('x', 90_000, 0, 500), at('y', 90_001, 0, 500)];
  const dead = new Map([['x', 10], ['y', 10]]);
  check('the tie is genuine: same ticks, same size',
    dead.get('x') === dead.get('y') && bodies[3].size === bodies[4].size,
    { ticks: [...dead], sizes: [bodies[3].size, bodies[4].size] });
  check('ties on time AND size break toward the lower id',
    topContributor(bodies, dead) === 'x', topContributor(bodies, dead));
  check('the id tiebreak does not depend on input array order',
    topContributor([...bodies].reverse(), dead) === 'x',
    topContributor([...bodies].reverse(), dead));
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
