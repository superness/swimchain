/**
 * The wild shoal — the fish that are not people (spec 2.6).
 *
 * An ocean containing only twenty players and nothing else is a barren ocean.
 * These fish shoal, drift and mill so that the sea has a population; they
 * never speak, because speech is the honest tell that someone is a person; and
 * **they bolt at the hush**, so the cover that felt solid a second ago
 * evaporates exactly when it matters and the crowd you are left standing in is
 * made only of people.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE HAS NO IDEA THAT PLAYERS EXIST
 * ---------------------------------------------------------------------------
 * Spec 3.8 requires every client to simulate wild fish identically, and warns
 * that stepping them on live presence would diverge because two clients hold
 * different in-flight views of who is where. Rather than police that with a
 * lock discipline, this module removes the dependency: a wild fish's position
 * is a pure function of `(seed, tickIndex, hushStartMs, nowMs)` — four numbers
 * every client already agrees on. Determinism then holds BY CONSTRUCTION. No
 * snapshot, no settling delay, no reconciliation, and nothing about the wild
 * shoal enters a checkpoint, because it is derived rather than stored.
 *
 * THE PRICE, stated rather than hidden: **wild fish cannot flee from a player
 * or follow one.** They do not know a player is there. If that ever reads as
 * dead scenery, the honest fix is better MOTION — more schools, different
 * orbits, a tide — and never a peek at player positions, because that is the
 * exact door spec 3.8 exists to keep shut.
 *
 * Two further rulings that keep the consensus surface almost empty: wild fish
 * do not touch the bloom map (no eating, no trampling, so food still grows
 * where the PLAYERS are not), and they are never taken by the sweep (they are
 * gone before it resolves).
 *
 * ---------------------------------------------------------------------------
 * THE MOTION, AND WHY IT COSTS THE SAME AT TICK 100_000 AS AT TICK 1
 * ---------------------------------------------------------------------------
 * Every fish belongs to one of `WILD_SCHOOLS` schools. A school has a CENTRE
 * that traces a Lissajous figure across the sea:
 *
 *     cx(t) = W/2 + ampX * cos(phX + t*rateX)
 *     cy(t) = H/2 + ampY * sin(phY + t*rateY)      rateY != rateX, always
 *
 * and each fish sits at an OFFSET from its school's centre built from two
 * epicycles turning at different rates:
 *
 *     ox(t) = r1*cos(a1 + t*s1) + r2*cos(a2 + t*s2)
 *     oy(t) = r1*sin(a1 + t*s1) + r2*sin(a2 + t*s2)
 *
 * `t` appears only inside `phase0 + t * rate`, so evaluating tick 100_000
 * costs precisely what evaluating tick 1 costs: a fixed number of hashes,
 * table lookups and multiplies per fish. Stepping the shoal forward from zero
 * instead would make cost grow with session length — the trap `foldTick`
 * exists to avoid elsewhere, and it would be worst for the player who joins an
 * hour in.
 *
 * WHERE THE SHOALING COMES FROM. Cohesion is not emergent here and does not
 * need to be: every fish of a school shares ONE centre, so the whole cluster
 * travels together for free, while the two epicycles — different radii,
 * different rates, hashed per fish — keep its members kneading past each other
 * instead of holding a rigid formation. The result is a loose ball of a dozen
 * fish, never wider than 2*WILD_SCHOOL_R, drifting as a body. Evenly-spaced
 * dots read as debug output; a bounded cluster around a wandering centre reads
 * as a shoal.
 *
 * Every parameter above (amplitudes, rates, phases, radii, sizes) is drawn
 * from a 32-bit integer hash of `(seed, index, salt)`. No dice are rolled here
 * and none ever can be: two clients must draw the same sea from the same seed,
 * and wild.test.ts section 4 reads this file's own source to keep it that way.
 * (That check is a literal substring match, so this comment says "dice" rather
 * than naming the function — a tripwire a doc comment can trip is not one.)
 *
 * ---------------------------------------------------------------------------
 * THE BOLT: "GONE" MEANS ABSENT FROM THE RETURNED ARRAY
 * ---------------------------------------------------------------------------
 * While `hushStartMs >= 0` and `nowMs > hushStartMs`, every fish flees along
 * the outward ray from its school's centre at the hush's own tick — a school
 * bursting, not a school marching — at WILD_SPEED_BOLT, faster than any player
 * can dart. From `hushStartMs + WILD_BOLT_MS` onward `wildAt` returns the
 * EMPTY ARRAY.
 *
 * That is the ruling, and it is the array rather than a distance on purpose:
 * Task 3 makes shelter depend on it, and "no wild body exists" is a fact a
 * caller cannot get wrong, whereas "has fled beyond any shelter radius" is a
 * geometric claim that has to be re-checked against every future radius. It
 * completes at WILD_BOLT_MS after the hush lands — a whole number of fold
 * ticks, and strictly before the input lock at LOCK_MS, so a player sees the
 * true crowd while there is still time to act on it.
 *
 * They are not merely deleted where they stood: before they vanish they have
 * flown WILD_SPEED_BOLT * WILD_BOLT_MS / 1000 = 840 cu, past two shelter
 * radii, and they are deliberately NOT clamped to the world while doing it.
 * They leave the sea. A clamp would park them on the wall and would cap the
 * flight of any fish fleeing outward, which is precisely the guarantee the
 * moment is made of.
 *
 * ---------------------------------------------------------------------------
 * THE TWO CLOCKS, which are not the same clock
 * ---------------------------------------------------------------------------
 * `tickIndex` is the MOTION clock: all drifting and milling is a function of
 * it alone, so the shoal advances on the same quantized tick as everything
 * else the fold agrees on. `nowMs` is the HUSH clock and is read for nothing
 * but `nowMs - hushStartMs`. On a fold tick the two agree by construction
 * (`tickIndex = nowMs / TICK_MS`); a renderer wanting smoother motion between
 * ticks should interpolate between `wildAt(seed, k, ...)` and
 * `wildAt(seed, k+1, ...)` — the arrays are the same length in the same order
 * — exactly as dead reckoning smooths a player between presence writes. It
 * must never invent a fractional `tickIndex`, and could not: the argument is
 * used as an integer multiplier.
 *
 * ---------------------------------------------------------------------------
 * ON FLOATS, in the same terms as fixed.ts
 * ---------------------------------------------------------------------------
 * Every value this module returns is an integer. The transient doubles are the
 * divisions, and IEEE-754 double division is correctly rounded and mandated as
 * such by the ECMAScript spec, so every conforming engine produces the
 * identical double from identical operands and `Math.trunc`/`Math.floor` turns
 * it back into the identical integer. Operands stay far below 2^53: the
 * largest product formed is `ampX * cosAt(...)`, bounded by
 * WILD_ORBIT_AMP_X_MAX(1400) * TRIG_SCALE(4096) = 5_734_400, and the only
 * place a tick index enters a product is `phase0 + tickIndex * rate`, exact
 * for any |tickIndex| below 2^53 / 34 ~= 2.6e14 — about two million years of
 * absolute tick indices. `Math.imul` is exact 32-bit by definition, so the
 * hash is bit-identical everywhere.
 */
