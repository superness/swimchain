/**
 * The tether, the hush and the scatter — the readings, not the paint.
 * Run: npx tsx src/ui/tether.test.ts
 *
 * WHAT IS TESTED HERE AND WHAT IS NOT. This file covers `tether.ts`, which is
 * pure: it holds no canvas, reads no clock and draws nothing. It answers four
 * questions and every one of them has a right answer that can be derived
 * without running the code —
 *
 *   1. how long and how warm is the tether?      (a function of `shelterOf`)
 *   2. is this swimmer visually exposed?         (exactly `isExposed`)
 *   3. how much of the tether does playtime leave? (the fade curve)
 *   4. who did the sweep take?                   (`state.lastTaken`, never a guess)
 *
 * The PAINT — the strands, the red, the freeze — is deliberately untested, on
 * the same rule seaPaint.ts states: the only assertion one could write against
 * a canvas context is "it was called", which passes against a black rectangle.
 * That half is verified by screenshot (shoal-client/docs/).
 *
 * Every expected value below is derived BY HAND in a comment from the
 * CONSENSUS constants, or lifted VERBATIM from `npm run harness` — an
 * instrument that has never imported anything under `src/ui/`. Nothing is read
 * back off the function under test.
 */
import {
  TETHER_TAUT_SHELTER, TETHER_MIN_CU, TETHER_MAX_CU,
  TETHER_FADE_HOLD_MS, TETHER_FADE_OFF_MS, SCATTER_FREEZE_MS,
  SENSE_SIZE_SMALL, SENSE_SIZE_LARGE, SENSE_SMALL_PERMILLE, SENSE_LARGE_PERMILLE,
  readTether, strandsOf, tetherLengthCu, tetherWarmth, tetherMood,
  tetherFade, tetherOpacity, senseThreshold, premonition,
  hushRead, lockedBodies, scatterReplay,
} from './tether';
import { shelterOf, isExposed, shelterWeight, type Body } from '../lib/shelter';
import { selectTaken } from '../lib/sweep';
import { bodiesOf } from '../lib/shoalEngine';
import { advance, createLoop, type LoopState } from '../lib/shoalLoop';
import { richSession } from '../lib/shoalFixtures';
import { epochEndMs } from '../lib/epoch';
import {
  HUSH_MS, LOCK_MS, MIN_SIZE, SHELTER_R, SHELTER_THRESHOLD, TENSION_TRIGGER, TICK_MS,
} from '../lib/shoalConst';
import type { LogEntry } from '../lib/shoalTypes';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

// ===========================================================================
// 1. THE WALK — the one scenario the whole tether hangs on
//
// Eight neighbours in a line, 60 cu apart, starting at (2000, 1500). Every
// one of them is size 20, and shelterWeight(20) = SHELTER_BASE +
// trunc(20/40) = 100 + 0 = 100 exactly — so a shelter score here is just a
// hundred times the neighbour count, and every expected value below is
// countable on fingers.
//
// The swimmer walks LEFT, from (2000, 1500) to (2000 - D, 1500). Neighbour k
// sits at distance D + 60k, and shelters iff D + 60k <= SHELTER_R (340).
//
//   D=  0  -> k <= 5.67 -> k=0..5 -> 6 neighbours -> 600
//   D= 40  -> k <= 5.00 -> k=0..5 -> 6            -> 600
//   D= 41  -> k <= 4.98 -> k=0..4 -> 5            -> 500
//   D=100  -> k <= 4.00 -> k=0..4 -> 5            -> 500
//   D=160  -> k <= 3.00 -> k=0..3 -> 4            -> 400
//   D=220  -> k <= 2.00 -> k=0..2 -> 3            -> 300   <- exactly the threshold
//   D=221  -> k <= 1.98 -> k=0..1 -> 2            -> 200   <- one cu past it
//   D=280  -> k <= 1.00 -> k=0..1 -> 2            -> 200
//   D=340  -> k <= 0.00 -> k=0    -> 1            -> 100
//   D=341  -> k <  0    -> none   -> 0            ->   0
//
// And the length, by hand, from this module's own stated constants:
//   length(s) = TETHER_MIN_CU + (TETHER_MAX_CU - TETHER_MIN_CU)
//                             * (1 - min(s, TETHER_TAUT_SHELTER)/TETHER_TAUT_SHELTER)
//             = 60 + 360 * (1 - s/600)
//   600 -> 60   500 -> 120   400 -> 180   300 -> 240
//   200 -> 300  100 -> 360     0 -> 420
// ===========================================================================

