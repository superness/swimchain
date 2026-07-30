/**
 * The Drop-off, measured. Run: npx tsx src/ui/terrainPaint.test.ts
 *
 * =============================================================================
 * WHAT THIS FILE CAN AND CANNOT SEE — READ THIS BEFORE TRUSTING IT
 * =============================================================================
 *
 * `seaPaint.ts` says of itself that it has no test file on purpose: "the only
 * assertions one could write against a canvas context are 'it was called',
 * which would pass against a black rectangle." That was true of this file too,
 * and it is still true of nearly everything in it. This file does not pretend
 * otherwise.
 *
 * It exists because the Drop-off shipped a defect that WAS structural rather
 * than a matter of taste: its near layer drew three flat, fully opaque,
 * straight-sided polygons closed with a straight foot line, and the result on
 * screen was black slabs that read as a missing texture. That is a property of
 * the drawing calls, not of the picture, and a recording context can see it
 * exactly. (That near layer is now empty, so §2 and §3 inspect only what is
 * drawn behind the swimmers — but they inspect BOTH passes, so a future near
 * layer built the same wrong way still fails them.)
 *
 * So the rules below are deliberately narrow, and each one is the negation of
 * something that actually looked broken:
 *
 *   §2  a filled shape may not be a POLYGON — no straight `lineTo` anywhere in
 *       a filled path. This is `terrainPaint.ts`'s own doctrine ("Nothing here
 *       is a polygon with corners any more") turned into something that fails.
 *   §3  a filled shape may not keep a BOTTOM EDGE — its fill must be a gradient
 *       and that gradient must have reached transparency by the shape's own
 *       lowest point. Also the module's own rule, previously enforced only by
 *       a comment.
 *   §4  the ledges below the lip must RECEDE — each one deeper and fainter than
 *       the one above it. Atmospheric perspective is the mechanism that makes
 *       the void read as depth rather than as a hole; flatten it and the
 *       feature is back to a dark smudge.
 *   §5  nothing may be drawn outside the envelope the culler admits, or a place
 *       pops into existence a limb at a time as you swim toward it.
 *   §6  the cut at the lip is a CURVE. A `rect` clip puts a perfectly straight
 *       vertical line down the one feature whose whole job is to not look
 *       manufactured.
 *
 * WHAT NO RULE HERE CAN CATCH, stated plainly because the temptation is to let
 * a green suite stand in for having looked: whether the Drop-off reads as
 * depth. Every rule below is satisfiable by a picture that is soft, edgeless,
 * curved, receding and still hideous. The screenshots in `docs/` are the
 * evidence for the picture; this file is the evidence that one specific class
 * of defect has not come back.
 *
 * Two blind spots worth naming rather than hiding:
 *   - A CLIP contributes an edge to the frame that this file cannot evaluate,
 *     because the clip's own geometry is not the filled shape's geometry. §6
 *     checks the cut is built from curves; it cannot check what the cut looks
 *     like once something is drawn through it.
 *   - Colour is not judged at all. A shape that satisfies every rule in a
 *     bright pink gradient passes.
 *
 * The recorder is a hand-written stub, not a canvas: it records the drawing
 * calls and evaluates the gradients itself, with the linear/radial
 * interpolation written out here (§1 pins that arithmetic against hand
 * computation, so a wrong evaluator cannot quietly make §3 vacuous).
 */
import { PLACE_REACH, paintPlacesFar, paintPlacesNear, type TerrainFrame } from './terrainPaint';
import { PLACES, type Place } from './terrain';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

// ---------------------------------------------------------------------------
// The recording context
// ---------------------------------------------------------------------------

