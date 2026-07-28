/**
 * The wild shoal. Run: npx tsx src/lib/wild.test.ts
 *
 * WHAT IS UNDER TEST. `wild.ts` is the sea's population of fish that are not
 * people (spec 2.6). It is a **pure function of `(seed, tickIndex,
 * hushStartMs, nowMs)`** and of nothing else — no player, no clock, no dice —
 * which is what makes spec 3.8's "every client must simulate them
 * identically" hold by construction instead of by lock discipline.
 *
 * HOW THE EXPECTED VALUES WERE OBTAINED. Section 2 walks the whole arithmetic
 * chain for one fish at one tick — every hash, every table lookup, every
 * truncation — and pins the literal result. Those literals were derived from
 * the module's DOCUMENTED formula in a separate scratch implementation and
 * then checked by hand (the working is in the comment), not read back off
 * `wildAt`. Every other section states its expected value or its bound as
 * arithmetic over the exported constants.
 *
 * NO CLOCK IN THE ENGINE, one clock here. Section 5 times `wildAt` — that is a
 * test-harness measurement of cost, using `process.hrtime.bigint()` (integer
 * nanoseconds, no float), and is the only clock read in this file. Every
 * `nowMs` and `tickIndex` passed to the code under test is a literal or an
 * expression over the imported constants.
 */
import { hrtime } from 'node:process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  wildAt, isWildId, wildIdOf,
  WILD_COUNT, WILD_SCHOOLS, WILD_PER_SCHOOL, WILD_SCHOOL_R,
  WILD_ORBIT_AMP_X_MAX, WILD_ORBIT_AMP_Y_MAX,
  WILD_SIZE_MIN, WILD_SIZE_SPREAD, WILD_BOLT_MS, WILD_SPEED_BOLT,
  type WildFish,
} from './wild';
import {
  WORLD_W, WORLD_H, QUANT, TICK_MS, SHELTER_R, HUSH_MS, LOCK_MS, SPEED_DART,
} from './shoalConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

/** Squared distance, integer. Never a square root, so never a float. */
const d2 = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);

/** The sentinel `wildAt` reads as "no hush is running" (ShoalState.hushStartMs). */
const NO_HUSH = -1;

// ===========================================================================
// 1. Shape. The CONSENSUS numbers and the relations they have to keep.
// ===========================================================================
{
  check('the shoal is exactly the schools times their size',
    WILD_SCHOOLS * WILD_PER_SCHOOL === WILD_COUNT, { WILD_SCHOOLS, WILD_PER_SCHOOL, WILD_COUNT });
  check('wildAt takes four arguments and none of them is player state',
    wildAt.length === 4, wildAt.length);

  // The bolt has to LAND ON A FOLD TICK. Shelter is only ever evaluated on the
  // tick grid, so a bolt that completed at (say) T+2_100 would be invisible on
  // the tick before and already over on the tick after, and which one a client
  // saw would depend on nothing at all.
  check('the bolt completes on a whole fold tick', WILD_BOLT_MS % TICK_MS === 0,
    { WILD_BOLT_MS, TICK_MS, ticks: WILD_BOLT_MS / TICK_MS });
  // ...and it has to complete BEFORE the input lock, or the cover evaporates
  // at a moment the player can no longer act on. LOCK_MS is 4_000; leaving
  // 2_000 ms of unlocked window is 8 fold ticks, and a dart (SPEED_DART 220 cu/s
  // for DART_MS 3_000) covers 660 cu — nearly two SHELTER_R — from a standing
  // start, so the window is long enough to reach real cover.
  check('the wild shoal is gone strictly before the input lock', WILD_BOLT_MS < LOCK_MS,
    { WILD_BOLT_MS, LOCK_MS });
  check('...and therefore long before the sweep resolves', WILD_BOLT_MS < HUSH_MS,
    { WILD_BOLT_MS, HUSH_MS });

  // A bolting fish must clear TWICE the shelter radius before it vanishes, so
  // that no point which had wild cover still has it. Hand-derived: over
  // WILD_BOLT_MS the flight is WILD_SPEED_BOLT * WILD_BOLT_MS / 1000 =
  // 420 * 2000 / 1000 = 840 cu, and 2 * SHELTER_R = 680.
  const flight = (WILD_SPEED_BOLT * WILD_BOLT_MS) / 1000;
  check('the full flight clears two shelter radii', flight === 840 && flight > 2 * SHELTER_R,
    { flight, twoR: 2 * SHELTER_R });
  check('they bolt faster than a player can dart', WILD_SPEED_BOLT > SPEED_DART,
    { WILD_SPEED_BOLT, SPEED_DART });

  // The amplitude budget is what keeps every fish inside the world WITHOUT a
  // clamp — a clamp would park fish flat against the wall, and (worse) would
  // cap the bolt's flight for any fish that fled outward. Hand-derived:
  //   x in [W/2 - AMPX - R, W/2 + AMPX + R] = [2048-1400-200, 2048+1400+200]
  //                                         = [448, 3648]  within [0, 4096]
  //   y in [H/2 - AMPY - R, H/2 + AMPY + R] = [1536-1000-200, 1536+1000+200]
  //                                         = [336, 2736]  within [0, 3072]
  const xLo = WORLD_W / 2 - WILD_ORBIT_AMP_X_MAX - WILD_SCHOOL_R;
  const yLo = WORLD_H / 2 - WILD_ORBIT_AMP_Y_MAX - WILD_SCHOOL_R;
  check('the x amplitude budget leaves 448 cu of margin', xLo === 448 && xLo > 0, xLo);
  check('the y amplitude budget leaves 336 cu of margin', yLo === 336 && yLo > 0, yLo);

  // Sizes: three plain wild fish must be able to shelter a player, or the bolt
  // has nothing to take away. shelterWeight(60) = 100 + trunc(60/40) = 101, so
  // three of the SMALLEST wild fish give 303 >= SHELTER_THRESHOLD (300).
  // (Task 3 owns that wiring; this only checks the sizes make it possible.)
  check('the smallest wild fish is still worth sheltering with',
    WILD_SIZE_MIN === 60 && WILD_SIZE_SPREAD === 60, { WILD_SIZE_MIN, WILD_SIZE_SPREAD });
}