const CROWD: Body[] = [];
for (let k = 0; k < 8; k++) CROWD.push({ id: `n${k}`, x: 2000 + 60 * k, y: 1500, size: 20 });

function walker(d: number): Body {
  return { id: 'you', x: 2000 - d, y: 1500, size: 100 };
}

/** D, hand-derived shelter, hand-derived tether length. */
const WALK: Array<[number, number, number]> = [
  [0, 600, 60],
  [40, 600, 60],
  [41, 500, 120],
  [100, 500, 120],
  [160, 400, 180],
  [220, 300, 240],
  [221, 200, 300],
  [280, 200, 300],
  [340, 100, 360],
  [341, 0, 420],
];

check('the crowd\'s neighbours each weigh exactly SHELTER_BASE (hand-derived 100)',
  CROWD.every((b) => shelterWeight(b.size) === 100), CROWD.map((b) => shelterWeight(b.size)));
check('the walk\'s reach constant is the engine\'s own radius', SHELTER_R === 340, SHELTER_R);

{
  let shelterMismatch = 0, engineMismatch = 0, lengthMismatch = 0;
  for (const [d, wantShelter, wantLength] of WALK) {
    const me = walker(d);
    const r = readTether(me, [me, ...CROWD]);
    if (r.shelter !== wantShelter) shelterMismatch++;
    // ...and the same number, pulled independently out of the ENGINE.
    if (r.shelter !== shelterOf(me, [me, ...CROWD])) engineMismatch++;
    if (r.lengthCu !== wantLength) lengthMismatch++;
  }
  check('the tether\'s shelter is the hand-derived count, at every step of the walk',
    shelterMismatch === 0, { shelterMismatch, got: WALK.map(([d]) => readTether(walker(d), [walker(d), ...CROWD]).shelter) });
  check('the tether\'s shelter IS the engine\'s shelterOf, at every step',
    engineMismatch === 0, { engineMismatch });
  check('the tether\'s length is the hand-derived length, at every step of the walk',
    lengthMismatch === 0, { lengthMismatch, got: WALK.map(([d]) => readTether(walker(d), [walker(d), ...CROWD]).lengthCu) });
}

// The load-bearing shape: MORE SHELTER, SHORTER TETHER. Asserted along the
// walk (where shelter is known by hand and falls monotonically) and then
// across the whole reachable range of scores.
{
  let nonMonotone = 0, notStrict = 0;
  let prevShelter = Infinity, prevLength = -1;
  for (const [d] of WALK) {
    const me = walker(d);
    const r = readTether(me, [me, ...CROWD]);
    if (r.lengthCu < prevLength) nonMonotone++;
    // Wherever the shelter genuinely dropped, the tether must genuinely grow.
    if (r.shelter < prevShelter && prevLength >= 0 && r.lengthCu <= prevLength) notStrict++;
    prevShelter = r.shelter;
    prevLength = r.lengthCu;
  }
  check('the tether never shortens as the swimmer walks away', nonMonotone === 0, { nonMonotone });
  check('every real loss of shelter lengthens the tether', notStrict === 0, { notStrict });
}
{
  let nonMonotone = 0;
  let prev = Infinity;
  for (let s = 0; s <= 1400; s++) {
    const len = tetherLengthCu(s);
    if (len > prev) nonMonotone++;
    prev = len;
  }
  check('length is non-increasing in shelter over the whole reachable range',
    nonMonotone === 0, { nonMonotone });
}
// The two ends, by hand from the module's own constants.
check('no shelter at all is the longest tether', tetherLengthCu(0) === TETHER_MAX_CU, tetherLengthCu(0));
check('a fully taut tether is the shortest', tetherLengthCu(TETHER_TAUT_SHELTER) === TETHER_MIN_CU,
  tetherLengthCu(TETHER_TAUT_SHELTER));
check('past taut it cannot shrink further', tetherLengthCu(TETHER_TAUT_SHELTER * 4) === TETHER_MIN_CU,
  tetherLengthCu(TETHER_TAUT_SHELTER * 4));
check('a longer tether than the shelter radius reads as out of reach', TETHER_MAX_CU > SHELTER_R,
  { TETHER_MAX_CU, SHELTER_R });
