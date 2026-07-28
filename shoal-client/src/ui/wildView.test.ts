/**
 * The wild shoal as a reading. Run: npx tsx src/ui/wildView.test.ts
 *
 * Expected values are derived by hand from the CONSTANTS (`WILD_BOLT_MS`,
 * `WILD_SPEED_BOLT`, `HUSH_MS`, `TICK_MS`, `WILD_RETURN_MS`) and from
 * `wildAt`'s own published contract, never by calling `wildClock`/`wildViewAt`
 * twice and comparing them to themselves. Where a whole ARRANGEMENT is needed
 * — "the fish are further out at the start of the return than at the end" —
 * the reference is `wildAt` itself, which is the layer below and is pinned
 * independently by `src/lib/wild.test.ts`.
 *
 * Nothing here mocks a canvas. Every number the paint uses is computed in this
 * module and is checkable as arithmetic; `wildPaint.ts` holds only the drawing
 * and is verified by screenshot, which is the standing bar for a player-facing
 * surface in this repo.
 */
import {
  WILD_RETURN_FADE, WILD_RETURN_MS, WILD_SHY_R, WILD_SHY_TURN,
  angleDelta, shyness, wildClock, wildShelterBodies, wildViewAt,
} from './wildView';
import { WILD_BOLT_MS, WILD_COUNT, WILD_SPEED_BOLT, wildAt, isWildId } from '../lib/wild';
import { shelterBodiesOf } from '../lib/shoalEngine';
import { shelterOf } from '../lib/shelter';
import { HUSH_MS, TICK_MS, SHELTER_R, SHELTER_THRESHOLD } from '../lib/shoalConst';
import type { ShoalState } from '../lib/shoalTypes';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}
function near(a: number, b: number, eps: number): boolean {
  return Math.abs(a - b) <= eps;
}

const SEED = 1;

// ---------------------------------------------------------------------------
// 1. The clock — the whole of the resolve-tick fix lives here.
// ---------------------------------------------------------------------------

// A live hush is passed through untouched: nothing is being second-guessed.
{
  const c = wildClock(1_000_000 + 900, 1_000_000, -1);
  check('a live hush is handed to wildAt verbatim',
    c.hushStartMs === 1_000_000 && c.nowMs === 1_000_000 + 900 && c.returning === 0);
  check('a live hush past T+0 is fleeing, outward', c.fleeing === true && c.inbound === false);
}

// A live hush wins even when a sweep is also on record — you can be inside a
// second hush that started after the previous one resolved.
{
  const c = wildClock(2_000_500, 2_000_000, 1_900_000);
  check('a live hush outranks a remembered sweep', c.hushStartMs === 2_000_000 && c.returning === 0);
}

// Nothing has ever happened: no hush to be in.
check('a sea that has never hushed is calm', wildClock(500_000, -1, -1).hushStartMs === -1);

// THE RESOLVE TICK ITSELF. This is the frame the fix exists for: the fold has
// just set hushStartMs = -1 and lastSweepMs = t in the same statement.
{
  const sweep = 3_000_000;
  const c = wildClock(sweep, -1, sweep);
  // Hand-derived: the hush this sweep came out of is sweep - HUSH_MS.
  check('the hush is recovered as lastSweepMs - HUSH_MS', c.hushStartMs === sweep - HUSH_MS);
  // ...and at `since = 0` the backward clock sits at the very end of the bolt,
  // WILD_BOLT_MS - 1 past the hush start, so wildAt still returns fish (its
  // cut-off is `>= WILD_BOLT_MS`) and they are at their furthest.
  check('at the resolve tick the shoal is at the far end of its own bolt',
    c.nowMs === (sweep - HUSH_MS) + (WILD_BOLT_MS - 1));
  check('the resolve tick is a return, inbound', c.returning === 0 && c.inbound === true);
  // Hand-derived flee distance: trunc(420 * 1999 / 1000) = trunc(839.58) = 839.
  check('...which is 839 cu out, past 2 * SHELTER_R (680)',
    Math.trunc((WILD_SPEED_BOLT * (WILD_BOLT_MS - 1)) / 1000) === 839
    && 839 > 2 * SHELTER_R);
  check('and it is still fleeing, so it faces along its ray', c.fleeing === true);
}