// ===========================================================================
// 2. One fish, one tick, derived by hand.
// ===========================================================================
// seed = 12345, fish index 0 (so school 0), tickIndex = 0, no hush.
//
// The 32-bit mixer h32(seed, i, salt) produces, for seed 12345 and i = 0:
//   salt S_AMPX  -> 3_842_376_240      salt F_R1   -> 2_560_319_581
//   salt S_AMPY  ->    96_637_633      salt F_R2   -> 1_315_199_243
//   salt S_RATEX -> 2_599_941_331      salt F_S1   ->   837_156_937
//   salt S_RATEY -> 1_216_684_528      salt F_S2   -> 2_535_420_837
//   salt S_PHX   ->   700_742_627      salt F_A1   -> 1_932_620_550
//   salt S_PHY   -> 1_829_359_671      salt F_A2   -> 1_429_255_016
//                                      salt F_SIZE -> 4_093_638_227
//
// SCHOOL 0's orbit, from those:
//   ampX  = 600 + 3_842_376_240 % 801 = 600 + 66  = 666
//           (801 * 4_796_974 = 3_842_376_174; 3_842_376_240 - that = 66)
//   ampY  = 400 +    96_637_633 % 601 = 400 + 439 = 839
//           (601 * 160_794 = 96_637_194; 96_637_633 - that = 439)
//   rateX = 2 + 2_599_941_331 % 3 = 2 + 1 = 3     (digit sum 46 -> 1 mod 3)
//   rateY = rateX + 2 + (1_216_684_528 % 2) * 2 = 3 + 2 + 0 = 5
//   phX   =   700_742_627 % 4096 = 3043
//   phY   = 1_829_359_671 % 4096 =   55
//
// SCHOOL 0's CENTRE at tick 0 (phase = phase0 + 0 * rate = phase0):
//   x: phase 3043 -> table index floor(3043/16) = 190, sub-phase 3043-3040 = 3
//      COS[190] = -201, COS[191] = -101
//      cosAt = -201 + trunc((-101 - -201) * 3 / 16) = -201 + trunc(300/16)
//            = -201 + 18 = -183
//      cx = 4096/2 + trunc(666 * -183 / 4096) = 2048 + trunc(-121878/4096)
//         = 2048 + trunc(-29.75) = 2048 - 29 = 2019
//   y: phase 55 -> index floor(55/16) = 3, sub-phase 55-48 = 7
//      SIN[3] = 301, SIN[4] = 401
//      sinAt = 301 + trunc(100 * 7 / 16) = 301 + 43 = 344
//      cy = 3072/2 + trunc(839 * 344 / 4096) = 1536 + trunc(288616/4096)
//         = 1536 + trunc(70.46) = 1536 + 70 = 1606
//
// FISH 0's two epicycles, from its own hashes:
//   r1 =  40 + 2_560_319_581 % 101 =  40 + 83 = 123
//   r2 =  20 + 1_315_199_243 %  41 =  20 + 13 =  33
//   s1 =   8 +   837_156_937 %   9 =   8 +  4 =  12
//   s2 =  18 + 2_535_420_837 %  17 =  18 +  3 =  21
//   a1 = 1_932_620_550 % 4096 = 774
//   a2 = 1_429_255_016 % 4096 = 872
//
//   epicycle 1 at tick 0: phase 774 -> index 48, sub 774-768 = 6
//     COS[48] = 1567, COS[49] = 1474 -> 1567 + trunc(-93*6/16) = 1567 - 34 = 1533
//     SIN[48] = 3784, SIN[49] = 3822 -> 3784 + trunc( 38*6/16) = 3784 + 14 = 3798
//   epicycle 2 at tick 0: phase 872 -> index 54, sub 872-864 = 8
//     COS[54] =  995, COS[55] =  897 ->  995 + trunc(-98*8/16) =  995 - 49 =  946
//     SIN[54] = 3973, SIN[55] = 3996 -> 3973 + trunc( 23*8/16) = 3973 + 11 = 3984
//
//   ox = trunc((123 * 1533 + 33 *  946) / 4096)
//      = trunc((188_559 +  31_218) / 4096) = trunc(219_777/4096) = trunc(53.66) = 53
//   oy = trunc((123 * 3798 + 33 * 3984) / 4096)
//      = trunc((467_154 + 131_472) / 4096) = trunc(598_626/4096) = trunc(146.15) = 146
//
// RAW position = centre + offset = (2019 + 53, 1606 + 146) = (2072, 1752).
// Quantized to the QUANT=8 grid: 2072 = 8*259 and 1752 = 8*219, both already
// on the grid, so the reported position is (2072, 1752).
//
// HEADING is the direction from this tick's raw position to the NEXT tick's,
// snapped to the nearest of the 256 table headings. The raw position at tick 1
// is (2072, 1760) — the same x, 8 cu further down — so the heading is exactly
// a quarter turn, 256/4 = 64.
//
// SIZE = 60 + 4_093_638_227 % 60 = 60 + 47 = 107.
{
  const w = wildAt(12345, 0, NO_HUSH, 0);
  check('the shoal is WILD_COUNT fish', w.length === WILD_COUNT, w.length);
  const f = w[0];
  check('hand-derived: wild:0 sits at x = 2019 + 53 = 2072', f.x === 2072, f.x);
  check('hand-derived: wild:0 sits at y = 1606 + 146 = 1752', f.y === 1752, f.y);
  check('hand-derived: wild:0 heads a quarter turn (64 brads)', f.heading === 64, f.heading);
  check('hand-derived: wild:0 has size 60 + 47 = 107', f.size === 107, f.size);
  check('hand-derived: its id names it wild', f.id === 'wild:0' && isWildId(f.id), f.id);

  // The whole point of a HASHED shoal rather than a laid-out one: change the
  // seed and you get a different sea, not the same sea shifted.
  const other = wildAt(12346, 0, NO_HUSH, 0)[0];
  check('a different seed puts wild:0 somewhere else',
    other.x !== f.x || other.y !== f.y, { a: [f.x, f.y], b: [other.x, other.y] });
}

