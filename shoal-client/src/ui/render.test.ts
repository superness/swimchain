/**
 * The projection — world to screen, the camera, culling, and where a swimmer
 * is at a display time BETWEEN engine ticks. Run: npx tsx src/ui/render.test.ts
 *
 * WHAT IS TESTED HERE AND WHAT IS NOT. This file covers `render.ts`, which is
 * pure geometry: it holds no canvas, reads no clock and draws nothing. The
 * PAINT — `seaPaint.ts`, the water, the light shafts, the bodies — is
 * deliberately untested, because the only test one could write for it is "the
 * context was called", which proves nothing about what a player sees. That
 * half is verified by screenshot (shoal-client/docs/), per the plan's own
 * note: "a test that mocks a rendering context and asserts it was called
 * proves nothing."
 *
 * Every expected value below is derived by hand in a comment from the
 * CONSENSUS constants and the module's own stated constants, or — for the
 * agreement section — lifted VERBATIM from `npm run harness`'s printed table,
 * an instrument that has never seen render.ts. Nothing is read back off the
 * function under test.
 *
 * DISPLAY SIDE. Floats are fine here (`src/ui/` is display, not consensus);
 * the numbers that must be integers are the ones `reckon` returns, and this
 * file checks that they still are.
 */
import {
  VIEW_SPAN_W, VIEW_SPAN_H, CAMERA_BAND, BODY_R0, BODY_R_EXP, BODY_EXTENT,
  fitScale, bandPx, worldToScreen, screenToWorld, isVisible, cullBodies,
  followCamera, bodyRadiusCu, bodyExtentCu, reckonSmooth,
  type Camera, type Viewport,
} from './render';
import { reckon } from '../lib/fixed';
import { QUANT, START_SIZE, TICK_MS } from '../lib/shoalConst';
import { createLoop, advance } from '../lib/shoalLoop';
import { bodiesOf } from '../lib/shoalEngine';
import { richSession } from '../lib/shoalFixtures';
import { epochEndMs } from '../lib/epoch';
import type { LogEntry, Vec } from '../lib/shoalTypes';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

// The reference viewport used throughout, chosen so every hand-derivation
// below is exact rather than approximate:
//   fitScale = max(1200/VIEW_SPAN_W, 800/VIEW_SPAN_H) = max(1200/2400, 800/1600)
//            = max(0.5, 0.5) = 0.5 px per cu.
const VIEW: Viewport = { w: 1200, h: 800 };
const CAM: Camera = { x: 2000, y: 1500, scale: 0.5 };

// ===========================================================================
// 1. The projection
// ===========================================================================

check('the module spans a sea wider than it is tall', VIEW_SPAN_W > VIEW_SPAN_H,
  { VIEW_SPAN_W, VIEW_SPAN_H });

// By hand: max(1200/2400, 800/1600) = 0.5.
check('fitScale fills the tighter axis', fitScale(VIEW) === 0.5, fitScale(VIEW));
// A window twice as wide but the same height: max(2400/2400, 800/1600) = 1.
check('fitScale grows with the binding axis', fitScale({ w: 2400, h: 800 }) === 1,
  fitScale({ w: 2400, h: 800 }));

// The camera's own world position lands on the middle of the window.
{
  const s = worldToScreen(CAM, VIEW, CAM.x, CAM.y);
  check('the camera centre paints at the window centre', s.x === 600 && s.y === 400, s);
}
// By hand: 600 + (2400-2000)*0.5 = 800; 400 + (1500-1500)*0.5 = 400.
{
  const s = worldToScreen(CAM, VIEW, 2400, 1500);
  check('worldToScreen offsets by scale', s.x === 800 && s.y === 400, s);
}
// By hand: 600 + (1200-2000)*0.5 = 200; 400 + (300-1500)*0.5 = -200.
{
  const s = worldToScreen(CAM, VIEW, 1200, 300);
  check('worldToScreen goes negative off the top-left', s.x === 200 && s.y === -200, s);
}
// By hand: 2000 + (800-600)/0.5 = 2400; 1500 + (400-400)/0.5 = 1500.
{
  const w = screenToWorld(CAM, VIEW, 800, 400);
  check('screenToWorld is the stated inverse', w.x === 2400 && w.y === 1500, w);
}
// By hand: 2000 - 600/0.5 = 800; 1500 - 400/0.5 = 700.
{
  const w = screenToWorld(CAM, VIEW, 0, 0);
  check('screenToWorld reads the top-left corner', w.x === 800 && w.y === 700, w);
}

