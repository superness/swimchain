/**
 * Terrain — the sea's named places. Run: npx tsx src/ui/terrain.test.ts
 *
 * Expected values here are derived by hand or from an independent formula,
 * never by calling the function under test twice. Distances are built from
 * scaled 3-4-5 Pythagorean triples so `placeAt`'s boundary cases compare
 * exactly in squared-integer arithmetic (no sqrt needed to know which side
 * of `r` a point falls on), and `nearestPlace` cases either use huge margins
 * (bounded between two perfect squares, so no decimal sqrt precision is
 * needed) or plain axis-aligned distances (exact integers, no sqrt at all).
 */
import {
  PLACES, placeAt, placeDistance, nearestPlace, type Place,
  NOWHERE, trackArrival, nameAlpha, announcedName,
  PLACE_EXIT_MARGIN, NAME_FADE_IN_MS, NAME_HOLD_MS, NAME_FADE_OUT_MS, NAME_TOTAL_MS,
} from './terrain';
import { WORLD_W, WORLD_H, SHELTER_R, BLOOM_CELL } from '../lib/shoalConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

// ---------------------------------------------------------------------------
// 1. The set itself: four real places, sea-language names, no debug labels.
// ---------------------------------------------------------------------------

check('there are four named places', PLACES.length === 4, PLACES.length);

{
  const ids = PLACES.map((p) => p.id);
  const unique = new Set(ids).size === ids.length;
  check('every place has a distinct id', unique, ids);
}

// The diegetic rule (spec 1.1): sea language only, nothing that names the
// underlying network primitives. A literal substring check so a later
// addition cannot drift back across the line quietly.
{
  const forbidden = ['node', 'chain', 'space', 'post', 'reply', 'swimchain'];
  let clean = true;
  const hits: string[] = [];
  for (const p of PLACES) {
    const hay = (p.id + ' ' + p.name).toLowerCase();
    for (const word of forbidden) {
      if (hay.includes(word)) { clean = false; hits.push(`${p.id}:${word}`); }
    }
  }
  check('no place name reads as a debug label', clean, hits);
}

// A name has to be sayable under pressure: short, and one word (or a short
// hyphenated compound) rather than a sentence.
{
  let sayable = true;
  const bad: string[] = [];
  for (const p of PLACES) {
    const words = p.name.replace(/^The /, '').split(/[\s-]+/);
    if (words.length > 2 || p.name.length > 16) { sayable = false; bad.push(p.name); }
  }
  check('every name is short enough to shout', sayable, bad);
}

// ---------------------------------------------------------------------------
// 2. Geometry sanity: every place is comfortably inside the world, bigger
//    than a bloom cell, and no two overlap or sit too close to tell apart.
//    (These are also enforced at module load by terrain.ts itself; this
//    section re-derives them independently, by hand, against the raw
//    WORLD_W/WORLD_H/SHELTER_R/BLOOM_CELL numbers rather than trusting that
//    the module's own internal check ran correctly.)
// ---------------------------------------------------------------------------

for (const p of PLACES) {
  check(`${p.id}: radius exceeds a bloom cell`, p.r > BLOOM_CELL, { r: p.r, BLOOM_CELL });
  check(`${p.id}: extent fits inside the world`,
    p.x - p.r >= 0 && p.x + p.r <= WORLD_W && p.y - p.r >= 0 && p.y + p.r <= WORLD_H,
    { x: p.x, y: p.y, r: p.r, WORLD_W, WORLD_H });
}

