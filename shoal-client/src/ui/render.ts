/**
 * The projection — the geometry half of rendering, with no paint in it.
 *
 * DISPLAY SIDE. Floats are used freely and deliberately: this module only
 * decides where things land on a window, and nothing here ever feeds
 * `foldShoal`/`foldTick`. It holds no canvas, imports nothing from the DOM,
 * and — like everything under `src/lib/` and unlike the rest of `src/ui/` —
 * reads no clock: every function is pure in its arguments, which is what
 * makes the whole file testable in node with no browser at all.
 *
 * The split this file exists to make: PROJECTION here, PAINT in `seaPaint.ts`.
 * The projection is where a rendering bug can silently disagree with
 * consensus — put a swimmer somewhere the fold did not — so it is pure and
 * pinned by hand-derived tests. The paint is where a rendering bug looks bad,
 * which is judged by looking at it.
 *
 * =============================================================================
 * WHY THE DISPLAY MUST NEVER RE-DERIVE A POSITION
 * =============================================================================
 *
 * `reckon` (src/lib/fixed.ts) is the single definition of where a swim vector
 * has got to at a given instant. The fold uses it to place every fish, the
 * sweep judges exposure against the positions it produced, and every client
 * computes bit-identical answers from it. A display that computed its own
 * "close enough" position would disagree with the sweep about who was
 * exposed, and the player would watch the shark take a fish that was, on
 * their screen, safely in the middle of the crowd. That is the single most
 * trust-destroying bug this game can have (sweep.ts's own header).
 *
 * So `reckonSmooth` below does NOT reimplement dead reckoning. It calls
 * `reckon` twice — on the two consecutive engine ticks that bracket the
 * display time — and linearly interpolates between those two answers. Stated
 * plainly, because it is the one liberty taken:
 *
 *   THE INTERPOLATION IS SUB-TICK SMOOTHNESS THE ENGINE CANNOT GIVE, LAID ON
 *   TOP OF `reckon`'s ANSWER. It never changes what `reckon` says. On a tick
 *   it returns `reckon`'s value exactly; between ticks it stays strictly
 *   inside the segment joining two of `reckon`'s values. It cannot drift,
 *   because both endpoints are recomputed from the vector every frame rather
 *   than accumulated.
 *
 * The engine answers only on the 250 ms tick grid and quantizes every answer
 * to an 8 cu lattice (`QUANT`), so a display that only asked on ticks would
 * step in visible 8 cu jerks four times a second. Interpolating removes the
 * stepping without moving the fish anywhere the fold does not agree it is.
 */
import { reckon } from '../lib/fixed';
import { START_SIZE, TICK_MS } from '../lib/shoalConst';
import type { Vec } from '../lib/shoalTypes';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The drawing surface, in CSS pixels. */
export interface Viewport {
  w: number;
  h: number;
}

/**
 * Where the window is looking. `x`/`y` are a point in world centi-units that
 * paints at the middle of the viewport; `scale` is pixels per centi-unit.
 */
export interface Camera {
  x: number;
  y: number;
  scale: number;
}

export interface Point {
  x: number;
  y: number;
}

/** The minimum a thing needs for the projection to place and cull it. */
export interface Placed {
  x: number;
  y: number;
  size: number;
}

// ---------------------------------------------------------------------------
// Constants — all POLICY. Nothing here is consensus; two clients running
// different values see the same sea from different distances and still agree
// on every position, every exposure and every sweep.
// ---------------------------------------------------------------------------

/**
 * How much sea a window shows, in centi-units. The world is 4096 x 3072 cu,
 * so this frames a bit over half its width: far enough out that the shoal
 * reads as a shoal and the dark reads as big, close enough that a single fish
 * is a creature rather than a dot. Spec 2.1 — "a small fish in a big dark
 * sea" — is a statement about this ratio more than about anything else on
 * screen.
 */
export const VIEW_SPAN_W = 2400;
export const VIEW_SPAN_H = 1600;

