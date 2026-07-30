/**
 * THE TEACHING MOMENT — the geometry of it, not the pixels.
 * Run: npx tsx src/ui/shallows.test.ts
 *
 * ## WHAT IS BEING ASSERTED, AND WHY IT IS ARITHMETIC RATHER THAN PAINT
 *
 * Spec §2.18 makes four claims about a newcomer's first fifteen seconds, and
 * every one of them is a statement about where bodies are:
 *
 *   1. the newcomer spawns slightly OUTSIDE the school, tether already stretched
 *   2. with a sweep INBOUND — within a bounded time, not eventually
 *   3. the other fish CONVERGE, and closing with them buys shelter
 *   4. someone FURTHER OUT than the newcomer is scattered in front of them
 *
 * So the checks below are distances, shelter scores and take-lists read off the
 * REAL fold, against numbers derived by hand from the CONSENSUS constants in the
 * comments beside them. Nothing here reads an expected value back out of
 * `shallows.ts`: the hush's instant is recomputed from `TENSION_TRIGGER`,
 * `TENSION_NEUTRAL` and the population, the tether's length from
 * `TETHER_MIN_CU`/`TETHER_MAX_CU`, and the "further out" comparison from
 * positions the fold itself produced.
 *
 * The paint — the red tether, the pall, the frozen diagram — is verified by
 * screenshot (`shoal-client/docs/task-3-*.png`), on the rule `seaPaint.ts`
 * states: the only assertion available against a canvas context is "it was
 * called", which passes against a black rectangle.
 *
 * ## THE PLAYER IS DRIVEN THROUGH THE REAL INPUT PATH
 *
 * `playShallows` below builds the sea, builds an `InputState` with
 * `createInput`, and runs `emitDue` once a "frame" against
 * `sea.seaMs(wall) + TICK_MS` — which is, line for line, what `App.tsx`'s frame
 * loop does. A player who "does nothing" therefore still publishes the
 * keep-alives `shouldEmit` produces, exactly as a real idle window does. Faking
 * the player by hand-writing log entries would have tested a different program.
 */
