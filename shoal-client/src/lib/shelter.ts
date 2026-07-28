/**
 * Shelter: how protected a swimmer is by the crowd around it.
 *
 * Exposure is a size-weighted NEIGHBOUR COUNT within a radius, not a
 * nearest-neighbour distance. Under a distance formulation a pair is nearly as
 * safe as a school and takes all the food, so the game's real texture becomes
 * buddy-pairing. The threshold of three plain neighbours prices that
 * deliberately: a pair is a marriage, a trio has politics.
 *
 * ---------------------------------------------------------------------------
 * TWO POPULATIONS, AND WHY THE DIFFERENCE IS IN THE TYPES
 * ---------------------------------------------------------------------------
 * Since the wild shoal (wild.ts, spec 2.6) there are two kinds of body in the
 * sea, and exactly one function pair may see both:
 *
 *   shelterOf / isExposed   see PEOPLE and WILD FISH   (ShelterBody[])
 *   outsideCore, spreadPerMille, stepTension, topContributor  (tension.ts)
 *   markVisits              (bloom.ts)
 *   selectTaken             (sweep.ts)
 *                           see PEOPLE ONLY            (SwimmerBody[])
 *
 * Tension is excluded because *the shark is something the school does to
 * itself*: if a wild shoal counted, wild movement would dominate the statistic
 * and the predator would arrive because the scenery drifted. The bloom map is
 * excluded because wild fish do not eat and do not trample, so "food grows
 * where the school isn't" stays a fact about players. The sweep is excluded
 * because your safety is other people at the moment of the verdict.
 *
 * A `Body[]` that sometimes holds wild fish and sometimes does not,
 * distinguished only by which call site built it, is precisely how the sweep
 * ends up seeing them. So the distinction is a TYPE:
 *
 *   Body         the structural minimum — a place and a size. Still the type
 *                of `self`, since a fish's own kind never affects the answer.
 *   SwimmerBody  a person. `wild?: never` is a brand, not data: it is what
 *                makes a WildBody structurally UNassignable here, while an
 *                ordinary `{id, x, y, size}` literal still is, so no existing
 *                caller had to change.
 *   WildBody     a wild fish, carrying `wild: true`.
 *   ShelterBody  either. The only population shelter accepts.
 *
 * AND A RUNTIME GUARD AS WELL, on the ID rather than the flag. The flag is for
 * the compiler; the id prefix is for everything the compiler cannot see. Three
 * reasons it is not belt-and-braces:
 *
 *  - `ShoalState.lockedPositions` is a Map of `{x, y, size}` keyed by id, and
 *    the sweep rebuilds bodies out of it. Any object flag is gone by then. The
 *    id is all that survives, so the id is what the guard must read.
 *  - A cast or an `any` at one call site defeats a type silently. "The shark
 *    ate the wrong fish" is the most trust-destroying bug this game can have
 *    (sweep.ts's header), so it gets a defence that survives a cast.
 *  - A rule enforced only by the compiler cannot be mutation-verified, and
 *    every load-bearing rule in this engine has to be.
 *
 * The guard is safe from griefing because a swimmer id is the author's own
 * ed25519 public key in hex, taken from the reply envelope the node reports
 * and never from anything a client writes into a body (shoalWire.ts's header).
 * Nobody can name themselves `wild:0` to become unsweepable. If an id ever
 * becomes client-chosen, `WILD_ID_PREFIX` must be rejected at that boundary.
 */
import { dist2 } from './fixed';
import { isWildId } from './wild';
import {
  SHELTER_R2, SHELTER_BASE, SHELTER_SIZE_DIV, SHELTER_SIZE_CAP, SHELTER_THRESHOLD,
  WILD_SHELTER_WEIGHT,
} from './shoalConst';

/** The minimum a fish needs to be to anyone else: a place and a size. */
export interface Body {
  id: string;
  x: number;
  y: number;
  size: number;
}

/**
 * A person. The `wild?: never` brand is what keeps a WildBody out: TypeScript
 * rejects `wild: true` against `wild?: undefined`, so `WildBody[]` is not
 * assignable to `SwimmerBody[]`, while a plain `{id, x, y, size}` still is.
 */
export interface SwimmerBody extends Body {
  wild?: never;
}

/** A wild fish, as a body. Never a person, never in `state.fish`. */
export interface WildBody extends Body {
  wild: true;
}

/** The only population shelter judges: people and wild fish together. */
export type ShelterBody = SwimmerBody | WildBody;

/**
 * Stamp a wild fish as a body. The single place a WildBody is minted, so the
 * brand and the wild id always travel together.
 */
export function wildBodyOf(f: Body): WildBody {
  return { id: f.id, x: f.x, y: f.y, size: f.size, wild: true };
}

/** How much shelter a PERSON of this size gives to a neighbour. */
export function shelterWeight(size: number): number {
  const bonus = Math.trunc(size / SHELTER_SIZE_DIV);
  return SHELTER_BASE + (bonus > SHELTER_SIZE_CAP ? SHELTER_SIZE_CAP : bonus);
}

/**
 * How much shelter this body gives, whoever it is. A wild fish contributes a
 * flat WILD_SHELTER_WEIGHT (half a person; see shoalConst.ts for the
 * arithmetic and the ruling); a person contributes its size-weighted share.
 *
 * Reads the ID, not the flag — see this module's header for why.
 */
export function bodyShelterWeight(b: Body): number {
  return isWildId(b.id) ? WILD_SHELTER_WEIGHT : shelterWeight(b.size);
}

/** Total shelter `self` receives from `others`. A fish never shelters itself. */
export function shelterOf(self: Body, others: readonly ShelterBody[]): number {
  let total = 0;
  for (const o of others) {
    if (o.id === self.id) continue;
    if (dist2(self.x, self.y, o.x, o.y) <= SHELTER_R2) total += bodyShelterWeight(o);
  }
  return total;
}

/** True when the sweep is permitted to take this fish. */
export function isExposed(self: Body, others: readonly ShelterBody[]): boolean {
  return shelterOf(self, others) < SHELTER_THRESHOLD;
}

/** Shelter for every body, against every other body. */
export function shelterMap(bodies: readonly ShelterBody[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of bodies) out.set(b.id, shelterOf(b, bodies));
  return out;
}
