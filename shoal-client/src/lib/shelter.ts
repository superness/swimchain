/**
 * Shelter: how protected a swimmer is by the crowd around it.
 *
 * Exposure is a size-weighted NEIGHBOUR COUNT within a radius, not a
 * nearest-neighbour distance. Under a distance formulation a pair is nearly as
 * safe as a school and takes all the food, so the game's real texture becomes
 * buddy-pairing. The threshold of three plain neighbours prices that
 * deliberately: a pair is a marriage, a trio has politics.
 */
import { dist2 } from './fixed';
import {
  SHELTER_R2, SHELTER_BASE, SHELTER_SIZE_DIV, SHELTER_SIZE_CAP, SHELTER_THRESHOLD,
} from './shoalConst';

/** The minimum a fish needs to be to anyone else: a place and a size. */
export interface Body {
  id: string;
  x: number;
  y: number;
  size: number;
}

/** How much shelter a fish of this size gives to a neighbour. */
export function shelterWeight(size: number): number {
  const bonus = Math.trunc(size / SHELTER_SIZE_DIV);
  return SHELTER_BASE + (bonus > SHELTER_SIZE_CAP ? SHELTER_SIZE_CAP : bonus);
}

/** Total shelter `self` receives from `others`. A fish never shelters itself. */
export function shelterOf(self: Body, others: readonly Body[]): number {
  let total = 0;
  for (const o of others) {
    if (o.id === self.id) continue;
    if (dist2(self.x, self.y, o.x, o.y) <= SHELTER_R2) total += shelterWeight(o.size);
  }
  return total;
}

/** True when the sweep is permitted to take this fish. */
export function isExposed(self: Body, others: readonly Body[]): boolean {
  return shelterOf(self, others) < SHELTER_THRESHOLD;
}

/** Shelter for every body, against every other body. */
export function shelterMap(bodies: readonly Body[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of bodies) out.set(b.id, shelterOf(b, bodies));
  return out;
}