import { advance, createLoop, type LoopState } from '../lib/shoalLoop';
import { bodiesOf } from '../lib/shoalEngine';
import { isExposed, shelterOf, type SwimmerBody } from '../lib/shelter';
import { outsideCore, spreadPerMille } from '../lib/tension';
import { selectTaken } from '../lib/sweep';
import { wildAt } from '../lib/wild';
import { dist2 } from '../lib/fixed';
import { readTether, scatterReplay, TETHER_MAX_CU, SCATTER_FREEZE_MS } from './tether';
import { applyInput, createInput, emitDue, headingTo, positionAt, type InputState } from './input';
import {
  HUSH_MS, LOCK_MS, MAX_TAKE, MIN_SIZE, SCATTER_COST, SHELTER_R, SHELTER_THRESHOLD, TENSION_NEUTRAL,
  TENSION_TRIGGER, TICK_MS,
} from '../lib/shoalConst';
import {
  SHALLOWS_CAST, SHALLOWS_EPOCH, SHALLOWS_FIRST_MS, SHALLOWS_GATHER, SHALLOWS_LIFE_FROM_MS,
  SHALLOWS_OPEN_MS, SHALLOWS_SELF, SHALLOWS_SPAWN, SHALLOWS_TIDE_MS, SHALLOWS_WILD_SEED,
  shallowsScript, shallowsSea, shallowsSeed,
} from './shallows';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown): void {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

/** Distance from the point the school gathers on — "how far out" this is. */
function outFrom(b: { x: number; y: number }): number {
  return Math.sqrt(dist2(b.x, b.y, SHALLOWS_GATHER.x, SHALLOWS_GATHER.y));
}

interface Frame {
  /** Sea time this frame was drawn at. */
  atMs: number;
  bodies: SwimmerBody[];
  hushStartMs: number;
  lockedPositions: ReadonlyMap<string, { x: number; y: number; size: number }> | null;
  lastSweepMs: number;
  lastTaken: string[];
  tension: number;
  spread: number;
  /** Ids outside the tension core — the count `spreadPerMille` is built from. */
  outside: string[];
}

/**
 * Play the shallows the way `App.tsx` plays it, and hand back every frame.
 *
 * `follow` is the whole of the player's agency, and there are three of them:
 *
 *   false     the player never touches anything. The window still publishes —
 *             a real idle client emits a keep-alive every MAX_EMIT_GAP_MS — so
 *             this is "did nothing", not "was not there".
 *   true      from `followAtMs` onward the pointer is held on the gathering
 *             point, which is what "following a visibly moving crowd" reduces to.
 *   'away'    the same, in the opposite direction: the player runs for open
 *             water. `dart` spends the burst on the first frame they move.
 */
function playShallows(opts: {
  follow: boolean | 'away';
  untilMs: number;
  stepMs?: number;
  followAtMs?: number;
  dart?: boolean;
}): Frame[] {
  const sea = shallowsSea(0);
  let input: InputState = createInput(sea.spawn.x, sea.spawn.y, 0);
  const stepMs = opts.stepMs ?? 50;
  const frames: Frame[] = [];
  let darted = false;
  for (let wall = 0; wall <= opts.untilMs; wall += stepMs) {
    const authorMs = sea.seaMs(wall) + TICK_MS;
    if (opts.follow !== false && wall >= (opts.followAtMs ?? 1_500)) {
      const me = positionAt(input, authorMs);
      const dx = SHALLOWS_GATHER.x - me.x;
      const dy = SHALLOWS_GATHER.y - me.y;
      const out = opts.follow === 'away';
      input = applyInput(input, {
        kind: 'steer',
        heading: headingTo(out ? -dx : dx, out ? -dy : dy),
      }, authorMs);
      if (opts.dart === true && !darted) {
        darted = true;
        input = applyInput(input, { kind: 'dart' }, authorMs);
      }
    }
    input = emitDue(input, authorMs, (vec, say) => sea.publish(vec, say));
    const s = sea.step(wall);
    const bodies = bodiesOf(s);
    frames.push({
      atMs: sea.seaMs(wall),
      bodies,
      hushStartMs: s.hushStartMs,
      lockedPositions: s.lockedPositions === null ? null : new Map(s.lockedPositions),
      lastSweepMs: s.lastSweepMs,
      lastTaken: [...s.lastTaken],
      tension: s.tension,
      spread: spreadPerMille(bodies),
      outside: outsideCore(bodies),
    });
  }
  return frames;
}

/** The bodies the sweep judged, rebuilt from the frame that froze them. */
function lockedBodiesOf(frames: Frame[]): SwimmerBody[] | null {
  const f = frames.find((fr) => fr.lockedPositions !== null);
  if (f === undefined || f.lockedPositions === null) return null;
  return [...f.lockedPositions.entries()].map(([id, p]) => ({ id, x: p.x, y: p.y, size: p.size }));
}

// ===========================================================================
console.log('\n1. the newcomer starts OUTSIDE the school, tether already stretched');
// ===========================================================================
//
// "Outside the school" is `isExposed`: no THREE neighbours inside SHELTER_R.
// Hand-derived from the arrangement — the spawn is (2624, 1360) and the nearest
// two swimmers in the scattered school are
//
//   s3 (2256, 1232):  dx = 368, dy = 128  ->  368^2 + 128^2 = 151_808 -> 389.6
//   s4 (2376, 1672):  dx = 248, dy = 312  ->  248^2 + 312^2 = 158_848 -> 398.6
//
// against SHELTER_R = 340 (SHELTER_R2 = 115_600). Both are outside it, so the
// shelter score is 0, `isExposed` is true, and `tetherLengthCu(0)` is
//
//   TETHER_MIN_CU + (TETHER_MAX_CU - TETHER_MIN_CU) * (600 - 0) / 600
//     = 60 + 360 * 1 = 420 = TETHER_MAX_CU
//
// i.e. the tether is at FULL stretch on the very first frame. Everything below
// is read off the fold rather than off that arithmetic.
{
  const first = playShallows({ follow: false, untilMs: 0 })[0];
  const me = first.bodies.find((b) => b.id === SHALLOWS_SELF);

  check('the newcomer is in the water on the first frame', me !== undefined,
    first.bodies.map((b) => b.id));

  if (me !== undefined) {
    const others = first.bodies.filter((b) => b.id !== SHALLOWS_SELF);
    const nearest = Math.min(...others.map((b) => Math.sqrt(dist2(me.x, me.y, b.x, b.y))));
    check('...with no other swimmer inside SHELTER_R of them',
      nearest > SHELTER_R, { nearest: Math.round(nearest), SHELTER_R });
    // 389.6 by hand, above. Rounded because the fold quantizes to QUANT = 8.
    check('...the nearest being 389 cu away, as arranged',
      Math.round(nearest) === 390, Math.round(nearest));
    // ONE CHECK, NOT TWO, AND THAT IS THE POINT. `isExposed` on its own was a
    // separate check here and it PROVED NOTHING: under the brief's own mutation
    // — spawn the player in the middle of the school — a swimmer with one
    // neighbour holds a shelter score of 103 against a threshold of 300 and is
    // still "exposed", so the check stayed green while the teaching moment it
    // was guarding had been deleted. Nine other checks in this group caught the
    // mutation, but a check that cannot fail is not one of the nine. Folded into
    // the score, which discriminates: NOTHING is holding this swimmer, which is
    // a strictly stronger statement than "not enough is".
    check('...so the engine calls them exposed, on a shelter score of exactly zero',
      shelterOf(me, first.bodies) === 0 && isExposed(me, first.bodies),
      shelterOf(me, first.bodies));

    const t = readTether(me, first.bodies);
    check('...and the tether is drawn at full stretch',
      t.lengthCu === TETHER_MAX_CU, t.lengthCu);
    check('...cold, and holding nothing',
      t.warmth === 0 && t.strands.length === 0, { warmth: t.warmth, strands: t.strands.length });
    check('...and adrift, which is the engine\'s own verdict spelled for the paint',
      t.mood === 'adrift' && t.exposed);

    // "Slightly" outside: one good swim from cover, not a different postcode.
    // 390 - 340 = 50 cu beyond the shelter radius, well under one SHELTER_R.
    check('...but only SLIGHTLY outside — under one shelter radius past cover',
      nearest - SHELTER_R < SHELTER_R, Math.round(nearest - SHELTER_R));

    // Everyone else in the sea is FURTHER from the gathering point in the two
    // cases §2.18 needs, and NEARER in the case it needs that: the school.
    const mine = outFrom(me);
    const open = first.bodies.filter((b) => b.id.startsWith('o'));
    check('three swimmers are further out than the newcomer',
      open.length === 3 && open.every((b) => outFrom(b) > mine),
      { mine: Math.round(mine), open: open.map((b) => Math.round(outFrom(b))) });
    const school = first.bodies.filter((b) => b.id.startsWith('s'));
    check('...and the school, which is what they are outside OF, is nearer in',
      school.length === 5 && school.every((b) => outFrom(b) < mine),
      school.map((b) => Math.round(outFrom(b))));
  }

  // THE WILD SHOAL MUST NOT LEND COVER HERE. `App.tsx` reads the ambient tether
  // against people AND wild fish (`readTether`'s header: wild cover is FELT
  // cover), so a wild school parked on the spawn would draw a short warm tether
  // over a swimmer the sweep considers entirely exposed — and the moment opens
  // on a stretched tether or it opens on nothing. Checked over every tick from
  // the window opening to two seconds past the hush, which is the whole window
  // in which a wild fish can be on screen at all (they bolt at hush + 2_000).
  {
    const from = Math.floor(SHALLOWS_OPEN_MS / TICK_MS);
    const to = Math.floor((SHALLOWS_OPEN_MS + 8_000) / TICK_MS);
    let closest = Infinity;
    for (let k = from; k <= to; k++) {
      for (const w of wildAt(SHALLOWS_WILD_SEED, k, -1, 0)) {
        const d = Math.sqrt(dist2(w.x, w.y, SHALLOWS_SPAWN.x, SHALLOWS_SPAWN.y));
        if (d < closest) closest = d;
      }
    }
    check('no wild fish lends the newcomer cover before the hush',
      closest > SHELTER_R, { closest: Math.round(closest), SHELTER_R });
  }
}

// ===========================================================================
console.log('\n2. a sweep is INBOUND — at a hand-derived instant, within a bounded time');
// ===========================================================================
//
// The hush's instant is a consequence of three CONSENSUS numbers and the size of
// the cast, and is recomputed here rather than imported:
//
//   nine swimmers, three of them outside the tension core
//   spreadPerMille = trunc(1000 * 3 / 9)             = 333
//   stepTension    = 333 - TENSION_NEUTRAL (250)     = +83 per tick
//   ticks to TENSION_TRIGGER (30_000) at +83         = ceil(30_000 / 83) = 362
//                                       (83 * 361 = 29_963, one tick short)
//
// The tick that admits the sea's first vectors is itself the first of those 362
// — `foldTick` applies entries in step 1 and steps tension in step 4 — so the
// trigger lands on the tick at SHALLOWS_FIRST_MS + 361 * TICK_MS, and
// `shouldStartHush` fires on that same tick.
{
  const OUTSIDE = 3;
  const spread = Math.trunc((1000 * OUTSIDE) / SHALLOWS_CAST.length); // 333
  const rate = spread - TENSION_NEUTRAL; // 83
  const ticks = Math.ceil(TENSION_TRIGGER / rate); // 362
  const expectedHush = SHALLOWS_FIRST_MS + (ticks - 1) * TICK_MS;

  check('the hand arithmetic is the arithmetic the engine uses',
    spread === 333 && rate === 83 && ticks === 362, { spread, rate, ticks });

  const frames = playShallows({ follow: false, untilMs: 20_000 });
  const hushed = frames.find((f) => f.hushStartMs >= 0);
  check('the hush begins on the tick the arithmetic names',
    hushed !== undefined && hushed.hushStartMs === expectedHush,
    { got: hushed?.hushStartMs, expected: expectedHush });

  // "Inbound", not "eventually". Ten seconds is the bound: it is inside the
  // first minute §2.18 is about, and it leaves the whole commit window on
  // screen before anyone could have got bored.
  const sinceOpen = expectedHush - SHALLOWS_OPEN_MS;
  check('...which is within ten seconds of the window opening',
    sinceOpen > 0 && sinceOpen <= 10_000, sinceOpen);

  // WHAT IS INVARIANT IS THE FLOOR, NOT THE RATE. This group used to check only
  // the two behaviours that hold the rate at 333 and called that "constant,
  // whatever the player does", which is false: swimming OUT of the core takes
  // the count to four, `trunc(4000/9) = 444`, and the rate to +194. The three
  // rows below are the whole story, and the third is the one that disproves the
  // claim the comment used to make.
  //
  // The floor is what actually matters, because the failure it forecloses is the
  // one that killed the first arrangement of this sea: a player who followed the
  // crowd across CORE_R dropped the count to TWO, `trunc(2000/8) = 250`
  // cancelled TENSION_NEUTRAL exactly, and the sweep never came at all.
  for (const [label, run] of [
    ['idle', playShallows({ follow: false, untilMs: sinceOpen })],
    ['follows the crowd', playShallows({ follow: true, untilMs: sinceOpen })],
    ['swims away from frame 0', playShallows({ follow: 'away', untilMs: sinceOpen, followAtMs: 0 })],
  ] as Array<[string, Frame[]]>) {
    const counts = new Set(run.filter((f) => f.bodies.length > 0).map((f) => f.outside.length));
    check(`the outside count never drops below three (player ${label})`,
      [...counts].every((n) => n >= 3), [...counts]);
  }
  {
    const idle = playShallows({ follow: false, untilMs: sinceOpen });
    const towards = playShallows({ follow: true, untilMs: sinceOpen });
    const away = playShallows({ follow: 'away', untilMs: sinceOpen, followAtMs: 0 });
    check('...so a player who stays in the core holds the spread at 333, either way',
      [idle, towards].every((r) => {
        const seen = new Set(r.filter((f) => f.bodies.length > 0).map((f) => f.spread));
        return seen.size === 1 && seen.has(spread);
      }));
    // trunc(1000 * 4 / 9) = 444, and 444 - 250 = 194 rather than 83.
    const awaySpreads = new Set(away.filter((f) => f.bodies.length > 0).map((f) => f.spread));
    check('...and a player who leaves it raises it to 444, which the rate follows',
      awaySpreads.has(444) && Math.trunc((1000 * 4) / SHALLOWS_CAST.length) === 444,
      [...awaySpreads]);
  }

  const followed = playShallows({ follow: true, untilMs: 20_000 });
  const followedHush = followed.find((f) => f.hushStartMs >= 0);
  check('...so the hush arrives on the SAME tick when the player follows the crowd',
    followedHush !== undefined && followedHush.hushStartMs === expectedHush,
    { got: followedHush?.hushStartMs, expected: expectedHush });

  // AND THE DIRECTION IT CAN MOVE IN IS ONE-WAY. A higher rate can only bring
  // the hush FORWARD, so no behaviour delays it and none stalls it. Measured at
  // the two extremes: swimming away from frame 0, and darting away from frame 0.
  {
    const away = playShallows({ follow: 'away', untilMs: 20_000, followAtMs: 0 });
    const darted = playShallows({ follow: 'away', untilMs: 20_000, followAtMs: 0, dart: true });
    const hushes = [away, darted].map((r) => (r.find((f) => f.hushStartMs >= 0) as Frame).hushStartMs);
    check('a player who swims out of the core pulls the hush EARLIER, never later',
      hushes.every((h) => h < expectedHush),
      hushes.map((h) => h - SHALLOWS_OPEN_MS));
    // 3_000 ms swimming and 2_750 darting, against 5_750 idle — so the whole of
    // the player's influence is under three seconds, and it fails safe: greed
    // calls the shark sooner, which is spec 2.11's own thesis.
    check('...by under three seconds, and the sweep still arrives in every case',
      hushes.every((h) => expectedHush - h <= 3_000)
      && [away, darted].every((r) => r.some((f) => f.lastSweepMs >= 0)),
      hushes.map((h) => expectedHush - h));
  }

  // The lock and the resolution follow from HUSH's own constants, not from
  // anything this module chose.
  const locked = frames.find((f) => f.lockedPositions !== null);
  check('the input lock lands LOCK_MS after the hush',
    locked !== undefined && locked.atMs === expectedHush + LOCK_MS,
    { got: locked?.atMs, expected: expectedHush + LOCK_MS });
  const swept = frames.find((f) => f.lastSweepMs >= 0);
  check('and the sweep resolves HUSH_MS after it',
    swept !== undefined && swept.lastSweepMs === expectedHush + HUSH_MS,
    { got: swept?.lastSweepMs, expected: expectedHush + HUSH_MS });
}

// ===========================================================================
console.log('\n3. the school CONVERGES, and closing with it buys real shelter');
// ===========================================================================
//
// Convergence is measured as a fact about distances rather than as "a vector was
// published": the widest gap between any two members of the school at the window
// opening, against the same measure at the input lock.
{
  const frames = playShallows({ follow: false, untilMs: 20_000 });
  const widest = (bs: SwimmerBody[]) => {
    let w = 0;
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const d = Math.sqrt(dist2(bs[i].x, bs[i].y, bs[j].x, bs[j].y));
        if (d > w) w = d;
      }
    }
    return w;
  };
  const schoolAt = (f: Frame) => f.bodies.filter((b) => b.id.startsWith('s'));
  const atOpen = widest(schoolAt(frames[0]));
  const lockFrame = frames.find((f) => f.lockedPositions !== null) as Frame;
  const atLock = widest(schoolAt(lockFrame));

  check('the school is loose when the window opens', atOpen > 700, Math.round(atOpen));
  check('...and is a ball by the time the sweep freezes the water',
    atLock < 2 * SHELTER_R, Math.round(atLock));
  check('...having closed by more than half', atLock < atOpen / 2,
    { atOpen: Math.round(atOpen), atLock: Math.round(atLock) });

  // Every member of that ball is held by the crowd, which is what makes it a
  // place worth swimming to rather than a shape.
  const ball = schoolAt(lockFrame);
  check('every swimmer in the ball is sheltered by the others',
    ball.length === 5 && ball.every((b) => shelterOf(b, ball) >= SHELTER_THRESHOLD),
    ball.map((b) => `${b.id}:${shelterOf(b, ball)}`));

  // And a player who followed it is held too — the "tether goes short and warm"
  // half of §2.18, read as the engine's own shelter score rather than as paint.
  const followed = playShallows({ follow: true, untilMs: 20_000 });
  const fLock = followed.find((f) => f.lockedPositions !== null) as Frame;
  const fMe = fLock.bodies.find((b) => b.id === SHALLOWS_SELF) as SwimmerBody;
  check('a player who follows the crowd is sheltered by the lock',
    shelterOf(fMe, fLock.bodies) >= SHELTER_THRESHOLD, shelterOf(fMe, fLock.bodies));
  const fT = readTether(fMe, fLock.bodies);
  check('...their tether short and warm rather than stretched and cold',
    fT.lengthCu < TETHER_MAX_CU / 2 && fT.warmth > 0.5 && fT.mood === 'held',
    { lengthCu: Math.round(fT.lengthCu), warmth: Number(fT.warmth.toFixed(2)), mood: fT.mood });
}