// Warmth is the same reading, the other way up: 0 cold and adrift, 1 warm and
// tucked. By hand at the threshold: 300/600 = 0.5.
check('warmth is nothing at no shelter', tetherWarmth(0) === 0, tetherWarmth(0));
check('warmth is full at taut', tetherWarmth(TETHER_TAUT_SHELTER) === 1, tetherWarmth(TETHER_TAUT_SHELTER));
check('warmth at the threshold is exactly half (hand-derived 0.5)',
  tetherWarmth(SHELTER_THRESHOLD) === 0.5, tetherWarmth(SHELTER_THRESHOLD));

// ===========================================================================
// 2. THE THRESHOLD IS THE ENGINE'S, EXACTLY, ON BOTH SIDES
//
// A tether that called someone safe whom the sweep would take is worse than
// no tether at all.
// ===========================================================================

check('exactly at the threshold is held (hand-derived shelter 300)',
  tetherMood(SHELTER_THRESHOLD) === 'held', tetherMood(SHELTER_THRESHOLD));
check('one point of shelter short of the threshold is adrift',
  tetherMood(SHELTER_THRESHOLD - 1) === 'adrift', tetherMood(SHELTER_THRESHOLD - 1));
check('a point of shelter past the threshold is still held',
  tetherMood(SHELTER_THRESHOLD + 1) === 'held', tetherMood(SHELTER_THRESHOLD + 1));
check('no shelter at all is adrift', tetherMood(0) === 'adrift', tetherMood(0));

// The boundary on REAL BODIES, one cu apart: D=220 is exactly three
// neighbours (300, held) and D=221 is two (200, adrift). Both derived above.
{
  const held = walker(220);
  const adrift = walker(221);
  const rHeld = readTether(held, [held, ...CROWD]);
  const rAdrift = readTether(adrift, [adrift, ...CROWD]);
  check('at exactly the threshold the tether says held, and so does the engine',
    rHeld.shelter === SHELTER_THRESHOLD && rHeld.mood === 'held' && rHeld.exposed === false
    && isExposed(held, [held, ...CROWD]) === false,
    { shelter: rHeld.shelter, mood: rHeld.mood, exposed: rHeld.exposed });
  check('one cu further out the tether says adrift, and so does the engine',
    rAdrift.shelter === 200 && rAdrift.mood === 'adrift' && rAdrift.exposed === true
    && isExposed(adrift, [adrift, ...CROWD]) === true,
    { shelter: rAdrift.shelter, mood: rAdrift.mood, exposed: rAdrift.exposed });
}

// And the two never disagree, over a wide sweep of arrangements the hand
// cases do not cover. `isExposed` is the engine; `tetherMood` is what the
// paint asks. If these ever parted, the picture would lie about the verdict.
{
  let disagree = 0, trials = 0;
  let seed = 12345;
  const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
  for (let trial = 0; trial < 400; trial++) {
    const n = 1 + Math.floor(rnd() * 7);
    const bodies: Body[] = [{ id: 'me', x: 2000, y: 1500, size: 60 + Math.floor(rnd() * 400) }];
    for (let i = 0; i < n; i++) {
      bodies.push({
        id: `o${i}`,
        x: 2000 + Math.round((rnd() - 0.5) * 900),
        y: 1500 + Math.round((rnd() - 0.5) * 900),
        size: 60 + Math.floor(rnd() * 2200),
      });
    }
    const me = bodies[0];
    const engine = isExposed(me, bodies);
    const paint = tetherMood(shelterOf(me, bodies)) === 'adrift';
    trials++;
    if (engine !== paint) disagree++;
  }
  check('the drawn threshold and the swept threshold never disagree, over 400 arrangements',
    disagree === 0 && trials === 400, { disagree, trials });
}

// ===========================================================================
// 3. THE STRANDS ARE THE SHELTER, DECOMPOSED
//
// One strand per neighbour that actually shelters you, each carrying that
// neighbour's own `shelterWeight`. The sum is `shelterOf`, exactly — which is
// what makes "big fish anchor several tethers" (spec 2.10) a fact about the
// picture rather than a metaphor.
// ===========================================================================

