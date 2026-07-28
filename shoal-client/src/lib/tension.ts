/**
 * Tension — the school's own greed, measured.
 *
 * Deliberately a COUNT of fish outside a median-anchored core, not a mean
 * distance. A count caps every individual's contribution at exactly one, which
 * removes the "call the shark on my enemy" exploit: swimming further out than
 * anyone else changes nothing once you are already outside.
 *
 * WILD FISH ARE NOT IN THIS FILE'S ARITHMETIC, ANYWHERE. Spec 2.6 says wild
 * fish count "toward shielding and toward tension"; spec 2.11 — the section
 * that specifies tension precisely — calls it "the fraction of PLAYERS outside
 * the core". This implements 2.11, and the plan
 * (docs/superpowers/plans/2026-07-28-the-shoal-wild.md) records it as a
 * deliberate spec correction rather than an oversight.
 *
 * The reason is the design's whole moral: *the shark is something the school
 * does to itself*. A wild shoal of thirty-six moving on an orbit no player can
 * influence would dominate a statistic of thirty-six-plus-twenty, and the
 * predator would arrive because the scenery drifted — greed unmeasured, and a
 * verdict nobody earned.
 *
 * Every entry point below therefore filters to the school FIRST, so the
 * exclusion covers the median, the numerator and the denominator alike. It is
 * a runtime filter as well as a type (`SwimmerBody`) because the type is a
 * compile-time brand and a cast defeats it; see shelter.ts's header.
 */
import { dist2, medianInt } from './fixed';
import { CORE_R2, TENSION_NEUTRAL } from './shoalConst';
import { isWildId } from './wild';
import type { SwimmerBody } from './shelter';

/**
 * The bodies tension is allowed to measure. Idempotent, so each entry point
 * below may apply it without knowing whether another already did.
 */
function schoolOnly(bodies: readonly SwimmerBody[]): readonly SwimmerBody[] {
  return bodies.some((b) => isWildId(b.id)) ? bodies.filter((b) => !isWildId(b.id)) : bodies;
}

/** The median position of the school. Immune to outliers by construction. */
export function coreCentre(bodies: readonly SwimmerBody[]): { x: number; y: number } {
  const school = schoolOnly(bodies);
  if (school.length === 0) return { x: 0, y: 0 };
  return {
    x: medianInt(school.map((b) => b.x)),
    y: medianInt(school.map((b) => b.y)),
  };
}

/** Ids of fish outside the core, ascending. Sorted so callers are order-stable. */
export function outsideCore(bodies: readonly SwimmerBody[]): string[] {
  const school = schoolOnly(bodies);
  const c = coreCentre(school);
  const out: string[] = [];
  for (const b of school) {
    if (dist2(b.x, b.y, c.x, c.y) > CORE_R2) out.push(b.id);
  }
  return out.sort();
}

/** Fraction of the school outside the core, in per mille. */
export function spreadPerMille(bodies: readonly SwimmerBody[]): number {
  const school = schoolOnly(bodies);
  if (school.length === 0) return 0;
  return Math.trunc((1000 * outsideCore(school).length) / school.length);
}

/** Advance tension by one tick. Floors at zero; never negative. */
export function stepTension(current: number, bodies: readonly SwimmerBody[]): number {
  const next = current + (spreadPerMille(bodies) - TENSION_NEUTRAL);
  return next < 0 ? 0 : next;
}

/**
 * The fish most responsible for the current tension: whoever has been outside
 * the core longest. Ties break toward the larger fish, then the lower id.
 * Greed calls the shark, and the shark knows your name.
 *
 * A wild fish can never be named here, however long its orbit has kept it out
 * of the core: `outsideCore` has already dropped it, so it is not a candidate
 * even if `outsideTicks` somehow carries an entry for it.
 */
export function topContributor(
  bodies: readonly SwimmerBody[],
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
