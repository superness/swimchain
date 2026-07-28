/**
 * The paint — the half of rendering that is judged by looking at it.
 *
 * DISPLAY SIDE, and the loosest part of it: floats, trigonometry, colour and
 * time-varying wobble, none of which any other client ever has to agree with.
 * Nothing in this file is imported by `src/lib/`, nothing here feeds the fold,
 * and every number in it is free to change without splitting a single client.
 *
 * WHAT IS DELIBERATELY NOT HERE: any idea of its own about where a swimmer is.
 * Every position on screen comes from `reckonSmooth` (render.ts), which comes
 * from the engine's `reckon`. This file decides what a fish LOOKS like, never
 * where it IS. The one place that distinction would be easy to lose is the
 * wake ghosts, which are drawn at earlier instants — those call `reckonSmooth`
 * again at `atMs - k`, they do not integrate a velocity of their own.
 *
 * THERE IS NO TEST FILE FOR THIS MODULE, on purpose. The only assertions one
 * could write against a canvas context are "it was called", which would pass
 * against a black rectangle. The projection it sits on top of is pinned by
 * render.test.ts; this part is verified by screenshot, which is the standing
 * bar for a player-facing surface in this repo.
 *
 * THE DIEGETIC RULE (spec 1.1) BINDS HERE. This module draws no text of any
 * kind — not a label, not an id, not a number. A swimmer's size is read off
 * its body, which is what spec 2.8 says the scoreboard is.
 *
 * The fantasy being painted, in the spec's words (2.1): "You are a small fish
 * in a big dark sea. You are not strong." Everything below serves that one
 * sentence — the water is dark and gets darker downward, the light comes from
 * far above and does not reach, the drifting particulate is there to give the
 * dark a SCALE (an empty gradient reads as a wall; the same gradient with
 * three parallax layers of snow drifting through it reads as depth), and a
 * swimmer is small against all of it.
 */
import {
  bodyRadiusCu, cullBodies, headingRad, reckonSmooth, worldToScreen,
  type Camera, type Viewport,
} from './render';
import { WORLD_H, WORLD_W } from '../lib/shoalConst';
import type { Vec } from '../lib/shoalTypes';

// ---------------------------------------------------------------------------
// What the paint needs to know about a swimmer
// ---------------------------------------------------------------------------

export interface Swimmer {
  id: string;
  size: number;
  vec: Vec;
  /** True for the swimmer the camera is following. */
  self: boolean;
  /** True while this swimmer is dazed from a scatter (spec 2.9). */
  scattered?: boolean;
  /**
   * How full this swimmer's dart is, 0 to 1, or undefined for a swimmer whose
   * charge this client cannot know — which is everyone but you, since a dart
   * cooldown is not on the wire. Drawn as a ring around the body.
   */
  charge?: number;
  /** True while the burst itself is running. */
  darting?: boolean;
  /** A word over this swimmer's head, if they have just spoken. */
  say?: string;
}

export interface Frame {
  view: Viewport;
  cam: Camera;
  /** Display time in ms — the wall clock, passed in, never read here. */
  atMs: number;
  swimmers: readonly Swimmer[];
  /**
   * Where the player has asked to go, in world cu, while they are holding a
   * heading — or null. Drawn as a small disturbance in the water, NOT as a
   * marker on the fish: a held heading does not reach anyone until it is
   * written, so turning the body early would be the display disagreeing with
   * the fold (render.ts's header). This is an intention in the water, and it
   * is the only honest way to show one.
   */
  aim?: { x: number; y: number } | null;
  /**
   * The centre of a bloom cell the player could take a bite from RIGHT NOW,
   * or null. Judged by the fold's own `canEat`, never by a display-side guess
   * — see App.tsx, and see the report on why there is no map of where food is.
   */
  bite?: { x: number; y: number } | null;
}

// ---------------------------------------------------------------------------
// Palette. Cold, low-chroma, and very dark at the bottom of the range: the
// sea has to be somewhere you do not want to be alone in.
// ---------------------------------------------------------------------------

const ABYSS = '#01060a';
const DEEP = '#03131d';
const MID = '#07293a';
const UPPER = '#0d4c60';
const SURFACE = '#1b8095';

/**
 * Swimmers that are not you: cold silver-greens, lit from above. FOUR sets
 * rather than one, picked by a hash of the swimmer's id — a shoal of
 * identically-coloured fish reads as a sprite repeated, and the whole subject
 * of this game is that the other fish are other people.
 */