import { COS, SIN, quantize } from './fixed';
import { HEADING_STEPS, TRIG_SCALE, WORLD_W, WORLD_H, TICK_MS } from './shoalConst';

// ---------------------------------------------------------------------------
// CONSENSUS — permanent. Do not change after launch.
//
// Wild fish count toward shelter (Task 3), so their count, their shape and the
// timing of their bolt decide who the sweep is allowed to take. Changing any
// number in this block re-scores every session ever played and splits clients
// running different versions, exactly as for shoalConst.ts's own CONSENSUS
// block. Values marked "arbitrary-but-practical" were chosen for feel and have
// never been played; that is not a promise of a later tuning pass, because for
// consensus values there is none.
// ---------------------------------------------------------------------------

/** Schools in the sea, and fish per school. Arbitrary-but-practical. */
export const WILD_SCHOOLS = 3;
export const WILD_PER_SCHOOL = 12;
/** The whole wild population. */
export const WILD_COUNT = WILD_SCHOOLS * WILD_PER_SCHOOL; // 36

/**
 * The furthest a fish ever sits from its school's centre, so a school is never
 * wider than 400 cu — comfortably inside SHELTER_R (340) at its middle, which
 * is what makes a school real cover rather than a loose scatter that happens
 * to be near you. Equal to WILD_EPI1_R_MAX + WILD_EPI2_R_MAX by construction.
 */
