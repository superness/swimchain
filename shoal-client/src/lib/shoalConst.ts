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

// --- Epochs ----------------------------------------------------------------
/**
 * The fold covers exactly one epoch, seeded by the previous epoch's checkpoint
 * (spec section 3.9). One hour. Chosen so fold cost is bounded at
 * EPOCH_MS / TICK_MS = 14_400 ticks regardless of how old the sea is, and so a
 * swimmer who steps away for less than an hour keeps their size.
 * Arbitrary-but-practical: an hour is a session, not an optimised value.
 */
export const EPOCH_MS = 3_600_000;

/**
 * How far BEFORE its epoch's start a fold begins ticking (spec 3.9 point 3).
 *
 * The checkpoint carries only durable, player-owned value: size, plus a
 * bounded recent-bite tail. Everything else that must cross a boundary is
 * RECONSTRUCTED by replaying this pre-origin window — bloom fallow state,
 * live presence, accumulated tension, and any in-flight hush. State a bounded
 * replay can rebuild does not belong in a checkpoint.
 *
 * The bound is derived from WHEN AN ENTRY STOPS MATTERING, not from when it
 * was authored, and the reference point is the fold's OWN EARLIEST TICK —
 * `warmStartMs` — never the epoch's origin. An earlier version of this
 * comment argued "a presence vector authored more than PRESENCE_TTL_MS
 * before the origin has already expired, so replaying it would change
 * nothing." That is true AT THE ORIGIN, and it is the exact argument that
 * (twice) narrowed the log-entry cursor in shoalEngine.ts's `foldShoal` down
 * to `warmStartMs` itself — which is false for every one of the 360 warm-up
 * ticks the replay actually runs: a presence vector authored at
 * `warmStartMs - 1` is live for all of them (liveness reach is exactly
 * PRESENCE_TTL_MS, evicted only once `t > expiresMs`), so skipping it
 * reconstructs an incomplete sea. The correct statement — the one that
 * cannot be used to re-narrow anything — is: an entry matters to the fold
 * iff it is still live at the fold's earliest tick, i.e.
 * `ms + PRESENCE_TTL_MS >= warmStartMs`, equivalently `ms >= warmStartMs -
 * PRESENCE_TTL_MS`. That is why `foldShoal`'s log cursor reaches back an
 * additional PRESENCE_TTL_MS past `warmStartMs` (see its doc there); WARMUP_MS
 * below governs only where TICKING starts, not which log entries are read.
 *
 * WARMUP_MS itself is set to PRESENCE_TTL_MS because that is the longest
 * window any OTHER reconstructible rule depends on. It comfortably exceeds
 * every shorter window it also has to cover — BLOOM_READY_MS (45_000, the
 * fallow clock), the 40-tick / 10_000 ms minimum for tension to climb from 0
 * to TENSION_TRIGGER at its fastest possible rate of 750/tick, and HUSH_MS
 * (8_000, a committed sweep in flight).
 *
 * Without it, `emptyState` IS the epoch boundary: everything outside the
 * checkpoint reads as zero at a predictable, publicly-readable instant. That
 * is not a random interruption, it is a clock a player can aim at — the whole
 * sea reads edible for exactly one tick every hour, an in-flight hush is
 * annihilated (so any hush starting within HUSH_MS of a boundary is free),
 * and the sea empties of every swimmer whose vector was authored before the
 * boundary but is still live.
 *
 * Cost: WARMUP_MS / TICK_MS = 360 extra ticks on top of the epoch's 14_400,
 * so the bounded-cost guarantee is unaffected.
 *
 * CONSENSUS: every client replays the same window from the same absolute
 * origin, so all of them reconstruct identically.
 *
 * WHAT THE WARM-UP DOES NOT FIX, stated plainly, and its real magnitude. Its
 * own first tick is a boundary of the same kind, 90 s earlier: at
 * `epochWarmStartMs` the bloom map is empty again, so any cell that had gone
 * fallow before then reads it as fallow for exactly one tick — "the sea
 * starts full" applied to the warm-up's own start. With the wider log cursor
 * (`warmStartMs - PRESENCE_TTL_MS`, see foldShoal), this is not "one tick of
 * one parked fish": up to 90 s of BACKLOGGED eat claims — every entry the
 * cursor admits from before `warmStartMs` — are all judged on that single
 * tick, against a map that has not yet seen a single `markVisits` call.
 * Measured on an UNSEEDED fold: 37 claims credited on that one tick, +355 net
 * size. What survives that into the epoch is only `bitesTaken`/`bloomSinceMs`
 * for the affected cells — the size, cooldown and void-ledger consequences
 * are overwritten by the checkpoint at the origin (see foldShoal) — BUT ONLY
 * FOR A SEEDED FOLD. `opts.seed` in `foldShoal` is OPTIONAL, and a seedless
 * call is accepted silently (no error, no warning), so a caller that folds
 * without a seed gets no such overwrite and the +355 stands as real,
 * uncorrected size. It is still bounded, and every client computes it
 * identically, so it is not a divergence between honest clients — but for an
 * unseeded fold it is a real artifact, not a small inaccuracy. The
 * alternative — an unbounded replay — is the ~69 h lifetime ceiling spec 3.9
 * point 2 exists to remove.
 */
