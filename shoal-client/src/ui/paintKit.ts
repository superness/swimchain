/**
 * The paint's shared vocabulary: the sea's palette, and the deterministic
 * noise everything cosmetic is drawn from.
 *
 * DISPLAY SIDE, and the loosest part of it. Nothing here is imported by
 * `src/lib/`, nothing feeds the fold, and every number is free to change
 * without splitting a client.
 *
 * WHY THIS FILE EXISTS. `seaPaint.ts` was 1_310 lines and the shell's own
 * review flagged it; the wild shoal (`wildPaint.ts`) and the sea's named
 * places (`terrainPaint.ts`) are two more layers of the same picture and had
 * to share the same colours or they would have read as pasted on. Duplicating
 * five hex constants into three files is exactly how a landmark ends up a
 * slightly different blue from the water it is standing in. So the palette and
 * the hashes moved here, and the three painters import them.
 *
 * ON THE HASHES: they are NOT consensus and could not be — they only decide
 * which fish flicks its tail on which beat and which frond leans which way —
 * but they must be STABLE, or every cosmetic phase resets whenever an array
 * order changes.
 */

// ---------------------------------------------------------------------------
// Palette. Cold, low-chroma, and very dark at the bottom of the range: the
// sea has to be somewhere you do not want to be alone in.
// ---------------------------------------------------------------------------

export const ABYSS = '#01060a';
export const DEEP = '#03131d';
export const MID = '#07293a';
export const UPPER = '#0d4c60';
export const SURFACE = '#1b8095';

/**
 * The silt colours the seafloor is built from — the same cold range as the
 * water, one step warmer and one step lighter, so a landmark reads as a
 * lighter part of the same sea rather than as a different material dropped
 * into it. `SILT_LIT` is only ever reached where a light shaft would land.
 */
export const SILT_DEEP = '#04141c';
export const SILT = '#0a2733';
export const SILT_LIT = '#194a58';

/** Living things on the floor: kelp, weed. Green enough to be alive, barely. */
export const WEED_DARK = '#062019';
export const WEED = '#0d3a2d';
export const WEED_LIT = '#1d6b52';

// ---------------------------------------------------------------------------
// The depth ramp
// ---------------------------------------------------------------------------

/**
 * The water's own colour at a world depth, as [r, g, b].
 *
 * THE SEA IS DRAWN IN ELEVATION, not in plan: `paintWater` runs its gradient
 * down the world's y axis, `paintShafts` drops light from above y=0, and a
 * swimmer is drawn side-on with its dorsal up. So world y IS depth, and this
 * function is the same ramp `paintWater` builds its gradient from —
 * duplicated as numbers rather than re-read off a `CanvasGradient`, which is
 * write-only.
 *
 * It exists so `terrainPaint.ts` can mix every colour it draws against the
 * water at the same depth. That is what makes a landmark look like it is IN
 * the sea: at y=750 the Wreck is bluer and paler than the Drop-off's rock at
 * y=2700, without a hand-picked palette per place, and it stays true if the
 * water's gradient is ever retuned.
 */
const WATER_STOPS: Array<{ at: number; rgb: [number, number, number] }> = [
  { at: 0, rgb: [27, 128, 149] }, // SURFACE
  { at: 0.08, rgb: [13, 76, 96] }, // UPPER
  { at: 0.34, rgb: [7, 41, 58] }, // MID
  { at: 0.68, rgb: [3, 19, 29] }, // DEEP
  { at: 1, rgb: [1, 6, 10] }, // ABYSS
];

/** The world y the gradient starts and ends at — `paintWater`'s own bounds. */
export const WATER_TOP_Y = -600;
export const WATER_BOTTOM_Y = 3972; // WORLD_H + 900

export function waterAt(wy: number): [number, number, number] {
  const t = (wy - WATER_TOP_Y) / (WATER_BOTTOM_Y - WATER_TOP_Y);
  const f = t < 0 ? 0 : t > 1 ? 1 : t;
  for (let i = 1; i < WATER_STOPS.length; i++) {
    const a = WATER_STOPS[i - 1];
    const b = WATER_STOPS[i];
    if (f <= b.at) {
      const k = b.at === a.at ? 0 : (f - a.at) / (b.at - a.at);
      return [
        a.rgb[0] + (b.rgb[0] - a.rgb[0]) * k,
        a.rgb[1] + (b.rgb[1] - a.rgb[1]) * k,
        a.rgb[2] + (b.rgb[2] - a.rgb[2]) * k,
      ];
    }
  }
  return WATER_STOPS[WATER_STOPS.length - 1].rgb;
}

// ---------------------------------------------------------------------------
// Deterministic per-id and per-index noise.
// ---------------------------------------------------------------------------

export function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function hashInt(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** A stable 0..1 from an integer seed. */
export function unit(n: number): number {
  return hashInt(n) / 4294967296;
}

/** A stable value in [lo, hi) from an integer seed. */
export function span(n: number, lo: number, hi: number): number {
  return lo + unit(n) * (hi - lo);
}

/** `rgba(...)` from three channels and an alpha. */
export function rgba(r: number, g: number, b: number, a: number): string {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
}

/** 0 below `a`, 1 above `b`, smooth in between. */
export function smoothstep(a: number, b: number, v: number): number {
  if (b === a) return v < a ? 0 : 1;
  const t = (v - a) / (b - a);
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}
