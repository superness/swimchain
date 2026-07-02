/**
 * Swimchain Proof-of-Work Protocol
 *
 * Defines the protocol-level types and constants for Swimchain
 * proof-of-work, including identity PoW (SHA-256) and action PoW (Argon2id).
 *
 * Two distinct PoW systems:
 * 1. Identity PoW — SHA-256 based, used when creating identities
 * 2. Action PoW — Argon2id based, used for posting/reply/engage actions
 */

// ============================================================================
// Identity PoW Protocol (SHA-256 based)
// ============================================================================

/** Default identity PoW difficulty (leading zero bits required) */
export const DEFAULT_IDENTITY_DIFFICULTY = 8 as const;

/** Testnet identity PoW difficulty */
export const TESTNET_IDENTITY_DIFFICULTY = 4 as const;

/** Identity PoW target format: SHA256(publicKey || nonce || timestamp) */
export const IDENTITY_POW_INPUT_FORMAT = 'publicKey || nonce || timestamp' as const;

// ============================================================================
// Action PoW Protocol (Argon2id based)
// ============================================================================

/**
 * Action types that require PoW, matching the protocol spec
 */
export enum ActionTypeProtocol {
  SpaceCreation = 0x01,
  Post = 0x02,
  Reply = 0x03,
  Engage = 0x04,
  IdentityUpdate = 0x05,
  SpamAttestation = 0x06,
}

/**
 * Protocol-defined difficulty levels per action type (mainnet)
 */
export const DIFFICULTY_PROTOCOL: Record<ActionTypeProtocol, number> = {
  [ActionTypeProtocol.SpaceCreation]: 22,
  [ActionTypeProtocol.Post]: 20,
  [ActionTypeProtocol.Reply]: 18,
  [ActionTypeProtocol.Engage]: 16,
  [ActionTypeProtocol.IdentityUpdate]: 20,
  [ActionTypeProtocol.SpamAttestation]: 22,
};

/**
 * Protocol-defined difficulty levels per action type (testnet)
 */
export const TESTNET_DIFFICULTY_PROTOCOL: Record<ActionTypeProtocol, number> = {
  [ActionTypeProtocol.SpaceCreation]: 12,
  [ActionTypeProtocol.Post]: 10,
  [ActionTypeProtocol.Reply]: 8,
  [ActionTypeProtocol.Engage]: 6,
  [ActionTypeProtocol.IdentityUpdate]: 10,
  [ActionTypeProtocol.SpamAttestation]: 12,
};

/**
 * PoW configuration presets (memory, iterations, parallelism)
 */
export interface PoWConfigProtocol {
  /** Argon2id memory in KiB */
  memoryKib: number;
  /** Argon2id iterations */
  iterations: number;
  /** Argon2id parallelism */
  parallelism: number;
}

/** Production Argon2id config (64 MiB) */
export const PRODUCTION_CONFIG_PROTOCOL: PoWConfigProtocol = {
  memoryKib: 65536,
  iterations: 3,
  parallelism: 4,
};

/** Testnet Argon2id config (8 MiB) */
export const TESTNET_CONFIG_PROTOCOL: PoWConfigProtocol = {
  memoryKib: 8192,
  iterations: 1,
  parallelism: 2,
};

/** Development/regtest Argon2id config (1 MiB) */
export const DEV_CONFIG_PROTOCOL: PoWConfigProtocol = {
  memoryKib: 1024,
  iterations: 1,
  parallelism: 1,
};

// ============================================================================
// PoW Challenge/Solution Protocol Types
// ============================================================================

/**
 * Protocol-level PoW challenge structure
 *
 * Serialized format (82 bytes):
 * - 1 byte: action type
 * - 32 bytes: content hash
 * - 32 bytes: author public key
 * - 8 bytes: timestamp (big-endian u64)
 * - 1 byte: difficulty
 * - 8 bytes: nonce space
 */