const OTHER_SETS: Array<{ dark: string; lit: string; deep: string }> = [
  { dark: '#0a2a37', lit: '#63b3c4', deep: '#02121a' },
  { dark: '#0c2f33', lit: '#72c1b6', deep: '#03130f' },
  { dark: '#122a3f', lit: '#7fb0cf', deep: '#04101d' },
  { dark: '#0e2733', lit: '#93c8cc', deep: '#03141a' },
];
const OTHER_RIM = '#bff0fb';
/** You: the one warm thing in the frame, so you are never lost in the crowd. */
const SELF_DARK = '#4a2f12';
const SELF_LIT = '#f4b563';
const SELF_DEEP = '#1c1005';
const SELF_RIM = '#ffe2b0';

// ---------------------------------------------------------------------------
// Deterministic per-id and per-index noise. Not consensus — this only decides
// which fish flicks its tail on which beat — but it must be STABLE, or every
// fish resets its animation phase whenever the array order changes.
// ---------------------------------------------------------------------------

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function hashInt(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** A stable 0..1 from an integer seed. */
function unit(n: number): number {
  return hashInt(n) / 4294967296;
}

// ---------------------------------------------------------------------------
// The water
// ---------------------------------------------------------------------------

/**
 * The depth gradient, built in WORLD space and projected, so the light stays
 * where the surface is instead of sliding around with the camera. Swimming
 * down genuinely gets darker; that is the only depth cue that survives a
 * screenshot.
 */
function paintWater(ctx: CanvasRenderingContext2D, f: Frame): void {
  const top = worldToScreen(f.cam, f.view, 0, -600).y;
  const bottom = worldToScreen(f.cam, f.view, 0, WORLD_H + 900).y;
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, SURFACE);
  g.addColorStop(0.08, UPPER);
  g.addColorStop(0.34, MID);
  g.addColorStop(0.68, DEEP);
  g.addColorStop(1, ABYSS);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, f.view.w, f.view.h);

  // Above and below the water column the gradient has run out; flood the rest
  // so a camera near an edge never shows an unpainted band.
  if (top > 0) { ctx.fillStyle = SURFACE; ctx.fillRect(0, 0, f.view.w, top); }
  if (bottom < f.view.h) { ctx.fillStyle = ABYSS; ctx.fillRect(0, bottom, f.view.w, f.view.h - bottom); }
}

/**
 * Light from a surface that is a long way up. Shafts are anchored in world x
 * so they slide past as you swim, tilt slightly, and breathe — the breathing
 * is what stops them reading as painted-on stripes.
 *
 * EACH SHAFT IS DRAWN AS FOUR NESTED QUADS, not one. A single quad has a hard
 * lateral edge, and a hard-edged column of light is the exact thing that made
 * an earlier pass read as grey wallpaper stripes rather than as light in
 * water: real shafts have no sides, they have a bright core that falls off
 * both ways. Stacking narrowing quads under `lighter` approximates that
 * falloff in four fills and costs nothing. (A `ctx.filter` blur would be one
 * fill, but it makes the look depend on a canvas feature whose support and
 * cost vary; this does not.)
 *
 * The length fade is aggressive on purpose. Light that reached the bottom of
 * the frame would contradict the whole premise — the point is that it does
 * not reach you.
 */
const SHAFT_LAYERS = [
  { width: 1.0, gain: 0.34 },
  { width: 0.66, gain: 0.28 },
  { width: 0.38, gain: 0.24 },
  { width: 0.17, gain: 0.22 },
];

