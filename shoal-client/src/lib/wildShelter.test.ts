/**
 * Wild fish shelter you — and do nothing else.
 * Run: npx tsx src/lib/wildShelter.test.ts
 *
 * This file is the seam between the two populations. Everything it checks is
 * one of four claims:
 *
 *   1. A wild body counts toward SHELTER, at a REDUCED, flat weight
 *      (WILD_SHELTER_WEIGHT), so two wild fish are worth exactly one plain
 *      person and six are worth three.
 *   2. A wild body counts toward NOTHING ELSE: not tension, not the bloom map,
 *      not the sweep. Each of those is asserted at RUNTIME with a wild body
 *      forced in, not merely prevented by a type.
 *   3. The bolt is a TRANSITION, not two states: the same swimmer, standing in
 *      the same water, goes from sheltered to exposed as the wild shoal leaves
 *      — and the control that proves it is the bolt (and not drift) is the
 *      identical tick with no hush running.
 *   4. The type seam itself. Three `@ts-expect-error` directives below fail
 *      `tsc --noEmit` (which `npm test` runs first) if any of the three
 *      forbidden call sites is ever widened back to accepting a wild body.
 *      That is the only way a compile-time rule can be regression-tested.
 *
 * Hand arithmetic is in comments beside every expected value, computed from
 * the CONSENSUS constants and never by re-invoking the function under test.
 */
import {
  shelterOf, isExposed, shelterWeight, bodyShelterWeight, wildBodyOf,
  type Body, type SwimmerBody, type WildBody, type ShelterBody,
} from './shelter';
import {
  SHELTER_BASE, SHELTER_THRESHOLD, SHELTER_R, WILD_SHELTER_WEIGHT,
  TICK_MS, LOCK_MS, CORE_R, TENSION_NEUTRAL, MAX_TAKE, BLOOM_READY_MS,
} from './shoalConst';
import { wildAt, wildIdOf, isWildId, WILD_COUNT, WILD_BOLT_MS } from './wild';
import { coreCentre, outsideCore, spreadPerMille, stepTension, topContributor } from './tension';
import { markVisits, isBloomReady, cellCentre, cellIndex } from './bloom';
import { selectTaken } from './sweep';
import { bodiesOf, shelterBodiesOf, emptyState, foldShoal } from './shoalEngine';
import { richSession } from './shoalFixtures';
import type { ShoalState, VisitMap } from './shoalTypes';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

/** A swimmer. Ids here are never `wild:`-prefixed — that is the whole point. */
const swimmer = (id: string, x: number, y: number, size = 100): SwimmerBody => ({ id, x, y, size });
/** A wild body at a chosen place, stamped both ways: `wild: true` and a wild id. */
const wild = (n: number, x: number, y: number, size = 100): WildBody =>
  wildBodyOf({ id: wildIdOf(n), x, y, size });

/** The sentinel `ShoalState.hushStartMs` uses for "no hush is running". */
const NO_HUSH = -1;

