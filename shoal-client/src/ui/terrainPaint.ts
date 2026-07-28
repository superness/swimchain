/**
 * The sea's named places, drawn (spec 2.13).
 *
 * DISPLAY SIDE. `terrain.ts` owns the four places' coordinates, names and
 * queries and is pure and tested; this file owns nothing but what they look
 * like, and like `seaPaint.ts` it is verified by screenshot rather than by a
 * mocked canvas.
 *
 * NO TEXT. Not a label, not a name, not a marker. A place is recognised the
 * way a place is recognised — by looking like itself — and the name exists so
 * that a player can SAY it ("kelp!"), which is spec 2.13's whole example. A
 * caption floating over the kelp would make the rally call redundant and would
 * put the first piece of chrome on a surface that has held out against it for
 * three plans.
 *
 * =============================================================================
 * SITTING *IN* THE SEA RATHER THAN ON TOP OF IT
 * =============================================================================
 *
 * A landmark drawn as flat art over a moving background reads as a sticker,
 * however good the art is. Four things stop that here, and each is doing a
 * specific job:
 *
 *  1. **Parallax, anchored to the place itself.** Each place is drawn in two
 *     layers at different depths INTO the screen (`FAR_P` behind, `NEAR_P` in
 *     front). `layerCam` implements that by moving the camera a fraction of
 *     the way, pinned to the place's own centre — so as you swim past, the
 *     near fronds sweep across the far ones and the stand has volume, while
 *     the place as a whole never drifts off the world coordinates
 *     `terrain.ts` says it occupies. Standing at a place's centre the two
 *     layers coincide exactly, which is the only anchoring that keeps a
 *     parallaxed landmark honest about where it is.
 *  2. **Occlusion.** The near layer is drawn AFTER the swimmers (see
 *     `paintFrame`'s order). Fish pass behind the front rank of kelp and
 *     behind the wreck's mast. Nothing else in this game occludes a fish, so
 *     it is an unusually strong depth cue and worth the second pass.
 *  3. **The same palette, at the same depth.** Every colour is mixed against
 *     `waterAt(y)` — the exact depth ramp `paintWater` builds its gradient
 *     from — so a landmark near the surface is bluer and paler than one in the
 *     deep, without a single hand-picked colour per place. The far layer gets
 *     an extra wash of that same water over it: atmospheric perspective, which
 *     is what makes distance read as distance rather than as opacity.
 *  4. **The rest of the frame runs over the top.** Motes drift in front of the
 *     far layer, light shafts fall across everything, and the murk, the grain
 *     and the vignette are drawn after both layers. A place is subject to the
 *     same weather the water is.
 *
 * =============================================================================
 * WHY EVERY PLACE HAS ITS OWN ROCK UNDER IT
 * =============================================================================
 *
 * The sea is drawn in ELEVATION, not in plan: `paintWater` runs its gradient
 * down the world's y axis from a surface above y=0 to the abyss below
 * WORLD_H, `paintShafts` drops light from y=-700, and a swimmer is drawn
 * side-on with its dorsal up. So world y is DEPTH.
 *
 * `terrain.ts` chose its four coordinates by plan-view quadrant ("NW", "NE",
 * "SE"), which reads differently under that projection: the Kelp Stand at
 * y=900 and the Wreck at y=750 are in the upper third of the water column, not
 * on the seabed. That is a real discrepancy between the two modules'
 * assumptions and it is recorded rather than papered over.
 *
 * Rather than move four coordinates that `terrain.test.ts` pins by hand, every
 * place is drawn standing on its OWN outcrop — a rock mass filling the lower
 * part of its own extent and fading into the murk below it. A kelp stand on a
 * shallow pinnacle and a wreck caught on a ledge are both ordinary things; a
 * kelp stand hanging in open water is not. The Drop-off and the Shelf, which
 * genuinely are deep, get the same treatment and lose nothing by it.
 */
import { PLACES, type Place } from './terrain';
import { isVisible, worldToScreen, type Camera, type Viewport } from './render';
import { rgba, span, unit, waterAt } from './paintKit';

/** What the terrain paint needs from the frame. `seaPaint.Frame` satisfies it. */
export interface TerrainFrame {
  view: Viewport;
  cam: Camera;
  atMs: number;
}

/**
 * Parallax factors: how far the camera appears to move for each layer.
 * Below 1 is further away (it moves less); above 1 is nearer the viewer.
 * Kept mild — a strong parallax on something the player is trying to swim to
 * makes the swim feel like it is fighting the picture.
 */
const FAR_P = 0.84;
const NEAR_P = 1.13;