interface Pt { x: number; y: number }
interface Stop { at: number; a: number }
/** A gradient the painter built, with only the alpha of each stop kept. */
class Grad {
  stops: Stop[] = [];
  constructor(
    readonly kind: 'linear' | 'radial',
    readonly a: Pt, readonly b: Pt, readonly r0: number, readonly r1: number,
  ) {}
  addColorStop(at: number, css: string): void { this.stops.push({ at, a: alphaOf(css) }); }
}
type Seg =
  | { t: 'move'; p: Pt }
  | { t: 'line'; p: Pt }
  | { t: 'quad'; c: Pt; p: Pt }
  | { t: 'arc'; c: Pt; r: number }
  | { t: 'ellipse'; c: Pt; rx: number; ry: number }
  | { t: 'rect'; p: Pt; w: number; h: number }
  | { t: 'close' };
/** One `fill`, `stroke` or `clip`, with the path it was issued against. */
interface Op { kind: 'fill' | 'stroke' | 'clip'; segs: Seg[]; style: Grad | string }

/** Alpha out of an `rgba(r, g, b, a)` string; 1 for anything else. */
function alphaOf(css: string): number {
  const m = /^rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.eE+-]+)\s*\)$/.exec(css);
  return m === null ? 1 : Number(m[1]);
}

/**
 * The alpha a gradient paints at a point, by the same rule a canvas uses:
 * project onto the gradient's own axis, clamp to [0, 1], interpolate between
 * the two stops that bracket it, and hold the end stops beyond the ends.
 */
function gradAlphaAt(g: Grad, p: Pt): number {
  let t: number;
  if (g.kind === 'linear') {
    const dx = g.b.x - g.a.x;
    const dy = g.b.y - g.a.y;
    const len2 = dx * dx + dy * dy;
    t = len2 === 0 ? 0 : ((p.x - g.a.x) * dx + (p.y - g.a.y) * dy) / len2;
  } else {
    const d = Math.hypot(p.x - g.b.x, p.y - g.b.y);
    t = g.r1 === g.r0 ? 1 : (d - g.r0) / (g.r1 - g.r0);
  }
  if (g.stops.length === 0) return 0;
  if (t <= g.stops[0].at) return g.stops[0].a;
  const last = g.stops[g.stops.length - 1];
  if (t >= last.at) return last.a;
  for (let i = 1; i < g.stops.length; i++) {
    const lo = g.stops[i - 1];
    const hi = g.stops[i];
    if (t <= hi.at) {
      const k = hi.at === lo.at ? 0 : (t - lo.at) / (hi.at - lo.at);
      return lo.a + (hi.a - lo.a) * k;
    }
  }
  return last.a;
}

/** The alpha an op's own fill paints at a point. */
function alphaAt(op: Op, p: Pt): number {
  return typeof op.style === 'string' ? alphaOf(op.style) : gradAlphaAt(op.style, p);
}

class Recorder {
  ops: Op[] = [];
  private segs: Seg[] = [];
  fillStyle: string | Grad = '#000';
  strokeStyle: string | Grad = '#000';
  lineWidth = 1;
  lineCap = 'butt';
  globalAlpha = 1;
  save(): void { /* nothing here depends on the state stack */ }
  restore(): void { /* as above */ }
  beginPath(): void { this.segs = []; }
  moveTo(x: number, y: number): void { this.segs.push({ t: 'move', p: { x, y } }); }
  lineTo(x: number, y: number): void { this.segs.push({ t: 'line', p: { x, y } }); }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    this.segs.push({ t: 'quad', c: { x: cx, y: cy }, p: { x, y } });
  }
  closePath(): void { this.segs.push({ t: 'close' }); }
  arc(x: number, y: number, r: number): void { this.segs.push({ t: 'arc', c: { x, y }, r }); }
  ellipse(x: number, y: number, rx: number, ry: number): void {
    this.segs.push({ t: 'ellipse', c: { x, y }, rx, ry });
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.segs.push({ t: 'rect', p: { x, y }, w, h });
  }
  clip(): void { this.ops.push({ kind: 'clip', segs: this.segs.slice(), style: '' }); }
  fill(): void { this.ops.push({ kind: 'fill', segs: this.segs.slice(), style: this.fillStyle }); }
  stroke(): void { this.ops.push({ kind: 'stroke', segs: this.segs.slice(), style: this.strokeStyle }); }
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): Grad {
    return new Grad('linear', { x: x0, y: y0 }, { x: x1, y: y1 }, 0, 0);
  }
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): Grad {
    return new Grad('radial', { x: x0, y: y0 }, { x: x1, y: y1 }, r0, r1);
  }
}

