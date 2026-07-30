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
 * WHAT THIS FILE DELIBERATELY DOES NOT DO, NOW VERIFIED RATHER THAN
 * ASSERTED. Spec 2.13 says terrain "gives blooms legible places to appear" —
 * i.e. blooms should be sited AT places rather than uniformly. Bloom siting
 * is CONSENSUS, and here is exactly where:
 *
 *   src/lib/bloom.ts:186    isBloomReady — is this cell fallow?
 *   src/lib/bloom.ts:240    canEat       — does this claimed bite credit?
 *   src/lib/shoalEngine.ts:349  foldTick calls canEat to judge every eat
 *   src/lib/shoalEngine.ts:478  foldTick calls isBloomReady to regrow
 *
 * Both live inside `foldTick`, so any rule that made a cell inside the Kelp
 * Stand likelier to carry a bloom would change which bites credit, would
 * change every client's `bitesTaken` and every fish's size, and would
 * re-score all of history. It is a hard fork, not a decoration, and it is
 * not attempted here or anywhere on the display side. Recorded as an open
 * question rather than left implied.
 *
 * There is a second consequence worth stating plainly, because it is the
 * one place the spec and the fold currently disagree: under the fold's
 * actual rule food grows where the school ISN'T (bloom.ts's header), and
 * places are where the school IS. So today a named place is, if anything,
 * slightly food-POORER than open water. Making 2.13's sentence true needs a
 * consensus change; nothing on this side can fake it, and nothing here
 * pretends to.
 *
 * The same goes for sweep lanes (`src/lib/sweep.ts` is folded too). What
 * this module hands downstream is geometry, a name, and — since plan 4b —
 * which of them you are standing in, for the sole purpose of saying its
 * name out loud once when you get there.
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
 *
 * ===========================================================================
 * THE SOUTH-WEST CORNER IS EMPTY ON PURPOSE — RULED 2026-07-29
 * ===========================================================================
 *
 * The four places cover 7.70% of the sea and they are not evenly spread. Mean
 * distance from a point to the nearest place's EDGE, by quadrant, measured on
 * an 8-cu grid over the whole world:
 *
 *   SE 304 cu    NW 397 cu    NE 491 cu    SW 748 cu
 *
 * The loneliest water in the sea is the south-west corner itself — (0, 3072)
 * is 1_822 cu from the Drop-off's edge, or 30 s at SPEED_CRUISE (60 cu/s).
 * 11.1% of the sea is more than 900 cu (15 s) from anywhere named, and nearly
 * all of that 11.1% is that one corner. So the gap is real and it is measured,
 * not eyeballed.
 *
 * IT STAYS OPEN. A fifth place there, or shifting the Drop-off west to even
 * the quadrants out, were both live options; here is why neither was taken.
 *
 * **1. Terrain is not shelter, so an empty corner is not a dangerous corner.**
 * `shelterOf` counts fish — people at SHELTER_BASE and wild fish at
 * WILD_SHELTER_WEIGHT — and nothing else. Nothing in `src/lib/` imports this
 * module or any geometry from it (`grep -rn terrain src/lib/` returns one
 * unrelated comment), so no place in this file makes any swimmer one point
 * safer. A place is safe only because PEOPLE are at it. What the corner costs
 * a player is therefore company, not survival — and company is exactly what
 * they went out there to trade away.
 *
 * **2. The corner is the sea's food pole, and the four places are what make
 * it one.** `bloom.ts`: a cell carries a bloom once nothing has come within
 * BLOOM_VISIT_R (200 cu) of it for BLOOM_READY_MS (45 s). Places gather the
 * school into the other three quadrants, so the south-west is the water most
 * reliably fallow, which is to say the most reliably worth the swim. That is
 * §2.2 drawn on a map — bloom.ts's own header states it as "food grows in the
 * open, safety is in the crowd, and they are never in the same place" — and a
 * fifth place in the corner would move the crowd onto the food and flatten
 * it. Spec 2.13's RESOLVED block refuses to bias blooms toward terrain for
 * exactly this reason; siting terrain where the food reliably is would be the
 * same mistake run backwards, and it would need no fold change to do the
 * damage.
 *
 * **3. Moving a place costs more than it did a week ago.** Since plan 4b every
 * place says its name as you arrive, so these coordinates are now the referent
 * of a word players share. Sliding the Drop-off west would make "the drop-off
 * is south" wrong for everyone who has already learned it, which is a real
 * price for a cosmetic evening-out.
 *
 * WHAT IS BEING PRICED, STATED HONESTLY. Spec 2.13's argument for places is
 * that without them the minute between sweeps is "hold a heading, which is
 * waiting". In the shallows' own arrangement a sweep lands roughly every 90 s
 * (TENSION_TRIGGER 30_000 at +83 a tick with three of nine outside the core),
 * so a swimmer in the far corner is about a third of a cycle from named water.
 * That is a genuine cost and it is the price of the richest food in the sea.
 * Open water has to be genuinely open somewhere or "food in the open" is a
 * sentence about nothing.
 *
 * WHAT WOULD OVERTURN THIS, so it stays falsifiable: if the corner turns out
 * to be where the school actually LIVES — if the food pull is strong enough
 * that players spend the minute between sweeps down there — then it is not
 * open water any more and it should be named. The measurement that settles it
 * is where the bodies are when a hush starts, not where the food is.
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