/**
 * A camera for a parallax layer, anchored so that the layer coincides exactly
 * with its true world position when the real camera is on `(ax, ay)`.
 *
 * Without the anchor a parallax layer drifts further from the truth the
 * further you are from the world origin, which for a landmark at (3400, 2300)
 * means it is drawn hundreds of cu from the water it is supposed to BE.
 */
function layerCam(cam: Camera, p: number, ax: number, ay: number): Camera {
  return { x: ax + (cam.x - ax) * p, y: ay + (cam.y - ay) * p, scale: cam.scale };
}

/** The water's own colour at a depth, mixed toward `to` by `k`. */
function siltAt(wy: number, to: [number, number, number], k: number, a: number): string {
  const w = waterAt(wy);
  return rgba(w[0] + (to[0] - w[0]) * k, w[1] + (to[1] - w[1]) * k, w[2] + (to[2] - w[2]) * k, a);
}

/** Rock, weed and lit-silt targets the water is mixed toward. */
const ROCK: [number, number, number] = [26, 44, 54];
const ROCK_DARK: [number, number, number] = [4, 12, 18];
const ROCK_LIT: [number, number, number] = [86, 124, 136];
const WEEDY: [number, number, number] = [18, 74, 58];
const WEEDY_LIT: [number, number, number] = [56, 150, 112];

/** A stable per-place, per-feature seed so nothing reshuffles between frames. */
function seedOf(place: Place, k: number): number {
  return place.x * 7919 + place.y * 31 + k;
}

// ---------------------------------------------------------------------------
// The rock every place stands on
// ---------------------------------------------------------------------------

/** Where an outcrop's crest sits, relative to the place's own centre. */
function crestRefY(place: Place, tall: number): number {
  return place.y - place.r * tall * 0.15;
}

/**
 * Where the outcrop's crest is at a world x, for standing things on. The
 * SMOOTH dome, deliberately: the drawn silhouette is roughened by hashed lumps
 * and matching them exactly would plant every frond in a notch, whereas a few
 * cu of disagreement reads as kelp growing out of a crack.
 */
function crestY(place: Place, wide: number, tall: number, wx: number): number {
  const ux = Math.max(-1, Math.min(1, (wx - place.x) / (place.r * wide)));
  return crestRefY(place, tall) - place.r * tall * Math.sqrt(1 - ux * ux);
}

/**
 * The outcrop: a lumpy mass of rock, lit along its upper edge and dissolving
 * downward into the murk.
 *
 * A CLOSED, LUMPY LENS rather than a dome sitting on a straight base. The
 * first version closed the silhouette with two vertical sides and a flat
 * bottom at the gradient's transparent end — which drew a hard-edged dark
 * RECTANGLE across the water, visible from the far side of the frame and the
 * single worst "pasted on" artefact in the whole set. A closed shape whose
 * lower half fades out has no straight edge anywhere.
 *
 * The lumps are hashed on the angle at two scales, and the vertical radius
 * below the waist is smaller than above it, so the mass reads as a rock
 * whose base is lost rather than as an ellipse.
 */