/** Flatten a path to the points on its boundary. Quadratics at 8 samples. */
function outline(segs: Seg[]): Pt[] {
  const pts: Pt[] = [];
  let cur: Pt = { x: 0, y: 0 };
  for (const s of segs) {
    if (s.t === 'move' || s.t === 'line') { pts.push(s.p); cur = s.p; }
    else if (s.t === 'quad') {
      for (let i = 1; i <= 8; i++) {
        const u = i / 8;
        const v = 1 - u;
        pts.push({
          x: v * v * cur.x + 2 * v * u * s.c.x + u * u * s.p.x,
          y: v * v * cur.y + 2 * v * u * s.c.y + u * u * s.p.y,
        });
      }
      cur = s.p;
    } else if (s.t === 'arc') {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        pts.push({ x: s.c.x + Math.cos(a) * s.r, y: s.c.y + Math.sin(a) * s.r });
      }
    } else if (s.t === 'ellipse') {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        pts.push({ x: s.c.x + Math.cos(a) * s.rx, y: s.c.y + Math.sin(a) * s.ry });
      }
    } else if (s.t === 'rect') {
      pts.push(s.p, { x: s.p.x + s.w, y: s.p.y }, { x: s.p.x + s.w, y: s.p.y + s.h }, { x: s.p.x, y: s.p.y + s.h });
    }
  }
  return pts;
}

// ---------------------------------------------------------------------------
// The frame everything below is recorded against
// ---------------------------------------------------------------------------

const VIEW = { w: 1280, h: 800 };
/**
 * The camera sits ON the place's centre at scale 1, which does two things:
 * `layerCam`'s parallax anchors resolve to the identity (both layers coincide
 * exactly at the anchor), and screen pixels become world cu offset by the
 * window's own centre — so §5 can measure a drawn extent in the same units
 * `Place.r` is in, without inverting anything.
 */
function frameAt(place: Place): TerrainFrame {
  return { view: VIEW, cam: { x: place.x, y: place.y, scale: 1 }, atMs: 4_000 };
}
function toWorld(place: Place, p: Pt): Pt {
  return { x: place.x + (p.x - VIEW.w / 2), y: place.y + (p.y - VIEW.h / 2) };
}

function record(place: Place): Op[] {
  const rec = new Recorder();
  const ctx = rec as unknown as CanvasRenderingContext2D;
  const f = frameAt(place);
  paintPlacesFar(ctx, f, [place]);
  paintPlacesNear(ctx, f, [place]);
  return rec.ops;
}

const DROPOFF = PLACES.find((p) => p.id === 'dropoff') as Place;
const drop = record(DROPOFF);
const dropFills = drop.filter((o) => o.kind === 'fill');

// ---------------------------------------------------------------------------
// 1. The instrument itself — a recorder that saw nothing would make every
//    rule below vacuous, and a wrong gradient evaluator would make §3 vacuous
//    while still printing `ok`.
// ---------------------------------------------------------------------------

check('the recorder sees the Drop-off being drawn at all', drop.length >= 10, drop.length);
check('and most of it is filled shapes rather than lines', dropFills.length >= 6, dropFills.length);

