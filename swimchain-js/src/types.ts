/**
 * TypeScript type definitions for Swimchain
 */

/**
 * Decay state information for content
 */
export interface DecayState {
  /** Current heat/survival probability (0.0 to 1.0) */
  currentHeat: number;
  /** Whether the content has decayed below threshold */
  isDecayed: boolean;
  /** Whether the content is protected (floor period or pinned) */
  isProtected: boolean;
  /** Number of half-lives elapsed since engagement */
  halfLivesElapsed: number;
  /** Content age in seconds */
  ageSeconds: number;
  /** Seconds since last engagement */
  timeSinceEngagement: number;
  /** Decay percentage (100 - currentHeat * 100) */
  decayPercent: number;
  /** Human-readable description */
  description: string;
  /** Estimated seconds until content decays (0 if already decayed) */
  timeUntilDecay: number;
}

/**
 * Result of PoW mining operation
 */
export interface PowSolution {
  /** The nonce that produced a valid hash */
  nonce: bigint;
  /** Number of hash attempts made */
  attempts: bigint;
  /** Time elapsed in milliseconds */
  elapsedMs: number;
  /** Timestamp used in the PoW (UNIX seconds) */
  timestamp: bigint;
  /** The resulting hash */
  hash: Uint8Array;
  /** Number of leading zeros in the hash */
  leadingZeros: number;
  /** Hash rate achieved (hashes per second) */
  hashRate: number;
}

/**
 * PoW mining progress callback
 */
export type PowProgressCallback = (attempts: number, elapsedMs: number) => void;

/**
 * Decay constants from the protocol
 */
export interface DecayConstants {
  /** Floor protection period in seconds (48 hours) */
  floorSecs: number;
  /** Default half-life in seconds (7 days) */
  halfLifeSecs: number;
  /** Decay threshold (0.0625 = 6.25%) */
  threshold: number;
}

/**
 * Address validation result
 */
export interface AddressValidation {
  /** Whether the address is valid */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
  /** Decoded public key if valid */
  publicKey?: Uint8Array;
}

/**
 * Mining options for PoW
 */
export interface MiningOptions {
  /** Maximum number of attempts before giving up */
  maxAttempts?: number;
  /** Difficulty (number of leading zero bits required) */
  difficulty?: number;
  /** Progress callback */
  onProgress?: PowProgressCallback;
}

/**
 * Worker message types for PoW mining
 */
export type PowWorkerMessage =
  | { type: "init" }
  | { type: "mine"; publicKey: Uint8Array; difficulty: number; maxAttempts?: number }
  | { type: "cancel" };

/**
 * Worker response types for PoW mining
 */
export type PowWorkerResponse =
  | { type: "ready" }
  | { type: "progress"; attempts: number; elapsedMs: number }
  | { type: "complete"; solution: PowSolution }
  | { type: "error"; message: string };

/**
 * Swimchain context value for React
 */
export interface SwimchainContextValue {
  /** Whether WASM is loaded and ready */
  isLoaded: boolean;
  /** Error that occurred during loading, if any */
  loadError: Error | null;
}