// ===========================================================================
console.log('\n4. someone FURTHER OUT than the newcomer is taken — either way');
// ===========================================================================
//
// The claim §2.18 rests on, in both of the branches it names. "Further out" is
// distance from the point the school gathers on, measured at the frozen
// arrangement the sweep actually judged (`lockedPositions`), never at a later
// frame — the fish it took have paid SCATTER_COST by then.
{
  for (const follow of [false, true]) {
    const label = follow ? 'the player follows the crowd' : 'the player does nothing at all';
    const frames = playShallows({ follow, untilMs: 20_000 });
    const swept = frames.find((f) => f.lastSweepMs >= 0) as Frame;
    const locked = lockedBodiesOf(frames) as SwimmerBody[];
    const me = locked.find((b) => b.id === SHALLOWS_SELF) as SwimmerBody;
    const taken = swept.lastTaken;

    check(`${label}: the sweep takes somebody`, taken.length > 0, taken);
    const further = taken.filter((id) => {
      const b = locked.find((x) => x.id === id);
      return b !== undefined && outFrom(b) > outFrom(me);
    });
    check(`${label}: at least one swimmer FURTHER OUT than them is taken`,
      further.length >= 1,
      { taken, distances: taken.map((id) => Math.round(outFrom(locked.find((x) => x.id === id) as SwimmerBody))), mine: Math.round(outFrom(me)) });

    // ...and the frozen replay carries the same verdict to the screen, with a
    // tether for every fish in it — the diagram §2.18 falls back on.
    const replay = scatterReplay(
      { lastSweepMs: swept.lastSweepMs, lastTaken: taken },
      swept.lastSweepMs + SCATTER_FREEZE_MS / 2,
      locked,
    );
    check(`${label}: the frozen replay shows the verdict and everybody in it`,
      replay !== null && replay.taken.join() === taken.join() && replay.bodies.length === locked.length,
      { taken: replay?.taken, bodies: replay?.bodies.length });
  }

  // The two branches, spelled out, because they are what makes the lesson land
  // rather than merely occur.
  const idle = playShallows({ follow: false, untilMs: 20_000 });
  const idleTaken = (idle.find((f) => f.lastSweepMs >= 0) as Frame).lastTaken;
  check('a player who does nothing is scattered — cheaply, and with company',
    idleTaken.includes(SHALLOWS_SELF) && idleTaken.length === MAX_TAKE, idleTaken);
  check('...alongside two swimmers who were further out than they were',
    idleTaken.filter((id) => id.startsWith('o')).length === 2, idleTaken);

  const followed = playShallows({ follow: true, untilMs: 20_000 });
  const followedTaken = (followed.find((f) => f.lastSweepMs >= 0) as Frame).lastTaken;
  check('a player who follows the crowd is NOT taken',
    !followedTaken.includes(SHALLOWS_SELF), followedTaken);
  check('...and all three swimmers out in the open go instead, in front of them',
    followedTaken.length === MAX_TAKE && followedTaken.every((id) => id.startsWith('o')),
    followedTaken);

  // THE ONE BEHAVIOUR WHERE §2.18's SPECIFIC PROMISE IS FALSE, checked rather
  // than left as a promise the code does not keep. A player who darts straight
  // out becomes the furthest-out body in the water, so "someone further out is
  // scattered in front of them" cannot be true — there is nobody further out.
  // What is still true is everything the lesson actually needs, and §2.18 names
  // the fallback itself: "the frozen replay delivers the same lesson
  // geometrically".
  {
    const fled = playShallows({ follow: 'away', untilMs: 20_000, followAtMs: 0, dart: true });
    const swept = fled.find((f) => f.lastSweepMs >= 0) as Frame;
    const locked = lockedBodiesOf(fled) as SwimmerBody[];
    const me = locked.find((b) => b.id === SHALLOWS_SELF) as SwimmerBody;
    const others = locked.filter((b) => b.id !== SHALLOWS_SELF);

    check('a player who darts straight out is the furthest-out body in the water',
      others.every((b) => outFrom(b) < outFrom(me)),
      { mine: Math.round(outFrom(me)), others: others.map((b) => Math.round(outFrom(b))) });
    check('...so NOBODY further out than them is taken — the promise does not hold here',
      swept.lastTaken.every((id) => outFrom(locked.find((x) => x.id === id) as SwimmerBody) <= outFrom(me)),
      swept.lastTaken);
    check('...but they are still scattered, with two of the three out in the open',
      swept.lastTaken.includes(SHALLOWS_SELF)
      && swept.lastTaken.filter((id) => id.startsWith('o')).length === 2, swept.lastTaken);
    // ...and the geometry is still delivered: a knot of five holding each other
    // in the middle, and every fish the sweep took alone at the edge of it.
    const ball = locked.filter((b) => b.id.startsWith('s'));
    check('...and the frozen replay still carries the lesson: the knot held, the alone did not',
      ball.every((b) => shelterOf(b, locked) >= SHELTER_THRESHOLD)
      && swept.lastTaken.every((id) => shelterOf(locked.find((x) => x.id === id) as SwimmerBody, locked) === 0),
      { ball: ball.map((b) => shelterOf(b, locked)), taken: swept.lastTaken });
  }

  // The verdict is the ENGINE's, re-derivable from the frozen arrangement — so
  // this is a claim about `selectTaken`'s inputs rather than about its output.
  {
    const frames = playShallows({ follow: false, untilMs: 20_000 });
    const locked = lockedBodiesOf(frames) as SwimmerBody[];
    const exposed = locked.filter((b) => isExposed(b, locked)).map((b) => b.id).sort();
    check('exactly the four alone-in-the-water swimmers are candidates at the lock',
      exposed.join() === ['o1', 'o2', 'o3', 'you'].join(), exposed);
    const taken = (frames.find((f) => f.lastSweepMs >= 0) as Frame).lastTaken;
    check('...and the take list is what selectTaken makes of that arrangement',
      selectTaken(locked, 'o1').join() === taken.join(),
      { derived: selectTaken(locked, 'o1'), got: taken });
  }
}