/**
 * How far from the middle of the window the followed swimmer may drift,
 * as a fraction of the window's TIGHTER axis.
 *
 * Pinning it to the tighter axis rather than to each axis separately keeps
 * the band circular-ish on any window shape; pinning it to the window rather
 * than to a pixel count keeps it honest on a small laptop screen and a large
 * monitor alike.
 */
export const CAMERA_BAND = 0.18;

/** Default per-frame easing fraction for `followCamera`. */
export const CAMERA_EASE = 0.12;

/** Body radius in cu at `START_SIZE`. */
export const BODY_R0 = 28;

/**
 * How hard size shows on the body: radius = BODY_R0 * (size/START_SIZE)^exp.
 *
 * Spec 2.8 makes size the scoreboard, so this number is a legibility
 * decision, not a taste one. At 1.0 (radius linear in size) a well-fed
 * veteran becomes a whale that fills the window and the area gap reads as
 * absurd; at 0.5 (area linear in size) the whole realistic range — roughly 60
 * to 400 — spans a radius ratio of only 2.6x and two neighbouring sizes are
 * indistinguishable at a glance. 0.8 keeps the game's actually-observed
 * spread readable: the harness's own smallest and largest, 60 and 112, differ
 * by 65% in radius, which is unmistakable, while 60 to 400 spans 4.6x rather
 * than 6.7x.
 */
export const BODY_R_EXP = 0.8;

/**
 * Nose-to-tail half-length as a multiple of body radius. A fish is drawn
 * longer than it is round, and culling has to measure with the long axis or a
 * swimmer's tail vanishes before its body leaves the window.
 */
export const BODY_EXTENT = 2.4;

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

/**
 * Pixels per centi-unit for a given window: the scale at which the window
 * shows at least VIEW_SPAN_W x VIEW_SPAN_H of sea on its binding axis.
 *
 * `max`, not `min`: with `min` a wide-and-short window would zoom out until
 * the full vertical span fitted, leaving huge dead bands of sea nobody is
 * looking at. `max` keeps the framing tight on whichever axis is scarce.
 */
export function fitScale(view: Viewport): number {
  return Math.max(view.w / VIEW_SPAN_W, view.h / VIEW_SPAN_H);
}

/** How far the followed swimmer may sit from the window's centre, in px. */
export function bandPx(view: Viewport): number {
  return CAMERA_BAND * Math.min(view.w, view.h);
}

/** World centi-units to window pixels. */
export function worldToScreen(cam: Camera, view: Viewport, wx: number, wy: number): Point {
  return {
    x: view.w / 2 + (wx - cam.x) * cam.scale,
    y: view.h / 2 + (wy - cam.y) * cam.scale,
  };
}

/** Window pixels back to world centi-units. The exact inverse of the above. */
export function screenToWorld(cam: Camera, view: Viewport, sx: number, sy: number): Point {
  return {
    x: cam.x + (sx - view.w / 2) / cam.scale,
    y: cam.y + (sy - view.h / 2) / cam.scale,
  };
}

/**
 * Is a world point inside the window, allowing `marginPx` of slack on every
 * side? Inclusive on the boundary: a thing exactly on the edge is on screen.
 */
export function isVisible(
  cam: Camera, view: Viewport, wx: number, wy: number, marginPx: number,
): boolean {
  const s = worldToScreen(cam, view, wx, wy);
  return s.x >= -marginPx && s.x <= view.w + marginPx
    && s.y >= -marginPx && s.y <= view.h + marginPx;
}

/**
 * Cull a list of placed things to those the window can actually show, each
 * judged by its OWN drawn extent rather than as a bare point — otherwise a
 * large swimmer crossing the edge disappears while half its body is still
 * inside the frame. Input order is preserved; the input is never mutated.
 */
export function cullBodies<T extends Placed>(
  cam: Camera, view: Viewport, bodies: readonly T[],
): T[] {
  return bodies.filter((b) => isVisible(cam, view, b.x, b.y, bodyExtentCu(b.size) * cam.scale));
}