// ===========================================================================
// 1. THE WEIGHT — a wild fish shelters LESS than a person
// ===========================================================================
//
// Hand arithmetic, from the CONSENSUS constants alone:
//   SHELTER_BASE       = 100   (a plain person, before any size bonus)
//   SHELTER_THRESHOLD  = 300   (= 3 * SHELTER_BASE; below this you are exposed)
//   WILD_SHELTER_WEIGHT = 50   (= SHELTER_BASE / 2, flat, size ignored)
//
//   two wild  = 2 * 50 = 100 = SHELTER_BASE          -> one plain person
//   five wild = 5 * 50 = 250 < 300                   -> STILL exposed
//   six wild  = 6 * 50 = 300 = SHELTER_THRESHOLD     -> sheltered (isExposed is `<`)
//
// So it takes exactly six wild fish to do what three people do: the 2:1 ratio,
// exact rather than approximate, because the wild weight is flat.
{
  check('a wild fish is worth exactly half a plain person',
    WILD_SHELTER_WEIGHT * 2 === SHELTER_BASE, WILD_SHELTER_WEIGHT);
  check('six wild fish reach the threshold exactly',
    6 * WILD_SHELTER_WEIGHT === SHELTER_THRESHOLD, 6 * WILD_SHELTER_WEIGHT);
  check('five wild fish do not',
    5 * WILD_SHELTER_WEIGHT < SHELTER_THRESHOLD, 5 * WILD_SHELTER_WEIGHT);

  // The weight is FLAT: a whale-sized wild fish shelters no better than a
  // minnow-sized one. A person of size 999_999 is worth 145 (base 100 + the
  // capped bonus 45); a wild fish of the same size is worth 50.
  check('a wild body ignores size', bodyShelterWeight(wild(0, 0, 0, 999_999)) === WILD_SHELTER_WEIGHT,
    bodyShelterWeight(wild(0, 0, 0, 999_999)));
  check('a wild body of minimum size is worth the same',
    bodyShelterWeight(wild(0, 0, 0, 0)) === WILD_SHELTER_WEIGHT, bodyShelterWeight(wild(0, 0, 0, 0)));
  check('a swimmer body still gets the size-weighted person weight',
    bodyShelterWeight(swimmer('a', 0, 0, 100)) === shelterWeight(100)
    && bodyShelterWeight(swimmer('a', 0, 0, 100)) === 102,
    bodyShelterWeight(swimmer('a', 0, 0, 100)));
  check('a wild body shelters strictly less than the WEAKEST person',
    WILD_SHELTER_WEIGHT < shelterWeight(0), { wild: WILD_SHELTER_WEIGHT, weakestPerson: shelterWeight(0) });
}

// ===========================================================================
// 2. A SWIMMER SHELTERED ONLY BY WILD FISH
// ===========================================================================
// Hand-derived totals: every wild body below is within SHELTER_R (340) of the
// swimmer, so shelterOf sums WILD_SHELTER_WEIGHT (50) once each.
{
  const me = swimmer('aaa', 2000, 1500);
  const ring = (n: number): WildBody[] => {
    const out: WildBody[] = [];
    // Placed on a 40-cu grid stub out from the swimmer: 40..40n cu, all far
    // inside SHELTER_R (340) for n <= 6, and all distinct positions.
    for (let i = 0; i < n; i++) out.push(wild(i, 2000 + 40 * (i + 1), 1500, 100));
    return out;
  };

  check('five wild fish give 250', shelterOf(me, ring(5)) === 250, shelterOf(me, ring(5)));
  check('five wild fish leave you EXPOSED', isExposed(me, ring(5)) === true, shelterOf(me, ring(5)));
  check('six wild fish give exactly 300', shelterOf(me, ring(6)) === 300, shelterOf(me, ring(6)));
  check('six wild fish shelter you', isExposed(me, ring(6)) === false, shelterOf(me, ring(6)));

  // Mixed cover, hand-derived: two people at size 100 (102 each = 204) plus
  // two wild (100) = 304 >= 300. Under the OLD reading (a wild fish worth the
  // same as a person, 101 at size 60) two people plus ONE wild fish already
  // cleared it — that is the knife-edge this ruling removes.
  const mixed: ShelterBody[] = [
    swimmer('bbb', 2010, 1500), swimmer('ccc', 2020, 1500),
    wild(0, 2030, 1500), wild(1, 2040, 1500),
  ];
  check('two people and two wild fish give 304', shelterOf(me, mixed) === 304, shelterOf(me, mixed));
  check('two people and two wild fish shelter', isExposed(me, mixed) === false);
  check('two people and ONE wild fish do not (204 + 50 = 254)',
    shelterOf(me, mixed.slice(0, 3)) === 254 && isExposed(me, mixed.slice(0, 3)) === true,
    shelterOf(me, mixed.slice(0, 3)));

  // The radius still applies to wild bodies exactly as to people.
  const onEdge = wild(0, 2000 + SHELTER_R, 1500);
  const justOut = wild(1, 2000 + SHELTER_R + 1, 1500);
  check('a wild fish exactly on the shelter radius counts',
    shelterOf(me, [onEdge]) === WILD_SHELTER_WEIGHT, shelterOf(me, [onEdge]));
  check('a wild fish one cu past it does not', shelterOf(me, [justOut]) === 0, shelterOf(me, [justOut]));
}