function paintOutcrop(
  ctx: CanvasRenderingContext2D, f: TerrainFrame, place: Place, cam: Camera,
  wide: number, tall: number, lit: number, k: number,
): void {
  const rx = place.r * wide;
  const ry = place.r * tall;
  const midY = crestRefY(place, tall);
  const steps = 40;

  const ring = (grow: number): Array<{ x: number; y: number }> => {
    const pts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      const lump = 1
        + (unit(seedOf(place, k * 1000 + i)) - 0.5) * 0.16
        + (unit(seedOf(place, k * 1000 + 700 + Math.floor(i / 5))) - 0.5) * 0.24;
      // Shallower below the waist: a rock, not an egg.
      const vr = (uy < 0 ? ry : ry * 0.72) * grow;
      pts.push({ x: place.x + rx * grow * ux * lump, y: midY + vr * uy * lump });
    }
    return pts;
  };

  // Traced through the MIDPOINTS with quadratic curves rather than straight
  // between the sampled points: forty hashed radii joined by `lineTo` draw a
  // visible staircase along the crest, which reads as a low-poly asset rather
  // than as rock.
  const trace = (pts: Array<{ x: number; y: number }>): void => {
    const px = pts.map((q) => worldToScreen(cam, f.view, q.x, q.y));
    const n = px.length;
    const mid = (i: number) => ({
      x: (px[i % n].x + px[(i + 1) % n].x) / 2,
      y: (px[i % n].y + px[(i + 1) % n].y) / 2,
    });
    ctx.beginPath();
    const m0 = mid(n - 1);
    ctx.moveTo(m0.x, m0.y);
    for (let i = 0; i < n; i++) {
      const m = mid(i);
      ctx.quadraticCurveTo(px[i].x, px[i].y, m.x, m.y);
    }
    ctx.closePath();
  };

  // The gradient must reach ZERO ALPHA at the shape's own lowest point, or the
  // silhouette keeps a visible bottom edge and the mass reads as a slab
  // floating in the water. The ring's floor is midY + ry * 0.72, so that is
  // where the fade ends, and most of the fade is packed into the lower third.
  // THE GRADIENT MUST START AT THE SHAPE'S OWN TOP, not above it. The first
  // pass began the ramp at midY - ry * 1.3 while the silhouette's crest is at
  // midY - ry, so by the time the fill reached any actual rock the lit stop
  // was already 37% spent and the Shelf — the one place that is supposed to be
  // LIGHTER than the water around it — came out darker than the open sea.
  //
  // It must still reach ZERO ALPHA at the shape's lowest point (midY + ry *
  // 0.72), or the silhouette keeps a bottom edge and the mass reads as a slab
  // floating in the water.
  // ...and it must reach ZERO ALPHA ABOVE the shape's lowest point (which the
  // hashed lumps put at roughly midY + ry * 0.72), not at it. Ending the ramp
  // exactly on the silhouette leaves the last band at ~0.4 alpha against the
  // hard edge of the path, and from any distance the mass reads as a pale
  // rectangle with square bottom corners. Fading out INSIDE the shape leaves
  // the lower sliver invisible and the mass with no bottom at all.
  const crest = worldToScreen(cam, f.view, place.x, midY - ry * 1.15);
  const base = worldToScreen(cam, f.view, place.x, midY + ry * 0.6);
  const g = ctx.createLinearGradient(0, crest.y, 0, base.y);
  g.addColorStop(0, siltAt(midY - ry, ROCK_LIT, lit, 0.9));
  g.addColorStop(0.2, siltAt(midY - ry * 0.8, ROCK_LIT, lit * 0.62, 0.92));
  g.addColorStop(0.55, siltAt(midY - ry * 0.2, ROCK, 0.86, 0.88));
  g.addColorStop(0.8, siltAt(midY + ry * 0.2, ROCK_DARK, 0.72, 0.45));
  g.addColorStop(0.93, siltAt(midY + ry * 0.45, ROCK_DARK, 0.6, 0.12));
  g.addColorStop(1, siltAt(midY + ry * 0.6, ROCK_DARK, 0.55, 0));
  ctx.fillStyle = g;
  trace(ring(1));
  ctx.fill();

  // Two darker lobes inside it, so the mass has folds rather than being one
  // flat silhouette.
  for (let i = 0; i < 2; i++) {
    const s = seedOf(place, k * 1000 + 300 + i * 41);
    const lx = place.x + span(s, -rx * 0.6, rx * 0.6);
    const ly = midY - ry * span(s + 1, 0.1, 0.55);
    const lr = rx * span(s + 2, 0.16, 0.3);
    const c = worldToScreen(cam, f.view, lx, ly);
    const lg = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, lr * cam.scale);
    lg.addColorStop(0, siltAt(ly, ROCK_DARK, 0.75, 0.34));
    lg.addColorStop(1, siltAt(ly, ROCK_DARK, 0.75, 0));
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.arc(c.x, c.y, lr * cam.scale, 0, Math.PI * 2);
    ctx.fill();
  }

  // The lit crest: a thin catch of what light gets down here, on the TOP edge
  // only — clipped to the upper half, because a rim all the way round would
  // draw the base this shape is deliberately not committing to.
  ctx.save();
  const clipTop = worldToScreen(cam, f.view, place.x - rx * 2, midY - ry * 3);
  const clipBot = worldToScreen(cam, f.view, place.x + rx * 2, midY - ry * 0.05);
  ctx.beginPath();
  ctx.rect(clipTop.x, clipTop.y, clipBot.x - clipTop.x, clipBot.y - clipTop.y);
  ctx.clip();
  ctx.strokeStyle = siltAt(midY - ry, ROCK_LIT, Math.min(1, lit * 1.2), 0.26 + 0.24 * lit);
  ctx.lineWidth = Math.max(0.9, 2.4 * cam.scale);
  trace(ring(1));
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Kelp Stand
// ---------------------------------------------------------------------------

const KELP_WIDE = 0.95;
const KELP_TALL = 0.52;