export const WILD_SCHOOL_R = 200;

/**
 * Sub-brad resolution for phases. The trig table has 256 entries; phases are
 * carried at 16 steps per entry and INTERPOLATED between neighbours (see
 * `cosAt`), which is what lets a school advance a fraction of a brad per tick.
 *
 * Without the interpolation the sub-resolution would be a lie: the centre
 * would hold still for five ticks and then teleport a whole brad — for the
 * largest amplitude, 1400 * 2*pi/256 = 34 cu in one frame. Interpolating the
 * ONE table (rather than adding a second, finer one) keeps the chord error at
 * amp * (1 - cos(brad/2)) ~= 0.1 cu, which quantization swallows whole.
 */
export const WILD_PHASE_SUB = 16;
/** A full turn in phase units: 256 * 16. */
export const WILD_PHASE_STEPS = HEADING_STEPS * WILD_PHASE_SUB; // 4096

/**
 * Orbit amplitude range for a school's centre, in cu.
 *
 * The maxima are the whole reason no clamp is needed anywhere: a fish sits
 * within WILD_SCHOOL_R of a centre that is within AMP of the sea's middle, so
 *   x in [2048 - 1400 - 200, 2048 + 1400 + 200] = [ 448, 3648] c [0, 4096]
 *   y in [1536 - 1000 - 200, 1536 + 1000 + 200] = [ 336, 2736] c [0, 3072]
 * A clamp would flatten schools against the wall and, worse, would cap the
 * bolt's flight for any fish fleeing outward.
 */
export const WILD_ORBIT_AMP_X_MIN = 600;
export const WILD_ORBIT_AMP_X_MAX = 1400;
export const WILD_ORBIT_AMP_Y_MIN = 400;
export const WILD_ORBIT_AMP_Y_MAX = 1000;

/**
 * Orbit rates, in phase units per tick. The y rate is always the x rate plus
 * at least 2, so the two axes never share a period and the centre traces a
 * figure rather than an ellipse.
 *
 * Speed, hand-derived: one phase unit per tick is 1/16 brad = 2*pi/4096 rad,
 * so a centre at the largest y amplitude and the fastest y rate moves
 * 1000 * 8 * 2*pi/4096 = 12.3 cu per tick = 49 cu/s. With both axes and both
 * epicycles at their worst the whole fish tops out near 65 cu/s — just past
 * SPEED_CRUISE (60), so a cruising player can very nearly swim with the shoal
 * and a dart (220) always catches it. A wild fish you cannot keep up with
 * would be weather, not company.
 */
export const WILD_RATE_X_MIN = 2;
export const WILD_RATE_X_SPAN = 3; // rateX in [2, 4]
export const WILD_RATE_Y_GAP = 2; // rateY = rateX + 2 or rateX + 4

/** Per-fish epicycle radii, in cu. They sum to at most WILD_SCHOOL_R. */
export const WILD_EPI1_R_MIN = 40;
export const WILD_EPI1_R_SPAN = 101; // r1 in [40, 140]
export const WILD_EPI2_R_MIN = 20;
export const WILD_EPI2_R_SPAN = 41; // r2 in [20, 60]
/** Per-fish epicycle rates, in phase units per tick. */
export const WILD_EPI1_S_MIN = 8;
export const WILD_EPI1_S_SPAN = 9; // s1 in [8, 16], a 64..128 s mill
export const WILD_EPI2_S_MIN = 18;
export const WILD_EPI2_S_SPAN = 17; // s2 in [18, 34], a 30..57 s mill