export const WARMUP_MS = PRESENCE_TTL_MS; // 90_000

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
 * How far back the bloom map is reconstructed from. This governs the ABSENCE
 * half of the map's guarantee, which is by construction rather than by a
 * check: the fold builds `lastVisit` from scratch starting at
 * `epochWarmStartMs`, so a cell absent from it has had no visit for the
 * WHOLE warm-up, i.e. at least WARMUP_MS (90_000) >= BLOOM_WINDOW_MS. (A cell
 * PRESENT in the map is a different story: its stamp can derive from a log
 * entry as old as WARMUP_MS + PRESENCE_TTL_MS before the origin, because the
 * fold's log cursor reaches back that far — see bloom.ts's module doc and
 * `foldShoal` in shoalEngine.ts. That does not weaken the absence guarantee
 * below, which only ever needs a LOWER bound on how long an absent cell has
 * been fallow.)
 *
 * The relationship that makes the reconstruction CORRECT rather than merely
 * bounded is WARMUP_MS > BLOOM_READY_MS: a cell nobody visited during the
 * whole warm-up has been fallow for at least 90 s, which is already past the
 * 45 s fallow clock, so "absent from lastVisit" and "genuinely ready"
 * coincide at every tick from the origin onward. That is what makes
 * isBloomReady's "the sea starts full" an honest reading of a reconstructed
 * map instead of a fiction about an empty one.
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
 * manage to compute.
 *
 * Originally this was a LIVE limit: with the tick origin anchored to
 * `log[0].ms`, a caller handing the fold a WALL-CLOCK untilMs against an
 * empty or ancient log would start at t=0 and grind through ~7.1e9 ticks,
 * about 77 minutes of dead hang.
 *
 * Since the fold now folds exactly one epoch from an absolute origin (spec
 * section 3.9, epoch.ts), that scenario cannot occur under normal use: a
 * DEFAULTED epoch (`opts.epoch` omitted, so it is `epochOf(untilMs)`) always
 * puts the origin within one EPOCH_MS of untilMs, bounding every ordinary
 * fold to EPOCH_MS / TICK_MS = 14_400 ticks — two orders of magnitude below
 * this ceiling. MAX_FOLD_TICKS is therefore now a BACKSTOP rather than a live
 * limit: it only fires if a caller passes an explicit `opts.epoch` far from
 * `untilMs` (e.g. resuming from a stale checkpoint's epoch against a much
 * later untilMs) — a caller bug, not a scenario that arises from ordinary
 * play.
 *
 * 1_000_000 ticks is 1_000_000 * TICK_MS = 250_000_000 ms, roughly 69 hours
 * of game time — orders of magnitude past any real session — so this can only
 * ever fire on the mistake it is looking for.
 */
export const MAX_FOLD_TICKS = 1_000_000;

/** Cruise and dart speeds in cu per second. */
export const SPEED_CRUISE = 60;
export const SPEED_DART = 220;

/**
 * Dart burst duration. EQUAL TO MIN_EMIT_GAP_MS (shoalEmit.ts, 3_000) — not by
 * coincidence, and the equality is asserted in input.test.ts §2 rather than
 * imported, because shoalEmit.ts imports this module and a back-import would
 * close a cycle.
 *
 * WHY THE TWO MUST MATCH. A burst has a start and an end and both are writes,
 * and no two writes may be closer together than MIN_EMIT_GAP_MS — the floor is
 * absolute and has no change-of-mind exception (shoalEmit.ts's header explains
 * why it can never get one). So the WIRE CANNOT REPRESENT a burst shorter than
 * the floor. At the old value of 900 the world reckoned every published dart at
 * SPEED_DART for the full 3_000 ms anyway, while `isDarting` (input.ts) called
 * the burst over after 900 — a 2_100 ms window, 464 cu of travel, in which this
 * client's own display disagreed with the vector it had published. Equal is the
 * only value that cannot lie about that, and it makes `isDarting` agree with
 * the published vector by construction.
 *
 * WHAT IT COSTS, stated rather than compensated for: SPEED_DART * DART_MS /
 * 1000 = 660 cu per dart, which is 1.94 * SHELTER_R (340) — nearly two shelter
 * radii, and enough to cross from exposed into a ball inside the hush's LOCK_MS
 * commit window. That number is NOT new (a published dart always travelled it);
 * what is new is that it is now also true of the darts that used to be
 * swallowed whole. Whether 660 cu is too generous is a PLAYTEST question, and
 * the honest lever is SPEED_DART, not a DART_MS that misreports the burst.
 *
 * POLICY: nothing folds this, so a tuning pass may move it freely — but move it
 * WITH MIN_EMIT_GAP_MS, or the tripwire in input.test.ts will say so.
 */
export const DART_MS = 3_000;

/**
 * Minimum gap between one swimmer's darts, measured from the instant a burst is
 * PUBLISHED (input.ts: a press arms, a publish spends) — never from the press,
 * so a dart the emit floor could not carry costs nothing.
 */
export const DART_COOLDOWN_MS = 11_000;