/**
 * One kelp stipe: a tapering ribbon rising from the rock and swaying, drawn
 * as a chain of segments so the sway travels UP it rather than pivoting the
 * whole frond about its root. A frond that rotates rigidly reads as a
 * windscreen wiper; one whose tip lags its base reads as something in water.
 */
function paintStipe(
  ctx: CanvasRenderingContext2D, f: TerrainFrame, cam: Camera,
  bx: number, by: number, height: number, seed: number, ink: string, wCu: number,
): void {
  const segs = 14;
  const phase = unit(seed) * 6.3;
  const rate = 0.35 + unit(seed + 1) * 0.3;
  const amp = height * (0.10 + unit(seed + 2) * 0.13);
  const t = f.atMs / 1000;
  const left: Array<{ x: number; y: number }> = [];
  const right: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    // The lag term is what makes the sway a travelling wave.
    const dx = Math.sin(t * rate + phase + u * 2.3) * amp * u * u;
    // A BLADE, not a stem: narrow at the holdfast, widest around the middle,
    // and tapering to a POINT. The first pass used a linear taper that left a
    // flat 28%-width tip, and twenty blades with square ends read as cut
    // cardboard rather than as anything that grew.
    const half = wCu * 0.5 * Math.sqrt(Math.sin(Math.PI * (0.12 + 0.88 * u)));
    const x = bx + dx;
    const y = by - height * u;
    left.push({ x: x - half, y });
    right.push({ x: x + half, y });
  }
  ctx.fillStyle = ink;
  ctx.beginPath();
  const a0 = worldToScreen(cam, f.view, left[0].x, left[0].y);
  ctx.moveTo(a0.x, a0.y);
  for (let i = 1; i <= segs; i++) {
    const s = worldToScreen(cam, f.view, left[i].x, left[i].y);
    ctx.lineTo(s.x, s.y);
  }
  for (let i = segs; i >= 0; i--) {
    const s = worldToScreen(cam, f.view, right[i].x, right[i].y);
    ctx.lineTo(s.x, s.y);
  }
  ctx.closePath();
  ctx.fill();
}

function paintKelp(
  ctx: CanvasRenderingContext2D, f: TerrainFrame, place: Place, cam: Camera, near: boolean,
): void {
  const count = near ? 9 : 20;
  const base = near ? 400 : 0;
  for (let k = 0; k < count; k++) {
    const s = seedOf(place, base + k * 13 + 3);
    const bx = place.x + span(s, -place.r * 0.9, place.r * 0.9);
    // Bases spread DOWN the rock's flank as well as across its crown, so the
    // stand reads as growing out of a slope rather than as a hedge planted in
    // a row along the top of it.
    const by = crestY(place, KELP_WIDE, KELP_TALL, bx) + span(s + 1, -6, place.r * 0.16);
    const h = place.r * span(s + 2, near ? 0.7 : 0.4, near ? 1.1 : 0.9);
    // ATMOSPHERIC PERSPECTIVE, and it runs the way round it does for a reason:
    // the FAR rank has more water in front of it, so it is paler, bluer and
    // lower in contrast; the NEAR rank is darker and greener. The first pass
    // had it backwards and the front rank glowed like a hedge under a
    // floodlight.
    const ink = near
      ? siltAt(by - h * 0.5, WEEDY, 0.95, 0.94)
      : siltAt(by - h * 0.5, WEEDY_LIT, 0.4, 0.5);
    // Kelp has BLADES, not stems. Wide ribbons read as kelp; hairlines read as
    // pond reeds, which is what the first pass drew.
    paintStipe(ctx, f, cam, bx, by, h, s + 7, ink, place.r * span(s + 3, 0.1, 0.185));
  }
}

// ---------------------------------------------------------------------------
// The Wreck
// ---------------------------------------------------------------------------

const WRECK_WIDE = 1.0;
const WRECK_TALL = 0.42;

/**
 * A wreck, read as a SILHOUETTE.
 *
 * The first pass drew a soft grey lozenge with faint ribs and a straight stick
 * for a mast, and at a glance it was a submarine. What actually says "ship" in
 * one look, in dark water, is an outline: a raked bow, a flat deck line, a
 * transom stern — and what says "wreck" is that the outline is in TWO PIECES
 * sitting at different angles, with the frames of the hull standing open
 * between them. So the hull is near-black against the water with one bright
 * deck edge, and the fore and aft sections carry different tilts.
 */