// The end of the return, and one instant past it, must agree exactly — that
// agreement is what makes the return seamless at BOTH ends.
{
  const sweep = 3_000_000;
  const almost = wildClock(sweep + WILD_RETURN_MS - 1, -1, sweep);
  const after = wildClock(sweep + WILD_RETURN_MS, -1, sweep);
  check('the return ends and the sea goes calm', after.hushStartMs === -1 && after.returning === 0);
  // The last returning frame's flee distance rounds to 0 cu, so the two
  // frames put every fish on the identical coordinates — no pop at this end
  // either. Derived: smoothstep(0, T, T-1) is within 1e-6 of 1, so
  // back <= (2000-1) * 1e-6 < 1 ms, and trunc(420 * back / 1000) = 0.
  const backMs = almost.nowMs - almost.hushStartMs;
  check('the last returning frame has travelled the whole way home',
    Math.trunc((WILD_SPEED_BOLT * backMs) / 1000) === 0, backMs);
}

// Monotonic: the shoal only ever gets closer to home across a return.
{
  const sweep = 3_000_000;
  let prev = Infinity;
  let monotonic = true;
  for (let s = 0; s < WILD_RETURN_MS; s += 100) {
    const c = wildClock(sweep + s, -1, sweep);
    const flee = Math.trunc((WILD_SPEED_BOLT * (c.nowMs - c.hushStartMs)) / 1000);
    if (flee > prev) monotonic = false;
    prev = flee;
  }
  check('the return never sends a fish back outward', monotonic);
  check('the return does arrive home', prev === 0, prev);
}

// THE SCATTER REPLAY. App.tsx paints the frozen diagram at the LOCKED
// arrangement's own instant, four seconds before the resolve. hushStartMs is
// already -1 by then, so without this branch the empty ocean refills inside
// the freeze.
{
  const sweep = 3_000_000;
  const lockAt = sweep - HUSH_MS + 4_000; // LOCK_MS after the hush began
  const c = wildClock(lockAt, -1, sweep);
  check('a replayed pre-sweep instant is still inside its hush',
    c.hushStartMs === sweep - HUSH_MS && c.nowMs === lockAt);
  // Elapsed there is 4_000 ms, well past WILD_BOLT_MS, so wildAt returns [].
  check('...and at T+4000 the shoal is gone, as it was at the time',
    wildAt(SEED, Math.floor(lockAt / TICK_MS), c.hushStartMs, c.nowMs).length === 0);
}

// An instant before the hush that produced the sweep is genuinely calm.
{
  const sweep = 3_000_000;
  const c = wildClock(sweep - HUSH_MS - 1, -1, sweep);
  check('before its hush began, that hush does not reach backward', c.hushStartMs === -1);
}

// ---------------------------------------------------------------------------
// 2. The bolt is still absolute. The clock must never resurrect it.
// ---------------------------------------------------------------------------

{
  const hush = 4_000_000;
  const at = hush + WILD_BOLT_MS; // the first instant of "gone"
  const c = wildClock(at, hush, -1);
  check('the shoal is absent from the view the instant the bolt completes',
    wildViewAt(SEED, at, c, null).length === 0);
  check('...and absent from the shelter read on the same instant',
    wildShelterBodies(SEED, at, c).length === 0);
}

{
  const hush = 4_000_000;
  const at = hush + WILD_BOLT_MS - 1;
  const c = wildClock(at, hush, -1);
  check('one ms earlier the whole shoal is still there',
    wildViewAt(SEED, at, c, null).length === WILD_COUNT);
}

// The bolt takes them past two shelter radii of everywhere they were. Measured
// against `wildAt` at the hush tick, which is the layer below.
{
  const hush = 4_000_000;
  const hushTick = Math.floor(hush / TICK_MS);
  const stood = wildAt(SEED, hushTick, -1, 0);
  const at = hush + WILD_BOLT_MS - 1;
  const gone = wildViewAt(SEED, at, wildClock(at, hush, -1), null);
  let minMoved = Infinity;
  for (let i = 0; i < gone.length; i++) {
    minMoved = Math.min(minMoved, Math.hypot(gone[i].x - stood[i].x, gone[i].y - stood[i].y));
  }
  check('every fish has left its own shelter radius twice over before it vanishes',
    minMoved > 2 * SHELTER_R, Math.round(minMoved));
}

// ---------------------------------------------------------------------------
// 3. The shelter read agrees with the engine's own join, in the calm case.
//
// `shelterBodiesOf` welds the motion clock to the hush clock, which is why
// this module cannot use it (see wildView.ts §2). In the CALM case the two
// clocks agree, and there the two must produce the identical wild half — so
// the divergence is exactly as wide as it is documented to be and no wider.
// ---------------------------------------------------------------------------