function paintShafts(ctx: CanvasRenderingContext2D, f: Frame): void {
  const t = f.atMs / 1000;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 11; i++) {
    const wx = (i / 11) * (WORLD_W + 1600) - 800 + Math.sin(t * 0.05 + i * 2.1) * 90;
    const len = 2600 + unit(i * 7 + 3) * 1500;
    const tilt = 200 + unit(i * 11 + 5) * 460;
    const wide = 90 + unit(i * 13 + 1) * 190;
    const a = worldToScreen(f.cam, f.view, wx, -700);
    const b = worldToScreen(f.cam, f.view, wx + tilt, -700 + len);
    // Cheap reject: a shaft entirely off to one side costs nothing to skip.
    if (Math.max(a.x, b.x) < -400 || Math.min(a.x, b.x) > f.view.w + 400) continue;
    const breath = 0.45 + 0.55 * Math.sin(t * 0.23 + i * 1.7);
    for (const L of SHAFT_LAYERS) {
      const halfTop = wide * 0.3 * L.width * f.cam.scale;
      const halfBot = wide * 2.0 * L.width * f.cam.scale;
      const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      g.addColorStop(0, `rgba(172, 242, 255, ${0.078 * L.gain * breath})`);
      g.addColorStop(0.3, `rgba(130, 216, 242, ${0.05 * L.gain * breath})`);
      g.addColorStop(0.68, `rgba(98, 186, 216, ${0.02 * L.gain * breath})`);
      g.addColorStop(1, 'rgba(80, 170, 200, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(a.x - halfTop, a.y);
      ctx.lineTo(a.x + halfTop, a.y);
      ctx.lineTo(b.x + halfBot, b.y);
      ctx.lineTo(b.x - halfBot, b.y);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * Marine snow, in three parallax layers.
 *
 * This is the load-bearing bit of the whole background and it is worth saying
 * why: a gradient alone has no scale — it could be a wall two metres away.
 * Particulate that moves at three different rates as the camera pans is read
 * instantly as three different distances, and once there are distances there
 * is a volume, and once there is a volume the fish in it are small.
 *
 * The field is an infinite tiling of one deterministic patch, so it costs a
 * fixed amount of memory and never reshuffles on resize.
 */
const MOTE_LAYERS = [
  { parallax: 0.32, count: 26, tile: 1500, r: 1.1, alpha: 0.16, drift: 5 },
  { parallax: 0.62, count: 22, tile: 1200, r: 1.9, alpha: 0.24, drift: 11 },
  { parallax: 1.0, count: 16, tile: 950, r: 3.0, alpha: 0.3, drift: 20 },
];

function paintMotes(ctx: CanvasRenderingContext2D, f: Frame): void {
  const t = f.atMs / 1000;
  for (let li = 0; li < MOTE_LAYERS.length; li++) {
    const L = MOTE_LAYERS[li];
    // A layer at parallax p behaves as if the camera moved only p as far.
    const cam: Camera = { x: f.cam.x * L.parallax, y: f.cam.y * L.parallax, scale: f.cam.scale };
    const halfW = f.view.w / 2 / cam.scale;
    const halfH = f.view.h / 2 / cam.scale;
    const x0 = Math.floor((cam.x - halfW - L.tile) / L.tile);
    const x1 = Math.ceil((cam.x + halfW + L.tile) / L.tile);
    const y0 = Math.floor((cam.y - halfH - L.tile) / L.tile);
    const y1 = Math.ceil((cam.y + halfH + L.tile) / L.tile);
    ctx.fillStyle = `rgba(196, 230, 242, ${L.alpha})`;
    for (let tx = x0; tx <= x1; tx++) {
      for (let ty = y0; ty <= y1; ty++) {
        for (let k = 0; k < L.count; k++) {
          const seed = (li * 7919 + k) * 31 + 17;
          const mx = tx * L.tile + unit(seed) * L.tile
            + Math.sin(t * 0.11 + unit(seed + 1) * 6.3) * 22;
          // Snow falls. Slowly, and wrapped inside the tile so the field
          // never runs out from underneath itself.
          const fall = (unit(seed + 2) * L.tile + t * L.drift) % L.tile;
          const my = ty * L.tile + fall;
          const s = worldToScreen(cam, f.view, mx, my);
          if (s.x < -8 || s.x > f.view.w + 8 || s.y < -8 || s.y > f.view.h + 8) continue;
          const r = L.r * (0.6 + unit(seed + 3) * 0.8);
          ctx.beginPath();
          ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
}

/**
 * The edge of the water. There is no wall and no line — the sea simply gets
 * murkier and colder outside the bounds every swimmer shares, which says
 * "there is nothing out there for you" without a single word of text.
 */
function paintMurk(ctx: CanvasRenderingContext2D, f: Frame): void {
  const FADE = 900; // cu over which the murk closes in
  const left = worldToScreen(f.cam, f.view, 0, 0).x;
  const right = worldToScreen(f.cam, f.view, WORLD_W, 0).x;
  const fadePx = FADE * f.cam.scale;
  if (left > 0) {
    const g = ctx.createLinearGradient(left, 0, left - fadePx, 0);
    g.addColorStop(0, 'rgba(1, 6, 10, 0)');
    g.addColorStop(1, 'rgba(1, 6, 10, 0.92)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, left, f.view.h);
  }
  if (right < f.view.w) {
    const g = ctx.createLinearGradient(right, 0, right + fadePx, 0);
    g.addColorStop(0, 'rgba(1, 6, 10, 0)');
    g.addColorStop(1, 'rgba(1, 6, 10, 0.92)');
    ctx.fillStyle = g;
    ctx.fillRect(right, 0, f.view.w - right, f.view.h);
  }
}

/**
 * A single tile of deterministic grey noise, laid over the whole frame at a
 * few percent.
 *
 * This is a DITHER, not decoration. The sea is one enormous smooth gradient
 * across a dark range, and eight bits per channel cannot represent it — the
 * result is visible horizontal contour banding across the deep water, plus
 * faint vertical seams where the shaft layers meet. A couple of percent of
 * noise breaks both up completely, and it reads as the grain of water rather
 * than as an effect. Built once, cached, and tiled in screen space.
 */
let noiseTile: CanvasPattern | null = null;
function noisePattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (noiseTile) return noiseTile;
  const N = 96;
  const c = document.createElement('canvas');
  c.width = N;
  c.height = N;
  const nctx = c.getContext('2d');
  if (!nctx) return null;
  const img = nctx.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const v = 96 + Math.floor(unit(i * 2654435 + 11) * 64);
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  nctx.putImageData(img, 0, 0);
  noiseTile = ctx.createPattern(c, 'repeat');
  return noiseTile;
}

function paintGrain(ctx: CanvasRenderingContext2D, f: Frame): void {
  const p = noisePattern(ctx);
  if (!p) return;
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = p;
  ctx.fillRect(0, 0, f.view.w, f.view.h);
  ctx.restore();
}

/** A soft darkening at the frame's own corners. Focuses the eye on the shoal. */
function paintVignette(ctx: CanvasRenderingContext2D, f: Frame): void {
  const cx = f.view.w / 2;
  const cy = f.view.h / 2;
  const r = Math.hypot(cx, cy);
  const g = ctx.createRadialGradient(cx, cy, r * 0.42, cx, cy, r);
  g.addColorStop(0, 'rgba(0, 0, 0, 0)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0.62)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, f.view.w, f.view.h);
}

// ---------------------------------------------------------------------------
// A swimmer
// ---------------------------------------------------------------------------

/**
 * One fish, in its own rotated frame. The shape is a tapered lens with a
 * forked caudal fin, a dorsal, a pectoral and an eye; the tail beats and the
 * body bends with it, out of phase, which is what makes it read as swimming
 * rather than sliding.
 *
 * SIZE IS THE POINT OF THIS FUNCTION. Radius comes from `bodyRadiusCu`, which
 * is a strictly increasing function of the engine's own `size`, and three
 * other things scale with it as well — the rim light strengthens, the tail
 * beats slower, and the under-shadow spreads — so a big fish is not merely a
 * scaled-up small one. Spec 2.8: size is worn on the body and is the
 * scoreboard.
 */
function paintFish(
  ctx: CanvasRenderingContext2D, f: Frame, sw: Swimmer, sx: number, sy: number,
): void {
  const rPx = bodyRadiusCu(sw.size) * f.cam.scale;
  if (rPx < 0.4) return;
  const lenPx = rPx * 2.7;
  const ang = headingRad(sw.vec);
  const h = hashStr(sw.id);
  const phase = (h % 6283) / 1000;
  // Bigger fish are ponderous; a small one flickers. Purely cosmetic, but it
  // is a second, non-geometric channel carrying the same information.
  const beatHz = 2.4 * Math.pow(100 / Math.max(sw.size, 40), 0.35) * (sw.vec.speed > 100 ? 1.9 : 1);
  const beat = Math.sin((f.atMs / 1000) * beatHz * Math.PI * 2 + phase);
  const dazed = sw.scattered === true;

  const set = OTHER_SETS[h % OTHER_SETS.length];
  const dark = sw.self ? SELF_DARK : set.dark;
  const lit = sw.self ? SELF_LIT : set.lit;
  const deep = sw.self ? SELF_DEEP : set.deep;
  const rim = sw.self ? SELF_RIM : OTHER_RIM;
  // The body flexes into its own tail beat, counter-phase at the head.
  const bend = beat * rPx * 0.18;

  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(ang);
  if (dazed) ctx.globalAlpha = 0.5 + 0.22 * Math.sin(f.atMs / 90);

  // A little of the fish's own darkness bleeding into the water beneath it.
  // KEPT SMALL ON PURPOSE: an earlier pass drew this as a wide ellipse and
  // every swimmer sat in a black hole punched out of the sea. What gives a
  // body presence in water is a short, soft, downward smear, not a shadow —
  // there is no floor down there to cast one on.
  const sh = ctx.createRadialGradient(0, rPx * 0.55, rPx * 0.1, 0, rPx * 0.55, lenPx * 0.85);
  sh.addColorStop(0, 'rgba(0, 10, 16, 0.30)');
  sh.addColorStop(0.55, 'rgba(0, 10, 16, 0.11)');
  sh.addColorStop(1, 'rgba(0, 10, 16, 0)');
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.ellipse(0, rPx * 0.55, lenPx * 0.85, rPx * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tail first, so the body's rear overlaps its root and the two read as one
  // animal rather than a triangle following a lozenge.
  ctx.save();
  ctx.translate(-lenPx * 0.6, bend * 0.6);
  ctx.rotate(beat * 0.5);
  ctx.fillStyle = dark;
  ctx.globalAlpha *= 0.88;
  ctx.beginPath();
  ctx.moveTo(rPx * 0.5, 0);
  ctx.quadraticCurveTo(-lenPx * 0.18, -rPx * 0.35, -lenPx * 0.42, -rPx * 1.05);
  ctx.quadraticCurveTo(-lenPx * 0.2, -rPx * 0.2, -lenPx * 0.16, 0);
  ctx.quadraticCurveTo(-lenPx * 0.2, rPx * 0.2, -lenPx * 0.42, rPx * 1.05);
  ctx.quadraticCurveTo(-lenPx * 0.18, rPx * 0.35, rPx * 0.5, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha /= 0.88;

  // Dorsal, low and swept back.
  ctx.fillStyle = dark;
  ctx.globalAlpha *= 0.9;
  ctx.beginPath();
  ctx.moveTo(lenPx * 0.12, -rPx * 0.78 + bend);
  ctx.quadraticCurveTo(-lenPx * 0.06, -rPx * 1.42 - beat * rPx * 0.1, -lenPx * 0.34, -rPx * 0.5 + bend);
  ctx.closePath();
  ctx.fill();
  // ...and its mirror below, which is what stops the silhouette reading as a
  // shark fin.
  ctx.beginPath();
  ctx.moveTo(-lenPx * 0.06, rPx * 0.72 + bend);
  ctx.quadraticCurveTo(-lenPx * 0.22, rPx * 1.24, -lenPx * 0.4, rPx * 0.44 + bend);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha /= 0.9;

  // The body: a tapered spindle, fat a third of the way back, drawn narrow at
  // the caudal peduncle so the tail has something to hinge on.
  const bodyGrad = ctx.createLinearGradient(0, -rPx, 0, rPx * 1.1);
  bodyGrad.addColorStop(0, lit);
  bodyGrad.addColorStop(0.38, dark);
  bodyGrad.addColorStop(1, deep);
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  // The nose is BLUNT and the taper is toward the tail. An earlier pass had
  // symmetric control points and every swimmer read as a floating leaf; a
  // fish's mass is forward, and that one asymmetry is most of what makes the
  // silhouette animal rather than geometric.
  ctx.moveTo(lenPx, bend * 0.5);
  ctx.bezierCurveTo(lenPx * 0.94, -rPx * 0.66 + bend, lenPx * 0.34, -rPx * 1.02 + bend, -lenPx * 0.2, -rPx * 0.7 + bend);
  ctx.quadraticCurveTo(-lenPx * 0.48, -rPx * 0.44 + bend, -lenPx * 0.6, -rPx * 0.2 + bend);
  ctx.quadraticCurveTo(-lenPx * 0.68, 0 + bend, -lenPx * 0.6, rPx * 0.2 + bend);
  ctx.quadraticCurveTo(-lenPx * 0.48, rPx * 0.44 + bend, -lenPx * 0.2, rPx * 0.7 + bend);
  ctx.bezierCurveTo(lenPx * 0.34, rPx * 1.02 + bend, lenPx * 0.94, rPx * 0.66 + bend, lenPx, bend * 0.5);
  ctx.closePath();
  ctx.fill();

  // A separating edge, so two overlapping swimmers stay two swimmers.
  ctx.strokeStyle = 'rgba(1, 10, 16, 0.55)';
  ctx.lineWidth = Math.max(0.5, rPx * 0.06);
  ctx.stroke();

  // Rim light along the back. THIN and weak: this is a wet animal catching
  // what little light reaches it, not a plastic outline. It does strengthen
  // with size — a big fish presents more flank to the surface — but the
  // ceiling is deliberately low.
  const rimA = Math.min(0.42, 0.14 + rPx / 240);
  ctx.strokeStyle = rim;
  ctx.globalAlpha *= rimA;
  ctx.lineWidth = Math.max(0.55, rPx * 0.055);
  ctx.beginPath();
  ctx.moveTo(lenPx * 0.8, -rPx * 0.24 + bend);
  ctx.bezierCurveTo(lenPx * 0.5, -rPx * 0.84 + bend, lenPx * 0.02, -rPx * 0.9 + bend, -lenPx * 0.5, -rPx * 0.24 + bend);
  ctx.stroke();
  ctx.globalAlpha /= rimA;

  // A flank highlight that slides as the body flexes — the cue that reads as
  // "wet" rather than "cut out of paper".
  if (rPx > 2.4) {
    const fl = ctx.createLinearGradient(0, -rPx * 0.5, 0, rPx * 0.3);
    fl.addColorStop(0, `rgba(255, 255, 255, ${sw.self ? 0.1 : 0.075})`);
    fl.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = fl;
    ctx.beginPath();
    ctx.ellipse(lenPx * 0.12 + beat * rPx * 0.12, -rPx * 0.3 + bend, lenPx * 0.36, rPx * 0.26, -0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  // Pectoral fin, rowing out of phase with the tail.
  ctx.fillStyle = dark;
  ctx.globalAlpha *= 0.62;
  ctx.save();
  ctx.translate(lenPx * 0.3, rPx * 0.34);
  ctx.rotate(-0.45 + beat * 0.4);
  ctx.beginPath();
  ctx.ellipse(0, rPx * 0.36, rPx * 0.17, rPx * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha /= 0.62;

  // The eye. One small light dot is the cheapest possible cue that a shape is
  // an animal, and at this body size it is most of the work.
  if (rPx > 3.2) {
    ctx.fillStyle = '#eaf7fd';
    ctx.beginPath();
    ctx.arc(lenPx * 0.62, -rPx * 0.24 + bend, Math.max(0.9, rPx * 0.13), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#01080d';
    ctx.beginPath();
    ctx.arc(lenPx * 0.645, -rPx * 0.24 + bend, Math.max(0.5, rPx * 0.075), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * A short trail of where this swimmer just was. Every ghost is a fresh
 * `reckonSmooth` at an earlier instant — never an integrated velocity of the
 * paint's own — so the trail is literally the path the fold agrees the fish
 * took, and a fish that has stopped leaves no trail at all because all the
 * samples land on the same point.
 */
function paintWake(ctx: CanvasRenderingContext2D, f: Frame, sw: Swimmer): void {
  if (sw.vec.speed <= 0) return;
  for (let k = 1; k <= 4; k++) {
    const p = reckonSmooth(sw.vec, f.atMs - k * 110);
    const s = worldToScreen(f.cam, f.view, p.x, p.y);
    const a = 0.11 * (1 - k / 5);
    ctx.fillStyle = sw.self ? `rgba(255, 214, 158, ${a})` : `rgba(170, 226, 240, ${a})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, bodyRadiusCu(sw.size) * f.cam.scale * (0.55 - k * 0.08), 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * A soft halo under the followed swimmer. Not a marker and not an arrow — the
 * player's own fish is already the only warm-coloured thing in the frame, and
 * this is just enough to find it in a tight ball without a label.
 */
function paintSelfGlow(ctx: CanvasRenderingContext2D, f: Frame, sw: Swimmer, sx: number, sy: number): void {
  const r = bodyRadiusCu(sw.size) * f.cam.scale * 6.5;
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
  g.addColorStop(0, 'rgba(255, 196, 118, 0.2)');
  g.addColorStop(0.35, 'rgba(255, 182, 100, 0.085)');
  g.addColorStop(1, 'rgba(255, 170, 90, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * THE SECOND SCOREBOARD (spec 2.4: "its cooldown is displayed as prominently
 * as size").
 *
 * Size is worn on the body, so the dart is worn on the body too — a ring of
 * light around the player's own fish that empties the instant it is spent and
 * refills over DART_COOLDOWN_MS. Not a bar in a corner, not a number: the two
 * scoreboards sit on the same object, at the same scale, and are read in the
 * same glance at the same place on screen. That is what "as prominently as
 * size" has to mean on a surface with no text on it.
 *
 * The three states are meant to be distinguishable at a glance and at speed:
 *
 *  - **spent / recharging** — a dim, cold, partial arc that sweeps clockwise
 *    from the top. Cold on purpose: it is the only cold thing on the player's
 *    otherwise warm body, so an empty dart reads as something missing.
 *  - **ready** — a complete warm ring with a slow breath in it. Closed is the
 *    signal; a player learns "closed means I can run" in one loop.
 *  - **burning** — while the burst is actually running, the ring flares
 *    outward and fades, so spending it is an event rather than a state change
 *    you notice later.
 *
 * `charge === 1` is exactly `canDart` (input.ts pins that at every instant
 * across a whole recharge), so this ring cannot say "ready" about a verb that
 * would be refused.
 */
function paintDartRing(
  ctx: CanvasRenderingContext2D, f: Frame, sw: Swimmer, sx: number, sy: number,
): void {
  const charge = sw.charge;
  if (charge === undefined) return;
  const rPx = bodyRadiusCu(sw.size) * f.cam.scale;
  // A floor in PIXELS as well as a multiple of the body: a small fish still
  // has to be able to read its own dart, and size already has a scoreboard.
  const ring = Math.max(rPx * 2.7, 26);
  if (ring < 6) return;
  const full = charge >= 1;

  ctx.save();
  ctx.lineCap = 'round';

  // The seat the arc runs in — always visible, so an empty dart is an empty
  // ring rather than nothing at all. Kept DIM and THIN, because the whole
  // legibility of the thing is the contrast between it and the charge.
  ctx.beginPath();
  ctx.arc(sx, sy, ring, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(96, 140, 158, 0.13)';
  ctx.lineWidth = Math.max(1, ring * 0.05);
  ctx.stroke();

  // The charge itself, from the top, clockwise.
  if (charge > 0) {
    const start = -Math.PI / 2;
    const end = start + Math.PI * 2 * charge;
    const breath = full ? 0.82 + 0.18 * Math.sin(f.atMs / 520) : 1;
    ctx.beginPath();
    ctx.arc(sx, sy, ring, start, end);
    ctx.strokeStyle = full
      ? `rgba(255, 206, 138, ${0.94 * breath})`
      : 'rgba(168, 232, 255, 0.85)';
    ctx.lineWidth = Math.max(1.8, ring * (full ? 0.11 : 0.1));
    ctx.stroke();
    if (!full) {
      // A bright head at the leading tip. This is what makes the fill LEVEL
      // unambiguous at a glance — an arc alone on a circle reads as "some of
      // it", a travelling dot reads as "this far, and climbing".
      ctx.beginPath();
      ctx.arc(sx + Math.cos(end) * ring, sy + Math.sin(end) * ring, Math.max(2, ring * 0.1), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(226, 248, 255, 0.95)';
      ctx.fill();
    }
  }

  if (full) {
    // A soft outer halo so a charged dart is legible even when the fish is
    // small on screen or lost in a crowd.
    const g = ctx.createRadialGradient(sx, sy, ring * 0.86, sx, sy, ring * 1.5);
    g.addColorStop(0, 'rgba(255, 198, 120, 0.16)');
    g.addColorStop(1, 'rgba(255, 190, 110, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, ring * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  if (sw.darting === true) {
    // Spending it is an event: a wider, brighter ring thrown outward.
    ctx.beginPath();
    ctx.arc(sx, sy, ring * 1.28, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 236, 200, 0.5)';
    ctx.lineWidth = Math.max(1, rPx * 0.12);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * A word over a swimmer's head. The one text in the whole game surface, and it
 * is the player's own — spec 2.6 makes speech the honest tell that a swimmer
 * is a person, so it has to be readable as language rather than as an icon.
 */
function paintSay(
  ctx: CanvasRenderingContext2D, f: Frame, sw: Swimmer, sx: number, sy: number,
): void {
  if (sw.say === undefined) return;
  const rPx = bodyRadiusCu(sw.size) * f.cam.scale;
  const y = sy - rPx * 2.6;
  ctx.save();
  ctx.font = '500 13px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = Math.min(260, ctx.measureText(sw.say).width) + 16;
  ctx.fillStyle = 'rgba(4, 20, 28, 0.66)';
  ctx.beginPath();
  ctx.roundRect(sx - w / 2, y - 11, w, 22, 11);
  ctx.fill();
  ctx.fillStyle = sw.self ? '#ffdfae' : '#d3edf6';
  ctx.fillText(sw.say, sx, y, 250);
  ctx.restore();
}

/** Where the player has asked to go: a small ring of disturbed water, fading. */
function paintAim(ctx: CanvasRenderingContext2D, f: Frame): void {
  if (!f.aim) return;
  const s = worldToScreen(f.cam, f.view, f.aim.x, f.aim.y);
  const pulse = 0.5 + 0.5 * Math.sin(f.atMs / 260);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 2; k++) {
    ctx.beginPath();
    ctx.arc(s.x, s.y, (7 + k * 7) * (0.85 + 0.15 * pulse), 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(190, 232, 246, ${0.2 - k * 0.1})`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Something to eat, right here, right now — drawn ONLY when the fold's own
 * `canEat` says a bite would credit at this instant (App.tsx runs the check).
 *
 * This is deliberately a near-field cue and not a food map. `isBloomReady` is
 * true for very nearly every one of the 768 cells at session start ("the sea
 * starts full", bloom.ts), so anything that claimed to show WHERE food is
 * would either carpet the whole sea or pick a subset on a rule the game does
 * not have. What is drawn here is the one thing that is honestly known.
 */
function paintBite(ctx: CanvasRenderingContext2D, f: Frame): void {
  if (!f.bite) return;
  const s = worldToScreen(f.cam, f.view, f.bite.x, f.bite.y);
  const r = 26 * f.cam.scale + 10;
  const breath = 0.55 + 0.45 * Math.sin(f.atMs / 380);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 2.6);
  g.addColorStop(0, `rgba(178, 255, 206, ${0.3 * breath})`);
  g.addColorStop(0.4, `rgba(130, 226, 176, ${0.11 * breath})`);
  g.addColorStop(1, 'rgba(110, 200, 160, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(s.x, s.y, r * 2.6, 0, Math.PI * 2);
  ctx.fill();
  // A few motes hanging in it, so it reads as something in the water rather
  // than as a UI ring painted over it.
  for (let k = 0; k < 7; k++) {
    const a = unit(k * 31 + 5) * Math.PI * 2 + f.atMs / 2600;
    const d = r * (0.35 + unit(k * 17 + 3) * 0.8);
    ctx.fillStyle = `rgba(206, 255, 224, ${0.34 * breath})`;
    ctx.beginPath();
    ctx.arc(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d * 0.8, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// The frame
// ---------------------------------------------------------------------------

/**
 * Paint one frame. The whole surface, back to front, with no text on it.
 *
 * Order matters and is not arbitrary: the water and its light go down first,
 * then the far parallax snow, then the swimmers, then the near murk and
 * vignette OVER them — so a fish at the edge of the water is dimmed by the
 * same murk the water is, instead of floating on top of it.
 */
export function paintFrame(ctx: CanvasRenderingContext2D, f: Frame): void {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  paintWater(ctx, f);
  paintShafts(ctx, f);
  paintMotes(ctx, f);

  // Position every swimmer through the engine's own reckoning, once, then
  // cull to what the window can actually show.
  const placed = f.swimmers.map((sw) => {
    const p = reckonSmooth(sw.vec, f.atMs);
    return { id: sw.id, x: p.x, y: p.y, size: sw.size, sw };
  });
  const visible = cullBodies(f.cam, f.view, placed);

  // Deepest first, so overlapping fish stack the way the water implies.
  visible.sort((a, b) => a.y - b.y);

  // Under the bodies: what is in the water rather than on it.
  paintBite(ctx, f);
  paintAim(ctx, f);

  for (const v of visible) {
    if (!v.sw.self) continue;
    const s = worldToScreen(f.cam, f.view, v.x, v.y);
    paintSelfGlow(ctx, f, v.sw, s.x, s.y);
  }
  for (const v of visible) paintWake(ctx, f, v.sw);
  // The dart ring goes UNDER the body it belongs to, so a charged dart reads
  // as light coming off the fish rather than as a hoop drawn on top of it.
  for (const v of visible) {
    const s = worldToScreen(f.cam, f.view, v.x, v.y);
    paintDartRing(ctx, f, v.sw, s.x, s.y);
  }
  for (const v of visible) {
    const s = worldToScreen(f.cam, f.view, v.x, v.y);
    paintFish(ctx, f, v.sw, s.x, s.y);
  }
  for (const v of visible) {
    const s = worldToScreen(f.cam, f.view, v.x, v.y);
    paintSay(ctx, f, v.sw, s.x, s.y);
  }

  paintMurk(ctx, f);
  paintGrain(ctx, f);
  paintVignette(ctx, f);
  ctx.restore();
}