// ===========================================================================
// 3. THE REAL SHOAL: a swimmer standing inside a wild school
// ===========================================================================
// Seed 1, tick 0. The centroid of school 0 (fish wild:0..wild:11) is
// (1003, 1401) — computed here from `wildAt`'s output rather than asserted, so
// this block does not hard-code a position; what IS asserted is the shelter
// total, and it is cross-checked against a longhand recount that never calls
// shelterOf.
const WILD_SEED = 1;

function centroidOfSchool(fish: readonly { x: number; y: number }[]): { x: number; y: number } {
  let sx = 0; let sy = 0;
  for (const f of fish) { sx += f.x; sy += f.y; }
  return { x: Math.round(sx / fish.length), y: Math.round(sy / fish.length) };
}

/** Longhand count of wild bodies within SHELTER_R of a point. Calls nothing under test. */
function countWithin(at: { x: number; y: number }, fish: readonly { x: number; y: number }[]): number {
  let n = 0;
  for (const f of fish) {
    const dx = f.x - at.x; const dy = f.y - at.y;
    if (dx * dx + dy * dy <= SHELTER_R * SHELTER_R) n++;
  }
  return n;
}

{
  const shoal = wildAt(WILD_SEED, 0, NO_HUSH, 0);
  const stand = centroidOfSchool(shoal.slice(0, 12));
  const near = countWithin(stand, shoal);
  // Every member of a school lies within WILD_SCHOOL_R (200) of its centre,
  // and SHELTER_R is 340, so standing at the middle of a school puts the whole
  // school in range: 12 fish, and no member of the other two schools.
  check('standing in a school puts all 12 of its members in range', near === 12, { stand, near });

  const me = swimmer('aaa', stand.x, stand.y);
  const bodies: ShelterBody[] = [me, ...shoal.map(wildBodyOf)];
  // 12 * 50 = 600, twice SHELTER_THRESHOLD.
  check('a swimmer inside a wild school reads 600 shelter',
    shelterOf(me, bodies) === near * WILD_SHELTER_WEIGHT && shelterOf(me, bodies) === 600,
    shelterOf(me, bodies));
  check('...and is not exposed', isExposed(me, bodies) === false);
}

// ===========================================================================
// 4. THE BOLT — the transition, not the two states
// ===========================================================================
// The design's central moment. A swimmer stands in the middle of a school with
// no person anywhere near. The hush lands. Tick by tick, the cover leaves, and
// the swimmer's exposure flips from false to true ONCE and never back — before
// the input lock, with time still on the clock to swim to a person.
//
// The control that makes this about the BOLT and not about drift: the very
// same ticks, evaluated with no hush running, must stay sheltered throughout.

/** A state holding exactly one swimmer, with a hush optionally in progress. */
function soloState(x: number, y: number, hushStartMs: number, nowMs: number): ShoalState {
  const s = emptyState(0);
  s.nowMs = nowMs;
  s.hushStartMs = hushStartMs;
  s.fish.set('aaa', {
    id: 'aaa', x, y, size: 100,
    vec: { x, y, heading: 0, speed: 0, t: 0 },
    expiresMs: 10_000_000, lastScatterMs: -1, lastBiteMs: -1, recentBites: [],
  });
  return s;
}