{
  const state = { fish: new Map(), hushStartMs: -1 } as unknown as ShoalState;
  const at = 5_000_123;
  const viaEngine = shelterBodiesOf(state, SEED, at).filter((b) => isWildId(b.id));
  const viaView = wildShelterBodies(SEED, at, wildClock(at, -1, -1));
  const same = viaEngine.length === viaView.length
    && viaEngine.every((b, i) => b.id === viaView[i].id && b.x === viaView[i].x
      && b.y === viaView[i].y && b.size === viaView[i].size);
  check('in calm water the view and shelterBodiesOf agree body for body',
    same && viaView.length === WILD_COUNT, { engine: viaEngine.length, view: viaView.length });
}

// Every body it hands out is branded wild, both ways: the flag for the
// compiler, the id prefix for everything the compiler cannot see.
{
  const at = 5_000_000;
  const bodies = wildShelterBodies(SEED, at, wildClock(at, -1, -1));
  check('every shelter body is branded wild', bodies.every((b) => b.wild === true && isWildId(b.id)));
}

// THE PROPERTY THAT MAKES THE RETURN HONEST RATHER THAN A PAINT-SIDE FADE:
// a returning fish shelters you from exactly where it is drawn, and where it
// is drawn is a long way out at the start.
//
// Measured two ways, because the obvious one — "shelter at a fixed spot rises
// monotonically" — is FALSE and it is worth saying why: the schools keep
// drifting through the whole six seconds (up to ~65 cu/s each), so shelter at
// any one coordinate is the sum of an inward march and a wander. The property
// that IS true, and is the one the fix rests on, is per fish: its distance from
// where it would have been with no bolt at all only ever shrinks.
{
  const sweep = 6_000_000;

  // 1. On the frame the shark strikes, the sea's BEST wild cover is under the
  //    survival line — checked against every fish's own home position, i.e.
  //    the 36 coordinates most likely to have some. Not zero: a fish bolting
  //    839 cu out of one school can land inside another school's home water by
  //    accident, and the run below measures exactly one pair's worth (100)
  //    doing it. What matters is that it is nowhere near SHELTER_THRESHOLD
  //    (300), against a full school's 600 once everyone is home.
  const atSweep = wildClock(sweep, -1, sweep);
  const homeAtSweep = wildShelterBodies(SEED, sweep, wildClock(sweep, -1, -1));
  const outAtSweep = wildShelterBodies(SEED, sweep, atSweep);
  let worst = 0;
  for (const h of homeAtSweep) {
    worst = Math.max(worst, shelterOf({ id: 'me', x: h.x, y: h.y, size: 100 }, outAtSweep));
  }
  check('at the resolve tick nowhere in the sea has wild cover worth having',
    worst < SHELTER_THRESHOLD, worst);
  // ...and the SAME measure on the same tick, with the shoal home, clears the
  // line comfortably — so the check above is a statement about the bolt and
  // not about this seed's geometry being sparse.
  let homeBest = 0;
  for (const h of homeAtSweep) {
    homeBest = Math.max(homeBest, shelterOf({ id: 'me', x: h.x, y: h.y, size: 100 }, homeAtSweep));
  }
  check('...where the same water with the shoal home is above it', homeBest >= SHELTER_THRESHOLD, homeBest);

  // 2. Every fish's displacement from home shrinks to zero.
  //
  // Positions land on the QUANT (8 cu) lattice on both axes, so two sampled
  // displacements can differ by up to 2*sqrt(2)*QUANT ~= 23 cu purely from
  // rounding. Fine sampling is therefore checked with that tolerance, and the
  // real claim — a strict, large decrease — is checked on quarters of the
  // return, where the change is hundreds of cu and the lattice is noise.
  const dispAt = (s: number): number[] => {
    const t = sweep + s;
    const back = wildShelterBodies(SEED, t, wildClock(t, -1, sweep));
    const home = wildShelterBodies(SEED, t, wildClock(t, -1, -1));
    return back.map((b, i) => Math.hypot(b.x - home[i].x, b.y - home[i].y));
  };
  let monotonic = true;
  let prev: number[] | null = null;
  for (let s = 0; s <= WILD_RETURN_MS; s += 200) {
    const d = dispAt(s);
    if (prev !== null && d.some((v, i) => v > prev![i] + 2 * Math.SQRT2 * 8)) monotonic = false;
    prev = d;
  }
  check('no returning fish ever moves back outward', monotonic);
  const q0 = dispAt(0);
  const q1 = dispAt(WILD_RETURN_MS * 0.25);
  const q2 = dispAt(WILD_RETURN_MS * 0.5);
  const q3 = dispAt(WILD_RETURN_MS * 0.75);
  const q4 = dispAt(WILD_RETURN_MS);
  check('...and every one of them is strictly closer each quarter of the way',
    q0.every((v, i) => v > q1[i] && q1[i] > q2[i] && q2[i] > q3[i] && q3[i] > q4[i]));
  check('...starting outside two shelter radii', Math.min(...q0) > 2 * SHELTER_R, Math.round(Math.min(...q0)));
  check('...and finishing exactly home', Math.max(...q4) === 0, Math.max(...q4));

  // 3. By the end of the return the shoal is real cover again.
  const home = wildShelterBodies(SEED, sweep + WILD_RETURN_MS, wildClock(sweep + WILD_RETURN_MS, -1, sweep));
  let best = 0;
  for (const h of home) {
    best = Math.max(best, shelterOf({ id: 'me', x: h.x, y: h.y, size: 100 }, home));
  }
  check('by the end of the return the shoal is cover again', best >= SHELTER_THRESHOLD, best);
}

