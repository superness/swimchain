/**
 * Shared types for the Shoal engine. Every coordinate is an integer in
 * centi-units (cu). Every time is integer milliseconds. There are no floats
 * anywhere in this engine — see the Global Constraints in the plan.
 */

/** A swim vector: "from here, at this instant, I am heading that way." */
export interface Vec {
  /** Position at time `t`, in cu. */
  x: number;
  y: number;
  /** Heading in brads: 0..255 maps to 0..2pi. */
  heading: number;
  /** Speed in cu per second. */
  speed: number;
  /** Authoring time in ms. */
  t: number;
}

/** A presence write: one swimmer's latest vector, plus optional speech. */
export interface Presence {
  kind: 'presence';
  /** Stable swimmer id (public key hex). */
  id: string;
  vec: Vec;
  /** Speech rides along in the same message so talking never costs a life. */
  say?: string;
  /** Authoring time in ms — mirrors vec.t, used for log ordering. */
  ms: number;
  /** Content hash, used only as a deterministic ordering tiebreak. */
  hash: string;
}

/**
 * A durable claim that a swimmer took a bite from a cell at a time.
 *
 * There is deliberately no claimed POSITION here. The fold judges the claim
 * against reckon(fish.vec, claim.ms) — the claimant's dead-reckoned position
 * at the instant claimed, derived from its own presence vector. A
 * self-reported x/y would be a second source for a value the fold can already
 * derive, so it could only ever agree redundantly or disagree, and a field
 * that is carried but never consulted invites the next reader to trust it.
 * (`cell` is self-reported and IS read, but it names WHICH bloom is being
 * claimed — it is not derivable, and canEat still checks the fish is within
 * EAT_R of that cell's centre.)
 */
export interface EatClaim {
  kind: 'eat';
  id: string;
  /** Bloom cell index the bite was taken from. */
  cell: number;
  ms: number;
  hash: string;
}

export type LogEntry = Presence | EatClaim;

/** A swimmer's folded state at a given tick. */
export interface Fish {
  id: string;
  /** Dead-reckoned position at the current tick, in cu. */
  x: number;
  y: number;
  size: number;
  /** Last vector seen for this swimmer. */
  vec: Vec;
  /** Tick at which this swimmer's presence expires. */
  expiresMs: number;
  /** Ms at which the last scatter landed, or -1. */
  lastScatterMs: number;
  /** Ms of the last credited bite, or -1. */
  lastBiteMs: number;
  /**
   * Ms of each bite credited recently, pruned to at most VOID_WINDOW_MS in
   * the past on every new credited bite. A scatter voids every entry still
   * within VOID_WINDOW_MS of the resolve tick (the whole recent foraging
   * trip, not just the single most recent bite) and removes those entries,
   * so a later sweep cannot void the same bites twice. The prune keeps this
   * bounded to a small constant regardless of session length — it can never
   * hold more than fit within one VOID_WINDOW_MS window at EAT_COOLDOWN_MS
   * spacing.
   */
  recentBites: number[];
}

/**
 * What a swimmer keeps when its presence lapses and it is evicted from
 * `fish`. Spec 2.7: "decay ticks only while present. Time away costs
 * nothing, ever. You return the size you left."
 *
 * The rule this encodes is that eviction is a PRESENCE-LIVENESS event, not a
 * game event: nothing durable may be created or destroyed by it. So every
 * durable per-fish field is carried, not just size —
 *
 *  - `size`, obviously: seeding a returning fish from START_SIZE instead
 *    inverts the spec into punishing absence, which is the exact pressure
 *    that makes quitting-while-ahead dominant.
 *  - `lastBiteMs`, because it gates EAT_COOLDOWN_MS. A bite is credited at
 *    e.ms, and e.ms may be as late as the fish's own expiresMs, so a fish can
 *    legally bank a bite one tick before eviction and rejoin the very next
 *    tick. Dropping lastBiteMs would hand that fish a free bite — "lapse and
 *    return" as a cooldown reset.
 *  - `recentBites`, by the same argument against the scatter-void ledger: a
 *    bite banked just before eviction is still inside VOID_WINDOW_MS when the
 *    fish returns, and dropping the ledger would launder it out of reach of
 *    the next sweep.
 *  - `lastScatterMs`, so a returning fish reports the same history it left
 *    with.
 *
 * Hunger is deliberately NOT here: it is defined as a while-present cost, it
 * holds no per-fish state of its own beyond lastBiteMs, and it simply stops
 * accruing while a fish is absent. Nor is `outsideTicks`, the tension
 * accumulator: an absent fish is not out in the open, so it correctly resets.
 */