{
  // Hush at ms 250_000, i.e. tick index 1000 — a whole number of ticks, as
  // every hush is (the fold only ever sets hushStartMs to a tick boundary).
  const HUSH_AT = 250_000;
  const HUSH_TICK = HUSH_AT / TICK_MS;
  check('the chosen hush lands on a tick boundary', HUSH_TICK === 1000 && HUSH_AT % TICK_MS === 0);

  const shoalAtHush = wildAt(WILD_SEED, HUSH_TICK, NO_HUSH, 0);
  const stand = centroidOfSchool(shoalAtHush.slice(0, 12));
  const nearAtHush = countWithin(stand, shoalAtHush);
  check('the swimmer starts with at least six wild fish in range', nearAtHush >= 6,
    { stand, nearAtHush });

  // The bolt completes WILD_BOLT_MS after the hush, which is a whole number of
  // ticks and strictly inside the commit window.
  const boltTicks = WILD_BOLT_MS / TICK_MS; // 2000 / 250 = 8
  check('the bolt is a whole number of ticks', Number.isInteger(boltTicks) && boltTicks === 8, boltTicks);
  check('the bolt completes strictly before the input lock', WILD_BOLT_MS < LOCK_MS,
    { WILD_BOLT_MS, LOCK_MS });

  const lockTicks = LOCK_MS / TICK_MS; // 16
  const exposedByTick: boolean[] = [];
  const shelterByTick: number[] = [];
  const controlExposed: boolean[] = [];
  for (let k = 0; k <= lockTicks; k++) {
    const atMs = HUSH_AT + k * TICK_MS;
    const hushed = soloState(stand.x, stand.y, HUSH_AT, atMs + TICK_MS);
    const calm = soloState(stand.x, stand.y, NO_HUSH, atMs + TICK_MS);
    const me = bodiesOf(hushed)[0];
    const hushedBodies = shelterBodiesOf(hushed, WILD_SEED, atMs);
    const calmBodies = shelterBodiesOf(calm, WILD_SEED, atMs);
    shelterByTick.push(shelterOf(me, hushedBodies));
    exposedByTick.push(isExposed(me, hushedBodies));
    controlExposed.push(isExposed(me, calmBodies));
  }

  check('before the bolt has moved anyone, the swimmer is sheltered',
    exposedByTick[0] === false && shelterByTick[0] >= SHELTER_THRESHOLD, shelterByTick[0]);
  check('once the bolt has completed, the swimmer has NO shelter at all',
    shelterByTick[boltTicks] === 0, shelterByTick[boltTicks]);
  check('...and is exposed', exposedByTick[boltTicks] === true);

  // THE TRANSITION: exactly one flip, false -> true, and it never flips back.
  let flips = 0;
  let flipAt = -1;
  for (let k = 1; k < exposedByTick.length; k++) {
    if (exposedByTick[k] !== exposedByTick[k - 1]) { flips++; flipAt = k; }
  }
  check('exposure flips exactly once across the hush', flips === 1, { flips, flipAt, exposedByTick });
  check('the flip is from sheltered to exposed', flipAt > 0 && exposedByTick[flipAt] === true);
  check('the flip happens no later than the bolt completes', flipAt <= boltTicks, flipAt);
  check('the flip happens strictly before the input lock', flipAt < lockTicks, { flipAt, lockTicks });

  // Shelter never RISES during the bolt: the cover leaves, it does not churn.
  let monotone = true;
  for (let k = 1; k <= boltTicks; k++) if (shelterByTick[k] > shelterByTick[k - 1]) monotone = false;
  check('shelter only ever falls while the shoal is bolting', monotone, shelterByTick.slice(0, boltTicks + 1));

  // THE CONTROL. Identical ticks, identical swimmer, no hush: the shoal drifts
  // but does not flee, and the swimmer stays sheltered the whole way. Without
  // this, every check above would also pass if wild fish simply drifted out of
  // range on their own — which is drift, not a bolt, and carries none of the
  // design's meaning.
  check('with no hush running, the same swimmer is sheltered on every one of those ticks',
    controlExposed.every((e) => e === false), controlExposed);

  // And the population itself: gone means ABSENT, not far away.
  const gone = shelterBodiesOf(soloState(stand.x, stand.y, HUSH_AT, HUSH_AT + WILD_BOLT_MS + TICK_MS),
    WILD_SEED, HUSH_AT + WILD_BOLT_MS);
  check('the shelter population after the bolt is the swimmers alone',
    gone.length === 1 && gone[0].id === 'aaa', gone.map((b) => b.id));
}