// ===========================================================================
console.log('\n5. the same sea every time — the lesson is not a coin flip');
// ===========================================================================
//
// The whole reliability claim, stated as two properties: the script is a
// constant, and the fold of it does not depend on how often a frame happened.
{
  const a = shallowsScript();
  const b = shallowsScript();
  check('the script is the same array every time it is built',
    JSON.stringify(a) === JSON.stringify(b), { a: a.length, b: b.length });
  check('...and holds no floating-point coordinate anywhere',
    a.every((e) => e.kind !== 'presence'
      || [e.vec.x, e.vec.y, e.vec.heading, e.vec.speed, e.vec.t].every(Number.isInteger)));

  // Three frame rates a machine might actually produce — 60 fps, 20 fps and a
  // window that has been dropping frames badly — and one that no machine
  // produces, to prove the fold is driving this rather than the loop.
  //
  // THE VERDICT ALONE IS NOT A STRONG ENOUGH OBSERVABLE, and finding that out is
  // the reason this reads a whole-world fingerprint instead. A writer driven by
  // the frame clock rather than by its own schedule — which is exactly what
  // `livelySea` does, and exactly what this module's header claims not to —
  // moves every fish by tens of cu between a 16 ms loop and a 977 ms one, and
  // the sweep still takes the same three: `lastTaken` is robust to jitter that
  // the sea plainly is not. Injecting that mutation left a verdict-only check
  // entirely green. So the comparison is every body's id, position AND size at
  // one fixed SEA instant, which nothing frame-shaped can survive.
  const worlds = [16, 50, 250, 977].map((stepMs) => {
    const frames = playShallows({ follow: false, untilMs: 20_000, stepMs });
    const swept = frames.find((f) => f.lastSweepMs >= 0) as Frame;
    const lock = lockedBodiesOf(frames) as SwimmerBody[];
    return `${swept.lastSweepMs}|${swept.lastTaken.join()}|`
      + lock.map((b) => `${b.id}:${b.x},${b.y}:${b.size}`).sort().join(' ');
  });
  const verdicts = worlds.map((w) => w.split('|').slice(0, 2).join('|'));
  check('the same hush, and the same fish taken, at every frame rate',
    new Set(verdicts).size === 1, verdicts);
  check('...and the same sea, body for body, at the instant the sweep judged it',
    new Set(worlds).size === 1, worlds.map((w) => w.split('|')[2]));

  // A THROTTLED WINDOW FOLDS THE SAME SEA, and this is a much stronger demand
  // than the four frame rates above because it reaches past
  // `SHALLOWS_LIFE_GAP_MS`. Browsers and webviews clamp `requestAnimationFrame`
  // to seconds in a window nobody is looking at, or stop it altogether — and a
  // BACKGROUNDED WINDOW IS THE NORMAL CASE HERE, because the shallows is where
  // somebody waits, possibly for hours, to be let into the real water.
  //
  // `millDue` used to author each write from `loop.state`, the world as of the
  // previous frame. Under 4 s frames that is one write per frame and the
  // difference never shows; past it, a catch-up burst authored every write in
  // it from the same stale position, nobody arrived anywhere, and the grazers'
  // claims landed nowhere near the cells they were scheduled on. Measured at
  // fifteen minutes, cast sizes at the end: 161/185/167/187/179 at 250 ms and
  // ALL NINE ON MIN_SIZE at 120 s — i.e. the throttled window starved the cast
  // back into precisely the still life the tide exists to replace.
  //
  // Twelve minutes, which is six tides, at four frame rates spanning two orders
  // of magnitude, compared body for body at one exact sea instant. 720_000 is
  // divisible by every step, so all four runs end on the same instant rather
  // than within a frame of it.
  {
    const worldAt = (stepMs: number) => {
      const run = playShallows({ follow: false, untilMs: 720_000, stepMs });
      return run[run.length - 1].bodies.map((b) => `${b.id}:${b.x},${b.y}:${b.size}`).sort().join(' ');
    };
    const throttled = [250, 4_000, 8_000, 30_000].map(worldAt);
    check('a throttled window folds the same sea — 250 ms to 30 s frames, twelve minutes in',
      new Set(throttled).size === 1, throttled);
    // NON-DEGENERACY: the comparison is of a real, fed, moving sea rather than
    // of four identical floors. A cast pinned on MIN_SIZE would agree perfectly
    // and prove nothing, which is exactly what the defect produced.
    const sizes = throttled[0].split(' ').map((s) => Number(s.split(':')[2]));
    check('...and it is a sea with something in it, not four identical floors',
      new Set(sizes).size >= 5 && Math.max(...sizes) > 2 * MIN_SIZE, sizes);
    // WHAT IS NOT CLAIMED, because it is not true and the reason is not this
    // module's to fix: past ~90 s between frames the PLAYER's own presence
    // lapses (`PRESENCE_TTL_MS`), since a window that renders once every two
    // minutes writes once every two minutes. At 120 s frames the fold holds
    // eight swimmers instead of nine for seven frames in eight — measured — so
    // the tension statistic differs and the sweeps fall elsewhere. The cast
    // stays fed (97..137 at fifteen minutes); it is the population that
    // changes, and it would change identically in real water.
  }

  // And nothing about the world depends on when the icon was pressed: the sea
  // rides its own clock, so two windows opened an hour apart see one sea.
  const later = shallowsSea(3_600_000 * 7 + 12_345);
  const laterFrames: string[] = [];
  {
    let input: InputState = createInput(later.spawn.x, later.spawn.y, 0);
    for (let wall = 3_600_000 * 7 + 12_345; wall <= 3_600_000 * 7 + 32_345; wall += 250) {
      input = emitDue(input, later.seaMs(wall) + TICK_MS, (v, s) => later.publish(v, s));
      const s = later.step(wall);
      if (s.lastSweepMs >= 0) { laterFrames.push(`${s.lastSweepMs}|${s.lastTaken.join()}`); break; }
    }
  }
  check('a window opened at a different wall-clock instant sees the identical sweep',
    laterFrames[0] === verdicts[0], { later: laterFrames[0], first: verdicts[0] });
}

