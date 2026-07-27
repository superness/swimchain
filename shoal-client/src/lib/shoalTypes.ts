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

/** A durable claim that a swimmer took a bite at a place and time. */
export interface EatClaim {
  kind: 'eat';
  id: string;
  /** Bloom cell index the bite was taken from. */
  cell: number;
  /** Claimed position of the bite, in cu. */
  x: number;
  y: number;
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

/** The folded world at a given tick. */
export interface ShoalState {
  /** Tick time in ms. */
  nowMs: number;
  /** Live swimmers, keyed by id. Insertion order is never relied upon. */
  fish: Map<string, Fish>;
  /** Accumulated tension, integer, floored at 0. */
  tension: number;
  /** Ms at which the current hush began, or -1 if no hush is running. */
  hushStartMs: number;
  /** Positions locked at the input lock, or null if not yet locked. */
  lockedPositions: Map<string, { x: number; y: number; size: number }> | null;
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
}