// ===========================================================================
// 5. TENSION IS UNCHANGED BY A HUNDRED WILD FISH
// ===========================================================================
// The discriminating test for the plan's spec correction. Spec 2.6 says wild
// fish count "toward shielding and toward tension"; spec 2.11 — the precise
// section — says tension is "the fraction of PLAYERS outside the core". This
// implements 2.11: the shark is something the school does to itself.
//
// Hand arithmetic. Five swimmers:
//     s0..s3 at (1000, 1000), s4 at (3000, 3000)
//   medianInt of the five x-values [1000,1000,1000,1000,3000] is the middle of
//   the sorted list, index 2 -> 1000; likewise y -> 1000. So coreCentre is
//   (1000, 1000). s4's distance from it is sqrt(2000^2 + 2000^2) = 2828 cu,
//   far outside CORE_R (620); s0..s3 sit exactly on it.
//     outsideCore    = ['s4']
//     spreadPerMille = trunc(1000 * 1 / 5) = 200
//     stepTension(1000, ...) = 1000 + (200 - TENSION_NEUTRAL 250) = 950
//
// Now add 100 wild fish all parked at (4000, 3000). If they counted:
//   105 x-values sorted = [1000 x4, 3000, 4000 x100]; the middle (index 52) is
//   4000, and the y-median is likewise 3000. coreCentre would move to
//   (4000, 3000) — a different point entirely — every one of the five swimmers
//   would read as outside, and
//     spreadPerMille = trunc(1000 * 5 / 105) = 47
//     stepTension(1000, ...) = 1000 + (47 - 250) = 797
//   So EVERY one of the five outputs below moves if wild fish are counted.
{
  const school: SwimmerBody[] = [
    swimmer('s0', 1000, 1000), swimmer('s1', 1000, 1000),
    swimmer('s2', 1000, 1000), swimmer('s3', 1000, 1000),
    swimmer('s4', 3000, 3000),
  ];
  const hundred: WildBody[] = [];
  for (let i = 0; i < 100; i++) hundred.push(wild(i, 4000, 3000));
  // The cast is the point of the test: the TYPE forbids this call, and the
  // runtime must refuse it anyway, because a cast, an `any`, or a body rebuilt
  // from a Map (which is exactly what `lockedPositions` does) can all defeat a
  // type. See the `@ts-expect-error` block at the end for the type half.
  const withWild = [...school, ...hundred] as unknown as SwimmerBody[];
  const ticks = new Map<string, number>([['s4', 7], ['wild:0', 999]]);

  check('coreCentre is the school median (1000,1000)',
    JSON.stringify(coreCentre(school)) === JSON.stringify({ x: 1000, y: 1000 }), coreCentre(school));
  check('coreCentre is unmoved by a hundred wild fish in the corner',
    JSON.stringify(coreCentre(withWild)) === JSON.stringify(coreCentre(school)), coreCentre(withWild));

  check('outsideCore is the one straying swimmer',
    JSON.stringify(outsideCore(school)) === JSON.stringify(['s4']), outsideCore(school));
  check('outsideCore is unchanged by a hundred wild fish',
    JSON.stringify(outsideCore(withWild)) === JSON.stringify(['s4']), outsideCore(withWild));

  check('spreadPerMille is 200 for the school alone', spreadPerMille(school) === 200, spreadPerMille(school));
  check('spreadPerMille is unchanged by a hundred wild fish — numerator AND denominator',
    spreadPerMille(withWild) === 200, spreadPerMille(withWild));

  check('stepTension is 950 for the school alone',
    stepTension(1000, school) === 1000 + (200 - TENSION_NEUTRAL) && stepTension(1000, school) === 950,
    stepTension(1000, school));
  check('stepTension is unchanged by a hundred wild fish',
    stepTension(1000, withWild) === 950, stepTension(1000, withWild));

  check('topContributor is the straying swimmer', topContributor(school, ticks) === 's4',
    topContributor(school, ticks));

  // topContributor needs its OWN arrangement, and finding that out is worth
  // recording: with the hundred fish parked on the median above, they read as
  // INSIDE the core, so `outsideCore` never offered them as candidates and
  // this check passed whether or not the exclusion existed. It was vacuous,
  // and only the mutation said so.
  //
  // The arrangement that discriminates: one wild fish far OUTSIDE the core,
  // carrying more outside-ticks than any person. Hand-derived — the six
  // x-values are [1000,1000,1000,1000,3000,3500] and medianInt takes the LOWER
  // middle of an even list (index 2), so the centre stays (1000,1000) and the
  // wild fish at (3500,1000) is 2500 cu out, well past CORE_R (620). If wild
  // fish counted, `outsideCore` would offer ['s4','wild:0'] and the 999 ticks
  // would beat s4's 7 outright.
  const oneFarWild = [...school, wild(0, 3500, 1000)] as unknown as SwimmerBody[];
  const dxFar = 3500 - 1000;
  check('the far wild fish really is outside the core', dxFar * dxFar > CORE_R * CORE_R, dxFar);
  check('topContributor cannot be a wild fish, however long it has been out',
    topContributor(oneFarWild, ticks) === 's4', topContributor(oneFarWild, ticks));
  check('...and outsideCore does not offer it as a candidate either',
    JSON.stringify(outsideCore(oneFarWild)) === JSON.stringify(['s4']), outsideCore(oneFarWild));

  // Non-degeneracy: prove the hundred wild fish are placed somewhere that
  // WOULD have moved every answer. Computed longhand, without calling anything
  // under test: their corner is further from the school's median than CORE_R.
  const dx = 4000 - 1000; const dy = 3000 - 1000;
  check('the hundred wild fish are genuinely outside the school core',
    dx * dx + dy * dy > CORE_R * CORE_R, { dx, dy, CORE_R });
}