/**
 * Wild sizes, in the same units as a swimmer's. In [60, 119], i.e. from
 * MIN_SIZE up to just under a starting swimmer.
 *
 * Chosen so wild fish are worth sheltering with and no more: shelterWeight of
 * the SMALLEST is 100 + trunc(60/40) = 101, so three of them give 303, one
 * point over SHELTER_THRESHOLD (300). Three wild fish is exactly the floor of
 * three — and every one of them leaves at the hush.
 */
export const WILD_SIZE_MIN = 60;
export const WILD_SIZE_SPREAD = 60;

/**
 * How long the bolt takes, from the instant the hush lands to the instant the
 * last wild fish is gone. A whole number of fold ticks (8), because shelter is
 * only ever evaluated on the tick grid.
 *
 * Strictly less than LOCK_MS (4_000) on purpose: the cover evaporates with
 * 2_000 ms of unlocked window still to run, so a player can still see the true
 * crowd and dart for it — SPEED_DART for DART_MS covers 660 cu, nearly two
 * shelter radii. Gone before the input lock, therefore gone long before the
 * sweep resolves, which is why `selectTaken` can never see a wild fish.
 */
export const WILD_BOLT_MS = 2_000;

/**
 * Bolt speed in cu per second. Above SPEED_DART (220) deliberately: a panicking
 * wild fish outruns a player, so the cover leaves and cannot be chased.
 *
 * The floor that matters: the full flight is 420 * 2_000 / 1000 = 840 cu,
 * past 2 * SHELTER_R = 680, so no water that had wild cover still has it.
 */
export const WILD_SPEED_BOLT = 420;

/** Every wild id begins with this. A swimmer id is public-key hex, so a
 *  collision is impossible rather than unlikely. */
export const WILD_ID_PREFIX = 'wild:';

// ---------------------------------------------------------------------------
// The fish
// ---------------------------------------------------------------------------

/**
 * One wild fish at one tick. Structurally a `Body` (shelter.ts) plus a heading
 * to draw it by — deliberately NOT a `Fish`: it has no vector, no size history
 * and no bite ledger, because none of those exist for something that is not a
 * person.
 */
export interface WildFish {
  id: string;
  x: number;
  y: number;
  /** Heading in brads: 0..255 maps to 0..2pi, same convention as `Vec`. */
  heading: number;
  size: number;
}

/** The id of the i-th wild fish. Stable across seeds and ticks. */
export function wildIdOf(index: number): string {
  return WILD_ID_PREFIX + index;
}

/** True when an id names a wild fish rather than a swimmer. */
export function isWildId(id: string): boolean {
  return id.startsWith(WILD_ID_PREFIX);
}

// ---------------------------------------------------------------------------
// Integer plumbing
// ---------------------------------------------------------------------------

/** Salts, so one hash function can draw every independent parameter. */
const S_AMPX = 1;
const S_AMPY = 2;
const S_RATEX = 3;
const S_RATEY = 4;
const S_PHX = 5;
const S_PHY = 6;
const F_R1 = 11;
const F_R2 = 12;
const F_S1 = 13;
const F_S2 = 14;
const F_A1 = 15;
const F_A2 = 16;
const F_SIZE = 17;
const F_FALLBACK = 18;

/**
 * A 32-bit avalanche hash of (seed, index, salt). Every operation is exact
 * 32-bit integer arithmetic — `Math.imul` is defined to be, and `^`/`>>>`
 * coerce through ToInt32/ToUint32 — so two clients draw bit-identical
 * parameters. `seed` is expected to be an integer; a non-integer would be
 * truncated by ToInt32, deterministically but not meaningfully.
 */
function h32(seed: number, index: number, salt: number): number {
  let x = (seed ^ Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) >>> 0;
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39) >>> 0;
  return (x ^ (x >>> 15)) >>> 0;
}

