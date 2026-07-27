/**
 * Integer geometry for the Shoal engine.
 *
 * "No floating point survives past module initialisation" would be the
 * comfortable claim, and it is literally false: quantize and reckon both
 * divide, and a JavaScript division is double arithmetic no matter how
 * integral its operands. The property that actually holds is stronger than
 * the false one is comforting —
 *
 *   Every value this module STORES or RETURNS is an integer. Math.cos and
 *   Math.sin are called only here, only at module init, and their results are
 *   rounded to integers immediately (the two engines' cos/sin need not agree
 *   bit-for-bit, but after Math.round at TRIG_SCALE they do). The transient
 *   doubles are the two divisions, and IEEE-754 double division is CORRECTLY
 *   ROUNDED and mandated as such by the ECMAScript spec — so every conforming
 *   engine produces the identical double from identical operands, and
 *   Math.trunc/Math.floor turn it back into the identical integer.
 *
 * The operands stay exact because they stay well below 2^53. The largest
 * product reckon forms is speed * COS[h] * dtMs, bounded by
 * SPEED_DART(220) * TRIG_SCALE(4096) = 901_120 per ms; exactness would only
 * be at risk past dtMs = 2^53 / 901_120 ~= 9.996e9 ms, about 116 days. The
 * fold never comes near it: a fish is evicted once t exceeds
 * PRESENCE_TTL_MS(90_000) past its last vector, so dtMs <= 90_000 and the
 * product tops out at 8.1e10 — five orders of magnitude of headroom.
 *
 * So two clients agree on every position they ever compute, which is the
 * thing that had to be true. Correct rounding is what buys it, not the
 * absence of floats.
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