// Invertible to well under a pixel, everywhere inside the viewport, at every
// scale a window resize can produce. The bound is stated in PIXELS — a
// round-trip error of `e` cu shows on screen as `e * scale` px — because "the
// same point" for a renderer means "the same pixel".
{
  let worstPx = 0;
  for (const scale of [0.25, 0.5, 1, 2.5]) {
    const cam: Camera = { x: 1234.5, y: 987.25, scale };
    for (let i = 0; i <= 10; i++) {
      for (let j = 0; j <= 10; j++) {
        const sx = (VIEW.w * i) / 10;
        const sy = (VIEW.h * j) / 10;
        const w = screenToWorld(cam, VIEW, sx, sy);
        const back = worldToScreen(cam, VIEW, w.x, w.y);
        worstPx = Math.max(worstPx, Math.abs(back.x - sx), Math.abs(back.y - sy));
      }
    }
  }
  check('screen -> world -> screen is invertible well inside one pixel', worstPx < 1e-6, { worstPx });
}
// And the other way round: world -> screen -> world, measured in cu but
// judged in px so the claim is scale-independent.
{
  let worstPx = 0;
  for (const scale of [0.25, 0.5, 1, 2.5]) {
    const cam: Camera = { x: 1234.5, y: 987.25, scale };
    for (let i = 0; i <= 10; i++) {
      for (let j = 0; j <= 10; j++) {
        // Points chosen to lie inside the viewport at this scale.
        const wx = cam.x + (i - 5) * (VIEW.w / 10 / scale) * 0.1;
        const wy = cam.y + (j - 5) * (VIEW.h / 10 / scale) * 0.1;
        const s = worldToScreen(cam, VIEW, wx, wy);
        const back = screenToWorld(cam, VIEW, s.x, s.y);
        worstPx = Math.max(worstPx, Math.abs(back.x - wx) * scale, Math.abs(back.y - wy) * scale);
      }
    }
  }
  check('world -> screen -> world is invertible well inside one pixel', worstPx < 1e-6, { worstPx });
}

// ===========================================================================
// 2. Culling
// ===========================================================================

check('a swimmer at the camera centre is on screen', isVisible(CAM, VIEW, 2000, 1500, 0));

// The right edge, by hand. screen x = 600 + (wx - 2000)*0.5, so screen x is
// exactly the window width 1200 at wx = 2000 + (1200-600)/0.5 = 3200, and is
// 1202 at wx = 3204. With no margin the first is on screen and the second is
// not — the boundary is checked from both sides so an off-by-one in the
// comparison cannot pass.
check('a point exactly on the right edge is not culled', isVisible(CAM, VIEW, 3200, 1500, 0));
check('a point two pixels past the right edge is culled', !isVisible(CAM, VIEW, 3204, 1500, 0));
// Same on the near edges: screen x = 0 at wx = 2000 - 600/0.5 = 800.
check('a point exactly on the left edge is not culled', isVisible(CAM, VIEW, 800, 1500, 0));
check('a point two pixels past the left edge is culled', !isVisible(CAM, VIEW, 796, 1500, 0));
// screen y = 0 at wy = 1500 - 400/0.5 = 700; screen y = 800 at wy = 1500 + 800 = 2300.
check('a point above the top edge is culled', !isVisible(CAM, VIEW, 2000, 696, 0));
check('a point below the bottom edge is culled', !isVisible(CAM, VIEW, 2000, 2304, 0));
// A generous margin brings a far-off point back in: screen x 1202 is inside
// 1200 + 100.
check('a margin widens what counts as on screen', isVisible(CAM, VIEW, 3204, 1500, 100));

