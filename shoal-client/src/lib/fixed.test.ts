/**
 * Integer geometry. Run: npx tsx src/lib/fixed.test.ts
 *
 * Expected values here are derived by hand or from an independent formula,
 * never by calling the function under test twice.
 */
import { COS, SIN, quantize, clampToWorld, reckon, dist2, medianInt } from './fixed';
import { HEADING_STEPS, TRIG_SCALE, QUANT, WORLD_W, WORLD_H } from './shoalConst';
import type { Vec } from './shoalTypes';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

// --- The trig table --------------------------------------------------------
check('table has one entry per brad', COS.length === HEADING_STEPS && SIN.length === HEADING_STEPS,
  { cos: COS.length, sin: SIN.length, HEADING_STEPS });

// Cardinal directions, by hand: brad 0 = +x, 64 = +y, 128 = -x, 192 = -y.
check('brad 0 points along +x', COS[0] === TRIG_SCALE && SIN[0] === 0, { c: COS[0], s: SIN[0] });
check('brad 64 points along +y', COS[64] === 0 && SIN[64] === TRIG_SCALE, { c: COS[64], s: SIN[64] });
check('brad 128 points along -x', COS[128] === -TRIG_SCALE && SIN[128] === 0, { c: COS[128], s: SIN[128] });
check('brad 192 points along -y', COS[192] === 0 && SIN[192] === -TRIG_SCALE, { c: COS[192], s: SIN[192] });

// Every entry is an integer within the scale, and the unit-circle identity
// holds to within rounding. Tolerance derived independently: each component
// is rounded by at most 0.5, so c^2+s^2 deviates by at most ~2*TRIG_SCALE.
{
  let allInt = true, identityOk = true;
  for (let i = 0; i < HEADING_STEPS; i++) {
    if (!Number.isInteger(COS[i]) || !Number.isInteger(SIN[i])) allInt = false;
    const mag = COS[i] * COS[i] + SIN[i] * SIN[i];
    if (Math.abs(mag - TRIG_SCALE * TRIG_SCALE) > 2 * TRIG_SCALE) identityOk = false;
  }
  check('every trig entry is an integer', allInt);
  check('unit-circle identity holds within rounding', identityOk);
}

// --- Quantization ----------------------------------------------------------
// QUANT is 8. By hand: 0->0, 7->0, 8->8, 15->8, -1->-8 (floor, not truncate,
// so negatives quantize consistently with positives).
check('quantize floors to the grid', quantize(0) === 0 && quantize(7) === 0 && quantize(8) === 8 && quantize(15) === 8,
  { q0: quantize(0), q7: quantize(7), q8: quantize(8), q15: quantize(15) });
check('quantize floors negatives too', quantize(-1) === -QUANT, { qm1: quantize(-1), QUANT });
check('quantize is idempotent', quantize(quantize(37)) === quantize(37));

// --- World clamping --------------------------------------------------------
check('clamp keeps interior points', clampToWorld(100, 200).x === 100 && clampToWorld(100, 200).y === 200);
check('clamp pins the far edges', clampToWorld(99_999, 99_999).x === WORLD_W && clampToWorld(99_999, 99_999).y === WORLD_H,
  clampToWorld(99_999, 99_999));
check('clamp pins the near edges', clampToWorld(-5, -5).x === 0 && clampToWorld(-5, -5).y === 0, clampToWorld(-5, -5));

// --- Dead reckoning --------------------------------------------------------
// Hand arithmetic: heading 0 (+x), speed 100 cu/s, 2000 ms elapsed.
// dx = 100 * 4096 * 2000 / (4096 * 1000) = 200. dy = 0.
// Start (500, 500) -> (700, 500) -> quantized to (696, 496).
{
  const v: Vec = { x: 500, y: 500, heading: 0, speed: 100, t: 1_000 };
  const p = reckon(v, 3_000);
  check('reckon travels +x at heading 0', p.x === 696 && p.y === 496, p);
}
// Heading 64 (+y), same numbers: dx = 0, dy = 200.
// Start (500, 500) -> (500, 700) -> quantized to (496, 696).
{
  const v: Vec = { x: 500, y: 500, heading: 64, speed: 100, t: 1_000 };
  const p = reckon(v, 3_000);
  check('reckon travels +y at heading 64', p.x === 496 && p.y === 696, p);
}
// A vector never travels backwards in time.
// Start (500, 500) at t=5_000, queried at t=1_000 means dt = -4_000, clamped to 0.
// No movement, quantized position stays as starting position quantized: (496, 496).
{
  const v: Vec = { x: 500, y: 500, heading: 0, speed: 100, t: 5_000 };
  const p = reckon(v, 1_000);
  check('reckon clamps negative elapsed time to zero', p.x === 496 && p.y === 496, p);
}
// A standing fish does not drift.
// Start (500, 500) with speed 0, t=0, queried at 60_000.
// No movement (speed=0), quantized position: (496, 496).
{
  const v: Vec = { x: 500, y: 500, heading: 33, speed: 0, t: 0 };
  const p = reckon(v, 60_000);
  check('a stopped fish does not drift', p.x === 496 && p.y === 496, p);
}
// Reckoned positions are always quantized and inside the world.
{
  const v: Vec = { x: 4_000, y: 3_000, heading: 0, speed: 250, t: 0 };
  const p = reckon(v, 60_000);
  check('reckon stays in the world', p.x <= WORLD_W && p.y <= WORLD_H, p);
  check('reckon returns quantized points', p.x % QUANT === 0 && p.y % QUANT === 0, p);
}

// --- Squared distance ------------------------------------------------------
// 3-4-5 triangle by hand: 3^2 + 4^2 = 25.
check('dist2 on a 3-4-5 triangle', dist2(0, 0, 3, 4) === 25, dist2(0, 0, 3, 4));
check('dist2 is symmetric', dist2(11, 7, 3, 4) === dist2(3, 4, 11, 7));
check('dist2 of a point with itself is zero', dist2(9, 9, 9, 9) === 0);

// --- Integer median --------------------------------------------------------
// Odd count: middle element. Even count: the LOWER of the two middles, chosen
// so the result is always an actual integer with no averaging.
check('median of an odd list', medianInt([5, 1, 3]) === 3, medianInt([5, 1, 3]));
check('median of an even list takes the lower middle', medianInt([1, 2, 3, 4]) === 2, medianInt([1, 2, 3, 4]));
check('median of one element', medianInt([42]) === 42);
check('median of an empty list is zero', medianInt([]) === 0);
check('median does not mutate its input', (() => {
  const xs = [3, 1, 2];
  medianInt(xs);
  return xs[0] === 3 && xs[1] === 1 && xs[2] === 2;
})());

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