{
  let sumMismatch = 0, countMismatch = 0, orderBroken = 0, reachBroken = 0;
  let seed = 777;
  const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
  for (let trial = 0; trial < 300; trial++) {
    const n = 1 + Math.floor(rnd() * 9);
    const bodies: Body[] = [{ id: 'me', x: 2000, y: 1500, size: 100 }];
    for (let i = 0; i < n; i++) {
      bodies.push({
        id: `o${i}`,
        x: 2000 + Math.round((rnd() - 0.5) * 1000),
        y: 1500 + Math.round((rnd() - 0.5) * 1000),
        size: 60 + Math.floor(rnd() * 2200),
      });
    }
    const me = bodies[0];
    const strands = strandsOf(me, bodies);
    let sum = 0;
    let prevDist = -1;
    for (const s of strands) {
      sum += s.weight;
      if (s.distCu < prevDist) orderBroken++;
      prevDist = s.distCu;
      if (s.distCu > SHELTER_R) reachBroken++;
      if (s.weight !== shelterWeight(bodies.find((b) => b.id === s.id)!.size)) sumMismatch++;
    }
    if (sum !== shelterOf(me, bodies)) sumMismatch++;
    const within = bodies.filter((b) => b.id !== 'me'
      && Math.hypot(b.x - me.x, b.y - me.y) <= SHELTER_R).length;
    if (strands.length !== within) countMismatch++;
  }
  check('the strand weights sum to exactly shelterOf, over 300 arrangements', sumMismatch === 0, { sumMismatch });
  check('there is one strand per sheltering neighbour and no others', countMismatch === 0, { countMismatch });
  check('strands come out nearest first', orderBroken === 0, { orderBroken });
  check('no strand reaches past the engine\'s shelter radius', reachBroken === 0, { reachBroken });
}
// A fish never ties a strand to itself.
{
  const me: Body = { id: 'me', x: 2000, y: 1500, size: 900 };
  check('a swimmer is never its own anchor', strandsOf(me, [me]).length === 0);
}
// The adrift case: no strands at all, but the tether still knows which way
// the crowd is — the one honest thing to trail toward.
{
  const me = walker(341);
  const r = readTether(me, [me, ...CROWD]);
  check('a swimmer past every neighbour has no strand left', r.strands.length === 0, r.strands.length);
  check('...and its tether is at full stretch', r.lengthCu === TETHER_MAX_CU, r.lengthCu);
  check('...and it still trails toward the nearest fish (n0, 341 cu away)',
    r.nearest !== null && r.nearest.id === 'n0' && r.nearest.distCu === 341, r.nearest);
}
{
  const me: Body = { id: 'alone', x: 10, y: 10, size: 100 };
  const r = readTether(me, [me]);
  check('a swimmer with nobody at all has no nearest and no strands',
    r.nearest === null && r.strands.length === 0 && r.shelter === 0 && r.mood === 'adrift', r);
}

// ===========================================================================
// 4. THE FADE (spec 2.10: "fades with accumulated playtime")
// ===========================================================================

check('a first-minute swimmer gets the whole tether', tetherFade(0) === 1, tetherFade(0));
check('it is still whole at the end of the hold window', tetherFade(TETHER_FADE_HOLD_MS) === 1,
  tetherFade(TETHER_FADE_HOLD_MS));
check('it is off at the stated playtime', tetherFade(TETHER_FADE_OFF_MS) === 0, tetherFade(TETHER_FADE_OFF_MS));
check('it stays off for ever after', tetherFade(TETHER_FADE_OFF_MS * 9) === 0,
  tetherFade(TETHER_FADE_OFF_MS * 9));
check('"the first ten minutes" is ten minutes', TETHER_FADE_OFF_MS === 600_000, TETHER_FADE_OFF_MS);
// By hand: halfway between the hold and the end is half gone.
// (240_000 + 600_000) / 2 = 420_000.
check('halfway through the fade it is half there (hand-derived 0.5)',
  Math.abs(tetherFade(420_000) - 0.5) < 1e-12, tetherFade(420_000));