// A body is culled by its OWN extent, not as a bare point, or a big fish
// straddling the edge would pop out of existence while half of it is still
// visible. By hand, for size 100: bodyRadiusCu = BODY_R0 * (100/100)^0.8 = 34,
// bodyExtentCu = 34 * BODY_EXTENT. With BODY_EXTENT = 2.4 that is 81.6 cu, i.e.
// 40.8 px at scale 0.5. A fish centred at wx = 3204 paints its centre at
// screen 1202, two px past the edge, and is KEPT because 1202 <= 1200 + 40.8.
// A fish centred at wx = 3600 paints at 1400, far past 1240.8, and goes.
{
  const bodies = [
    { id: 'near', x: 3204, y: 1500, size: START_SIZE },
    { id: 'far', x: 3600, y: 1500, size: START_SIZE },
    { id: 'home', x: 2000, y: 1500, size: START_SIZE },
  ];
  const kept = cullBodies(CAM, VIEW, bodies).map((b) => b.id);
  check('a body straddling the edge is kept, one past it is not',
    kept.length === 2 && kept[0] === 'near' && kept[1] === 'home', kept);
}
// The margin is the body's own, so a bigger fish survives further out. By
// hand: size 400 -> radius 34 * 4^0.8 = 34 * 3.0314 = 103.07 cu, extent
// 247.4 cu = 123.7 px at scale 0.5. Centred at wx = 3600 it paints at screen
// 1400, which is inside 1200 + 123.7 = 1323.7? No — 1400 > 1323.7, so it is
// still culled; at wx = 3400 it paints at 1300, which IS inside 1323.7 while
// a size-100 fish there (margin 40.8, limit 1240.8) is not.
{
  const at3400 = (size: number) => cullBodies(CAM, VIEW, [{ id: 'x', x: 3400, y: 1500, size }]).length;
  check('a larger body is culled later than a small one at the same place',
    at3400(400) === 1 && at3400(START_SIZE) === 0, { big: at3400(400), small: at3400(START_SIZE) });
}
check('cullBodies keeps everything when everything is on screen',
  cullBodies(CAM, VIEW, [{ id: 'a', x: 2000, y: 1500, size: 100 }, { id: 'b', x: 2100, y: 1600, size: 100 }]).length === 2);

// ===========================================================================
// 3. Dead reckoning at a display time between ticks
//
// The engine only ever answers on the tick grid (TICK_MS = 250), and it
// quantizes every answer to QUANT = 8. A display that only ever asked on
// ticks would move in 8-cu jumps four times a second. `reckonSmooth`
// interpolates BETWEEN two of `reckon`'s own answers — it never re-derives
// one — so it agrees with the fold exactly on every tick and never leaves the
// segment the fold drew.
// ===========================================================================

// The worked vector. speed 100 cu/s, heading 0 (+x), authored at t = 1_000_000.
//   reckon's rule: dx = trunc(speed * COS[h] * dtMs / (TRIG_SCALE * 1000)),
//   and COS[0] = TRIG_SCALE, so dx = trunc(100 * dtMs / 1000) = trunc(dtMs/10).
// At the tick t0 = 1_002_000: dtMs = 2000 -> dx = 200 -> x = 1200; quantize
// leaves 1200 (1200 = 150 * 8). y is unmoved at 1000 = 125 * 8.
// At the next tick t1 = 1_002_250: dtMs = 2250 -> dx = 225 -> x = 1225;
// quantize floors to 1224 (153 * 8). y still 1000.
const V: Vec = { x: 1000, y: 1000, heading: 0, speed: 100, t: 1_000_000 };
const T0 = 1_002_000;
const T1 = T0 + TICK_MS;

check('the worked tick is on the absolute tick grid', T0 % TICK_MS === 0, { T0, TICK_MS });

{
  const a = reckonSmooth(V, T0);
  check('on a tick the display sits exactly where the engine says (hand-derived)',
    a.x === 1200 && a.y === 1000, a);
  const engine = reckon(V, T0);
  check('on a tick the display equals reckon itself', a.x === engine.x && a.y === engine.y,
    { display: a, engine });
  check('the engine answer is on the quantization grid', engine.x % QUANT === 0 && engine.y % QUANT === 0, engine);
}
{
  const b = reckonSmooth(V, T1);
  check('the next tick is the engine\'s next answer (hand-derived 1224)',
    b.x === 1224 && b.y === 1000, b);
}
// Halfway between the two ticks: 1200 + (1224 - 1200) * 0.5 = 1212 exactly.
// Note this is NOT (1200 + 1225)/2 = 1212.5 — the endpoint is reckon's
// QUANTIZED 1224, so a display that re-derived the position without going
// through reckon lands half a unit away and this check fails.
{
  const m = reckonSmooth(V, T0 + 125);
  check('halfway between ticks is halfway along the engine\'s own step (hand-derived 1212)',
    m.x === 1212 && m.y === 1000, m);
}
// A fifth of the way: 1200 + 24 * 0.2 = 1204.8.
{
  const m = reckonSmooth(V, T0 + 50);
  check('a fifth of the way is a fifth along the step (hand-derived 1204.8)',
    Math.abs(m.x - 1204.8) < 1e-9 && m.y === 1000, m);
}

