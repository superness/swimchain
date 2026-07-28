/**
 * Terrain — the sea's named places (spec 2.13).
 *
 * DISPLAY SIDE, not consensus. Terrain is hand-authored geometry and names,
 * nothing more: fixed world coordinates chosen once by a person, never
 * derived from anything on the network and never fed by anything a player
 * does. Nothing here enters `foldShoal`/`foldTick` and nothing here is
 * checkpointed — like `tether.ts`, this module is pure in its arguments and
 * reads no clock, and like the rest of `src/ui/` it is free to use floats
 * (the `Math.sqrt` in `placeDistance` below is exactly that).
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO. Spec 2.13 says terrain "gives
 * blooms legible places to appear" — biasing bloom placement toward a named
 * place. That is a CONSENSUS rule (it would change which cells the fold
 * makes ready, and therefore what every client agrees is edible) and it
 * needs its own design and its own review; it is not attempted here.
 * Recorded as an open question in docs/THE_SHOAL_OPEN_ITEMS.md rather than
 * left implied. The same goes for sweep lanes or any other gameplay use of
 * these coordinates: this module hands back geometry and a name, and
 * nothing downstream consumes it yet — Task 5 owns painting it, and paints
 * only, per its own brief.
 *
 * WHY A PLACE IS A REGION, NOT A POINT. The job (spec 2.13) is to give a
 * player something to swim TO and something to shout — "kelp!" has to mean
 * "I am there", not "the nearest labelled dot happens to be kelp weeds,
 * four shelter-radii away". A point can only ever be NEAR; it cannot be AT.
 * So every place here is a circle — a centre and a radius — `placeAt` asks
 * whether a point falls inside one, and `nearestPlace` asks which region a
 * point is closest to (0 while already inside it). A future bloom-biasing
 * rule and a sweep lane would both want the same shape — a bounded area —
 * so the extent is not a display flourish: it is the one property that
 * would make this geometry reusable for the consensus work this file
 * declines to do.
 *
 * THE FOUR PLACES, chosen against the numbers already in play: the world is
 * WORLD_W x WORLD_H (4096 x 3072), a shelter radius (SHELTER_R) is 340 cu
 * and a bloom cell (BLOOM_CELL) is 128 cu. Every place's radius is
 * comfortably larger than a bloom cell so it reads as a stretch of seafloor
 * rather than a single tile, and every pair of centres sits well over
 * 2 * SHELTER_R apart (checked by hand in terrain.test.ts, smallest gap
 * ~1553 cu against a floor of 680) — meaningfully far apart, per the task
 * brief, and never so close that one place's crowd could be mistaken for
 * another's. No two regions overlap (also checked by hand): the sum of any
 * two radii is a few hundred cu, the gap between their centres thousands.
 *
 *   Kelp Stand    (900,  900)  r=320  — a wide stand, big enough to hold a
 *                                        whole school. NW quadrant.
 *   The Wreck     (3300, 750)  r=220  — a compact site, easy to hold and
 *                                        easy to lose. NE quadrant.
 *   The Drop-off  (2048, 2700) r=260  — where the floor falls away, south
 *                                        of centre.
 *   The Shelf     (3400, 2300) r=300  — a broad shallow shoulder, SE.
 *
 * Every place's full extent (centre +/- radius) stays inside the world with
 * room to spare — the tightest margin is the Drop-off's southern edge,
 * 2700 + 260 = 2960, still 112 cu shy of WORLD_H (3072) — so nothing is
 * ever half-drawn against the wall.
 *
 * Names are the whole point (spec 2.13: *"kelp!" is a complete rally call
 * in one word*) and are sea language only — no place here reads as a debug
 * label, and none says node, chain, space, post, reply or Swimchain.
 * `terrain.test.ts` guards that with a literal substring check so a later
 * addition cannot drift back across the line quietly.
 */
import { dist2 } from '../lib/fixed';
import { WORLD_W, WORLD_H, SHELTER_R, BLOOM_CELL } from '../lib/shoalConst';

/** One named place: a fixed circular region of the sea. */
export interface Place {
  readonly id: string;
  readonly name: string;
  /** Centre, in world cu. */
  readonly x: number;
  readonly y: number;
  /** Radius of the region, in cu. */
  readonly r: number;
}