// ===========================================================================
// 6. WILD FISH DO NOT TRAMPLE — markVisits stamps nothing for them
// ===========================================================================
// The bloom map must stay a pure function of PLAYER behaviour: "food grows
// where the school isn't" means the school of people, not the scenery.
{
  const cell = cellIndex(1984, 1472); // col 15, row 11 -> 11*32 + 15 = 367
  const centre = cellCentre(cell); // (1984, 1472)
  check('the test cell is the one its arithmetic says', cell === 367
    && centre.x === 1984 && centre.y === 1472, { cell, centre });

  const t = 1_000_000;

  // Positive control FIRST: a PERSON standing on the cell centre stamps it,
  // and the cell stops reading ready. Without this the negative below could
  // pass because the position was wrong rather than because the body was wild.
  {
    const map: VisitMap = new Map();
    markVisits(map, [swimmer('aaa', centre.x, centre.y)], t);
    check('a person standing on a cell stamps it', map.size > 0 && map.get(cell)?.has('aaa') === true,
      [...map.keys()]);
    check('...and the bloom under a person is not ready', isBloomReady(map, cell, t) === false);
  }

  // The same position, a wild body. Nothing is stamped, anywhere.
  {
    const map: VisitMap = new Map();
    const overhead = [wild(0, centre.x, centre.y)] as unknown as SwimmerBody[];
    markVisits(map, overhead, t);
    check('a wild fish standing on a cell stamps nothing at all', map.size === 0, [...map.entries()]);
    check('a bloom under a wild shoal stays ready', isBloomReady(map, cell, t) === true);
  }

  // A whole school of thirty-six overhead, and the cell is still ready — even
  // BLOOM_READY_MS later, since there is nothing in the map to age out.
  {
    const map: VisitMap = new Map();
    const shoal = wildAt(WILD_SEED, 0, NO_HUSH, 0)
      .map((f) => wildBodyOf({ ...f, x: centre.x, y: centre.y })) as unknown as SwimmerBody[];
    check('the forced shoal really is the whole wild population', shoal.length === WILD_COUNT, shoal.length);
    markVisits(map, shoal, t);
    check('thirty-six wild fish parked on a bloom stamp nothing', map.size === 0, [...map.entries()]);
    check('the bloom is still ready a full fallow window later',
      isBloomReady(map, cell, t + BLOOM_READY_MS) === true);
  }

  // Mixed: one person and thirty-six wild fish on the same cell leave exactly
  // one visitor stamp — the person's.
  {
    const map: VisitMap = new Map();
    const mixed = [
      swimmer('aaa', centre.x, centre.y),
      ...wildAt(WILD_SEED, 0, NO_HUSH, 0).map((f) => wildBodyOf({ ...f, x: centre.x, y: centre.y })),
    ] as unknown as SwimmerBody[];
    markVisits(map, mixed, t);
    const visitors = [...(map.get(cell) ?? new Map()).keys()];
    check('only the person leaves a stamp', JSON.stringify(visitors) === JSON.stringify(['aaa']), visitors);
  }
}