// The general property, over vectors the hand cases do not cover: at any
// display time the point lies ON the segment between the two consecutive
// engine answers that bracket it, and at both ends it IS an engine answer.
// The endpoints come from `reckon` — the engine — never from `reckonSmooth`.
{
  let offSegment = 0, outOfRange = 0, endpointMismatch = 0, nonMonotone = 0;
  const vecs: Vec[] = [
    { x: 500, y: 500, heading: 0, speed: 60, t: 900_000 },
    { x: 3000, y: 2000, heading: 64, speed: 220, t: 900_000 },
    { x: 2048, y: 1536, heading: 33, speed: 137, t: 1_001_000 },
    { x: 100, y: 2900, heading: 200, speed: 220, t: 1_001_500 },
    { x: 2048, y: 1536, heading: 128, speed: 0, t: 1_000_000 },
  ];
  for (const v of vecs) {
    for (const tick of [1_001_000, 1_002_000, 1_005_000, 1_060_000]) {
      const a = reckon(v, tick);
      const b = reckon(v, tick + TICK_MS);
      const s0 = reckonSmooth(v, tick);
      if (s0.x !== a.x || s0.y !== a.y) endpointMismatch++;
      let prevAlong = -1;
      for (const off of [1, 30, 62, 125, 187, 249]) {
        const p = reckonSmooth(v, tick + off);
        // Cross product of (b-a) with (p-a) is zero iff p is on the LINE.
        const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
        if (Math.abs(cross) > 1e-6) offSegment++;
        // ...and the parameter must be in [0, 1] for it to be on the SEGMENT.
        const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
        const along = len2 === 0 ? 0 : ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len2;
        if (along < -1e-12 || along > 1 + 1e-12) outOfRange++;
        if (along < prevAlong - 1e-12) nonMonotone++;
        prevAlong = along;
      }
    }
  }
  check('every between-ticks point is on the line the engine drew', offSegment === 0, { offSegment });
  check('every between-ticks point is inside the engine\'s own step', outOfRange === 0, { outOfRange });
  check('the tick itself is exactly the engine\'s answer, for every vector', endpointMismatch === 0, { endpointMismatch });
  check('the display never slides backwards within a step', nonMonotone === 0, { nonMonotone });
}
// A vector never predicts the past, and the display inherits that.
{
  const p = reckonSmooth(V, 999_000);
  const e = reckon(V, 999_000);
  check('before its own authoring time the display holds still', p.x === e.x && p.y === e.y, { p, e });
}

// ===========================================================================
// 4. The render agrees with the fold — on the harness's own world
//
// `npm run harness` prints a scripted session tick by tick. The table below
// is COPIED VERBATIM from its "poll 1" block at t=147571500; the harness has
// never imported render.ts, so this is an independent instrument and not a
// second call to the code under test. If the projection's idea of where a
// swimmer is ever stopped matching the fold's, this is where it shows.
// ===========================================================================