function place(id: string, name: string, x: number, y: number, r: number): Place {
  return Object.freeze({ id, name, x, y, r });
}

/**
 * The sea's named places. Hand-authored, fixed, and never mutated — see the
 * module header for how the coordinates were chosen. Frozen two ways: the
 * array itself and every entry in it, so nothing downstream can move a
 * place by mutating what this module handed out — which is the concrete
 * form of "a place does not move between calls".
 */
export const PLACES: readonly Place[] = Object.freeze([
  place('kelp', 'Kelp Stand', 900, 900, 320),
  place('wreck', 'The Wreck', 3300, 750, 220),
  place('dropoff', 'The Drop-off', 2048, 2700, 260),
  place('shelf', 'The Shelf', 3400, 2300, 300),
]);

/**
 * Enforces, at module load, the claims the header above makes by hand: every
 * place is bigger than a bloom cell, sits fully inside the world, and is far
 * enough from every other place to be a place a player can tell apart from
 * its neighbours. Throws rather than degrading quietly, so a later edit to
 * `PLACES` that violates one of those claims fails loudly instead of
 * shipping a landmark nobody can actually distinguish.
 */
function assertPlaceInvariants(places: readonly Place[]): void {
  for (const p of places) {
    if (p.r <= BLOOM_CELL) {
      throw new Error(`terrain: ${p.id}'s radius (${p.r}) is not larger than a bloom cell (${BLOOM_CELL})`);
    }
    if (p.x - p.r < 0 || p.x + p.r > WORLD_W || p.y - p.r < 0 || p.y + p.r > WORLD_H) {
      throw new Error(`terrain: ${p.id}'s extent falls outside the world`);
    }
  }
  for (let i = 0; i < places.length; i++) {
    for (let j = i + 1; j < places.length; j++) {
      const a = places[i];
      const b = places[j];
      const gap = Math.sqrt(dist2(a.x, a.y, b.x, b.y));
      if (gap <= a.r + b.r) {
        throw new Error(`terrain: ${a.id} and ${b.id} overlap`);
      }
      if (gap <= 2 * SHELTER_R) {
        throw new Error(`terrain: ${a.id} and ${b.id} are not meaningfully far apart`);
      }
    }
  }
}
assertPlaceInvariants(PLACES);

/**
 * The place containing (x, y), or null if the point is in open water.
 *
 * Inclusive boundary: a point exactly `r` cu from a centre counts as
 * inside — see terrain.test.ts for the hand-derived boundary case. Places
 * here never overlap (checked in terrain.test.ts), so at most one entry
 * can ever match; if a future edit introduced an overlap this returns the
 * FIRST match in `places`' order, which is also why `places` is a plain
 * array and not a set.
 */
export function placeAt(
  x: number, y: number, places: readonly Place[] = PLACES,
): Place | null {
  for (const p of places) {
    if (dist2(x, y, p.x, p.y) <= p.r * p.r) return p;
  }
  return null;
}

/**
 * Distance from (x, y) to a place's REGION, not its centre: 0 while inside
 * it, otherwise the gap to its boundary. This is what makes `nearestPlace`
 * answer "which place should I swim to" rather than "which centre happens
 * to be closest" — the two differ whenever radii differ, which is why
 * terrain.test.ts checks the region measure rather than the centre-only
 * one.
 */
export function placeDistance(x: number, y: number, p: Place): number {
  const d = Math.sqrt(dist2(x, y, p.x, p.y));
  return d > p.r ? d - p.r : 0;
}

/**
 * The nearest place to (x, y), by region distance (`placeDistance`); null
 * only if `places` is empty. Ties are broken by array order — the earlier
 * entry wins, via a strict `<` — which keeps this a pure function of its
 * arguments rather than of anything about how the tie arose.
 */
export function nearestPlace(
  x: number, y: number, places: readonly Place[] = PLACES,
): Place | null {
  let best: Place | null = null;
  let bestD = Infinity;
  for (const p of places) {
    const d = placeDistance(x, y, p);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}