// And a quarter of the way: 240_000 + 0.25*360_000 = 330_000 -> 0.75.
check('a quarter of the way through the fade, three quarters remain (hand-derived 0.75)',
  Math.abs(tetherFade(330_000) - 0.75) < 1e-12, tetherFade(330_000));
{
  let nonMonotone = 0;
  let prev = Infinity;
  for (let ms = 0; ms <= 900_000; ms += 500) {
    const v = tetherFade(ms);
    if (v > prev + 1e-12) nonMonotone++;
    prev = v;
  }
  check('the fade never comes back', nonMonotone === 0, { nonMonotone });
}
// "...and the hush carries it from then on" — spec 2.10, verbatim. A veteran
// whose ambient tether has gone gets the whole of it back the moment the
// water goes quiet, and again for the replay.
check('a veteran has no ambient tether left', tetherOpacity(TETHER_FADE_OFF_MS, 'ambient') === 0,
  tetherOpacity(TETHER_FADE_OFF_MS, 'ambient'));
check('...but the hush carries it in full', tetherOpacity(TETHER_FADE_OFF_MS, 'hush') === 1,
  tetherOpacity(TETHER_FADE_OFF_MS, 'hush'));
check('...and so does the scatter replay', tetherOpacity(TETHER_FADE_OFF_MS * 20, 'scatter') === 1,
  tetherOpacity(TETHER_FADE_OFF_MS * 20, 'scatter'));
check('a newcomer\'s ambient tether is whole', tetherOpacity(0, 'ambient') === 1, tetherOpacity(0, 'ambient'));

// ===========================================================================
// 5. SIZE SENSES (spec 2.8: "a larger fish feels the hush a beat earlier")
//
// The premonition is read off `state.tension` — a public, folded number every
// client already has — so it is a sense, not a secret. The threshold falls
// with size: by hand, from this module's own constants,
//   small (60):  TENSION_TRIGGER * 940/1000 = 30_000 * 0.94 = 28_200
//   large (400): TENSION_TRIGGER * 720/1000 = 30_000 * 0.72 = 21_600
// ===========================================================================

check('the smallest swimmer\'s sense threshold is hand-derived 28_200',
  senseThreshold(SENSE_SIZE_SMALL) === 28_200, senseThreshold(SENSE_SIZE_SMALL));
check('a big swimmer\'s sense threshold is hand-derived 21_600',
  senseThreshold(SENSE_SIZE_LARGE) === 21_600, senseThreshold(SENSE_SIZE_LARGE));
check('the sense thresholds are stated as per-mille of the trigger',
  SENSE_SMALL_PERMILLE === 940 && SENSE_LARGE_PERMILLE === 720,
  { SENSE_SMALL_PERMILLE, SENSE_LARGE_PERMILLE });
check('the smallest a swimmer can be is the small end of the scale', SENSE_SIZE_SMALL === MIN_SIZE,
  { SENSE_SIZE_SMALL, MIN_SIZE });
{
  let nonMonotone = 0;
  let prev = Infinity;
  for (let size = 20; size <= 1200; size += 3) {
    const th = senseThreshold(size);
    if (th > prev + 1e-9) nonMonotone++;
    prev = th;
  }
  check('a bigger fish never has a higher sense threshold', nonMonotone === 0, { nonMonotone });
  check('below the small end the threshold does not keep climbing',
    senseThreshold(1) === senseThreshold(SENSE_SIZE_SMALL), senseThreshold(1));
  check('above the large end it does not keep falling',
    senseThreshold(9000) === senseThreshold(SENSE_SIZE_LARGE), senseThreshold(9000));
}
{
  let notAhead = 0, nonMonotone = 0;
  for (let tension = 0; tension <= TENSION_TRIGGER; tension += 25) {
    const small = premonition(tension, SENSE_SIZE_SMALL);
    const large = premonition(tension, SENSE_SIZE_LARGE);
    if (large < small - 1e-12) notAhead++;
  }
  let prev = -1;
  for (let tension = 0; tension <= TENSION_TRIGGER * 2; tension += 25) {
    const v = premonition(tension, 200);
    if (v < prev - 1e-12) nonMonotone++;
    prev = v;
  }
  check('at every tension the larger fish feels at least as much', notAhead === 0, { notAhead });
  check('the premonition never falls as tension climbs', nonMonotone === 0, { nonMonotone });
}
check('a calm sea gives nobody a premonition', premonition(0, SENSE_SIZE_LARGE) === 0,
  premonition(0, SENSE_SIZE_LARGE));
check('at the trigger itself everyone feels it fully', premonition(TENSION_TRIGGER, SENSE_SIZE_SMALL) === 1,
  premonition(TENSION_TRIGGER, SENSE_SIZE_SMALL));