// ===========================================================================
console.log('\n6. and then it keeps going — the shallows is a PLACE TO WAIT');
// ===========================================================================
//
// §2.16: "Never let a downloader dead-end." A scripted sea whose script runs out
// empties itself PRESENCE_TTL_MS later and leaves the player alone in open
// water, which is the dead end with extra steps.
//
// AND A NEWCOMER AT THE EDGE OF THE REAL WATER MAY WAIT HERE FOR HOURS
// (`seaChoice.chooseWater`), so "it keeps going" is no longer enough on its
// own. The sea this group used to describe kept going and stopped being a
// place: every swimmer pinned on MIN_SIZE by T+8min, a ball that never moved,
// and the same three fish taken by every sweep for the rest of the hour. The
// checks below are the properties that failed for that sea and hold for this
// one, and every threshold is stated before the run.
//
// HALF AN HOUR AT 250 ms FRAMES, which is 7_200 folded frames per behaviour —
// the whole group runs in a few seconds because `advance` is incremental.
{
  const HALF_HOUR = 1_800_000;
  const frames = playShallows({ follow: false, untilMs: HALF_HOUR, stepMs: 250 });
  const last = frames[frames.length - 1];
  check('every scripted swimmer is still in the water half an hour later',
    last.bodies.length >= SHALLOWS_CAST.length - 1,
    last.bodies.map((b) => b.id));

  // "The sweep came back" has to mean it came back TO SOMEBODY. A count of
  // distinct `lastSweepMs` values alone survives a sea that has emptied out —
  // an empty take list is still a sweep — so the later sweeps are required to
  // have taken a scripted swimmer, which only a populated sea can produce.
  const later = frames.filter((f) => f.lastSweepMs > SHALLOWS_OPEN_MS + 20_000);
  const laterSweeps = new Set(later.map((f) => `${f.lastSweepMs}|${f.lastTaken.join()}`));
  check('...and the sweep has come back, to swimmers who are still there',
    laterSweeps.size >= 1 && [...laterSweeps].every((k) => k.split('|')[1].length > 0),
    [...laterSweeps]);

  // AND IT DOES NOT KEEP TAKING THE SAME THREE. The parked sea's sweep had one
  // answer and repeated it for an hour, which is the difference between weather
  // and a metronome. Distinct take-lists, over the sweeps after the lesson.
  const takeLists = new Set([...laterSweeps].map((k) => k.split('|')[1]));
  check('...to DIFFERENT swimmers — the shark is not on a loop',
    takeLists.size >= 8, [...takeLists].slice(0, 12));

  // THE BALL IS SOMETIMES WHOLE AND SOMETIMES NOT, and both halves are the
  // design: the school cannot shelter and feed at once (`SHALLOWS_TIDE_MS`), so
  // a sea with cover at every instant would be a sea whose cast starves. Cover
  // exists for a large part of every tide and is really gone for the rest —
  // measured at 47-49%, checked here as "between a third and two thirds" so it
  // is a claim about the shape rather than a copy of one run's number.
  const ballWhole = frames.filter((f) => {
    const ball = f.bodies.filter((b) => b.id.startsWith('s'));
    return ball.length === 5 && ball.every((b) => shelterOf(b, f.bodies) >= SHELTER_THRESHOLD);
  }).length;
  const held = ballWhole / frames.length;
  check('...the school holds together as cover for a large part of every tide',
    held > 0.33 && held < 0.66, Number(held.toFixed(3)));

  // THE SCOREBOARD STILL READS. Spec §2.8: size IS the scoreboard, and a
  // scoreboard everybody is at the bottom of is not one. Sampled every ten
  // seconds from T+10min — long past the point at which the parked sea had
  // flattened (its spread was 11 and falling by T+8min).
  const spreads: number[] = [];
  for (const f of frames) {
    if ((f.atMs - SHALLOWS_OPEN_MS) < 600_000 || (f.atMs - SHALLOWS_OPEN_MS) % 10_000 !== 0) continue;
    const sizes = f.bodies.map((b) => b.size);
    spreads.push(Math.max(...sizes) - Math.min(...sizes));
  }
  const worstSpread = Math.min(...spreads);
  check('...and the water still has a size spread in it after half an hour',
    spreads.length > 100 && worstSpread >= 40,
    { samples: spreads.length, worst: worstSpread, median: [...spreads].sort((a, b) => a - b)[spreads.length >> 1] });

  // ...because the school EATS. Not "is not at the floor" — that would pass for
  // a sea one hunger tick away from it — but visibly fed, half an hour in, on
  // bites the fold credited against its own bloom map.
  const fedSchool = frames.filter((f) => (f.atMs - SHALLOWS_OPEN_MS) >= 600_000
    && (f.atMs - SHALLOWS_OPEN_MS) % 10_000 === 0)
    .filter((f) => f.bodies.filter((b) => b.id.startsWith('s') && b.size >= MIN_SIZE + 30).length >= 2);
  check('...the school having really fed itself, at nearly every moment of it',
    fedSchool.length >= spreads.length - 10, { fed: fedSchool.length, of: spreads.length });

  // ...AND SO ARE THE THREE OUT IN THE OPEN, which is a separate claim about a
  // separate rule. `SHALLOWS_FORAGE_EVERY` is their whole economy, and it was
  // set against hunger alone: break-even income, which the tide's oftener sweep
  // turned into a slow slide to MIN_SIZE. Nothing pinned it — the interval
  // could be moved back and every check in this file stayed green.
  //
  // THE BAR IS `MIN_SIZE + SCATTER_COST`, DERIVED RATHER THAN OBSERVED, and it
  // is the smallest bar that means anything: a swimmer that never gets that far
  // above the floor is one for whom a single sweep is unrecoverable, which is
  // being pinned on MIN_SIZE with extra steps. At a bite every SECOND write the
  // income is BITE_GROWTH (12) per 2 * SHALLOWS_LIFE_GAP_MS (8 s) against
  // hunger's 1 a second — +0.5/s, which pays for being eaten. At every THIRD
  // write it is +1/s against -1/s exactly: break-even, so `SCATTER_COST` is
  // taken out of a swimmer with no way to earn it back. Measured over this run,
  // peaks after T+10min: 104/144/117 at two, 74/79/78 at three.
  const loners = ['o1', 'o2', 'o3'];
  const peak = new Map(loners.map((id) => [id, 0]));
  for (const f of frames) {
    if ((f.atMs - SHALLOWS_OPEN_MS) < 600_000) continue;
    for (const b of f.bodies) {
      if (peak.has(b.id)) peak.set(b.id, Math.max(peak.get(b.id) as number, b.size));
    }
  }
  check('...and the three out in the open are fed enough to survive being eaten',
    loners.every((id) => (peak.get(id) as number) >= MIN_SIZE + SCATTER_COST),
    Object.fromEntries(peak));

  // THE FLOOR OF THREE, over the whole half hour and all three behaviours. It
  // is the invariant the sweep's reliability rests on (this module's header),
  // and the tide is the first thing that could ever have broken it: when the
  // ball breaks up the tension core's median moves, so the count outside it is
  // no longer the constant it was. It rises — measured up to 7 — and it must
  // never fall.
  for (const [label, run] of [
    ['idle', frames],
    ['follows the crowd', playShallows({ follow: true, untilMs: HALF_HOUR, stepMs: 250 })],
    ['runs for open water', playShallows({ follow: 'away', untilMs: HALF_HOUR, stepMs: 250 })],
  ] as Array<[string, Frame[]]>) {
    const counts = run.filter((f) => f.bodies.length > 0).map((f) => f.outside.length);
    check(`the floor of three holds for half an hour (player ${label})`,
      Math.min(...counts) >= 3,
      { min: Math.min(...counts), max: Math.max(...counts) });
  }

  // THE TIDE REALLY RUNS, measured on the school's own positions rather than on
  // the count above.
  //
  // THERE WAS A ROW HERE PER BEHAVIOUR CLAIMING THAT `max(outside) > 3` PROVED
  // THE SCHOOL GOES OUT, AND IT WAS VACUOUS: with the tide disabled outright,
  // two of the three still passed. The count outside the core is a statistic
  // over EVERYONE, and the player alone is enough to move it — an idle newcomer
  // sits 602 cu from the gathering point against a CORE_R of 620, so the median
  // wandering by twenty cu takes them in and out of it all session, in a sea
  // where the school never moved at all. Only "follows the crowd" discriminated,
  // and then only by accident: a player tucked into the ball cannot be the
  // swimmer whose drift makes the count move.
  //
  // So it is measured directly, once, on the five swimmers the claim is about:
  // there are frames where the whole school is on the gathering point, and
  // frames where the whole school is out at its patches. The ball is a ring of
  // radius ~112 about the gathering point and the patches are 453-487 cu from
  // it, so 200 and 400 separate the two states with room on both sides and
  // neither threshold is a measurement read back out of the code.
  const outFromGather = (b: SwimmerBody) => Math.sqrt(dist2(b.x, b.y, SHALLOWS_GATHER.x, SHALLOWS_GATHER.y));
  const schoolOf = (f: Frame) => f.bodies.filter((b) => b.id.startsWith('s'));
  const gathered = frames.filter((f) => schoolOf(f).length === 5 && schoolOf(f).every((b) => outFromGather(b) < 200));
  const feeding = frames.filter((f) => schoolOf(f).length === 5 && schoolOf(f).every((b) => outFromGather(b) > 400));
  check('the school is really sometimes gathered on the point...',
    gathered.length > 0, gathered.length);
  check('...and really sometimes all the way out at its patches',
    feeding.length > 0, feeding.length);
  // ...and it is a TIDE rather than one excursion: both states recur, many
  // times, over half an hour. `SHALLOWS_TIDE_MS` is 120 s, so half an hour is
  // fifteen of them.
  const tidesSeen = new Set(feeding.map((f) => Math.floor((f.atMs - SHALLOWS_LIFE_FROM_MS) / SHALLOWS_TIDE_MS)));
  check('...on a tide that turns again and again, not once',
    tidesSeen.size >= 12, tidesSeen.size);
}