// ===========================================================================
// 3. Determinism. Same question, same answer — whatever else was asked first.
// ===========================================================================
{
  const args: Array<[number, number, number, number]> = [
    [12345, 0, NO_HUSH, 0],
    [12345, 7, NO_HUSH, 1750],
    [7, 100_000, NO_HUSH, 25_000_000],
    [0, 1, 250_000, 250_400],
    [-5, 4_000_001, 12_000, 12_000],
  ];
  const first = args.map((a) => JSON.stringify(wildAt(...a)));

  // Same call, again.
  const again = args.map((a) => JSON.stringify(wildAt(...a)));
  check('the same (seed, tick, hush, now) yields byte-identical output',
    args.every((_, i) => first[i] === again[i]));

  // Same calls, REVERSED order, with unrelated calls interleaved. If any
  // hidden state existed — a cached tick, a running RNG, a memo keyed wrong —
  // this is where it would show.
  const reversed: string[] = [];
  for (let i = args.length - 1; i >= 0; i--) {
    wildAt(999, i * 37, NO_HUSH, 0);
    wildAt(1, 5, 1000, 1000 + i);
    reversed[i] = JSON.stringify(wildAt(...args[i]));
  }
  check('...and reversing the call order, with other calls interleaved, changes nothing',
    args.every((_, i) => first[i] === reversed[i]));

  // Two different seeds must not collapse onto the same sea.
  check('different seeds give different seas', first[0] !== JSON.stringify(wildAt(12346, 0, NO_HUSH, 0)));
  // ...and two different ticks must not either (non-degeneracy: the shoal moves).
  check('different ticks give different positions', first[0] !== first[1]);

  // nowMs is the HUSH clock and nothing else: with no hush running it cannot
  // move a single fish. (This is the contract Task 3 depends on — the motion
  // clock is tickIndex.)
  check('with no hush, nowMs does not move anything',
    JSON.stringify(wildAt(12345, 42, NO_HUSH, 0)) === JSON.stringify(wildAt(12345, 42, NO_HUSH, 9_999_999)));
  // ...and a hush that has not started yet (nowMs before hushStartMs) is not a
  // hush: a vector never predicts the past, and neither does a bolt.
  check('a hush in the future does not move anything either',
    JSON.stringify(wildAt(12345, 42, NO_HUSH, 10_500)) === JSON.stringify(wildAt(12345, 42, 11_000, 10_500)));
}