// By hand: a 400-size fish at tension 25_000 -> (25_000 - 21_600)/(30_000 - 21_600)
//        = 3_400/8_400 = 0.404761904...
check('a big fish at tension 25_000 is 0.40476 of the way (hand-derived)',
  Math.abs(premonition(25_000, SENSE_SIZE_LARGE) - 3400 / 8400) < 1e-12,
  premonition(25_000, SENSE_SIZE_LARGE));
check('...while a small one at the same tension feels nothing yet',
  premonition(25_000, SENSE_SIZE_SMALL) === 0, premonition(25_000, SENSE_SIZE_SMALL));

// ===========================================================================
// 6. THE HUSH WINDOW (spec 2.12), read against the engine's own constants
// ===========================================================================

check('the hush is calm before it starts', hushRead(-1, 147_580_000).phase === 'calm');
{
  const H = 100_000;
  const at0 = hushRead(H, H);
  const mid = hushRead(H, H + LOCK_MS - 1);
  const lock = hushRead(H, H + LOCK_MS);
  const dread = hushRead(H, H + HUSH_MS - 1);
  const over = hushRead(H, H + HUSH_MS);
  check('the commit window opens at T+0', at0.phase === 'commit' && at0.locked === false, at0);
  check('one ms before the lock the player still counts',
    mid.phase === 'commit' && mid.locked === false, mid);
  check('at exactly LOCK_MS nothing the player does counts any more',
    lock.phase === 'dread' && lock.locked === true, lock);
  check('the last ms before resolution is still dread',
    dread.phase === 'dread' && dread.locked === true, dread);
  check('after HUSH_MS the water is calm again', over.phase === 'calm' && over.locked === false, over);
  // By hand: the lock is exactly half of the eight-second window.
  check('the lock lands halfway through the hush (hand-derived 4000 of 8000)',
    LOCK_MS * 2 === HUSH_MS, { LOCK_MS, HUSH_MS });
  check('progress runs 0..1 across the window (hand-derived 0.5 at the lock)',
    at0.progress === 0 && lock.progress === 0.5 && Math.abs(dread.progress - (HUSH_MS - 1) / HUSH_MS) < 1e-12,
    { a: at0.progress, b: lock.progress, c: dread.progress });
  // The lock is a moment, not a state change nobody sees: a flash that is at
  // its brightest on the instant and gone shortly after.
  check('the lock flashes at the instant it lands', lock.lockFlash === 1, lock.lockFlash);
  check('nothing flashes during the commit window', mid.lockFlash === 0, mid.lockFlash);
  check('the flash is over well before resolution', hushRead(H, H + HUSH_MS - 500).lockFlash === 0,
    hushRead(H, H + HUSH_MS - 500).lockFlash);
  // The pall is the WORLD going quiet — the same for a fish deep in the crowd
  // as for one out in the open, because it is the water that hushes, not the
  // player. (What is personal is the tether, which the paint reads off
  // `exposed`.) It must be fully in before the commit window closes, or a
  // newly-exposed swimmer gets no warning at all.
  check('the pall is nothing before the hush', hushRead(-1, 147_580_000).pall === 0);
  check('the pall is fully in before the lock', hushRead(H, H + LOCK_MS).pall === 1,
    hushRead(H, H + LOCK_MS).pall);
  check('the pall is already reading in the first second',
    hushRead(H, H + 900).pall > 0.5, hushRead(H, H + 900).pall);
  // Dread: how close the thing is, 0 at the lock and 1 at resolution.
  check('dread is nothing during the commit window', hushRead(H, H + 1000).dread === 0);
  check('dread starts at the lock and lands at resolution',
    lock.dread === 0 && Math.abs(hushRead(H, H + HUSH_MS - 1).dread - (LOCK_MS - 1) / LOCK_MS) < 1e-12,
    { lock: lock.dread, end: hushRead(H, H + HUSH_MS - 1).dread });
}
// A hush that has not begun yet cannot report an elapsed time.
check('a calm sea has no elapsed hush', hushRead(-1, 5_000).elapsedMs === -1, hushRead(-1, 5_000).elapsedMs);