// ---------------------------------------------------------------------------
// 4. The display half: interpolation, presence, facing.
// ---------------------------------------------------------------------------

// Motion is interpolated between the fold ticks either side, never invented.
// Hand-derived: at exactly the tick boundary the view must equal wildAt's own
// integer coordinates; at the halfway point it must be the midpoint of the two.
{
  const tick = 20_000;
  const t0 = tick * TICK_MS;
  const a = wildAt(SEED, tick, -1, 0);
  const b = wildAt(SEED, tick + 1, -1, 0);
  const onTick = wildViewAt(SEED, t0, wildClock(t0, -1, -1), null);
  const half = wildViewAt(SEED, t0 + TICK_MS / 2, wildClock(t0 + TICK_MS / 2, -1, -1), null);
  let exact = true;
  let midpoint = true;
  for (let i = 0; i < WILD_COUNT; i++) {
    if (onTick[i].x !== a[i].x || onTick[i].y !== a[i].y) exact = false;
    if (!near(half[i].x, (a[i].x + b[i].x) / 2, 1e-9)) midpoint = false;
    if (!near(half[i].y, (a[i].y + b[i].y) / 2, 1e-9)) midpoint = false;
  }
  check('on a tick boundary the view is the fold tick exactly', exact);
  check('halfway between two ticks it is the midpoint of the two', midpoint);
  // ...and the interpolation is actually doing something: at least one fish
  // has to have moved between the two ticks, or the check above is vacuous.
  check('the two ticks are genuinely different frames',
    a.some((f, i) => f.x !== b[i].x || f.y !== b[i].y));
}

// Order and identity are the fixed order `wildAt` promises.
{
  const at = 7_000_000;
  const v = wildViewAt(SEED, at, wildClock(at, -1, -1), null);
  const w = wildAt(SEED, Math.floor(at / TICK_MS), -1, 0);
  check('the view keeps wildAt\'s own order and ids',
    v.length === w.length && v.every((f, i) => f.id === w[i].id && f.size === w[i].size));
}

// Presence: 1 in calm water, and ramped over the first WILD_RETURN_FADE of a
// return. Hand-derived from smoothstep(0, 0.35, x): at x = 0 it is 0, at
// x = 0.175 (half of 0.35) it is 0.5, at x >= 0.35 it is 1.
{
  const at = 7_000_000;
  check('a calm shoal is fully present',
    wildViewAt(SEED, at, wildClock(at, -1, -1), null).every((f) => f.presence === 1));
  const sweep = 7_000_000;
  const p = (frac: number) => {
    const t = sweep + frac * WILD_RETURN_MS;
    return wildViewAt(SEED, t, wildClock(t, -1, sweep), null)[0].presence;
  };
  check('the return starts from nothing', near(p(0), 0, 1e-9), p(0));
  check('...is half-there at half the fade', near(p(WILD_RETURN_FADE / 2), 0.5, 1e-9), p(WILD_RETURN_FADE / 2));
  check('...and is fully present once the fade is done', p(WILD_RETURN_FADE) === 1, p(WILD_RETURN_FADE));
  check('...and stays that way', p(0.9) === 1);
}

// angleDelta: the shortest way round, including across the wrap.
{
  const eps = 1e-12;
  check('angleDelta of two equal angles is zero', angleDelta(1.2, 1.2) === 0);
  check('angleDelta takes the short way across the wrap',
    near(angleDelta(0.1, Math.PI * 2 - 0.1), -0.2, 1e-9), angleDelta(0.1, Math.PI * 2 - 0.1));
  check('angleDelta the other way across the wrap',
    near(angleDelta(Math.PI * 2 - 0.1, 0.1), 0.2, 1e-9));
  check('angleDelta never exceeds a half turn',
    Math.abs(angleDelta(0, Math.PI - eps)) <= Math.PI
    && Math.abs(angleDelta(0, Math.PI + 1)) <= Math.PI);
}