// ===========================================================================
// 7. THE SWEEP NEVER SEES A WILD FISH
// ===========================================================================
// They bolt before the input lock, so this can never arise — which is exactly
// why it is asserted rather than relied upon. `lockedPositions` rebuilds bodies
// from a Map of {x,y,size} keyed by id, dropping any object flag, so the id
// prefix is what the runtime guard has to be built on.
//
// Hand-derived scenario. `locked` holds:
//   'aaa'      a lone swimmer at (1000,1000), size 100
//   wild:0..5  six wild bodies within 60 cu of it, size 100 each
//   wild:99    a stray wild body at (3000,2500), size 2000, alone
//
// With wild fish excluded from the sweep (the rule):
//   the school is ['aaa'] alone -> shelter 0 -> exposed -> taken = ['aaa'].
// If they were NOT excluded:
//   'aaa' would hold 6 * 50 = 300 -> sheltered -> NOT taken;
//   each of wild:0..5 would hold 5 * 50 + 102 = 352 -> sheltered -> not taken;
//   wild:99 stands alone -> 0 -> exposed -> taken = ['wild:99'].
// So the single assertion below separates the two rules completely.
{
  const locked = [
    swimmer('aaa', 1000, 1000, 100),
    wild(0, 1010, 1000), wild(1, 1020, 1000), wild(2, 1030, 1000),
    wild(3, 1040, 1000), wild(4, 1050, 1000), wild(5, 1060, 1000),
    wild(99, 3000, 2500, 2000),
  ] as unknown as SwimmerBody[];

  const taken = selectTaken(locked, null);
  check('the sweep takes the lone swimmer and nobody else',
    JSON.stringify(taken) === JSON.stringify(['aaa']), taken);
  check('no wild id is ever returned', taken.every((id) => !isWildId(id)), taken);

  // Preferred-target laundering: naming a wild fish as the preferred target
  // must not conjure it into the result either.
  const preferredWild = selectTaken(locked, wildIdOf(99));
  check('a wild fish named as the preferred target is still not taken',
    JSON.stringify(preferredWild) === JSON.stringify(['aaa']), preferredWild);

  // And the count rule still holds for people: three exposed swimmers, all
  // alone, with six wild fish scattered among them, takes exactly MAX_TAKE.
  const many = [
    swimmer('aaa', 100, 100), swimmer('bbb', 2000, 100), swimmer('ccc', 100, 2000),
    swimmer('ddd', 2000, 2000),
    wild(0, 110, 100), wild(1, 120, 100), wild(2, 130, 100),
    wild(3, 140, 100), wild(4, 150, 100), wild(5, 160, 100),
  ] as unknown as SwimmerBody[];
  const takenMany = selectTaken(many, null);
  check('the sweep still takes MAX_TAKE exposed people', takenMany.length === MAX_TAKE, takenMany);
  check('...and every one of them is a person', takenMany.every((id) => !isWildId(id)), takenMany);
}

