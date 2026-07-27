/**
 * Constants for the Shoal engine.
 *
 * The CONSENSUS block is PERMANENT. Changing any value in it re-scores every
 * session ever played and splits clients running different versions — see
 * docs/superpowers/specs/2026-07-27-the-shoal-design.md section 4.
 *
 * The POLICY block is free to change at any time, with no coordination.
 *
 * Values marked "arbitrary-but-practical" were chosen for feel and have never
 * been played. They are not optimised numbers and should not be treated as if
 * a later tuning pass is available — for CONSENSUS values, it is not.
 */

// ---------------------------------------------------------------------------
// CONSENSUS — permanent. Do not change after launch.
// ---------------------------------------------------------------------------

/** World bounds in centi-units. Arbitrary-but-practical. */
export const WORLD_W = 4096;
export const WORLD_H = 3072;

/** Positions are quantized to this grid before any comparison. */
export const QUANT = 8;

/** Heading resolution: 256 brads to the full turn. */
export const HEADING_STEPS = 256;
/** Fixed-point scale for the integer trig table. */
export const TRIG_SCALE = 4096;

/** Fold tick. All state advances in steps of this size. */
export const TICK_MS = 250;

/** A presence vector is live for this long after it was authored. */
export const PRESENCE_TTL_MS = 90_000;

// --- Shelter ---------------------------------------------------------------
/** Neighbours within this radius shelter you. */
export const SHELTER_R = 340;
export const SHELTER_R2 = SHELTER_R * SHELTER_R; // 115_600
/** Shelter contributed by any fish, regardless of size. */
export const SHELTER_BASE = 100;
/** Each SHELTER_SIZE_DIV of size adds 1 more shelter... */
export const SHELTER_SIZE_DIV = 40;
/**
 * ...up to this cap, so one whale cannot shelter the whole sea.
 *
 * The cap must keep a PAIR below the threshold at ANY size, or the floor of
 * three silently dissolves for exactly the population it was written to
 * constrain. Two maximally-capped fish contribute
 * 2 * (SHELTER_BASE + SHELTER_SIZE_CAP) = 2 * 145 = 290 < SHELTER_THRESHOLD
 * (300). At the old value of 120 that sum was 440, so two size-2000 fish —
 * roughly 158 net bites, routinely reachable — sheltered each other
 * outright. The binding constraint is 2*(100+C) < 300, i.e. C <= 49; 45
 * takes it with a margin of 10.
 */
export const SHELTER_SIZE_CAP = 45;
/**
 * Below this shelter score a fish is exposed. Equal to 3 * SHELTER_BASE:
 * three plain neighbours is exactly enough, a pair is not. This is the
 * "floor of three" from spec 2.11 — it prices buddy-pairing deliberately.
 */
export const SHELTER_THRESHOLD = 3 * SHELTER_BASE; // 300

// --- Tension ---------------------------------------------------------------
/** Fish farther than this from the median position count as outside the core. */
export const CORE_R = 620;
export const CORE_R2 = CORE_R * CORE_R; // 384_400
/** Per-mille of fish outside the core at which tension holds steady. */
export const TENSION_NEUTRAL = 250;
/** Tension at which the hush fires. Arbitrary-but-practical. */
export const TENSION_TRIGGER = 30_000;

// --- The hush --------------------------------------------------------------
/** Total hush duration: commit window, then dread. */
export const HUSH_MS = 8_000;
/** Inputs after this point in the hush do not count. */
export const LOCK_MS = 4_000;
/** The sweep takes at most this many fish. It may take none. */
export const MAX_TAKE = 3;

// --- Blooms ----------------------------------------------------------------
/** Bloom grid cell size in cu. WORLD_W/BLOOM_CELL and WORLD_H/BLOOM_CELL must be integers. */
export const BLOOM_CELL = 128;
export const BLOOM_COLS = WORLD_W / BLOOM_CELL; // 32
export const BLOOM_ROWS = WORLD_H / BLOOM_CELL; // 24
/** A fish within this radius of a cell centre marks it visited. */
export const BLOOM_VISIT_R = 200;
export const BLOOM_VISIT_R2 = BLOOM_VISIT_R * BLOOM_VISIT_R; // 40_000
/** A cell unvisited for this long carries a bloom. Arbitrary-but-practical. */
export const BLOOM_READY_MS = 45_000;
/**
 * How far back the bloom map WOULD look, if the lookback were bounded. It is
 * not: nothing in bloom.ts or the fold enforces this window, and isBloomReady
 * reads the whole of lastVisit however old. The value is kept, and kept below
 * PRESENCE_TTL_MS, so that the constants stay ready for the day a joining
 * client has to reconstruct the map from data that is still live — but
 * whether to enforce it at all is an open design decision, not an oversight
 * to be quietly closed.
 */
export const BLOOM_WINDOW_MS = 60_000;
/** Bites a single bloom yields before it is gone. Blooms are rivalrous. */
export const BLOOM_BITES = 6;
/** A bite must be claimed within this radius of the cell centre. */
export const EAT_R = 90;
export const EAT_R2 = EAT_R * EAT_R; // 8_100
/** Minimum gap between one swimmer's credited bites. */
export const EAT_COOLDOWN_MS = 2_500;

// --- Size ------------------------------------------------------------------
export const START_SIZE = 100;
export const MIN_SIZE = 60;
/** Size gained per credited bite. */
export const BITE_GROWTH = 12;
/**
 * Size lost to a scatter. FIXED, not a percentage — so big fish risk
 * proportionally less and are pulled out of the ball rather than parked in it.
 */
export const SCATTER_COST = 30;
/** Hunger ticks once every this many fold ticks (once per second at 250ms). */
export const HUNGER_TICK_INTERVAL = 4;
/** Size lost per hunger tick, while present and not eating. */
export const HUNGER_AMOUNT = 1;
/** Bites credited within this window before a sweep are voided for the taken. */
export const VOID_WINDOW_MS = 10_000;

// ---------------------------------------------------------------------------
// POLICY — free to change at any time.
// ---------------------------------------------------------------------------

/**
 * Hard ceiling on how many ticks a single foldShoal call may run.
 *
 * Not a game rule and not consensus: no legitimate fold is anywhere near it,
 * so two clients on different values still agree on every world they both
 * manage to compute. It is a guard against a caller handing the fold a
 * WALL-CLOCK untilMs against an empty or ancient log — foldShoal([], now())
 * starts at t=0 and would grind through ~7.1e9 ticks, about 77 minutes of
 * dead hang, which is what a shell does the very first time it starts against
 * empty water.
 *
 * 1_000_000 ticks is 1_000_000 * TICK_MS = 250_000_000 ms, roughly 69 hours
 * of game time — orders of magnitude past any real session — so this can only
 * ever fire on the mistake it is looking for.
 */
export const MAX_FOLD_TICKS = 1_000_000;

/** Cruise and dart speeds in cu per second. */
export const SPEED_CRUISE = 60;
export const SPEED_DART = 220;
/** Dart burst duration and cooldown. */
export const DART_MS = 900;
export const DART_COOLDOWN_MS = 11_000;