// ===========================================================================
// 4. No player dependency. Structurally, from the module's own source.
// ===========================================================================
// This is the ruling that makes spec 3.8's determinism requirement free rather
// than fragile: a wild fish cannot see a player, so there is no in-flight view
// for two clients to disagree about. The signature is the first wall (four
// numbers in, fish out) and the imports are the second.
{
  const src = readFileSync(fileURLToPath(new URL('./wild.ts', import.meta.url)), 'utf8');
  check('wild.ts does not import the folded world', !/from\s+'[^']*shoalEngine'/.test(src));
  check('wild.ts does not import presence or live state',
    !/from\s+'[^']*shoalLive'/.test(src) && !/from\s+'[^']*shoalRoom'/.test(src));
  check('wild.ts does not import the transport', !/from\s+'[^']*shoalRpc'/.test(src));
  check('wild.ts does not import the writer', !/from\s+'[^']*shoalSend'/.test(src));
  check('wild.ts never reads a clock', !/Date\.now|performance\.now|hrtime|new Date\b/.test(src));
  check('wild.ts never rolls dice', !/Math\.random/.test(src));
  check('wild.ts never calls fetch', !/\bfetch\s*\(/.test(src));
  // It may hold shape constants and the trig table, and nothing else.
  check('wild.ts does use the ONE integer trig table', /from\s+'\.\/fixed'/.test(src));
  check('wild.ts builds no second trig table', !/Math\.cos|Math\.sin/.test(src));
}

// ===========================================================================
// 5. O(1) in the tick. A hundred thousand ticks in costs what one tick costs.
// ===========================================================================
// The trap this rules out is the one `foldTick` exists to avoid elsewhere: a
// wild shoal stepped forward from zero would cost more the longer the session
// ran, and a client that joined an hour in would pay 14_400 steps per frame.
// Every position here is a closed form in `tickIndex` — a fixed number of
// hashes, table lookups and multiplies per fish — so the tick appears only
// inside `phase0 + tickIndex * rate`.
//
// Measured, not asserted from the shape of the code: equal call counts at tick
// 1, tick 100_000 and tick 7_000_000_000 (an ABSOLUTE tick index for a real
// 2026 wall-clock ms, floor(1.75e12 / 250) — the value a live client passes).
{
  const N = 1500;
  const burn = (t: number): number => {
    let acc = 0;
    for (let k = 0; k < N; k++) acc += wildAt(12345, t, NO_HUSH, 0)[0].x;
    return acc;
  };
  const time = (t: number): bigint => {
    const a = hrtime.bigint();
    burn(t);
    return hrtime.bigint() - a;
  };
  // Warm the JIT on all three shapes first, so the measurement is of the
  // function and not of V8 tiering up mid-run.
  for (const t of [1, 100_000, 7_000_000_000]) burn(t);

  const small = time(1);
  const big = time(100_000);
  const huge = time(7_000_000_000);
  // Integer-only comparison: no ratio, no float. A generous 3x band — the
  // difference this is looking for is UNBOUNDED GROWTH (100_000x the work),
  // not a 20% constant factor from doubles outside the 32-bit range.
  check('tick 100_000 costs the same as tick 1 (within 3x)',
    big <= small * 3n && small <= big * 3n, { small: String(small), big: String(big) });
  check('a real absolute tick index (7e9) costs the same as tick 1 (within 3x)',
    huge <= small * 3n && small <= huge * 3n, { small: String(small), huge: String(huge) });
  // Non-degeneracy: the measurement has to be of something.
  check('the timing loop actually ran', small > 0n && big > 0n && huge > 0n);
}

// ===========================================================================
// 6. They shoal.
// ===========================================================================
// Three baselines, all derived by hand for WORLD_W=4096, WORLD_H=3072, n=36.
//
// (a) MEAN SQUARED PAIRWISE DISTANCE under uniform scatter. Exact, and the
//     reason this file uses the squared form rather than the mean distance:
//     for two independent uniform points, E[(x1-x2)^2] = W^2/6 and likewise
//     for y, so
//       E[d^2] = (W^2 + H^2)/6 = (16_777_216 + 9_437_184)/6
//              = 26_214_400/6 = 4_369_066 (RMS distance 2090 cu).
//     A mean-of-distances baseline has no closed form over a rectangle, and
//     squaring keeps the whole check in integers.
//
// (b) MEAN NEAREST-NEIGHBOUR DISTANCE under uniform (Poisson) scatter. For
//     intensity lambda, P(nearest > r) = exp(-lambda*pi*r^2), so
//       E[nn] = integral_0^inf exp(-lambda*pi*r^2) dr = 1/(2*sqrt(lambda)).
//     lambda = 36 / (4096*3072) = 36/12_582_912, sqrt(lambda) = 1.6915e-3,
//       E[nn] = 295 cu.
//     Squared for the integer comparison: 295^2 = 87_025.
//
// (c) FRACTION OF PAIRS WITHIN SHELTER_R. For a small radius the edge effects
//     only reduce it, so pi*r^2/A is an OVER-estimate of the uniform value —
//     which makes it a conservative bar to clear:
//       pi * 340^2 / (4096*3072) = 363_168/12_582_912 = 0.0289, i.e. 2.9%.
//     This is the game-relevant statistic: it is literally "how often are two
//     wild fish close enough to shelter the same water".
//
// (a) is the instrument the brief asked for and it is nearly BLIND here, which
// is worth saying rather than hiding: three schools roaming a sea this size
// are mostly far apart, so the pairwise mean is dominated by school-to-school
// distance and lands at ~0.89 of the uniform baseline even when every school
// is a tight ball. (b) and (c) are the load-bearing checks — they measure
// clustering rather than spread, and clustering is what "shoal" means.
{
  const uniformMeanD2 = (WORLD_W * WORLD_W + WORLD_H * WORLD_H) / 6; // 4_369_066.67
  check('hand-derived uniform mean-squared pairwise distance',
    Math.trunc(uniformMeanD2) === 4_369_066, uniformMeanD2);

  const UNIFORM_NN2 = 295 * 295; // 87_025
  const SHELTER_R2 = SHELTER_R * SHELTER_R; // 115_600

  // Sampled across seven seeds and a hundred-odd ticks each, so the result is
  // a property of the DESIGN and not of one lucky moment.
  let worstMeanD2 = 0;
  let worstMeanNN2 = 0;
  let worstNearFracPerMille = 1000;
  for (const seed of [0, 1, 7, 42, 2026, 12345, 999_999]) {
    for (let t = 0; t < 4000; t += 37) {
      const f = wildAt(seed, t, NO_HUSH, 0);
      const nn2 = new Array<number>(f.length).fill(Number.MAX_SAFE_INTEGER);
      let sum2 = 0;
      let pairs = 0;
      let near = 0;
      for (let a = 0; a < f.length; a++) {
        for (let b = a + 1; b < f.length; b++) {
          const dd = d2(f[a], f[b]);
          sum2 += dd;
          pairs++;
          if (dd <= SHELTER_R2) near++;
          if (dd < nn2[a]) nn2[a] = dd;
          if (dd < nn2[b]) nn2[b] = dd;
        }
      }
      const meanD2 = Math.trunc(sum2 / pairs);
      const meanNN2 = Math.trunc(nn2.reduce((s, v) => s + v, 0) / f.length);
      const nearPerMille = Math.trunc((near * 1000) / pairs);
      if (meanD2 > worstMeanD2) worstMeanD2 = meanD2;
      if (meanNN2 > worstMeanNN2) worstMeanNN2 = meanNN2;
      if (nearPerMille < worstNearFracPerMille) worstNearFracPerMille = nearPerMille;
    }
  }

  // (b) the load-bearing one. Uniform would give a mean nearest-neighbour of
  // 295 cu (87_025 squared); a shoal must be far inside that. Bar set at HALF
  // the uniform squared value, i.e. 0.71 of the distance — the measured worst
  // case is far below it, and uniform scatter cannot reach it.
  check('every fish has a neighbour much closer than uniform scatter would give',
    worstMeanNN2 < UNIFORM_NN2 / 2,
    { worstMeanNN2, uniformNN2: UNIFORM_NN2 });
  // (c) the game-relevant one. Uniform gives 2.9% of pairs within a shelter
  // radius; a shoal must give many times that. Bar: 4x the uniform 29 per mille.
  check('pairs within a shelter radius are many times more common than uniform',
    worstNearFracPerMille > 4 * 29,
    { worstNearFracPerMille, uniformPerMille: 29 });
  // (a) the blind one, kept because the brief asked for it and because a
  // uniformly-scattered shoal WOULD fail it — just barely.
  check('mean squared pairwise distance stays under the uniform baseline',
    worstMeanD2 < Math.trunc(uniformMeanD2 * 95 / 100),
    { worstMeanD2, bar: Math.trunc(uniformMeanD2 * 95 / 100) });

  // ...and they shoal because they DRIFT TOGETHER, not because they are pinned:
  // a school's members stay within WILD_SCHOOL_R of a shared moving centre, so
  // the whole cluster travels while its members mill inside it. Checked as: at
  // any tick, every fish of a school is within 2 * WILD_SCHOOL_R of every other
  // fish of that school, and the school's own centroid has MOVED between two
  // ticks far apart.
  const SCHOOL_SPAN2 = (2 * WILD_SCHOOL_R + 2 * QUANT) ** 2; // grid slack both ways
  let looseSchoolPairs = 0;
  const centroid = (fish: WildFish[], k: number): { x: number; y: number } => {
    let sx = 0;
    let sy = 0;
    for (let i = k * WILD_PER_SCHOOL; i < (k + 1) * WILD_PER_SCHOOL; i++) { sx += fish[i].x; sy += fish[i].y; }
    return { x: Math.trunc(sx / WILD_PER_SCHOOL), y: Math.trunc(sy / WILD_PER_SCHOOL) };
  };
  for (const seed of [0, 12345, 999_999]) {
    for (let t = 0; t < 2000; t += 53) {
      const f = wildAt(seed, t, NO_HUSH, 0);
      for (let k = 0; k < WILD_SCHOOLS; k++) {
        for (let a = k * WILD_PER_SCHOOL; a < (k + 1) * WILD_PER_SCHOOL; a++) {
          for (let b = a + 1; b < (k + 1) * WILD_PER_SCHOOL; b++) {
            if (d2(f[a], f[b]) > SCHOOL_SPAN2) looseSchoolPairs++;
          }
        }
      }
    }
  }
  check('no fish is ever further from a schoolmate than the school is wide',
    looseSchoolPairs === 0, { looseSchoolPairs });

  // Travel is measured as the FURTHEST a school's centroid ever gets from
  // where it started, over a window, not as where it happens to be at the end
  // of one: the centre is periodic, so an interval close to a whole number of
  // its y-periods puts it back where it began having crossed the whole sea in
  // between. (Measuring the endpoint alone is what the first draft of this
  // check did, and one school of nine legitimately failed it.)
  //
  // Window: 2048 ticks = 512 s, one full period of the SLOWEST orbit
  // (WILD_RATE_X_MIN = 2 phase units/tick, WILD_PHASE_STEPS/2 = 2048 ticks),
  // so every school must complete at least one x sweep inside it and reach
  // 2 * ampX >= 2 * WILD_ORBIT_AMP_X_MIN = 1200 cu of x excursion alone. The
  // bar is one school radius, far below that.
  let stillSchools = 0;
  for (const seed of [0, 12345, 999_999]) {
    for (let k = 0; k < WILD_SCHOOLS; k++) {
      const a = centroid(wildAt(seed, 0, NO_HUSH, 0), k);
      let furthest = 0;
      for (let t = 0; t <= 2048; t += 16) {
        const dd = d2(a, centroid(wildAt(seed, t, NO_HUSH, 0), k));
        if (dd > furthest) furthest = dd;
      }
      if (furthest < WILD_SCHOOL_R * WILD_SCHOOL_R) stillSchools++;
    }
  }
  check('every school genuinely travels the sea, not just mills in place',
    stillSchools === 0, { stillSchools });
}

// ===========================================================================
// 7. The bolt. What "gone" means, and that they really fled to get there.
// ===========================================================================
// THE RULING: **gone means absent from the returned array.** From
// `hushStartMs + WILD_BOLT_MS` onward `wildAt` returns the empty array, so at
// the input lock and at the sweep's resolve tick there is no wild body at all
// and wild shelter is exactly zero. Task 3 can depend on that without a
// geometric argument.
//
// WHY IT HAD TO BE THE ARRAY AND NOT A DISTANCE. The brief's phrasing —
// "no wild fish is within SHELTER_R of any point that had one at hushStart-1"
// — is TRUE at T+HUSH_MS only BECAUSE the array is empty; measured against the
// live shoal at the last tick before it vanishes, the worst case over seven
// seeds and 73 hush times is **0 cu**: a fish fleeing outward from one school
// routinely lands on the spot another school's fish has just left. So that
// check on its own is satisfied vacuously, and the teeth are below it: every
// fish is more than SHELTER_R from ITS OWN pre-hush position, which IS
// guaranteed by construction and is the property the moment is made of.
{
  const H = 1000 * TICK_MS; // a tick-aligned hush start: 250_000 ms
  const hushTick = H / TICK_MS; // 1000
  const SEED = 12345;

  const before = wildAt(SEED, hushTick, NO_HUSH, H - 1);
  check('non-degeneracy: the sea is full one instant before the hush',
    before.length === WILD_COUNT, before.length);

  // ...and full enough to actually shelter: some point of the sea has three
  // wild fish within SHELTER_R of it. Without this the emptiness check below
  // proves nothing about cover.
  let sheltered = 0;
  for (const f of before) {
    let near = 0;
    for (const g of before) if (g.id !== f.id && d2(f, g) <= SHELTER_R * SHELTER_R) near++;
    if (near >= 3) sheltered++;
  }
  check('non-degeneracy: before the hush there is real wild cover in the water',
    sheltered > 0, { fishWithThreeNeighbours: sheltered });

  // GONE, the ruling.
  check('at the sweep\'s resolve tick the wild shoal is not there at all',
    wildAt(SEED, (H + HUSH_MS) / TICK_MS, H, H + HUSH_MS).length === 0);
  check('gone already at the input lock', wildAt(SEED, (H + LOCK_MS) / TICK_MS, H, H + LOCK_MS).length === 0);
  check('gone exactly on the tick the bolt completes, not one later',
    wildAt(SEED, (H + WILD_BOLT_MS) / TICK_MS, H, H + WILD_BOLT_MS).length === 0);
  check('...and still there on the tick before that',
    wildAt(SEED, (H + WILD_BOLT_MS - TICK_MS) / TICK_MS, H, H + WILD_BOLT_MS - TICK_MS).length === WILD_COUNT);

  // The brief's check, stated as the brief states it. True, and true only
  // because the array is empty — which is exactly why the ruling is the array.
  {
    const after = wildAt(SEED, (H + HUSH_MS) / TICK_MS, H, H + HUSH_MS);
    let violations = 0;
    for (const a of after) for (const b of before) if (d2(a, b) <= SHELTER_R * SHELTER_R) violations++;
    check('at hushStart + HUSH_MS no wild fish is within SHELTER_R of any point that had one',
      violations === 0, { violations });
  }

  // THE TEETH. They fled; they were not deleted where they stood.
  //
  // Hand-derived floor for the last tick they exist, t = H + 1750:
  //   flight   = trunc(WILD_SPEED_BOLT * 1750 / 1000) = trunc(735) = 735 cu
  //   base drift over those 7 ticks, worst case, bounded by the phase advance:
  //     school x: rateX <= 4  -> 4*7/16 = 1.75 brads = 0.0429 rad
  //               |dx| <= 1400 * 0.0429 =  60.1
  //     school y: rateY <= 8  -> 8*7/16 = 3.5  brads = 0.0859 rad
  //               |dy| <= 1000 * 0.0859 =  85.9
  //     epicycle1: s1 <= 16   -> 16*7/16 = 7   brads = 0.1718 rad
  //               |d|  <=  140 * 0.1718 =  24.1 per axis
  //     epicycle2: s2 <= 34   -> 34*7/16 = 14.875 brads = 0.3651 rad
  //               |d|  <=   60 * 0.3651 =  21.9 per axis
  //     per-axis worst: x 60.1+24.1+21.9 = 106.1 ; y 85.9+24.1+21.9 = 131.9
  //     magnitude <= sqrt(106.1^2 + 131.9^2) = 169.3, plus <= 8 of grid slack
  //     each way and <= 2 of truncation: call it 190.
  //   so displacement from the pre-hush position >= 735 - 190 = 545 cu,
  //   comfortably past SHELTER_R = 340. The bar below is set at 400.
  {
    const lastMs = H + WILD_BOLT_MS - TICK_MS; // H + 1750
    const late = wildAt(SEED, lastMs / TICK_MS, H, lastMs);
    check('non-degeneracy: they are all still in the water at the last tick of the bolt',
      late.length === WILD_COUNT, late.length);
    let closest = Number.MAX_SAFE_INTEGER;
    for (let i = 0; i < late.length; i++) {
      const dd = d2(late[i], before[i]);
      if (dd < closest) closest = dd;
      check(`wild:${i} has fled past a shelter radius from where it was`, dd > SHELTER_R * SHELTER_R);
    }
    check('the closest any fish still is to its own pre-hush spot clears the hand-derived 400 cu',
      closest > 400 * 400, { closest, bar: 400 * 400 });
  }

  // And they flee OUTWARD, in different directions — a school bursting, not a
  // school marching. Hand-check: the mean position of a school barely moves
  // (each fish leaves along its own outward ray) while its RADIUS explodes.
  {
    const lastMs = H + WILD_BOLT_MS - TICK_MS;
    const late = wildAt(SEED, lastMs / TICK_MS, H, lastMs);
    let widened = 0;
    for (let k = 0; k < WILD_SCHOOLS; k++) {
      let spanBefore = 0;
      let spanAfter = 0;
      for (let a = k * WILD_PER_SCHOOL; a < (k + 1) * WILD_PER_SCHOOL; a++) {
        for (let b = a + 1; b < (k + 1) * WILD_PER_SCHOOL; b++) {
          if (d2(before[a], before[b]) > spanBefore) spanBefore = d2(before[a], before[b]);
          if (d2(late[a], late[b]) > spanAfter) spanAfter = d2(late[a], late[b]);
        }
      }
      if (spanAfter > spanBefore * 4) widened++;
    }
    check('every school has burst apart, not moved as one', widened === WILD_SCHOOLS, { widened });
  }

  // The bolt is a function of the HUSH clock, so a hush that started at a
  // different instant produces a different amount of flight at the same tick.
  {
    const t = H + 1000;
    const early = wildAt(SEED, t / TICK_MS, H, t); // 1000 ms into the bolt
    const late = wildAt(SEED, t / TICK_MS, H + 750, t); // 250 ms into the bolt
    check('a hush that started later has flung them less far',
      d2(early[0], before[0]) > d2(late[0], before[0]),
      { early: d2(early[0], before[0]), late: d2(late[0], before[0]) });
    check('at the instant the hush lands, nothing has moved yet',
      JSON.stringify(wildAt(SEED, hushTick, H, H)) === JSON.stringify(before));
  }

  // A hush start that is not on the tick grid still resolves deterministically
  // — the flight is measured in ms, so it does not need to be.
  check('an off-grid hush start is still deterministic',
    JSON.stringify(wildAt(SEED, hushTick + 2, H + 37, H + 537))
    === JSON.stringify(wildAt(SEED, hushTick + 2, H + 37, H + 537)));
}

// ===========================================================================
// 8. Integer purity, world bounds, and identity.
// ===========================================================================
{
  let nonInteger = 0;
  let offGrid = 0;
  let outOfWorld = 0;
  let badHeading = 0;
  let badSize = 0;
  for (const seed of [0, 1, 7, 12345, 999_999, -5, 0x7fff_ffff]) {
    for (let t = 0; t < 20_000; t += 71) {
      for (const f of wildAt(seed, t, NO_HUSH, 0)) {
        if (!Number.isInteger(f.x) || !Number.isInteger(f.y)
          || !Number.isInteger(f.heading) || !Number.isInteger(f.size)) nonInteger++;
        if (f.x % QUANT !== 0 || f.y % QUANT !== 0) offGrid++;
        if (f.x < 0 || f.x > WORLD_W || f.y < 0 || f.y > WORLD_H) outOfWorld++;
        if (f.heading < 0 || f.heading >= 256) badHeading++;
        if (f.size < WILD_SIZE_MIN || f.size >= WILD_SIZE_MIN + WILD_SIZE_SPREAD) badSize++;
      }
    }
  }
  check('every coordinate is an integer', nonInteger === 0, { nonInteger });
  check('every coordinate is on the QUANT grid', offGrid === 0, { offGrid });
  check('every fish is inside the world, with no clamp doing the work', outOfWorld === 0, { outOfWorld });
  check('every heading is a legal brad', badHeading === 0, { badHeading });
  check('every size is inside the declared range', badSize === 0, { badSize });

  // Bolting fish deliberately LEAVE the sea rather than pile up on the wall:
  // a clamp would cap the flight of any fish fleeing outward and quietly break
  // the "past a shelter radius" guarantee above. Non-degeneracy for the
  // no-clamp claim: at least one fish is outside the world while bolting.
  {
    let outside = 0;
    for (let hk = 0; hk < 400; hk += 7) {
      const H = hk * TICK_MS;
      const t = H + WILD_BOLT_MS - TICK_MS;
      for (const f of wildAt(12345, t / TICK_MS, H, t)) {
        if (f.x < 0 || f.x > WORLD_W || f.y < 0 || f.y > WORLD_H) outside++;
      }
    }
    check('a bolting shoal leaves the sea instead of stacking against the wall',
      outside > 0, { outside });
  }

  // Ids: stable, unique, and unmistakably not a swimmer's (a swimmer id is a
  // public-key hex string, so the colon prefix can never collide).
  const w = wildAt(12345, 5, NO_HUSH, 0);
  check('ids are unique', new Set(w.map((f) => f.id)).size === WILD_COUNT);
  check('ids are stable across ticks and seeds',
    JSON.stringify(w.map((f) => f.id))
    === JSON.stringify(wildAt(999, 400_000, NO_HUSH, 0).map((f) => f.id)));
  check('every id is marked wild', w.every((f) => isWildId(f.id)));
  check('wildIdOf agrees with the ids handed out', w.every((f, i) => f.id === wildIdOf(i)));
  check('a swimmer id is not mistaken for a wild one',
    !isWildId('04a1b2c3d4e5f6') && !isWildId('') && !isWildId('wilder:1'));
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