/** Draw an integer in [lo, lo + span). */
function pick(seed: number, index: number, salt: number, lo: number, span: number): number {
  return lo + (h32(seed, index, salt) % span);
}

/** Table entry a phase falls in, wrapped positive so negative ticks are fine. */
function phaseIndex(phase: number): number {
  const q = Math.floor(phase / WILD_PHASE_SUB);
  return ((q % HEADING_STEPS) + HEADING_STEPS) % HEADING_STEPS;
}

/** How far the phase sits between that entry and the next, in [0, WILD_PHASE_SUB). */
function subPhase(phase: number): number {
  return phase - Math.floor(phase / WILD_PHASE_SUB) * WILD_PHASE_SUB;
}

/** cos at sub-brad resolution, by linear interpolation of the ONE trig table. */
function cosAt(phase: number): number {
  const i = phaseIndex(phase);
  const a = COS[i];
  const b = COS[(i + 1) % HEADING_STEPS];
  return a + Math.trunc(((b - a) * subPhase(phase)) / WILD_PHASE_SUB);
}

/** sin at sub-brad resolution, by linear interpolation of the ONE trig table. */
function sinAt(phase: number): number {
  const i = phaseIndex(phase);
  const a = SIN[i];
  const b = SIN[(i + 1) % HEADING_STEPS];
  return a + Math.trunc(((b - a) * subPhase(phase)) / WILD_PHASE_SUB);
}

/**
 * The nearest table heading pointing from (fx, fy) toward (tx, ty), by
 * maximising the dot product against every entry.
 *
 * 256 iterations, and constant: it does not depend on the tick, so it does not
 * touch the O(1)-in-the-tick property. There is no integer atan2 in this
 * project and adding one would mean a second table, which this file is
 * forbidden. Ties go to the lower heading; a zero delta (possible at the
 * turning point of an epicycle) falls back to the fish's own hashed heading so
 * the answer is still a function of the seed and never of call order.
 */
function headingBetween(fx: number, fy: number, tx: number, ty: number, fallback: number): number {
  const dx = tx - fx;
  const dy = ty - fy;
  if (dx === 0 && dy === 0) return fallback;
  let best = 0;
  let bestDot = -Infinity;
  for (let h = 0; h < HEADING_STEPS; h++) {
    const dot = dx * COS[h] + dy * SIN[h];
    if (dot > bestDot) { bestDot = dot; best = h; }
  }
  return best;
}

/** Which school a fish belongs to. */
function schoolOf(index: number): number {
  return Math.trunc(index / WILD_PER_SCHOOL);
}

/** A school's centre at a tick. Closed form: the tick is a multiplier, never a loop. */
function centreAt(seed: number, school: number, tickIndex: number): { x: number; y: number } {
  const ampX = pick(seed, school, S_AMPX, WILD_ORBIT_AMP_X_MIN,
    WILD_ORBIT_AMP_X_MAX - WILD_ORBIT_AMP_X_MIN + 1);
  const ampY = pick(seed, school, S_AMPY, WILD_ORBIT_AMP_Y_MIN,
    WILD_ORBIT_AMP_Y_MAX - WILD_ORBIT_AMP_Y_MIN + 1);
  const rateX = pick(seed, school, S_RATEX, WILD_RATE_X_MIN, WILD_RATE_X_SPAN);
  const rateY = rateX + WILD_RATE_Y_GAP + (h32(seed, school, S_RATEY) % 2) * 2;
  const phX = h32(seed, school, S_PHX) % WILD_PHASE_STEPS;
  const phY = h32(seed, school, S_PHY) % WILD_PHASE_STEPS;
  return {
    x: WORLD_W / 2 + Math.trunc((ampX * cosAt(phX + tickIndex * rateX)) / TRIG_SCALE),
    y: WORLD_H / 2 + Math.trunc((ampY * sinAt(phY + tickIndex * rateY)) / TRIG_SCALE),
  };
}

/**
 * One fish's position at a tick, before quantization and before any bolt.
 * Kept unquantized so headings are taken from the real motion rather than from
 * the grid it is reported on.
 */