{
  const EPOCH = 40;
  const BOUNDARY = epochEndMs(EPOCH); // 147_600_000
  const OFFSET = BOUNDARY - 30_000; // 147_570_000 — richSession()'s ms=0 lands here
  const X_MS = OFFSET + 25_000;
  const GONE_MS = BOUNDARY - 400_000;
  const AT = 147_571_500; // the harness's "poll 1" tick

  const log: LogEntry[] = richSession().map((e) => (e.kind === 'presence'
    ? { ...e, ms: e.ms + OFFSET, vec: { ...e.vec, t: e.vec.t + OFFSET } }
    : { ...e, ms: e.ms + OFFSET }));
  log.push({ kind: 'eat', id: 'e0', cell: 367, ms: X_MS, hash: 'e0e2' });
  log.push({
    kind: 'presence', id: 'gone', ms: GONE_MS, hash: 'g0',
    vec: { x: 576, y: 448, heading: 0, speed: 0, t: GONE_MS },
  });
  log.push({ kind: 'eat', id: 'gone', cell: 100, ms: GONE_MS, hash: 'ge0' });

  const { loop } = advance(createLoop(EPOCH, null), log, AT);
  const bodies = bodiesOf(loop.state);

  // id, x, y, size — verbatim from the harness's printed table.
  const HARNESS: Array<[string, number, number, number]> = [
    ['c1', 1984, 1472, 99], ['c2', 1984, 1472, 99], ['c3', 1984, 1472, 99],
    ['e0', 1984, 1472, 112],
    ['o0', 1088, 1968, 99], ['o1', 1280, 1168, 99], ['o2', 1488, 2368, 99],
    ['o3', 1680, 768, 99], ['o4', 2288, 576, 99], ['o5', 2480, 2176, 99],
    ['o6', 2688, 976, 99], ['o7', 2880, 1776, 99],
  ];

  check('the fold reproduces the harness population exactly',
    bodies.length === HARNESS.length && bodies.every((b, i) => b.id === HARNESS[i][0]),
    bodies.map((b) => b.id));

  let posMismatch = 0, sizeMismatch = 0;
  for (const [id, hx, hy, hsize] of HARNESS) {
    const f = loop.state.fish.get(id);
    if (!f) { posMismatch++; continue; }
    const p = reckonSmooth(f.vec, AT);
    if (p.x !== hx || p.y !== hy) posMismatch++;
    if (f.size !== hsize) sizeMismatch++;
  }
  check('the display puts every swimmer exactly where the harness printed it', posMismatch === 0, { posMismatch });
  check('the fold agrees with the harness on every size too', sizeMismatch === 0, { sizeMismatch });

  // The harness's four cluster fish sit on ONE point, and the eater is
  // meaningfully larger than everyone else — the two facts the screenshot of
  // this scenario has to be read against.
  check('the harness cluster really is stacked on a single point',
    ['c1', 'c2', 'c3', 'e0'].every((id) => {
      const f = loop.state.fish.get(id);
      return f !== undefined && f.x === 1984 && f.y === 1472;
    }));
  check('the eater is drawn larger than its neighbours',
    bodyRadiusCu(112) > bodyRadiusCu(99), { big: bodyRadiusCu(112), small: bodyRadiusCu(99) });
}

// ===========================================================================
// 5. The camera
// ===========================================================================

// By hand: CAMERA_BAND * min(1200, 800) = 0.18 * 800 = 144 px.
check('the band is a fraction of the tighter window axis', bandPx(VIEW) === CAMERA_BAND * 800, bandPx(VIEW));
check('the band is 144px on the reference window', Math.abs(bandPx(VIEW) - 144) < 1e-9, bandPx(VIEW));

// A jump the ease cannot cover in one step, worked by hand:
//   eased  = 0 + 4000*0.1 = 400 (x), 0 + 3000*0.1 = 300 (y)
//   band   = 144 px / 0.5 px-per-cu = 288 cu
//   clamp x into [4000-288, 4000+288] = [3712, 4288] -> 3712
//   clamp y into [3000-288, 3000+288] = [2712, 3288] -> 2712
{
  const cam = followCamera({ x: 0, y: 0, scale: 0.5 }, 4000, 3000, VIEW, 0.1);
  check('a far target drags the camera onto the edge of its band (hand-derived)',
    cam.x === 3712 && cam.y === 2712, cam);
  const s = worldToScreen(cam, VIEW, 4000, 3000);
  check('and the target then paints exactly one band from centre',
    Math.abs(Math.abs(s.x - VIEW.w / 2) - 144) < 1e-9 && Math.abs(Math.abs(s.y - VIEW.h / 2) - 144) < 1e-9, s);
}
// Inside the band the camera EASES rather than snapping:
//   2000 + (2100 - 2000) * 0.25 = 2025, and |2100 - 2025| = 75 <= 288, so the
//   clamp does not bind.
{
  const cam = followCamera({ x: 2000, y: 1500, scale: 0.5 }, 2100, 1500, VIEW, 0.25);
  check('a near target is followed smoothly, not snapped (hand-derived 2025)',
    cam.x === 2025 && cam.y === 1500, cam);
}
check('a camera already on its target does not move',
  (() => {
    const cam = followCamera({ x: 2000, y: 1500, scale: 0.5 }, 2000, 1500, VIEW, 0.2);
    return cam.x === 2000 && cam.y === 1500;
  })());
