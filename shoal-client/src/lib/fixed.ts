/**
 * Integer geometry for the Shoal engine.
 *
 * No floating point survives past module initialisation: the trig table is
 * built once with Math.cos/Math.sin and immediately rounded to integers, and
 * every function below operates purely on integers. Two clients that agree on
 * the table agree on every position they ever compute.
 */
import {
  HEADING_STEPS, TRIG_SCALE, QUANT, WORLD_W, WORLD_H,
} from './shoalConst';
import type { Vec } from './shoalTypes';

function buildTable(fn: (rad: number) => number): readonly number[] {
  const out: number[] = [];
  for (let i = 0; i < HEADING_STEPS; i++) {
    const rad = (2 * Math.PI * i) / HEADING_STEPS;
    out.push(Math.round(fn(rad) * TRIG_SCALE));
  }
  return Object.freeze(out);
}

/** cos(brad) * TRIG_SCALE, as integers. */
export const COS: readonly number[] = buildTable(Math.cos);
/** sin(brad) * TRIG_SCALE, as integers. */
export const SIN: readonly number[] = buildTable(Math.sin);

/** Floor `v` to the quantization grid. Floors negatives too, not truncates. */
export function quantize(v: number): number {
  return Math.floor(v / QUANT) * QUANT;
}

/** Pin a point inside the world bounds. */
export function clampToWorld(x: number, y: number): { x: number; y: number } {
  return {
    x: x < 0 ? 0 : x > WORLD_W ? WORLD_W : x,
    y: y < 0 ? 0 : y > WORLD_H ? WORLD_H : y,
  };
}

/**
 * Dead-reckon a vector forward to `atMs`. Elapsed time before the vector was
 * authored is clamped to zero — a vector never predicts the past.
 *
 * dx = speed * COS[heading] * dtMs / (TRIG_SCALE * 1000), integer-truncated.
 */
export function reckon(vec: Vec, atMs: number): { x: number; y: number } {
  const dt = atMs - vec.t;
  const dtMs = dt > 0 ? dt : 0;
  const denom = TRIG_SCALE * 1000;
  const dx = Math.trunc((vec.speed * COS[vec.heading] * dtMs) / denom);
  const dy = Math.trunc((vec.speed * SIN[vec.heading] * dtMs) / denom);
  const c = clampToWorld(vec.x + dx, vec.y + dy);
  return { x: quantize(c.x), y: quantize(c.y) };
}

/** Squared distance. Squared so no square root, and so no float. */
export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/**
 * Median of a list of integers. For an even count, returns the LOWER of the
 * two middle values rather than their average, so the result is always an
 * element of the input and never introduces a fraction. Does not mutate input.
 */
export function medianInt(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = sorted.length % 2 === 1
    ? sorted[(sorted.length - 1) / 2]
    : sorted[sorted.length / 2 - 1];
  return mid;
}