// ===========================================================================
// 7. THE HARNESS'S OWN SESSION
//
// Everything below is folded through the real `createLoop`/`advance` on the
// harness's exact log, and every expected value is COPIED VERBATIM from
// `npm run harness`'s printed output. The harness has never imported
// `tether.ts`.
//
//   hush-started=147588000     (poll 16)
//   phase=dread from +4000ms   (poll 20, t=147592000)
//   last sweep @147596000 took=[o0, o1, o2]   (poll 26)
//   every one of o0..o7 sits at shelter 0, size 74, at the lock (poll 25)
// ===========================================================================

const EPOCH = 40;
const BOUNDARY = epochEndMs(EPOCH); // 147_600_000
const OFFSET = BOUNDARY - 30_000; // 147_570_000
const HUSH_AT = 147_588_000; // verbatim from the harness
const LOCK_AT = 147_592_000; // verbatim from the harness
const SWEEP_AT = 147_596_000; // verbatim from the harness

function harnessLog(): LogEntry[] {
  const out: LogEntry[] = richSession().map((e) => (e.kind === 'presence'
    ? { ...e, ms: e.ms + OFFSET, vec: { ...e.vec, t: e.vec.t + OFFSET } }
    : { ...e, ms: e.ms + OFFSET }));
  out.push({ kind: 'eat', id: 'e0', cell: 367, ms: OFFSET + 25_000, hash: 'e0e2' });
  const goneMs = BOUNDARY - 400_000;
  out.push({
    kind: 'presence', id: 'gone', ms: goneMs, hash: 'g0',
    vec: { x: 576, y: 448, heading: 0, speed: 0, t: goneMs },
  });
  out.push({ kind: 'eat', id: 'gone', cell: 100, ms: goneMs, hash: 'ge0' });
  return out;
}

const LOG = harnessLog();

/** Fold the harness's session to `t`, from a cold start. */
function foldTo(t: number): LoopState {
  return advance(createLoop(EPOCH, null), LOG, t).loop;
}

// --- 7a. A larger fish really does feel it earlier, in this real session ---
{
  let loop = advance(createLoop(EPOCH, null), LOG, OFFSET - TICK_MS).loop;
  let bigMs = -1, smallMs = -1, hushMs = -1;
  for (let t = OFFSET; t <= HUSH_AT; t += TICK_MS) {
    loop = advance(loop, LOG, t).loop;
    const s = loop.state;
    if (bigMs < 0 && premonition(s.tension, SENSE_SIZE_LARGE) > 0) bigMs = t;
    if (smallMs < 0 && premonition(s.tension, SENSE_SIZE_SMALL) > 0) smallMs = t;
    if (hushMs < 0 && s.hushStartMs >= 0) hushMs = s.hushStartMs;
  }
  check('the harness\'s hush still begins at 147_588_000 (verbatim)', hushMs === HUSH_AT, hushMs);
  check('a big fish senses the hush before it arrives', bigMs > 0 && bigMs < hushMs, { bigMs, hushMs });
  check('a small fish senses it too, but later', smallMs > 0 && smallMs < hushMs && smallMs > bigMs,
    { smallMs, bigMs, hushMs });
  check('"a beat earlier" is at least two seconds of real warning in this session',
    smallMs - bigMs >= 2_000, { bigMs, smallMs, lead: smallMs - bigMs });
}

// --- 7b. During dread the tether shows the arrangement the sweep will judge --
{
  const commit = foldTo(HUSH_AT + 1_000);
  check('there is nothing locked during the commit window',
    lockedBodies(commit.state) === null, lockedBodies(commit.state));

  const dread = foldTo(LOCK_AT + 1_000);
  const locked = lockedBodies(dread.state);
  check('the lock is taken once the commit window closes', locked !== null);
  if (locked) {
    const engine = dread.state.lockedPositions;
    check('the locked arrangement is the engine\'s own, entry for entry',
      engine !== null && locked.length === engine.size
      && locked.every((b) => {
        const p = engine.get(b.id);
        return p !== undefined && p.x === b.x && p.y === b.y && p.size === b.size;
      }), locked);
    check('the locked arrangement comes out sorted by id, as the fold reads it',
      locked.every((b, i) => i === 0 || locked[i - 1].id < b.id), locked.map((b) => b.id));
    // THE POINT OF SHOWING IT: the verdict is already decided, and the
    // arrangement on screen is the one that decides it.
    check('the arrangement on screen produces exactly the sweep that follows (verbatim [o0, o1, o2])',
      JSON.stringify(selectTaken(locked, dread.state.lockedPreferred)) === JSON.stringify(['o0', 'o1', 'o2']),
      selectTaken(locked, dread.state.lockedPreferred));
    // ...and every one of the harness's outsiders reads as adrift on it.
    const adrift = locked.filter((b) => readTether(b, locked).mood === 'adrift').map((b) => b.id);
    check('the eight outsiders read adrift and the four in the cluster do not (verbatim)',
      JSON.stringify(adrift) === JSON.stringify(['o0', 'o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7']), adrift);
  }
}