{
  // A linear gradient from (0,0) to (100,0), stops at 0 -> a=1 and 1 -> a=0.
  // Hand arithmetic: at x=25 the alpha is 0.75; at x=-40 it is held at 1; at
  // x=180 it is held at 0. None of these numbers comes from the painter.
  const g = new Grad('linear', { x: 0, y: 0 }, { x: 100, y: 0 }, 0, 0);
  g.addColorStop(0, 'rgba(0, 0, 0, 1)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  check('the evaluator interpolates a linear gradient', Math.abs(gradAlphaAt(g, { x: 25, y: 0 }) - 0.75) < 1e-12);
  check('the evaluator holds the first stop before the start', gradAlphaAt(g, { x: -40, y: 9 }) === 1);
  check('the evaluator holds the last stop past the end', gradAlphaAt(g, { x: 180, y: -3 }) === 0);
}
{
  // A radial from r=10 to r=50, alpha 0.8 at the inside and 0 at the rim.
  // At distance 30 the fraction is (30-10)/(50-10) = 0.5, so alpha is 0.4.
  const g = new Grad('radial', { x: 0, y: 0 }, { x: 0, y: 0 }, 10, 50);
  g.addColorStop(0, 'rgba(0, 0, 0, 0.8)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  check('the evaluator interpolates a radial gradient', Math.abs(gradAlphaAt(g, { x: 30, y: 0 }) - 0.4) < 1e-12);
  check('a radial is transparent at its own rim', gradAlphaAt(g, { x: 0, y: 50 }) === 0);
}
check('a flat colour string yields its own alpha', Math.abs(alphaOf('rgba(4, 12, 18, 0.95)') - 0.95) < 1e-12);

// ---------------------------------------------------------------------------
// 2. No filled shape is a polygon.
//
// THIS IS THE RULE THE OLD TEETH BROKE. They were built from `lineTo` up one
// flank and down the other and closed with a straight run out to a foot point,
// which is precisely how you draw a slab.
// ---------------------------------------------------------------------------

{
  const polys = dropFills.filter((o) => o.segs.some((s) => s.t === 'line'));
  check('no filled shape in the Drop-off is built from straight lines',
    polys.length === 0,
    polys.map((o) => o.segs.filter((s) => s.t === 'line').length));
}

// ---------------------------------------------------------------------------
// 3. No filled shape keeps a bottom edge.
// ---------------------------------------------------------------------------

{
  const flat = dropFills.filter((o) => typeof o.style === 'string');
  check('every filled shape in the Drop-off is painted with a gradient',
    flat.length === 0, flat.map((o) => o.style));
}
{
  // The lowest point of each shape, and what its own fill paints there. A
  // shape whose fill has not run out by its own floor has a visible bottom,
  // and a dark shape with a visible bottom is a slab hanging in the water.
  const bad: Array<{ y: number; a: number }> = [];
  for (const op of dropFills) {
    const pts = outline(op.segs);
    if (pts.length === 0) continue;
    let low = pts[0];
    for (const p of pts) if (p.y > low.y) low = p;
    const a = alphaAt(op, low);
    if (a > 0.06) bad.push({ y: Math.round(low.y), a: Number(a.toFixed(3)) });
  }
  check('every filled shape has faded out by its own lowest point', bad.length === 0, bad);
}

// ---------------------------------------------------------------------------
// 4. The ledges recede.
//
// What makes a void read as depth rather than as a hole is that you can see
// SOMETHING in it, going away: successive ledges below the lip, each fainter
// than the one above. This is the one rule here that is about the picture's
// mechanism rather than about an absence.
// ---------------------------------------------------------------------------

{
  const r = DROPOFF.r;
  // A ledge is a MASS lying wholly east of the lip and wholly below the
  // place's centre. Both halves of that matter: "east of the lip" is what
  // separates a ledge from the plateau, the wall, the void haze and every
  // fold drawn inside those (all of which reach west of it), and the width
  // floor is what separates a ledge from the small dark lobes `paintMass`
  // draws inside each mass to give it folds.
  const lipX = DROPOFF.x + DROPOFF.r * 0.15;
  const ledges: Array<{ top: number; peak: number }> = [];
  for (const op of dropFills) {
    const pts = outline(op.segs);
    if (pts.length === 0) continue;
    let top = pts[0];
    let west = pts[0].x;
    let east = pts[0].x;
    for (const p of pts) {
      if (p.y < top.y) top = p;
      if (p.x < west) west = p.x;
      if (p.x > east) east = p.x;
    }
    const topW = toWorld(DROPOFF, top);
    if (topW.y <= DROPOFF.y) continue;                              // not below the centre
    if (toWorld(DROPOFF, { x: west, y: 0 }).x <= lipX) continue;    // reaches back over the floor
    if (east - west < r * 0.5) continue;                            // a fold, not a ledge
    ledges.push({ top: topW.y, peak: alphaAt(op, top) });
  }
  ledges.sort((a, b) => a.top - b.top);
  check('there are at least three ledges out over the void', ledges.length >= 3,
    ledges.map((l) => ({ top: Math.round(l.top), peak: Number(l.peak.toFixed(3)) })));
  let recedes = ledges.length >= 3;
  for (let i = 1; i < ledges.length; i++) {
    if (!(ledges[i].top > ledges[i - 1].top && ledges[i].peak < ledges[i - 1].peak)) recedes = false;
  }
  check('each ledge is deeper AND fainter than the one above it', recedes,
    ledges.map((l) => ({ top: Math.round(l.top), peak: Number(l.peak.toFixed(3)) })));
}

// ---------------------------------------------------------------------------
// 5. Nothing is drawn outside the envelope the culler admits.
//
// `nearby` stops drawing a place once its centre is PLACE_REACH * r beyond the
// window. Anything drawn further out than that from the centre appears and
// disappears on its own schedule as you swim toward the place — a limb popping
// into existence, which is the exact reading of "a bug" the whole feature is
// trying to shed. Checked for ALL FOUR places, not just the one being changed.
// ---------------------------------------------------------------------------

{
  const worst: Array<{ id: string; reach: number }> = [];
  for (const place of PLACES) {
    let far = 0;
    for (const op of record(place)) {
      for (const p of outline(op.segs)) {
        if (op.kind === 'clip') continue;         // a clip is a window, not a mark
        const w = toWorld(place, p);
        const d = Math.hypot(w.x - place.x, w.y - place.y) / place.r;
        if (d > far) far = d;
      }
    }
    worst.push({ id: place.id, reach: Number(far.toFixed(2)) });
  }
  console.log('     drawn reach, in radii: ' + worst.map((w) => `${w.id} ${w.reach}`).join(', '));
  const over = worst.filter((w) => w.reach > PLACE_REACH);
  check('no place draws outside the envelope its culler admits', over.length === 0, over);
}

// ---------------------------------------------------------------------------
// 6. The cut at the lip is a curve.
// ---------------------------------------------------------------------------

{
  // Every rock mass clips its own lit rim to its upper half with a plain
  // rectangle (`paintMass`), and those are not the cut — they trim a stroke,
  // they do not decide where the floor ends. THE CUT is the one clip built
  // out of curves, and there must be exactly one of it.
  const clips = drop.filter((o) => o.kind === 'clip');
  const cuts = clips.filter((o) => o.segs.filter((s) => s.t === 'quad').length >= 3);
  check('the floor is cut off by exactly one curved clip', cuts.length === 1,
    clips.map((o) => o.segs.filter((s) => s.t === 'quad').length));
  if (cuts.length === 1) {
    const cut = cuts[0];
    check('the cut is not an axis-aligned rectangle', !cut.segs.some((s) => s.t === 'rect'));
    const ys = outline(cut.segs).map((p) => toWorld(DROPOFF, p).y);
    const top = Math.min(...ys);
    const bot = Math.max(...ys);
    // It has to run past both ends of the rock it is cutting, or the cut stops
    // somewhere in mid-air and the floor grows back below it.
    check('and it runs from above the plateau to below the wall',
      top < DROPOFF.y - DROPOFF.r && bot > DROPOFF.y + DROPOFF.r * 1.5,
      { top: Math.round(top), bot: Math.round(bot) });
  }
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