// ===========================================================================
// 8. THE ENGINE SEAM — traced through a real fold, not assumed
// ===========================================================================
// richSession() is the fixture whose hush is derived from the constants in
// shoalEngine.determinism.test.ts: tension trips at t=18_000, the input lock
// falls at 18_000 + LOCK_MS = 22_000, and the sweep resolves at 26_000.
{
  const log = richSession();
  const HUSH_AT = 18_000;

  const atLock = foldShoal(log, HUSH_AT + LOCK_MS);
  check('the hush is running at the lock tick', atLock.hushStartMs === HUSH_AT, atLock.hushStartMs);
  check('positions are locked by then', atLock.lockedPositions !== null);
  const lockedIds = [...(atLock.lockedPositions ?? new Map()).keys()];
  check('the locked positions hold the twelve swimmers', lockedIds.length === 12, lockedIds.length);
  check('NO locked position is a wild fish', lockedIds.every((id) => !isWildId(id)), lockedIds);
  check('the locked preferred target is not a wild fish',
    atLock.lockedPreferred !== null && !isWildId(atLock.lockedPreferred), atLock.lockedPreferred);

  const resolved = foldShoal(log, 26_000);
  check('a sweep actually resolved', resolved.lastSweepMs === 26_000 && resolved.lastTaken.length > 0,
    { lastSweepMs: resolved.lastSweepMs, lastTaken: resolved.lastTaken });
  check('nobody taken is a wild fish', resolved.lastTaken.every((id) => !isWildId(id)), resolved.lastTaken);

  // bodiesOf is the SWIMMER population and stays that way; shelterBodiesOf is
  // the only place the two populations are ever joined.
  const bodies = bodiesOf(resolved);
  check('bodiesOf returns swimmers only', bodies.length === 12 && bodies.every((b) => !isWildId(b.id)),
    bodies.map((b) => b.id));

  const shelterPop = shelterBodiesOf(resolved, WILD_SEED, 26_000);
  check('shelterBodiesOf adds the whole wild shoal', shelterPop.length === 12 + WILD_COUNT, shelterPop.length);
  check('...and every added body is a wild one',
    shelterPop.filter((b) => isWildId(b.id)).length === WILD_COUNT, shelterPop.length);

  // Neither the tension nor the bloom map the fold produced knows they exist:
  // outsideTicks is keyed only by swimmer ids, and lastVisit only by swimmers.
  check('outsideTicks names no wild fish',
    [...resolved.outsideTicks.keys()].every((id) => !isWildId(id)), [...resolved.outsideTicks.keys()]);
  let visitorsAreAllPeople = true;
  for (const [, by] of resolved.lastVisit) for (const id of by.keys()) if (isWildId(id)) visitorsAreAllPeople = false;
  check('the bloom map names no wild fish', visitorsAreAllPeople);

  // During the hush, shelterBodiesOf reflects the bolt on the state's own
  // hushStartMs — no separate wiring, no second clock.
  const mid = foldShoal(log, HUSH_AT + 1_000);
  check('mid-hush, before the bolt completes, the wild shoal is still there',
    shelterBodiesOf(mid, WILD_SEED, HUSH_AT + 1_000).length === 12 + WILD_COUNT,
    shelterBodiesOf(mid, WILD_SEED, HUSH_AT + 1_000).length);
  check('at the bolt, shelterBodiesOf is the swimmers alone',
    shelterBodiesOf(mid, WILD_SEED, HUSH_AT + WILD_BOLT_MS).length === 12,
    shelterBodiesOf(mid, WILD_SEED, HUSH_AT + WILD_BOLT_MS).length);
}

// ===========================================================================
// 9. THE TYPE SEAM ITSELF
// ===========================================================================
// `npm test` runs `tsc --noEmit` before any of the above executes. Each
// directive below asserts that the compiler REJECTS handing a wild body to a
// function that must never see one; if any of these three signatures is
// widened back to a plain `Body[]`, tsc fails with "Unused '@ts-expect-error'
// directive" and the suite never runs. This is the only regression test a
// compile-time rule can have.
//
// The statements still execute, and still return the empty/ignored answers a
// caller would get, so nothing here depends on the directive being skipped.
{
  const wildOnly: WildBody[] = [wild(0, 100, 100), wild(1, 200, 200)];

  // @ts-expect-error a WildBody is not a SwimmerBody: tension must not see it.
  outsideCore(wildOnly);
  // @ts-expect-error a WildBody is not a SwimmerBody: the bloom must not see it.
  markVisits(new Map(), wildOnly, 0);
  // @ts-expect-error a WildBody is not a SwimmerBody: the sweep must not see it.
  selectTaken(wildOnly, null);

  // The other direction is allowed and must stay allowed: shelter takes both.
  const both: ShelterBody[] = [swimmer('aaa', 0, 0), wild(0, 10, 10)];
  const self: Body = { id: 'aaa', x: 0, y: 0, size: 100 };
  check('shelter accepts a mixed population', shelterOf(self, both) === WILD_SHELTER_WEIGHT,
    shelterOf(self, both));
  // A plain swimmer list is still a valid shelter population.
  check('shelter accepts a swimmers-only population',
    shelterOf(self, [swimmer('bbb', 10, 10)]) === 102, shelterOf(self, [swimmer('bbb', 10, 10)]));
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