// ===========================================================================
console.log('\n7. the fold is the engine\'s, not this module\'s');
// ===========================================================================
//
// The sea is only trustworthy if the world on screen is one `advance` produced
// from the script. Folded here independently, with no `Sea` object involved at
// all, and compared against the sea's own answer at the same instant.
{
  let loop: LoopState = createLoop(SHALLOWS_EPOCH, shallowsSeed());
  const log = shallowsScript();
  loop = advance(loop, log, SHALLOWS_OPEN_MS).loop;
  const direct = bodiesOf(loop.state)
    .map((b) => `${b.id}:${b.x},${b.y}:${b.size}`).sort().join(' ');

  const viaSea = playShallows({ follow: false, untilMs: 0 })[0].bodies
    .map((b) => `${b.id}:${b.x},${b.y}:${b.size}`).sort().join(' ');

  check('the sea shows exactly what advance() makes of the script',
    direct === viaSea, { direct, viaSea });

  // Sizes come in through a CHECKPOINT — the same seam a client joining an
  // hour-old sea uses — and are decayed by the fold's own hunger, not written
  // down anywhere. 84.5 s of prelude at HUNGER_AMOUNT (1) per
  // HUNGER_TICK_INTERVAL * TICK_MS (1_000 ms) is 84 lost, so a swimmer seeded at
  // 180 must open at 96.
  const s1Seed = SHALLOWS_CAST.find((p) => p.id === 's1') as { size: number };
  const s1Now = bodiesOf(loop.state).find((b) => b.id === 's1') as SwimmerBody;
  check('the seeded sizes have really been through the fold\'s hunger',
    s1Now.size < s1Seed.size && s1Now.size === 96, { seeded: s1Seed.size, open: s1Now.size });
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