function hullPath(
  ctx: CanvasRenderingContext2D, f: TerrainFrame, cam: Camera,
  ox: number, oy: number, r: number, tilt: number,
  pts: Array<[number, number]>,
): void {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const x = pts[i][0] * r;
    const y = pts[i][1] * r;
    const wx = ox + x * Math.cos(tilt) - y * Math.sin(tilt);
    const wy = oy + x * Math.sin(tilt) + y * Math.cos(tilt);
    const sp = worldToScreen(cam, f.view, wx, wy);
    if (i === 0) ctx.moveTo(sp.x, sp.y); else ctx.lineTo(sp.x, sp.y);
  }
  ctx.closePath();
}

function wreckPoint(
  ox: number, oy: number, r: number, tilt: number, u: number, v: number,
): { x: number; y: number } {
  const x = u * r;
  const y = v * r;
  return {
    x: ox + x * Math.cos(tilt) - y * Math.sin(tilt),
    y: oy + x * Math.sin(tilt) + y * Math.cos(tilt),
  };
}

/** The fore section's outline, in hull-local units: raked bow, flat deck. */
const FORE: Array<[number, number]> = [
  [1.0, -0.16], [0.94, -0.34], [0.2, -0.4], [-0.3, -0.36],
  [-0.34, 0.16], [0.1, 0.3], [0.72, 0.24], [0.98, 0.04],
];
/** The aft section: transom stern, broken forward end. */
const AFT: Array<[number, number]> = [
  [-0.52, -0.34], [-1.02, -0.3], [-1.06, 0.18], [-0.6, 0.26], [-0.46, 0.1],
];

function paintWreck(
  ctx: CanvasRenderingContext2D, f: TerrainFrame, place: Place, cam: Camera, near: boolean,
): void {
  const r = place.r;
  const cy = crestY(place, WRECK_WIDE, WRECK_TALL, place.x) + r * 0.3;
  const cx = place.x;
  const foreTilt = -0.13;
  const aftTilt = 0.2; // the stern has sagged: the two angles ARE the break

  if (!near) {
    const dark = siltAt(cy, ROCK_DARK, 0.88, 0.96);
    const deck = siltAt(cy - r * 0.4, ROCK_LIT, 0.62, 0.72);

    // Frames standing open where the hull broke. Drawn first, so the two
    // sections overlap their roots.
    ctx.strokeStyle = siltAt(cy - r * 0.3, ROCK_LIT, 0.3, 0.55);
    ctx.lineWidth = Math.max(1, r * 0.03 * cam.scale);
    for (let i = 0; i < 5; i++) {
      const u = -0.42 + i * 0.09;
      const a = wreckPoint(cx, cy, r, foreTilt, u, 0.24);
      const b = wreckPoint(cx, cy, r, foreTilt, u - 0.1 + i * 0.02, -0.52 - i * 0.05);
      const m = wreckPoint(cx, cy, r, foreTilt, u - 0.02, -0.16);
      const sa = worldToScreen(cam, f.view, a.x, a.y);
      const sb = worldToScreen(cam, f.view, b.x, b.y);
      const sm = worldToScreen(cam, f.view, m.x, m.y);
      ctx.beginPath();
      ctx.moveTo(sa.x, sa.y);
      ctx.quadraticCurveTo(sm.x, sm.y, sb.x, sb.y);
      ctx.stroke();
    }

    for (const [pts, tilt] of [[FORE, foreTilt], [AFT, aftTilt]] as const) {
      ctx.fillStyle = dark;
      hullPath(ctx, f, cam, cx, cy, r, tilt, pts as Array<[number, number]>);
      ctx.fill();
      // One bright edge along the top: the deck, the only lit line on it.
      ctx.strokeStyle = deck;
      ctx.lineWidth = Math.max(1.1, r * 0.022 * cam.scale);
      ctx.stroke();
    }

    // Weed along both sheers. Forty years is a long time.
    for (let i = 0; i < 10; i++) {
      const sd = seedOf(place, 900 + i * 7);
      const u = span(sd, -1.0, 0.95);
      const tilt = u < -0.42 ? aftTilt : foreTilt;
      const w = wreckPoint(cx, cy, r, tilt, u, -0.32);
      paintStipe(ctx, f, cam, w.x, w.y, r * span(sd + 1, 0.14, 0.3),
        sd + 5, siltAt(w.y, WEEDY, 0.6, 0.55), r * 0.05);
    }
  } else {
    // The mast — a T, not a stick: a bare pole reads as a scratch on the
    // screen, and one cross-spar is all it takes to read as rigging.
    const foot = wreckPoint(cx, cy, r, foreTilt, 0.36, -0.3);
    const head = wreckPoint(cx, cy, r, foreTilt, -0.02, -1.5);
    const sf = worldToScreen(cam, f.view, foot.x, foot.y);
    const sh = worldToScreen(cam, f.view, head.x, head.y);
    ctx.strokeStyle = siltAt(cy - r, ROCK_DARK, 0.8, 0.95);
    ctx.lineWidth = Math.max(1.6, r * 0.05 * cam.scale);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sf.x, sf.y);
    ctx.lineTo(sh.x, sh.y);
    ctx.stroke();
    // The yard, across it, two thirds up.
    const yc = { x: sf.x + (sh.x - sf.x) * 0.68, y: sf.y + (sh.y - sf.y) * 0.68 };
    const ya = wreckPoint(cx, cy, r, foreTilt, -0.42, -1.12);
    const yb = wreckPoint(cx, cy, r, foreTilt, 0.42, -0.92);
    const sya = worldToScreen(cam, f.view, ya.x, ya.y);
    const syb = worldToScreen(cam, f.view, yb.x, yb.y);
    ctx.lineWidth = Math.max(1.2, r * 0.032 * cam.scale);
    ctx.beginPath();
    ctx.moveTo(sya.x, sya.y);
    ctx.lineTo(syb.x, syb.y);
    ctx.stroke();
    // Two lines hanging off the yard, drifting.
    ctx.lineWidth = Math.max(0.7, r * 0.014 * cam.scale);
    ctx.strokeStyle = siltAt(cy - r, ROCK, 0.7, 0.5);
    for (let i = 0; i < 2; i++) {
      const t = 0.25 + i * 0.5;
      const a = { x: sya.x + (syb.x - sya.x) * t, y: sya.y + (syb.y - sya.y) * t };
      const sway = Math.sin(f.atMs / 1500 + i * 2.1) * r * 0.1 * cam.scale;
      const b = { x: a.x + sway * 2, y: a.y + r * 0.55 * cam.scale };
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(a.x + sway, (a.y + b.y) / 2, b.x, b.y);
      ctx.stroke();
    }
    void yc;
  }
}