// shyness: zero at and beyond the radius, WILD_SHY_TURN on top, smooth.
// Hand-derived from smoothstep: at half the radius the smoothstep is
// 0.5^2 * (3 - 2*0.5) = 0.25 * 2 = 0.5, so shyness is WILD_SHY_TURN * 0.5.
{
  check('a fish right on top of you turns away hardest', shyness(0) === WILD_SHY_TURN);
  check('a fish at the shy radius does not turn at all', shyness(WILD_SHY_R) === 0);
  check('a fish beyond it does not either', shyness(WILD_SHY_R * 3) === 0);
  check('at half the radius it turns half as hard',
    near(shyness(WILD_SHY_R / 2), WILD_SHY_TURN * 0.5, 1e-12), shyness(WILD_SHY_R / 2));
}

// THE ONE PROPERTY THE WHOLE HEADING LICENCE RESTS ON: a player changes
// facing and NOTHING else. Positions, ids and sizes must be bit-identical
// with and without a player standing in the middle of the shoal.
{
  const at = 8_000_000;
  const c = wildClock(at, -1, -1);
  const none = wildViewAt(SEED, at, c, null);
  // Stand exactly on top of one of them, which is the most provocative
  // arrangement available.
  const on = wildViewAt(SEED, at, c, { x: none[0].x, y: none[0].y });
  const samePlaces = none.every((f, i) => f.x === on[i].x && f.y === on[i].y
    && f.id === on[i].id && f.size === on[i].size && f.presence === on[i].presence);
  check('a nearby player moves no wild fish at all', samePlaces);
  const anyTurned = none.some((f, i) => f.facing !== on[i].facing);
  check('...but it does turn the ones close enough to notice', anyTurned);
  // ...and only those. A fish beyond WILD_SHY_R of the player is untouched.
  let farUntouched = true;
  for (let i = 0; i < none.length; i++) {
    const d = Math.hypot(none[i].x - none[0].x, none[i].y - none[0].y);
    if (d >= WILD_SHY_R && none[i].facing !== on[i].facing) farUntouched = false;
  }
  check('a fish outside the shy radius is not turned', farUntouched);
}

// The turn is genuinely AWAY: standing next to a fish must not leave it
// pointing more toward you than it was.
{
  const at = 8_000_000;
  const c = wildClock(at, -1, -1);
  const none = wildViewAt(SEED, at, c, null);
  const target = none[0];
  // Stand 40 cu to the fish's west, so "away" is due east (angle 0).
  const player = { x: target.x - 40, y: target.y };
  const on = wildViewAt(SEED, at, c, player);
  const awayAngle = Math.atan2(0, 40); // 0 rad: due east, away from the player
  const before = Math.abs(angleDelta(target.facing, awayAngle));
  const after = Math.abs(angleDelta(on[0].facing, awayAngle));
  check('a fish you stand beside turns toward pointing away from you',
    after < before || before < 1e-9, { before, after });
  // Hand-derived magnitude: at 40 cu, w = shyness(40), and the turn is
  // exactly w of the way round the short arc.
  const w = shyness(40);
  check('...by exactly its shyness fraction of the short arc',
    near(on[0].facing, target.facing + angleDelta(target.facing, awayAngle) * w, 1e-9));
}

// A fleeing fish is not shy: it is already running, and a second rule pulling
// on its heading would fight the outward ray the bolt is made of.
{
  const hush = 9_000_000;
  const at = hush + 900;
  const c = wildClock(at, hush, -1);
  const none = wildViewAt(SEED, at, c, null);
  const on = wildViewAt(SEED, at, c, { x: none[0].x, y: none[0].y });
  check('a bolting fish ignores the player entirely',
    none.every((f, i) => f.facing === on[i].facing));
}

// A returning fish faces the way it is travelling: back inward, which is a
// half turn from the outward ray it left along.
{
  const sweep = 9_000_000;
  const at = sweep + 500;
  const c = wildClock(at, -1, sweep);
  const view = wildViewAt(SEED, at, c, null);
  const raw = wildAt(SEED, Math.floor(at / TICK_MS), c.hushStartMs, c.nowMs);
  const flipped = view.every((f, i) =>
    near(Math.abs(angleDelta(f.facing, (raw[i].heading / 256) * Math.PI * 2)), Math.PI, 1e-9));
  check('a returning fish points the opposite way down its own escape ray', flipped);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