// --- 7c. THE REPLAY SHOWS THE FISH THE ENGINE TOOK ------------------------
{
  const after = foldTo(SWEEP_AT);
  const state = after.state;
  check('the sweep resolved where the harness said it did (verbatim 147_596_000)',
    state.lastSweepMs === SWEEP_AT, state.lastSweepMs);

  const bodies = bodiesOf(state);
  const replay = scatterReplay(state, SWEEP_AT, bodies);
  check('a replay opens on the instant the sweep resolved', replay !== null);
  if (replay) {
    check('the replay names the fish the harness printed (verbatim [o0, o1, o2])',
      JSON.stringify([...replay.taken]) === JSON.stringify(['o0', 'o1', 'o2']), replay.taken);
    check('the replay reads the sweep\'s own instant, not the display\'s',
      replay.atMs === state.lastSweepMs, replay.atMs);
    check('the replay opens at the very start of the freeze', replay.progress === 0, replay.progress);
  }

  // THE WHOLE REASON THIS IS READ AND NEVER RECOMPUTED. Re-deriving the taken
  // set from the world AFTER the sweep names three DIFFERENT fish: o0/o1/o2
  // have just paid SCATTER_COST and clamped to MIN_SIZE (60), so a fresh
  // `selectTaken` — which prefers the LARGEST exposed fish — picks the three
  // untouched outsiders instead. Disagreeing about who died is the worst
  // thing this game can do.
  const recomputed = selectTaken(bodies, null);
  check('a recomputation after the fact names different fish (that is the point)',
    JSON.stringify(recomputed) !== JSON.stringify(['o0', 'o1', 'o2']), recomputed);
  check('...specifically the three untouched outsiders (hand-derived o3, o4, o5)',
    JSON.stringify(recomputed) === JSON.stringify(['o3', 'o4', 'o5']), recomputed);

  // And the replay follows the ENGINE'S field, wherever it points: hand it a
  // different verdict and it reports that one, because it never had an
  // opinion of its own.
  const forged = scatterReplay({ lastSweepMs: SWEEP_AT, lastTaken: ['c1'] }, SWEEP_AT, bodies);
  check('the replay reports whatever the engine recorded, and nothing else',
    forged !== null && JSON.stringify([...forged.taken]) === JSON.stringify(['c1']), forged?.taken);
}

// --- 7d. The freeze is two seconds, and then it is over -------------------
{
  const state = foldTo(SWEEP_AT).state;
  const bodies = bodiesOf(state);
  check('the freeze is the stated two seconds', SCATTER_FREEZE_MS === 2_000, SCATTER_FREEZE_MS);
  check('a moment into the freeze the replay is still running',
    scatterReplay(state, SWEEP_AT + SCATTER_FREEZE_MS - 1, bodies) !== null);
  // By hand: halfway through a 2_000 ms freeze is 1_000 ms in.
  {
    const half = scatterReplay(state, SWEEP_AT + 1_000, bodies);
    check('halfway through the freeze the replay is half done (hand-derived 0.5)',
      half !== null && half.progress === 0.5, half?.progress);
  }
  check('the freeze ends exactly two seconds after the sweep',
    scatterReplay(state, SWEEP_AT + SCATTER_FREEZE_MS, bodies) === null);
  check('a sea that has never been swept has no replay',
    scatterReplay({ lastSweepMs: -1, lastTaken: [] }, 1_000, bodies) === null);
  check('a replay never runs before its own sweep',
    scatterReplay(state, SWEEP_AT - 1, bodies) === null);
  // Every fish in the frozen frame, not only the taken ones — that is what
  // makes it an argument rather than an accusation.
  {
    const replay = scatterReplay(state, SWEEP_AT, bodies);
    check('the replay carries every fish in the sea, not only the taken',
      replay !== null && replay.bodies.length === bodies.length, replay?.bodies.length);
  }
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