export interface Departed {
  size: number;
  lastScatterMs: number;
  lastBiteMs: number;
  recentBites: number[];
}

/**
 * The state that crosses an epoch boundary (spec section 3.9): size, plus a
 * bounded tail of recent-bite state.
 *
 * `sizes` is an array of [id, size] pairs sorted by id rather than a Map, so
 * the structure is canonical: two clients that agree on the world produce
 * byte-identical checkpoints, and a Map's insertion order cannot leak in.
 *
 * `recent` carries `[id, lastBiteMs, recentBites]` for every swimmer whose
 * `lastBiteMs` fell within `VOID_WINDOW_MS` of `epochEndMs(epoch)` —
 * everyone else is correctly reconstructed with `lastBiteMs: -1` and
 * `recentBites: []` at the seeding site, since a bite older than the void
 * window carries no more protection than a brand-new arrival's. Sorted by
 * id, same canonicality rule as `sizes`.
 *
 * Both halves of the carry are load-bearing, but for different reasons and
 * with different force —
 *
 *  - `lastBiteMs` gates `EAT_COOLDOWN_MS`. Without it, a swimmer who ate
 *    right before the boundary and claimed again right after read as "never
 *    bitten" and got a free cooldown reset. That is directly reachable
 *    (EAT_COOLDOWN_MS is 2_500 ms and the boundary is a public clock) and is
 *    exercised by shoalEngine.test.ts's cross-boundary cooldown test.
 *  - `recentBites` gates the scatter void. This one was UNREACHABLE under the
 *    pre-warm-up fold and is reachable now, which is worth stating precisely
 *    because the intermediate review concluded — correctly, for the code in
 *    front of it — that it could never matter. The old argument: tension was
 *    zeroed at every boundary, so a fresh epoch needed at least 40 ticks to
 *    reach TENSION_TRIGGER and HUSH_MS more to resolve, putting the earliest
 *    possible sweep at `epochStart + 17_750` — already past VOID_WINDOW_MS
 *    (10_000) from anything that happened before the epoch began. The warm-up
 *    replay (spec 3.9 point 3) removes that floor: tension and an in-flight
 *    hush now cross the boundary, so a sweep can resolve as little as one
 *    tick into a new epoch and CAN void a bite credited before it. Pinned by
 *    shoalEngine.test.ts's "a carried bite is voidable by a sweep that
 *    resolves just after the boundary".
 *
 * Kept small by construction: at most the swimmers who ate in the last
 * `VOID_WINDOW_MS` of the epoch. That is a bound set BY the population — in
 * the worst case (everyone eats in the final ten seconds) it is everyone —
 * not a bound below it. What keeps it small in practice is
 * `EAT_COOLDOWN_MS` and the fact that a shoal is fifteen to twenty-five fish,
 * so the payload is at most a few dozen short arrays.
 */
export interface Checkpoint {
  epoch: number;
  sizes: Array<[string, number]>;
  recent: Array<[string, number, number[]]>;
}