export interface PoWChallengeProtocol {
  /** Action type requiring PoW */
  actionType: ActionTypeProtocol;
  /** 32-byte SHA-256 hash of content */
  contentHash: Uint8Array;
  /** 32-byte author Ed25519 public key */
  authorId: Uint8Array;
  /** Unix timestamp (seconds) */
  timestamp: number;
  /** Required leading zero bits */
  difficulty: number;
  /** 8-byte random nonce space */
  nonceSpace: Uint8Array;
}

/**
 * Protocol-level PoW solution
 */
export interface PoWSolutionProtocol {
  /** The challenge that was solved */
  challenge: PoWChallengeProtocol;
  /** The winning nonce */
  nonce: bigint;
  /** 32-byte hash output */
  hash: Uint8Array;
}

/**
 * Identity PoW solution (SHA-256 based)
 */
export interface IdentityPoWSolutionProtocol {
  /** The winning nonce value */
  nonce: string;
  /** Unix timestamp used in the PoW */
  timestamp: string;
  /** Difficulty level used */
  difficulty: number;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get protocol difficulty for an action type based on network
 *
 * @param actionType - The action type
 * @param isTestnet - Whether using testnet (default: true)
 * @returns Required leading zero bits
 *
 * @example
 * ```ts
 * const diff = getDifficultyProtocol(ActionTypeProtocol.Post, true);
 * // Returns 10 (testnet post difficulty)
 * ```
 */
export function getDifficultyProtocol(
  actionType: ActionTypeProtocol,
  isTestnet: boolean = true
): number {
  return isTestnet
    ? TESTNET_DIFFICULTY_PROTOCOL[actionType]
    : DIFFICULTY_PROTOCOL[actionType];
}

/**
 * Get PoW config for a network type
 *
 * @param isTestnet - Whether using testnet (default: true)
 * @param isDev - Whether using dev/regtest mode
 * @returns PoW configuration
 *
 * @example
 * ```ts
 * const config = getConfigProtocol(true, false);
 * // Returns TESTNET_CONFIG_PROTOCOL
 * ```
 */
export function getConfigProtocol(
  isTestnet: boolean = true,
  isDev: boolean = false
): PoWConfigProtocol {
  if (isDev) return DEV_CONFIG_PROTOCOL;
  return isTestnet ? TESTNET_CONFIG_PROTOCOL : PRODUCTION_CONFIG_PROTOCOL;
}

/**
 * Estimate mining time for a given difficulty
 *
 * @param difficulty - Required leading zero bits
 * @param hashRate - Hash rate in hashes/second (default: 1)
 * @returns Estimated seconds
 *
 * @example
 * ```ts
 * const secs = estimateMiningTimeProtocol(10, 1000);
 * // ~1 second for 10-bit difficulty at 1000 h/s
 * ```
 */
export function estimateMiningTimeProtocol(
  difficulty: number,
  hashRate: number = 1
): number {
  const expectedAttempts = Math.pow(2, difficulty);
  return expectedAttempts / hashRate;
}

/**
 * Format mining time estimate for display
 *
 * @param seconds - Estimated seconds
 * @returns Human-readable string
 */
export function formatMiningEstimateProtocol(seconds: number): string {
  if (seconds < 1) return '< 1s';
  if (seconds < 60) return `~${Math.round(seconds)}s`;
  if (seconds < 3600) return `~${Math.round(seconds / 60)}m`;
  return `~${(seconds / 3600).toFixed(1)}h`;
}

/**
 * Get PoW action type label
 *
 * @param type - Action type enum
 * @returns Human-readable label
 */
export function getActionTypeLabel(type: ActionTypeProtocol): string {
  switch (type) {
    case ActionTypeProtocol.SpaceCreation:
      return 'Space Creation';
    case ActionTypeProtocol.Post:
      return 'Post';
    case ActionTypeProtocol.Reply:
      return 'Reply';
    case ActionTypeProtocol.Engage:
      return 'Engage';
    case ActionTypeProtocol.IdentityUpdate:
      return 'Identity Update';
    case ActionTypeProtocol.SpamAttestation:
      return 'Spam Attestation';
    default:
      return 'Unknown';
  }
}