// ---------------------------------------------------------------------------
// The Drop-off
// ---------------------------------------------------------------------------

const DROP_WIDE = 1.5;
const DROP_TALL = 0.5;

/**
 * Where the floor falls away.
 *
 * The whole feature is ONE READ: a bright ledge that stops, and black under
 * it. In elevation that is a plateau CLIPPED at a vertical line — the clip
 * edge IS the cliff face, and because the plateau's own fill fades downward
 * the face has no bottom, which is the point of a drop-off.
 *
 * The first pass drew the void as a filled quadrilateral and it came out as a
 * hard-edged dark RECTANGLE hanging in open water, visible from two places
 * away (it is the black slab in the corner of the Shelf's first capture).
 * Nothing here is a polygon with corners any more: the depth below the lip is
 * a radial gradient, which cannot have an edge.
 */
function paintDropoff(
  ctx: CanvasRenderingContext2D, f: TerrainFrame, place: Place, cam: Camera, near: boolean,
): void {
  const r = place.r;
  const edgeX = place.x + r * 0.15;
  if (!near) {
    // The dark below and beyond the lip, as a radial so it has no edge.
    const c = worldToScreen(cam, f.view, edgeX + r * 0.35, place.y + r * 0.9);
    const rr = r * 2.3 * cam.scale;
    const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, rr);
    g.addColorStop(0, siltAt(place.y + r, ROCK_DARK, 1, 0.72));
    g.addColorStop(0.45, siltAt(place.y + r, ROCK_DARK, 1, 0.4));
    g.addColorStop(1, siltAt(place.y + r, ROCK_DARK, 1, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c.x, c.y, rr, 0, Math.PI * 2);
    ctx.fill();

    // The plateau, clipped at the lip. The clip's straight edge is the cliff.
    ctx.save();
    const a = worldToScreen(cam, f.view, place.x - r * 4, place.y - r * 4);
    const b = worldToScreen(cam, f.view, edgeX, place.y + r * 4);
    ctx.beginPath();
    ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.clip();
    paintOutcrop(ctx, f, place, cam, DROP_WIDE, DROP_TALL, 0.8, 11);
    ctx.restore();

    // The lip: the one high-contrast line in the whole terrain set, because
    // "the floor stops HERE" has to be readable from across the frame.
    ctx.strokeStyle = siltAt(place.y, ROCK_LIT, 0.95, 0.6);
    ctx.lineWidth = Math.max(1.4, r * 0.035 * cam.scale);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const wx = place.x - r * DROP_WIDE * 0.96 + t * (edgeX - (place.x - r * DROP_WIDE * 0.96));
      const wy = crestY(place, DROP_WIDE, DROP_TALL, wx)
        + span(seedOf(place, 1300 + i), -r * 0.015, r * 0.03);
      const sp = worldToScreen(cam, f.view, wx, wy);
      if (i === 0) ctx.moveTo(sp.x, sp.y); else ctx.lineTo(sp.x, sp.y);
    }
    ctx.stroke();
    // NO PAINTED CLIFF FACE. An earlier pass filled a rectangle down the lip
    // to suggest the wall, and from two places away — the Shelf is 1_553 cu
    // off — it was a pale rectangle hanging in open water with nothing around
    // it. The clip edge above already IS the face; anything drawn on top of it
    // has to be a shape with no straight sides, and there is nothing this
    // feature needs that a hard rectangle was providing.
  } else {
    // Teeth of rock standing off the edge, in front of the fish. Jagged
    // rather than clean triangles, which read as UI arrows.
    for (let i = 0; i < 3; i++) {
      const sd = seedOf(place, 1500 + i * 29);
      const bx = place.x + span(sd, -r * 0.9, r * 0.02);
      const by = crestY(place, DROP_WIDE, DROP_TALL, bx) + r * 0.06;
      const h = r * span(sd + 1, 0.3, 0.55);
      const w = r * span(sd + 2, 0.1, 0.19);
      ctx.fillStyle = siltAt(by - h, ROCK_DARK, 0.78, 0.95);
      ctx.beginPath();
      const steps = 7;
      for (let j = 0; j <= steps; j++) {
        const t = j / steps;
        // Up the left flank and down the right, kinked at hashed intervals.
        const side = t < 0.5 ? -1 : 1;
        const climb = t < 0.5 ? t * 2 : (1 - t) * 2;
        const wx = bx + side * w * (1 - climb) + span(sd + 10 + j, -w * 0.22, w * 0.22);
        const wy = by - h * climb;
        const sp = worldToScreen(cam, f.view, wx, wy);
        if (j === 0) ctx.moveTo(sp.x, sp.y); else ctx.lineTo(sp.x, sp.y);
      }
      const foot = worldToScreen(cam, f.view, bx - w, by + r * 0.4);
      ctx.lineTo(foot.x, foot.y);
      ctx.closePath();
      ctx.fill();
    }
  }
}