// A resize must not leave the camera on a stale scale, or every projection
// after it is wrong by the ratio of the two windows.
check('the camera re-fits its scale to the window it is given',
  followCamera({ x: 0, y: 0, scale: 0.5 }, 0, 0, { w: 2400, h: 800 }, 0.2).scale === 1);

// THE INVARIANT, over a long irregular walk: after EVERY call, the followed
// swimmer is inside the band, on both axes. mulberry32 is a standard small
// deterministic PRNG (the harness uses the same one) so this walk is the same
// on every machine and a failure is reproducible.
{
  let a = 20260728 >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let cam: Camera = { x: 0, y: 0, scale: fitScale(VIEW) };
  let tx = 0, ty = 0;
  let outside = 0;
  let worst = 0;
  for (let i = 0; i < 400; i++) {
    // Mostly small steps, occasionally a teleport — the case an ease alone
    // cannot hold and only the clamp can.
    if (i % 37 === 0) { tx = rand() * 4096; ty = rand() * 3072; }
    else { tx += (rand() - 0.5) * 120; ty += (rand() - 0.5) * 120; }
    cam = followCamera(cam, tx, ty, VIEW, 0.12);
    const s = worldToScreen(cam, VIEW, tx, ty);
    const dx = Math.abs(s.x - VIEW.w / 2);
    const dy = Math.abs(s.y - VIEW.h / 2);
    worst = Math.max(worst, dx, dy);
    if (dx > bandPx(VIEW) + 1e-9 || dy > bandPx(VIEW) + 1e-9) outside++;
  }
  check('the followed swimmer never leaves the band, over 400 steps and 11 teleports',
    outside === 0, { outside, worst, band: bandPx(VIEW) });
  check('and the walk actually pushed the camera to its band at least once',
    worst > bandPx(VIEW) - 1e-6, { worst, band: bandPx(VIEW) });
}

// ===========================================================================
// 6. Size is worn on the body
//
// Spec 2.8: "Size is worn on the body and is the scoreboard." The only thing
// that makes that true on screen is that radius is a strictly increasing
// function of size with enough gain to read at a glance.
// ===========================================================================

check('a start-size swimmer has the module\'s base radius', bodyRadiusCu(START_SIZE) === BODY_R0, bodyRadiusCu(START_SIZE));
{
  let monotone = true;
  let prev = -1;
  for (let size = 60; size <= 2000; size += 7) {
    const r = bodyRadiusCu(size);
    if (r <= prev) monotone = false;
    prev = r;
  }
  check('radius is strictly increasing in size', monotone);
}
// By hand: doubling size multiplies radius by 2^BODY_R_EXP = 2^0.8 = 1.7411.
{
  const ratio = bodyRadiusCu(2 * START_SIZE) / bodyRadiusCu(START_SIZE);
  check('twice the size is 2^BODY_R_EXP the radius (hand-derived 1.7411)',
    Math.abs(ratio - Math.pow(2, BODY_R_EXP)) < 1e-12 && Math.abs(ratio - 1.7411) < 1e-3, ratio);
}
// The harness's own extremes — 60 and 112 — must be tellable apart on sight.
// By hand: (112/60)^0.8 = (28/15)^0.8. ln(28/15) = 3.332205 - 2.708050 =
// 0.624155; x 0.8 = 0.499324; exp(0.499324) = exp(0.5)/exp(0.000676) =
// 1.648721 / 1.000676 = 1.64761.
{
  const ratio = bodyRadiusCu(112) / bodyRadiusCu(60);
  check('the harness\'s smallest and largest differ by half again in radius',
    ratio > 1.5 && Math.abs(ratio - 1.64761) < 1e-4, ratio);
}
check('even the smallest swimmer has a body worth drawing', bodyRadiusCu(60) > 15, bodyRadiusCu(60));
// The drawn extent is the radius times the stated nose-to-tail factor, and it
// is what culling measures with.
check('extent is the stated multiple of radius',
  Math.abs(bodyExtentCu(START_SIZE) - BODY_R0 * BODY_EXTENT) < 1e-12, bodyExtentCu(START_SIZE));
check('a fish is longer than it is round', BODY_EXTENT > 1, BODY_EXTENT);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
