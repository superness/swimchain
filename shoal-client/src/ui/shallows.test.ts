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
import { spreadPerMille } from '../lib/tension';
import { selectTaken } from '../lib/sweep';
import { wildAt } from '../lib/wild';
import { dist2 } from '../lib/fixed';
import { readTether, scatterReplay, TETHER_MAX_CU, SCATTER_FREEZE_MS } from './tether';
import { applyInput, createInput, emitDue, headingTo, positionAt, type InputState } from './input';
import {
  HUSH_MS, LOCK_MS, MAX_TAKE, SHELTER_R, SHELTER_THRESHOLD, TENSION_NEUTRAL,
  TENSION_TRIGGER, TICK_MS,
} from '../lib/shoalConst';
import {
  SHALLOWS_CAST, SHALLOWS_EPOCH, SHALLOWS_FIRST_MS, SHALLOWS_GATHER, SHALLOWS_OPEN_MS,
  SHALLOWS_SELF, SHALLOWS_SPAWN, SHALLOWS_WILD_SEED, shallowsScript, shallowsSea, shallowsSeed,
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
}

/**
 * Play the shallows the way `App.tsx` plays it, and hand back every frame.
 *
 * `follow` is the whole of the player's agency: when true, from `followAtMs`
 * onward the pointer is held on the gathering point, which is what "following a
 * visibly moving crowd" reduces to. When false the window still publishes —
 * a real idle client emits a keep-alive every `MAX_EMIT_GAP_MS` — and that is
 * exactly the difference between "the player did nothing" and "the player was
 * not there".
 */
function playShallows(opts: { follow: boolean; untilMs: number; stepMs?: number; followAtMs?: number }): Frame[] {
  const sea = shallowsSea(0);
  let input: InputState = createInput(sea.spawn.x, sea.spawn.y, 0);
  const stepMs = opts.stepMs ?? 50;
  const frames: Frame[] = [];
  for (let wall = 0; wall <= opts.untilMs; wall += stepMs) {
    const authorMs = sea.seaMs(wall) + TICK_MS;
    if (opts.follow && wall >= (opts.followAtMs ?? 1_500)) {
      const me = positionAt(input, authorMs);
      input = applyInput(input, {
        kind: 'steer',
        heading: headingTo(SHALLOWS_GATHER.x - me.x, SHALLOWS_GATHER.y - me.y),
      }, authorMs);
    }
    input = emitDue(input, authorMs, (vec, say) => sea.publish(vec, say));
    const s = sea.step(wall);
    frames.push({
      atMs: sea.seaMs(wall),
      bodies: bodiesOf(s),
      hushStartMs: s.hushStartMs,
      lockedPositions: s.lockedPositions === null ? null : new Map(s.lockedPositions),
      lastSweepMs: s.lastSweepMs,
      lastTaken: [...s.lastTaken],
      tension: s.tension,
      spread: spreadPerMille(bodiesOf(s)),
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
    check('...so the engine calls them exposed', isExposed(me, first.bodies));
    check('...on a shelter score of exactly zero',
      shelterOf(me, first.bodies) === 0, shelterOf(me, first.bodies));

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

  // THE RATE IS CONSTANT, WHATEVER THE PLAYER DOES. This is the check that
  // stands between the lesson and the defect that a player who followed the
  // crowd across CORE_R dropped the outside-count to two, `trunc(2000 / 8)`
  // cancelled TENSION_NEUTRAL exactly, and the sweep never came.
  for (const follow of [false, true]) {
    const run = playShallows({ follow, untilMs: sinceOpen });
    const seen = new Set(run.filter((f) => f.bodies.length > 0).map((f) => f.spread));
    check(`the spread is 333 on every tick up to the hush (player ${follow ? 'follows' : 'idle'})`,
      seen.size === 1 && seen.has(spread), [...seen]);
  }
  const followed = playShallows({ follow: true, untilMs: 20_000 });
  const followedHush = followed.find((f) => f.hushStartMs >= 0);
  check('...so the hush arrives on the SAME tick when the player follows the crowd',
    followedHush !== undefined && followedHush.hushStartMs === expectedHush,
    { got: followedHush?.hushStartMs, expected: expectedHush });

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
console.log('\n6. and then it keeps going — the shallows is a place, not a cutscene');
// ===========================================================================
//
// §2.16: "Never let a downloader dead-end." A scripted sea whose script runs out
// empties itself PRESENCE_TTL_MS later and leaves the player alone in open
// water, which is the dead end with extra steps.
{
  const frames = playShallows({ follow: false, untilMs: 200_000, stepMs: 250 });
  const last = frames[frames.length - 1];
  check('every scripted swimmer is still in the water three minutes later',
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

  // The ball is still a ball, so there is still somewhere safe to be.
  const ball = last.bodies.filter((b) => b.id.startsWith('s'));
  check('...with the school still holding together as cover',
    ball.length === 5 && ball.every((b) => shelterOf(b, ball) >= SHELTER_THRESHOLD),
    ball.map((b) => `${b.id}:${shelterOf(b, ball)}`));
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
