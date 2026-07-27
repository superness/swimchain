/**
 * Tension — the school's own greed, measured.
 *
 * Deliberately a COUNT of fish outside a median-anchored core, not a mean
 * distance. A count caps every individual's contribution at exactly one, which
 * removes the "call the shark on my enemy" exploit: swimming further out than
 * anyone else changes nothing once you are already outside.
 */
import { dist2, medianInt } from './fixed';
import { CORE_R2, TENSION_NEUTRAL } from './shoalConst';
import type { Body } from './shelter';

/** The median position of the school. Immune to outliers by construction. */
export function coreCentre(bodies: readonly Body[]): { x: number; y: number } {
  if (bodies.length === 0) return { x: 0, y: 0 };
  return {
    x: medianInt(bodies.map((b) => b.x)),
    y: medianInt(bodies.map((b) => b.y)),
  };
}

/** Ids of fish outside the core, ascending. Sorted so callers are order-stable. */
export function outsideCore(bodies: readonly Body[]): string[] {
  const c = coreCentre(bodies);
  const out: string[] = [];
  for (const b of bodies) {
    if (dist2(b.x, b.y, c.x, c.y) > CORE_R2) out.push(b.id);
  }
  return out.sort();
}

/** Fraction of the school outside the core, in per mille. */
export function spreadPerMille(bodies: readonly Body[]): number {
  if (bodies.length === 0) return 0;
  return Math.trunc((1000 * outsideCore(bodies).length) / bodies.length);
}

/** Advance tension by one tick. Floors at zero; never negative. */
export function stepTension(current: number, bodies: readonly Body[]): number {
  const next = current + (spreadPerMille(bodies) - TENSION_NEUTRAL);
  return next < 0 ? 0 : next;
}

/**
 * The fish most responsible for the current tension: whoever has been outside
 * the core longest. Ties break toward the larger fish, then the lower id.
 * Greed calls the shark, and the shark knows your name.
 */
export function topContributor(
  bodies: readonly Body[],
  outsideTicks: ReadonlyMap<string, number>,
): string | null {
  const out = outsideCore(bodies);
  if (out.length === 0) return null;
  const byId = new Map(bodies.map((b) => [b.id, b]));
  let best: string | null = null;
  let bestTicks = -1;
  let bestSize = -1;
  for (const id of out) {
    const ticks = outsideTicks.get(id) ?? 0;
    const size = byId.get(id)?.size ?? 0;
    if (ticks > bestTicks || (ticks === bestTicks && size > bestSize)) {
      best = id;
      bestTicks = ticks;
      bestSize = size;
    }
  }
  return best;
}