// ---------------------------------------------------------------------------
// ARRIVING SOMEWHERE
//
// A name is only worth having if a player learns it, and the only way anyone
// ever learns the name of a place is by being told it once, when they get
// there. Spec 2.13's own example — *"kelp!" is a complete rally call in one
// word* — is a claim about two players sharing a WORD, and a word that lives
// only in this file's source is not shared with anybody.
//
// THIS REVERSES `terrainPaint.ts`'s "NO TEXT" RULING, DELIBERATELY AND ONLY
// THIS FAR. That ruling's reasoning was sound about the thing it was
// rejecting: a caption floating permanently over the kelp is chrome, it
// makes the landmark redundant, and it would put the first standing piece of
// UI on a surface that has held out against one for four plans. None of that
// is true of an announcement. What is added here is not a label but a
// MOMENT — the place names itself as you arrive, for four and a half seconds,
// and then the sea is wordless again. A player who has been to the kelp once
// can shout "kelp!"; a player who has not still has nothing on their screen.
//
// It is still terrain, so it is still purely a game object: nothing below
// derives from, refers to, or is named after anything on the network
// (spec 2.13 and the diegetic rule, 1.1), and nothing below is consensus —
// two clients with different values for any constant here see the same sea
// and agree about every position, every bloom and every sweep.
// ---------------------------------------------------------------------------

/**
 * How far past a place's edge you must get before you have LEFT it, in cu.
 *
 * This is hysteresis and it is not cosmetic. Without it a swimmer idling on
 * the boundary — which is exactly what a swimmer holding station at the edge
 * of a stand of kelp is doing — crosses in and out several times a second,
 * and every crossing is a fresh arrival, so the place's name strobes in their
 * face. With it, arriving and leaving are different distances and neither can
 * chatter.
 *
 * 120 cu is two dart-lengths short of nothing and well under a shelter radius
 * (340), so the ring never reaches out far enough to hold you at one place
 * while you are visibly at another — the two closest places in the sea are
 * ~1553 cu apart (see the header) against a worst-case hold of 320 + 120.
 */
export const PLACE_EXIT_MARGIN = 120;

/** How long the name takes to surface, hold, and go, in ms. */
export const NAME_FADE_IN_MS = 800;
export const NAME_HOLD_MS = 2_600;
export const NAME_FADE_OUT_MS = 1_200;
/** The whole announcement, arrival to silence. */
export const NAME_TOTAL_MS = NAME_FADE_IN_MS + NAME_HOLD_MS + NAME_FADE_OUT_MS;

/**
 * Where a swimmer is, in the only sense terrain has an opinion about: the
 * place they are at, and when they got there.
 *
 * `sinceMs` is stamped on CHANGE and on nothing else, which is what makes it
 * usable as the start of an announcement. `NOWHERE`'s -1 is a stamp that has
 * never happened; `nameAlpha` never reads it, because a `null` place is
 * silent whatever the clock says.
 */
export interface Arrival {
  readonly at: Place | null;
  readonly sinceMs: number;
}

/** Open water, never having been anywhere. */
export const NOWHERE: Arrival = Object.freeze({ at: null, sinceMs: -1 });

/**
 * Advance an arrival by one frame.
 *
 * Pure, and pure in the strong sense the display side needs: given the same
 * `prev` and the same point it returns the IDENTICAL object when nothing has
 * changed, so a frame loop calling this sixty times a second allocates
 * nothing and — more importantly — cannot restart an announcement by
 * accident. Every new `Arrival` it does build is frozen.
 *
 * Two rules, in this order:
 *
 *  1. IF YOU WERE SOMEWHERE, you are still there until you get past that
 *     place's own hold ring (`r + PLACE_EXIT_MARGIN`, inclusive — the ring
 *     itself still counts as here, matching `placeAt`'s inclusive edge).
 *  2. OTHERWISE it is `placeAt` and nothing cleverer, so crossing straight
 *     from one place into another names the new one on the same call rather
 *     than a frame later.
 *
 * `nowMs` is the display clock, passed in — this module reads no clock.
 */
export function trackArrival(
  prev: Arrival, x: number, y: number, nowMs: number, places: readonly Place[] = PLACES,
): Arrival {
  if (prev.at !== null) {
    const hold = prev.at.r + PLACE_EXIT_MARGIN;
    if (dist2(x, y, prev.at.x, prev.at.y) <= hold * hold) return prev;
  }
  const now = placeAt(x, y, places);
  if (now === prev.at) return prev;
  return Object.freeze({ at: now, sinceMs: nowMs });
}

/**
 * How strongly the place's name is being said right now, 0..1: up over
 * NAME_FADE_IN_MS, level for NAME_HOLD_MS, away over NAME_FADE_OUT_MS, then
 * silent forever.
 *
 * Zero in open water whatever the clock reads, and zero for a `nowMs` BEFORE
 * the stamp — the caller's clock is a display clock and a fold time arriving
 * out of order must read as silence, never as a negative alpha.
 */
export function nameAlpha(a: Arrival, nowMs: number): number {
  if (a.at === null) return 0;
  const t = nowMs - a.sinceMs;
  if (t <= 0 || t >= NAME_TOTAL_MS) return 0;
  if (t < NAME_FADE_IN_MS) return t / NAME_FADE_IN_MS;
  if (t < NAME_FADE_IN_MS + NAME_HOLD_MS) return 1;
  return 1 - (t - NAME_FADE_IN_MS - NAME_HOLD_MS) / NAME_FADE_OUT_MS;
}

/**
 * The whole announcement, or null when the sea has nothing to say — the one
 * call a painter needs, so no painter has to know the shape of `Arrival`.
 */
export function announcedName(
  a: Arrival, nowMs: number,
): { place: Place; name: string; alpha: number } | null {
  const alpha = nameAlpha(a, nowMs);
  if (a.at === null || alpha <= 0) return null;
  return { place: a.at, name: a.at.name, alpha };
}