/** The folded world at a given tick. */
export interface ShoalState {
  /** The epoch this state is folding (spec section 3.9). */
  epoch: number;
  /** Tick time in ms. */
  nowMs: number;
  /** Live swimmers, keyed by id. Insertion order is never relied upon. */
  fish: Map<string, Fish>;
  /**
   * Durable per-swimmer record for everyone whose presence has lapsed,
   * written at the moment of eviction and read when they come back. Outlives
   * `fish` on purpose — see Departed. A swimmer who is currently live has no
   * entry that is authoritative; `fish` always wins while it exists.
   */
  departed: Map<string, Departed>;
  /** Accumulated tension, integer, floored at 0. */
  tension: number;
  /** Ms at which the current hush began, or -1 if no hush is running. */
  hushStartMs: number;
  /** Positions locked at the input lock, or null if not yet locked. */
  lockedPositions: Map<string, { x: number; y: number; size: number }> | null;
  /**
   * The preferred sweep target, frozen at the same instant as
   * lockedPositions, or null if not yet locked (or if nobody is outside the
   * core). This lives on ShoalState rather than in a local because the fold
   * must be resumable: a client that folds up to a tick inside the dread
   * window and continues later would otherwise lose it and recompute a
   * different answer.
   *
   * It is separate state and not derivable from lockedPositions because
   * topContributor reads OUTSIDE-TICKS, which the fold keeps accumulating
   * every tick through the dread window. Recomputing it at the resolve tick
   * would let a presence write authored after T+LOCK decide who the shark
   * takes — precisely the input the lock exists to exclude (spec 2.12
   * rule 2).
   */
  lockedPreferred: string | null;
  /** Ids taken by the most recent resolved sweep. */
  lastTaken: string[];
  /** Ms of the most recent resolved sweep, or -1. */
  lastSweepMs: number;
  /** Per-cell ms of last visit by any fish. Absent means never visited. */
  lastVisit: Map<number, number>;
  /** Per-cell bites already consumed from the current bloom. */
  bitesTaken: Map<number, number>;
  /**
   * Presence of a cell in this map means its current bloom is LATCHED: it
   * opened on the ms of the first credited bite since the bloom last
   * regrew, and stays open — bypassing the fallow test — until BLOOM_BITES
   * have been taken, at which point the cell is removed. Only ever checked
   * with .has() and .delete(); the stored ms itself is not otherwise read.
   */
  bloomSinceMs: Map<number, number>;

  /**
   * Fold-internal bookkeeping for `foldTick` (Task 5, spec 3.9's plan-2
   * incremental-fold seam). None of the four fields below are part of the
   * observable world — they are deliberately absent from every fingerprint
   * in the test suite — they exist only so a fold can be resumed one tick at
   * a time across separate `foldTick` calls with no loop of its own.
   */
  /**
   * Index into `orderLog(entries)` of the next log entry `foldTick` has not
   * yet applied. This used to be a loop-local in `foldShoal`'s own `for`
   * loop; an incremental caller has no such loop, so the cursor has to live
   * somewhere a caller can carry it forward between calls. Deriving it fresh
   * from `nowMs` each tick instead (e.g. "apply everything with ms <= t")
   * was rejected: it cannot distinguish "not yet applied" from "already
   * applied on an earlier call," so it would silently re-apply every entry
   * at or before the current tick on every single `foldTick` call — visibly,
   * double- (or N-times-) crediting every bite and re-registering every
   * presence write. Consequently `foldTick`'s callers (including foldShoal's
   * own loop) MUST pass the same `entries` array — same content, same order
   * — on every call in one fold; the cursor is meaningless against a log
   * that has been reordered or had earlier entries removed since the last
   * call. Append-only growth is safe: `orderLog`'s sort places new entries
   * with a later (ms, hash) key after everything already scanned, so the
   * existing cursor position stays valid.
   */
  cursor: number;
  /**
   * Consecutive ticks each live fish has spent outside the tension core,
   * keyed by id. Read by `topContributor` at the hush's input lock (step 5)
   * to pick the preferred sweep target, and written every tick (step 4)
   * regardless of whether a hush is running — an idle sea still has fish
   * drifting in and out of the core. Was a loop-local `Map` in `foldShoal`;
   * moved here for the same reason as `cursor`.
   */
  outsideTicks: Map<string, number>;
  /**
   * Ticks folded so far, for this state. Hunger (step 6) fires only once
   * every `HUNGER_TICK_INTERVAL` of these, so this has to persist across
   * `foldTick` calls or hunger would either never fire (reset to 0 every
   * call) or fire on the wrong cadence (derived from `nowMs` alone, which
   * would work only if a fold never skips a tick — true today, but this
   * keeps the tick-counting logic identical to what `foldShoal`'s own loop
   * always did, rather than introducing a second, subtly different way to
   * compute the same thing).
   */
  tickCount: number;
  /**
   * Ids that authored an applied presence entry at some point during this
   * fold. Consulted only by `foldShoal`, once, after its `foldTick` loop
   * finishes, to prune seeded `departed` records nobody returned to claim
   * (spec 3.9 point 6). An incremental caller driving `foldTick` directly
   * (never going through `foldShoal`) can ignore this field entirely — it is
   * never read for anything else.
   */
  touchedIds: Set<string>;
}