// ---------------------------------------------------------------------------
// Size on the body
// ---------------------------------------------------------------------------

/** Drawn body radius in world centi-units. See BODY_R_EXP for the shape. */
export function bodyRadiusCu(size: number): number {
  const s = size > 1 ? size : 1;
  return BODY_R0 * Math.pow(s / START_SIZE, BODY_R_EXP);
}

/** Drawn nose-to-tail half-length in world centi-units. */
export function bodyExtentCu(size: number): number {
  return bodyRadiusCu(size) * BODY_EXTENT;
}

// ---------------------------------------------------------------------------
// The camera
// ---------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Advance a camera one frame towards the swimmer it is following.
 *
 * Two rules, in this order, and both are load-bearing:
 *
 *  1. EASE. The camera moves a fraction `alpha` of the way to the target, so
 *     ordinary swimming reads as the water sliding past rather than as the
 *     window being dragged. An ease alone is asymptotic — it has no bound at
 *     all on how far behind it may fall while the target is moving.
 *  2. LEASH. The result is then clamped so the target cannot paint further
 *     than `bandPx(view)` from the window's centre on either axis. This is
 *     what turns "the camera tends to follow" into a property that holds
 *     after EVERY call, including the frame after a scatter flings the player
 *     across the sea. Without it the player can be off screen, which for a
 *     game whose entire subject is where you are relative to everyone else is
 *     not a cosmetic failure.
 *
 * `scale` is re-fitted from `view` rather than carried from `prev`, so a
 * window resize cannot leave a camera projecting at a stale scale — every
 * position on screen would be wrong by the ratio of the two windows until
 * something else happened to rebuild it.
 */
export function followCamera(
  prev: Camera, targetX: number, targetY: number, view: Viewport, alpha: number = CAMERA_EASE,
): Camera {
  const scale = fitScale(view);
  const bandCu = bandPx(view) / scale;
  const easedX = prev.x + (targetX - prev.x) * alpha;
  const easedY = prev.y + (targetY - prev.y) * alpha;
  return {
    x: clamp(easedX, targetX - bandCu, targetX + bandCu),
    y: clamp(easedY, targetY - bandCu, targetY + bandCu),
    scale,
  };
}

// ---------------------------------------------------------------------------
// Dead reckoning at display time
// ---------------------------------------------------------------------------

/**
 * Where a swim vector has got to at `atMs`, smooth between engine ticks.
 *
 * See this module's header for why this delegates to `reckon` instead of
 * re-deriving the motion. In one sentence: on a tick it IS `reckon`'s answer,
 * and between two ticks it is a point on the straight segment joining
 * `reckon`'s answers at those two ticks.
 *
 * The tick grid is absolute (epoch.ts: an epoch starts at a multiple of
 * EPOCH_MS, and TICK_MS divides EPOCH_MS exactly), so the tick bracketing any
 * instant is just `floor(atMs / TICK_MS) * TICK_MS` — no epoch, no state and
 * no history is needed to find it, which is why this stays a pure function of
 * the vector and the time.
 *
 * `Math.floor`, not `Math.trunc`: negative timestamps are not reachable in
 * play but truncation would round the wrong way across zero and put the
 * bracket on the far side of the instant.
 */
export function reckonSmooth(vec: Vec, atMs: number): Point {
  const t0 = Math.floor(atMs / TICK_MS) * TICK_MS;
  const a = reckon(vec, t0);
  const f = (atMs - t0) / TICK_MS;
  if (f === 0) return { x: a.x, y: a.y };
  const b = reckon(vec, t0 + TICK_MS);
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

/**
 * The direction a swimmer is actually travelling, in radians, for drawing.
 *
 * Headings are stored in brads (256 to the turn) and this is the only place
 * that conversion is needed — the engine never works in radians and must not
 * start. A stationary swimmer keeps its last heading rather than snapping to
 * zero, which is what `vec.heading` already holds.
 */
export function headingRad(vec: Vec): number {
  return (vec.heading * Math.PI * 2) / 256;
}