function rawAt(seed: number, index: number, tickIndex: number): { x: number; y: number } {
  const c = centreAt(seed, schoolOf(index), tickIndex);
  const r1 = pick(seed, index, F_R1, WILD_EPI1_R_MIN, WILD_EPI1_R_SPAN);
  const r2 = pick(seed, index, F_R2, WILD_EPI2_R_MIN, WILD_EPI2_R_SPAN);
  const s1 = pick(seed, index, F_S1, WILD_EPI1_S_MIN, WILD_EPI1_S_SPAN);
  const s2 = pick(seed, index, F_S2, WILD_EPI2_S_MIN, WILD_EPI2_S_SPAN);
  const p1 = (h32(seed, index, F_A1) % WILD_PHASE_STEPS) + tickIndex * s1;
  const p2 = (h32(seed, index, F_A2) % WILD_PHASE_STEPS) + tickIndex * s2;
  return {
    x: c.x + Math.trunc((r1 * cosAt(p1) + r2 * cosAt(p2)) / TRIG_SCALE),
    y: c.y + Math.trunc((r1 * sinAt(p1) + r2 * sinAt(p2)) / TRIG_SCALE),
  };
}

// ---------------------------------------------------------------------------
// The one entry point
// ---------------------------------------------------------------------------

/**
 * The wild shoal at a tick.
 *
 * @param seed         Consensus seed for this sea, from confirmed chain state.
 * @param tickIndex    The MOTION clock: an integer tick index every client
 *                     agrees on, `nowMs / TICK_MS` on the absolute grid.
 * @param hushStartMs  Ms the current hush began, or -1 when none is running —
 *                     the same sentinel `ShoalState.hushStartMs` uses.
 * @param nowMs        The HUSH clock, read only as `nowMs - hushStartMs`.
 *
 * Returns the fish in a fixed order (index 0..WILD_COUNT-1), or the EMPTY
 * ARRAY once the bolt has completed. Takes no player state and never will.
 */
export function wildAt(
  seed: number,
  tickIndex: number,
  hushStartMs: number,
  nowMs: number,
): WildFish[] {
  const hushing = hushStartMs >= 0;
  const elapsedMs = hushing ? nowMs - hushStartMs : -1;
  // Gone. Not fleeing, not far away: absent.
  if (hushing && elapsedMs >= WILD_BOLT_MS) return [];
  // A bolt never predicts the past, exactly as a presence vector never does.
  const fleeMs = elapsedMs > 0 ? elapsedMs : 0;
  const flee = Math.trunc((WILD_SPEED_BOLT * fleeMs) / 1000);
  // The outward rays are frozen at the hush's own tick, so a fish's escape
  // direction cannot wander while it flees.
  const hushTick = hushing ? Math.floor(hushStartMs / TICK_MS) : 0;

  const out: WildFish[] = [];
  for (let i = 0; i < WILD_COUNT; i++) {
    const fallback = h32(seed, i, F_FALLBACK) % HEADING_STEPS;
    const here = rawAt(seed, i, tickIndex);
    let x = here.x;
    let y = here.y;
    let heading: number;
    if (flee > 0) {
      const centre = centreAt(seed, schoolOf(i), hushTick);
      const stood = rawAt(seed, i, hushTick);
      heading = headingBetween(centre.x, centre.y, stood.x, stood.y, fallback);
      // Deliberately unclamped: a bolting fish leaves the sea.
      x += Math.trunc((flee * COS[heading]) / TRIG_SCALE);
      y += Math.trunc((flee * SIN[heading]) / TRIG_SCALE);
    } else {
      const next = rawAt(seed, i, tickIndex + 1);
      heading = headingBetween(here.x, here.y, next.x, next.y, fallback);
    }
    out.push({
      id: wildIdOf(i),
      x: quantize(x),
      y: quantize(y),
      heading,
      size: WILD_SIZE_MIN + (h32(seed, i, F_SIZE) % WILD_SIZE_SPREAD),
    });
  }
  return out;
}