// ---------------------------------------------------------------------------
// The Shelf
// ---------------------------------------------------------------------------

const SHELF_WIDE = 1.4;
const SHELF_TALL = 0.34;

/**
 * A broad, pale, shallow shoulder — the one place in the sea that is LIGHTER
 * than the water around it, which is what makes "the shelf" a thing you can
 * point at from a long way off. Sand ripples give it a surface; a few
 * boulders give it a scale.
 */
function paintShelf(
  ctx: CanvasRenderingContext2D, f: TerrainFrame, place: Place, cam: Camera, near: boolean,
): void {
  const r = place.r;
  if (!near) {
    // `lit` at its ceiling: the Shelf is the ONE place in the sea that is
    // lighter than the water around it, which is what lets it be pointed at
    // from a long way off. The first pass ran it at 0.78 and the broad pale
    // shoulder came out darker than the open water beside it.
    paintOutcrop(ctx, f, place, cam, SHELF_WIDE, SHELF_TALL, 1, 21);
    // Sand ripples: shallow arcs following the shoulder's own curve, thinning
    // downward. They are what stop a pale mass reading as fog.
    ctx.lineWidth = Math.max(0.6, 1.4 * cam.scale);
    for (let i = 1; i <= 7; i++) {
      const drop = r * SHELF_TALL * (i / 7) * 0.85;
      ctx.strokeStyle = siltAt(place.y + drop, ROCK_LIT, 0.85 * (1 - i / 11), 0.42 * (1 - i / 10));
      ctx.beginPath();
      for (let j = 0; j <= 14; j++) {
        const t = j / 14;
        const wx = place.x - r * SHELF_WIDE * 0.92 + t * r * SHELF_WIDE * 1.84;
        const wy = crestY(place, SHELF_WIDE, SHELF_TALL, wx) + drop
          + span(seedOf(place, 2000 + i * 40 + j), -r * 0.012, r * 0.012);
        const s = worldToScreen(cam, f.view, wx, wy);
        if (j === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 4; i++) boulder(ctx, f, place, cam, 2300 + i * 17, 0.45, false);
  } else {
    for (let i = 0; i < 2; i++) boulder(ctx, f, place, cam, 2600 + i * 23, 0.85, true);
  }
}

function boulder(
  ctx: CanvasRenderingContext2D, f: TerrainFrame, place: Place, cam: Camera,
  s: number, k: number, near: boolean,
): void {
  const r = place.r;
  const bx = place.x + span(s, -r * 1.1, r * 1.1);
  const by = crestY(place, SHELF_WIDE, SHELF_TALL, bx) + r * span(s + 1, 0.0, 0.09);
  const rr = r * span(s + 2, near ? 0.16 : 0.08, near ? 0.26 : 0.15);
  const c = worldToScreen(cam, f.view, bx, by);
  const g = ctx.createRadialGradient(
    c.x - rr * cam.scale * 0.4, c.y - rr * cam.scale * 0.5, rr * cam.scale * 0.1,
    c.x, c.y, rr * cam.scale * 1.4,
  );
  g.addColorStop(0, siltAt(by - rr, ROCK_LIT, k * 0.5, 0.95));
  g.addColorStop(1, siltAt(by, ROCK_DARK, k, 0.95));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, rr * cam.scale * 1.15, rr * cam.scale * 0.85, 0, Math.PI, Math.PI * 2);
  ctx.ellipse(c.x, c.y, rr * cam.scale * 1.15, rr * cam.scale * 0.3, 0, 0, Math.PI);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// The two passes
// ---------------------------------------------------------------------------

function paintPlace(
  ctx: CanvasRenderingContext2D, f: TerrainFrame, place: Place, near: boolean,
): void {
  const cam = layerCam(f.cam, near ? NEAR_P : FAR_P, place.x, place.y);
  switch (place.id) {
    case 'kelp':
      if (!near) paintOutcrop(ctx, f, place, cam, KELP_WIDE, KELP_TALL, 0.62, 1);
      paintKelp(ctx, f, place, cam, near);
      break;
    case 'wreck':
      if (!near) paintOutcrop(ctx, f, place, cam, WRECK_WIDE, WRECK_TALL, 0.72, 5);
      paintWreck(ctx, f, place, cam, near);
      break;
    case 'dropoff':
      paintDropoff(ctx, f, place, cam, near);
      break;
    case 'shelf':
      paintShelf(ctx, f, place, cam, near);
      break;
    default:
      break;
  }
}

/**
 * Atmospheric perspective over the far layer: a wash of the water's own colour
 * at that depth, so the landmark recedes INTO the sea instead of sitting in
 * front of it. Restricted to the place's own extent, softly, so it does not
 * fog the open water beside it.
 */
function paintDepthWash(ctx: CanvasRenderingContext2D, f: TerrainFrame, place: Place): void {
  const c = worldToScreen(f.cam, f.view, place.x, place.y);
  const rPx = place.r * 2.1 * f.cam.scale;
  const w = waterAt(place.y);
  const g = ctx.createRadialGradient(c.x, c.y, rPx * 0.15, c.x, c.y, rPx);
  g.addColorStop(0, rgba(w[0], w[1], w[2], 0.2));
  g.addColorStop(0.55, rgba(w[0], w[1], w[2], 0.13));
  g.addColorStop(1, rgba(w[0], w[1], w[2], 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c.x, c.y, rPx, 0, Math.PI * 2);
  ctx.fill();
}

/** Is any of this place within reach of the window? */
function nearby(f: TerrainFrame, place: Place): boolean {
  return isVisible(f.cam, f.view, place.x, place.y, (place.r * 2.4) * f.cam.scale);
}

/**
 * Everything that goes BEHIND the swimmers: the rock, the wreck's hull, the
 * far kelp, the void under the Drop-off, the Shelf's ripples — and the depth
 * wash over all of it.
 */
export function paintPlacesFar(
  ctx: CanvasRenderingContext2D, f: TerrainFrame, places: readonly Place[] = PLACES,
): void {
  for (const p of places) {
    if (!nearby(f, p)) continue;
    ctx.save();
    paintPlace(ctx, f, p, false);
    paintDepthWash(ctx, f, p);
    ctx.restore();
  }
}

/**
 * Everything that goes IN FRONT of the swimmers: the front rank of kelp, the
 * wreck's mast and rigging, the Drop-off's teeth, the Shelf's near boulders.
 *
 * This pass is the reason a place has depth rather than merely detail — see
 * point 2 in the module header.
 */
export function paintPlacesNear(
  ctx: CanvasRenderingContext2D, f: TerrainFrame, places: readonly Place[] = PLACES,
): void {
  for (const p of places) {
    if (!nearby(f, p)) continue;
    ctx.save();
    paintPlace(ctx, f, p, true);
    ctx.restore();
  }
}