// Pairwise gaps, hand-computed from the coordinates in terrain.ts's header:
//   kelp(900,900)/wreck(3300,750):     dx=2400 dy=150  -> ~2404.7
//   kelp/dropoff(2048,2700):           dx=1148 dy=1800 -> ~2135.4
//   kelp/shelf(3400,2300):             dx=2500 dy=1400 -> ~2865.7
//   wreck/dropoff:                     dx=1252 dy=1950 -> ~2317.6
//   wreck/shelf:                       dx=100  dy=1550 -> ~1553.2  <- smallest
//   dropoff/shelf:                     dx=1352 dy=400  -> ~1409.9
// The smallest, ~1553, is checked against 2*SHELTER_R (680) and against the
// two radii it connects (220+300=520) by bounding sqrt(2,412,500) between
// 1553^2=2,411,809 and 1554^2=2,414,916 (2,412,500 lies between), so the gap
// is in (1553, 1554) - comfortably past both floors.
{
  let noOverlap = true;
  let farApart = true;
  const bad: string[] = [];
  for (let i = 0; i < PLACES.length; i++) {
    for (let j = i + 1; j < PLACES.length; j++) {
      const a = PLACES[i];
      const b = PLACES[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const gap2 = dx * dx + dy * dy;
      if (gap2 <= (a.r + b.r) * (a.r + b.r)) { noOverlap = false; bad.push(`${a.id}/${b.id} overlap`); }
      if (gap2 <= (2 * SHELTER_R) * (2 * SHELTER_R)) { farApart = false; bad.push(`${a.id}/${b.id} too close`); }
    }
  }
  check('no two places overlap', noOverlap, bad);
  check('every pair is more than 2*SHELTER_R apart', farApart, bad);
}

// ---------------------------------------------------------------------------
// 3. placeAt: inclusive boundary, exact in squared-integer arithmetic.
// ---------------------------------------------------------------------------

const kelp = PLACES.find((p) => p.id === 'kelp')!;
const wreck = PLACES.find((p) => p.id === 'wreck')!;
const dropoff = PLACES.find((p) => p.id === 'dropoff')!;
const shelf = PLACES.find((p) => p.id === 'shelf')!;

check('every named place exists', !!kelp && !!wreck && !!dropoff && !!shelf);

// Kelp Stand: r=320 = 64*5, so (64*3, 64*4) = (192, 256) is exactly on the
// boundary: 192^2 + 256^2 = 36864 + 65536 = 102400 = 320^2.
check('placeAt: the centre is inside its own place', placeAt(kelp.x, kelp.y)?.id === 'kelp');
{
  const p = placeAt(kelp.x + 192, kelp.y + 256);
  check('placeAt: exactly on the boundary counts as inside (inclusive)', p?.id === 'kelp', p);
}
{
  // One cu further out: 193^2 + 256^2 = 37249 + 65536 = 102785 > 102400.
  const p = placeAt(kelp.x + 193, kelp.y + 256);
  check('placeAt: one cu past the boundary is open water', p === null, p);
}

// The Wreck: r=220 = 44*5, so (44*3, 44*4) = (132, 176) is exactly on the
// boundary: 132^2 + 176^2 = 17424 + 30976 = 48400 = 220^2.
{
  const onBoundary = placeAt(wreck.x + 132, wreck.y + 176);
  const justOutside = placeAt(wreck.x + 133, wreck.y + 176); // 133^2+176^2=48665>48400
  check('placeAt: the wreck boundary is inclusive', onBoundary?.id === 'wreck', onBoundary);
  check('placeAt: just past the wreck boundary is open water', justOutside === null, justOutside);
}

// The Drop-off: r=260 = 52*5, so (52*3, 52*4) = (156, 208) is exactly on the
// boundary: 156^2 + 208^2 = 24336 + 43264 = 67600 = 260^2.
{
  const p = placeAt(dropoff.x - 156, dropoff.y - 208);
  check('placeAt: the drop-off boundary is inclusive (negative offset)', p?.id === 'dropoff', p);
}

// The Shelf: r=300 = 60*5, so (60*3, 60*4) = (180, 240) is exactly on the
// boundary: 180^2 + 240^2 = 32400 + 57600 = 90000 = 300^2.
{
  const p = placeAt(shelf.x + 180, shelf.y + 240);
  check('placeAt: the shelf boundary is inclusive', p?.id === 'shelf', p);
}

// A point nowhere near any of the four places is open water.
check('placeAt: the middle of nowhere is open water', placeAt(50, 50) === null, placeAt(50, 50));

// ---------------------------------------------------------------------------
// 4. placeDistance and nearestPlace, on a synthetic pair so the numbers are
//    small, exact, and independent of the real four places' coordinates.
// ---------------------------------------------------------------------------

function synth(id: string, name: string, x: number, y: number, r: number): Place {
  return Object.freeze({ id, name, x, y, r });
}

// A 3-4-5 triangle scaled by 10: place at (0,0) r=10, point at (30,40).
// dist = sqrt(30^2+40^2) = sqrt(900+1600) = sqrt(2500) = 50 exactly.
// region distance = 50 - 10 = 40.
{
  const p = synth('a', 'A', 0, 0, 10);
  check('placeDistance: outside a region is dist-to-centre minus radius', placeDistance(30, 40, p) === 40,
    placeDistance(30, 40, p));
}
// Inside the region: point (3,4), dist=5 < r=10 -> region distance 0.
{
  const p = synth('a', 'A', 0, 0, 10);
  check('placeDistance: inside a region is zero', placeDistance(3, 4, p) === 0, placeDistance(3, 4, p));
}
// Exactly on the boundary: point (6,8), dist=10=r -> region distance 0 (inclusive).
{
  const p = synth('a', 'A', 0, 0, 10);
  check('placeDistance: exactly on the boundary is zero', placeDistance(6, 8, p) === 0, placeDistance(6, 8, p));
}

// nearestPlace on two synthetic, non-overlapping places, axis-aligned so
// every distance is an exact integer with no sqrt involved:
//   A at (0,0) r=100, B at (1000,0) r=100.
{
  const A = synth('a', 'A', 0, 0, 100);
  const B = synth('b', 'B', 1000, 0, 100);
  const pair = [A, B];

  // A point close to A: dist-to-A-centre=200 -> region dist 100.
  //                      dist-to-B-centre=800 -> region dist 700.
  check('nearestPlace: picks the obviously closer region', nearestPlace(200, 0, pair)?.id === 'a',
    nearestPlace(200, 0, pair));

  // Dead centre between them, (500, 0): dist-to-A=500 -> region dist 400.
  //                                      dist-to-B=500 -> region dist 400.
  // Exact tie. Ties are broken by array order: A is listed first and wins.
  check('nearestPlace: an exact tie is broken by array order (first wins)',
    nearestPlace(500, 0, pair)?.id === 'a', nearestPlace(500, 0, pair));

  // Reversing the array order flips which place wins the same tie, proving
  // the rule really is "array order" and not e.g. "lower id" or "lower x".
  check('nearestPlace: reversing the array flips the tie the same way',
    nearestPlace(500, 0, [B, A])?.id === 'b', nearestPlace(500, 0, [B, A]));

  // A point already inside B's region is nearest to B even though A's
  // centre and B's centre are equidistant-ish — the region measure, not the
  // centre measure, is what must decide this.
  // Point (950, 0): inside B (dist-to-B-centre=50 < r=100 -> region 0);
  //                 dist-to-A-centre=950 -> region dist 850.
  check('nearestPlace: a point inside a region is nearest to it, not to a closer-looking centre',
    nearestPlace(950, 0, pair)?.id === 'b', nearestPlace(950, 0, pair));

  // Empty list: no place to be near.
  check('nearestPlace: an empty list has no nearest place', nearestPlace(0, 0, []) === null);
}

// nearestPlace against the real four places, with margins wide enough to
// verify by bounding sqrt between two perfect squares (no decimal sqrt
// needed). Point (900, 1520): straight below Kelp's centre.
//   dist-to-kelp-centre = 620 (axis-aligned, exact) -> region dist = 300.
//   dist-to-wreck-centre: dx=2400 dy=770 -> dist^2=6,352,900.
//     2500^2=6,250,000 and 2600^2=6,760,000 bound it, so dist in (2500,2600)
//     -> region dist > 2500-220=2280, far past 300.
//   dist-to-dropoff-centre: dx=1148 dy=1180 -> dist^2=2,710,304.
//     1600^2=2,560,000 and 1700^2=2,890,000 bound it, so dist in (1600,1700)
//     -> region dist > 1600-260=1340, far past 300.
//   dist-to-shelf-centre: dx=2500 dy=780 -> dist^2=6,858,400.
//     2600^2=6,760,000 and 2700^2=7,290,000 bound it, so dist in (2600,2700)
//     -> region dist > 2600-300=2300, far past 300.
check('nearestPlace: kelp wins by a wide margin near its own centre',
  nearestPlace(900, 1520)?.id === 'kelp', nearestPlace(900, 1520));

// ---------------------------------------------------------------------------
// 5. Stability: the set does not move between calls, and is immutable.
// ---------------------------------------------------------------------------

check('PLACES is frozen', Object.isFrozen(PLACES));
check('every place is frozen', PLACES.every((p) => Object.isFrozen(p)));

{
  const before = JSON.stringify(PLACES);
  placeAt(1000, 1000);
  nearestPlace(2000, 2000);
  placeAt(kelp.x, kelp.y);
  const after = JSON.stringify(PLACES);
  check('reading placeAt/nearestPlace repeatedly does not move any place', before === after);
}

{
  // Same query, twice, is the same answer both times — not merely equal,
  // the literal same object, since PLACES is never rebuilt.
  const first = nearestPlace(900, 900);
  const second = nearestPlace(900, 900);
  check('nearestPlace returns the identical object on repeated calls', first === second);
}

{
  const first = placeAt(kelp.x, kelp.y);
  const second = placeAt(kelp.x, kelp.y);
  check('placeAt returns the identical object on repeated calls', first === second);
}

// ---------------------------------------------------------------------------
// 6. Arrival: which place you are AT, with hysteresis at the boundary.
//
//    Every offset below is a scaled 3-4-5 triple against the Kelp Stand's
//    r=320 and PLACE_EXIT_MARGIN, so each distance is an exact integer and
//    no sqrt precision is involved:
//      (192, 256) -> 320  exactly r          (inside)
//      (240, 320) -> 400  past r, inside the hold ring (320+120=440)
//      (264, 352) -> 440  exactly the hold ring         (still inside)
//      (265, 352) -> 265^2+352^2 = 194_129 > 440^2 = 193_600   (outside)
//    The first three are 64/80/88 x (3,4); the last is one cu further out.
// ---------------------------------------------------------------------------

check('PLACE_EXIT_MARGIN is 120 cu', PLACE_EXIT_MARGIN === 120, PLACE_EXIT_MARGIN);

{
  // Open water leaves the arrival exactly as it was — the same object, so a
  // frame loop calling this sixty times a second allocates nothing and
  // restamps nothing.
  const a = trackArrival(NOWHERE, 50, 50, 1_000);
  check('trackArrival: open water from nowhere is still nowhere', a === NOWHERE, a);
}

{
  const a = trackArrival(NOWHERE, kelp.x, kelp.y, 1_000);
  check('trackArrival: entering a place records it', a.at?.id === 'kelp', a.at);
  check('trackArrival: entering a place stamps the instant', a.sinceMs === 1_000, a.sinceMs);
}

{
  // You are AT the place you are inside, never at the one that merely happens
  // to be nearest. A point 10 cu outside kelp's edge, straight below its
  // centre (kelp.y + 330 against r = 320), is open water — even though kelp is
  // by far the nearest place to it.
  const a = trackArrival(NOWHERE, kelp.x, kelp.y + 330, 1_000);
  check('trackArrival: just outside a place is open water, not "at" the nearest one',
    a.at === null, a.at);
  check('trackArrival: and the nearest place to that same point really is kelp',
    nearestPlace(kelp.x, kelp.y + 330)?.id === 'kelp');
}

{
  const at = trackArrival(NOWHERE, kelp.x, kelp.y, 1_000);
  // Still inside: same place, and NOT restamped — a name announces an
  // arrival, so it must not restart while you are simply swimming about in
  // the place you already arrived at.
  const still = trackArrival(at, kelp.x + 192, kelp.y + 256, 5_000);
  check('trackArrival: moving within a place does not restamp it', still === at, still);
}

{
  const at = trackArrival(NOWHERE, kelp.x, kelp.y, 1_000);
  // 400 cu out: past r (320) but inside the hold ring (440). Still here.
  const held = trackArrival(at, kelp.x + 240, kelp.y + 320, 5_000);
  check('trackArrival: a step past the edge but inside the margin still counts as here',
    held === at, held);
  // Exactly on the hold ring: inclusive, same as placeAt's own boundary.
  const onRing = trackArrival(at, kelp.x + 264, kelp.y + 352, 6_000);
  check('trackArrival: the hold ring itself still counts as here', onRing === at, onRing);
  // One cu further out: gone.
  const gone = trackArrival(at, kelp.x + 265, kelp.y + 352, 7_000);
  check('trackArrival: past the hold ring is open water', gone.at === null, gone.at);
  check('trackArrival: leaving stamps the instant it happened', gone.sinceMs === 7_000, gone.sinceMs);
}

{
  // THE HYSTERESIS, as behaviour rather than as a constant. A swimmer idling
  // on the boundary — alternately 320 cu in and 400 cu out, twenty times —
  // must arrive exactly ONCE. Without the hold ring every second step is a
  // fresh arrival and the name flashes on and off in the player's face.
  let a = trackArrival(NOWHERE, kelp.x, kelp.y, 1_000);
  const stamps = new Set<number>([a.sinceMs]);
  for (let i = 0; i < 20; i++) {
    a = trackArrival(a, kelp.x + (i % 2 === 0 ? 240 : 192), kelp.y + (i % 2 === 0 ? 320 : 256),
      2_000 + i * 100);
    stamps.add(a.sinceMs);
    if (a.at === null) break;
  }
  check('trackArrival: idling on the boundary arrives exactly once',
    a.at?.id === 'kelp' && stamps.size === 1, { at: a.at?.id, stamps: [...stamps] });
}

{
  // Leaving and coming back IS a second arrival — the name should greet you
  // again, which is the other half of the same rule.
  const first = trackArrival(NOWHERE, kelp.x, kelp.y, 1_000);
  const left = trackArrival(first, 50, 50, 20_000);
  const again = trackArrival(left, kelp.x, kelp.y, 40_000);
  check('trackArrival: returning to a place is a fresh arrival',
    again.at?.id === 'kelp' && again.sinceMs === 40_000, again);
}

{
  // Straight from one place into another, with no open water in between —
  // the new place is picked up on the same call rather than a frame later.
  // Synthetic, so the numbers are exact: A at (0,0) r=100, B at (1000,0)
  // r=100. From A's centre to B's centre is 1000, past A's hold ring (220).
  const A = synth('a', 'A', 0, 0, 100);
  const B = synth('b', 'B', 1000, 0, 100);
  const pair = [A, B];
  const inA = trackArrival(NOWHERE, 0, 0, 1_000, pair);
  const inB = trackArrival(inA, 1000, 0, 2_000, pair);
  check('trackArrival: crossing straight into another place names the new one',
    inB.at?.id === 'b' && inB.sinceMs === 2_000, inB);
}

{
  const before = JSON.stringify(PLACES);
  const a = trackArrival(NOWHERE, kelp.x, kelp.y, 1_000);
  trackArrival(a, wreck.x, wreck.y, 2_000);
  check('trackArrival does not move any place', JSON.stringify(PLACES) === before);
  check('an arrival is frozen', Object.isFrozen(a));
  check('NOWHERE is frozen and is nowhere', Object.isFrozen(NOWHERE) && NOWHERE.at === null);
}

// ---------------------------------------------------------------------------
// 7. The announcement: a place says its name when you get there, then stops.
//
//    Hand-computed against NAME_FADE_IN_MS(800) / NAME_HOLD_MS(2600) /
//    NAME_FADE_OUT_MS(1200), total 4600. Every value below is worked out from
//    those three numbers by hand, not read back off the function.
// ---------------------------------------------------------------------------

check('the announcement lasts fade-in + hold + fade-out',
  NAME_TOTAL_MS === NAME_FADE_IN_MS + NAME_HOLD_MS + NAME_FADE_OUT_MS,
  { NAME_TOTAL_MS, NAME_FADE_IN_MS, NAME_HOLD_MS, NAME_FADE_OUT_MS });

{
  const at = trackArrival(NOWHERE, kelp.x, kelp.y, 10_000);
  // fade in: 800 ms. 10_000 + 200 -> 200/800 = 0.25; +400 -> 0.5; +800 -> 1.
  check('nameAlpha: nothing at the instant of arrival', nameAlpha(at, 10_000) === 0, nameAlpha(at, 10_000));
  check('nameAlpha: a quarter of the way in', nameAlpha(at, 10_200) === 0.25, nameAlpha(at, 10_200));
  check('nameAlpha: half way in', nameAlpha(at, 10_400) === 0.5, nameAlpha(at, 10_400));
  check('nameAlpha: full at the end of the fade-in', nameAlpha(at, 10_800) === 1, nameAlpha(at, 10_800));
  // hold: 800..3400 after arrival.
  check('nameAlpha: still full in the middle of the hold', nameAlpha(at, 12_000) === 1, nameAlpha(at, 12_000));
  check('nameAlpha: still full at the last instant of the hold',
    nameAlpha(at, 13_400) === 1, nameAlpha(at, 13_400));
  // fade out: 3400..4600. +300 -> 1 - 300/1200 = 0.75; +600 -> 0.5.
  check('nameAlpha: three quarters through the fade-out\'s first act',
    nameAlpha(at, 13_700) === 0.75, nameAlpha(at, 13_700));
  check('nameAlpha: half way out', nameAlpha(at, 14_000) === 0.5, nameAlpha(at, 14_000));
  check('nameAlpha: gone at the end', nameAlpha(at, 14_600) === 0, nameAlpha(at, 14_600));
  check('nameAlpha: still gone long after', nameAlpha(at, 99_999) === 0, nameAlpha(at, 99_999));
}

{
  // Shape, sampled — independent of the three constants' values: it rises,
  // it plateaus at exactly 1, it falls, and it never leaves [0, 1].
  const at = trackArrival(NOWHERE, kelp.x, kelp.y, 0);
  let inRange = true;
  let rises = true;
  let falls = true;
  let plateau = 0;
  let prev = -1;
  for (let t = 0; t <= NAME_TOTAL_MS; t += 25) {
    const v = nameAlpha(at, t);
    if (v < 0 || v > 1) inRange = false;
    if (t <= NAME_FADE_IN_MS && v < prev) rises = false;
    if (t >= NAME_FADE_IN_MS + NAME_HOLD_MS && v > prev) falls = false;
    if (v === 1) plateau += 25;
    prev = v;
  }
  check('nameAlpha never leaves [0, 1]', inRange);
  check('nameAlpha rises to the plateau', rises);
  check('nameAlpha falls away from the plateau', falls);
  // A plateau at all — a pure triangle ramp would sample 1 exactly once.
  check('nameAlpha holds at full for a readable stretch, not an instant',
    plateau > 1_000, plateau);
}

{
  // Open water says nothing, whatever the clock is doing.
  let silent = true;
  for (let t = 0; t < 20_000; t += 137) if (nameAlpha(NOWHERE, t) !== 0) silent = false;
  check('nameAlpha: open water never announces anything', silent);
}

{
  // A clock that has gone backwards (a fold time behind the stamp) must read
  // as silence, never as a negative alpha or a wrapped-around one.
  const at = trackArrival(NOWHERE, kelp.x, kelp.y, 10_000);
  check('nameAlpha: a time before the arrival is silence', nameAlpha(at, 9_000) === 0,
    nameAlpha(at, 9_000));
}

{
  const at = trackArrival(NOWHERE, wreck.x, wreck.y, 500);
  const said = announcedName(at, 1_300);
  check('announcedName: gives the place, its name and how strongly to say it',
    said !== null && said.place.id === 'wreck' && said.name === 'The Wreck' && said.alpha === 1,
    said);
  check('announcedName: says nothing once the announcement is over',
    announcedName(at, 500 + NAME_TOTAL_MS) === null);
  check('announcedName: says nothing in open water', announcedName(NOWHERE, 1_000) === null);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
