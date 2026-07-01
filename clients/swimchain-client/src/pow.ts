/**
 * SwimChain Action Proof-of-Work
 *
 * Implements SPEC_03 action PoW using Argon2id.
 * This is used for creating posts, replies, and engagements.
 */

import { argon2id } from 'hash-wasm';
import {
  ActionType,
  PoWChallenge,
  PoWConfig,
  PoWSolution,
  ProgressCallback,
  CancellationCheck,
} from './types.js';
import { sha256, randomBytes, bytesToHex } from './utils.js';

// =============================================================================
// Constants
// =============================================================================

/** Default difficulty per action type (mainnet) */
export const DIFFICULTY: Record<ActionType, number> = {
  [ActionType.SpaceCreation]: 22,
  [ActionType.Post]: 20,
  [ActionType.Reply]: 18,
  [ActionType.Engage]: 16,
  [ActionType.IdentityUpdate]: 20,
};

/** Testnet difficulty (reduced ~10 bits) */
export const TESTNET_DIFFICULTY: Record<ActionType, number> = {
  [ActionType.SpaceCreation]: 12,
  [ActionType.Post]: 10,
  [ActionType.Reply]: 8,
  [ActionType.Engage]: 6,
  [ActionType.IdentityUpdate]: 10,
};

/** Production config (64 MiB) */
export const PRODUCTION_CONFIG: PoWConfig = {
  memoryKib: 65536,
  iterations: 3,
  parallelism: 4,
};

/** Testnet config (8 MiB) */
export const TESTNET_CONFIG: PoWConfig = {
  memoryKib: 8192,
  iterations: 1,
  parallelism: 2,
};

/** Fast test config (1 MiB) */
export const TEST_CONFIG: PoWConfig = {
  memoryKib: 1024,
  iterations: 1,
  parallelism: 1,
};

// =============================================================================
// Challenge Creation
// =============================================================================

/**
 * Create a challenge for content
 */
export async function createChallenge(
  actionType: ActionType,
  content: Uint8Array,
  authorPubkey: Uint8Array,
  difficulty: number,
): Promise<PoWChallenge> {
  const contentHash = await sha256(content);
  const timestamp = Math.floor(Date.now() / 1000);
  const nonceSpace = randomBytes(8);

  return {
    actionType,
    contentHash,
    authorId: authorPubkey,
    timestamp,
    difficulty,
    nonceSpace,
  };
}

/**
 * Serialize a challenge to 82-byte canonical format per SPEC_03
 */
export function serializeChallenge(challenge: PoWChallenge): Uint8Array {
  const buf = new Uint8Array(82);
  buf[0] = challenge.actionType;
  buf.set(challenge.contentHash, 1);
  buf.set(challenge.authorId, 33);

  // Timestamp as big-endian u64
  const view = new DataView(buf.buffer);
  const ts = BigInt(challenge.timestamp);
  view.setBigUint64(65, ts, false); // big-endian

  buf[73] = challenge.difficulty;
  buf.set(challenge.nonceSpace, 74);

  return buf;
}

// =============================================================================
// Hash Computation
// =============================================================================

/**
 * Count leading zero bits in a hash
 */
export function leadingZeros(hash: Uint8Array): number {
  let zeros = 0;
  for (const byte of hash) {
    if (byte === 0) {
      zeros += 8;
    } else {
      zeros += Math.clz32(byte) - 24;
      break;
    }
  }
  return zeros;
}

/**
 * Compute Argon2id hash for PoW
 */
async function computeArgon2id(
  input: Uint8Array,
  salt: Uint8Array,
  config: PoWConfig,
): Promise<Uint8Array> {
  const hash = await argon2id({
    password: input,
    salt: salt,
    parallelism: config.parallelism,
    memorySize: config.memoryKib,
    iterations: config.iterations,
    hashLength: 32,
    outputType: 'binary',
  });

  return new Uint8Array(hash);
}

// =============================================================================
// Mining
// =============================================================================

/**
 * Compute PoW solution for a challenge
 *
 * @param challenge The challenge to solve
 * @param config PoW configuration
 * @param onProgress Optional progress callback
 * @param isCancelled Optional cancellation check
 * @returns The solution with nonce and hash
 */
export async function computePow(
  challenge: PoWChallenge,
  config: PoWConfig,
  onProgress?: ProgressCallback,
  isCancelled?: CancellationCheck,
): Promise<PoWSolution> {
  const serialized = serializeChallenge(challenge);
  let nonce = 0n;
  const startTime = Date.now();
  let attempts = 0;

  // Pre-allocate input buffer (82 challenge + 8 nonce = 90 bytes)
  const input = new Uint8Array(90);
  input.set(serialized, 0);
  const view = new DataView(input.buffer);

  while (true) {
    if (isCancelled?.()) {
      throw new Error('Mining cancelled');
    }

    // Set nonce as big-endian u64
    view.setBigUint64(82, nonce, false);

    // Compute Argon2id hash
    const hash = await computeArgon2id(input, challenge.nonceSpace, config);
    attempts++;

    // Check if hash meets difficulty
    if (leadingZeros(hash) >= challenge.difficulty) {
      return {
        challenge,
        nonce,
        hash,
      };
    }

    // Progress callback every 10 attempts
    if (attempts % 10 === 0) {
      const elapsedMs = Date.now() - startTime;
      const hashRate = (attempts / elapsedMs) * 1000;
      onProgress?.(attempts, elapsedMs, hashRate);
    }

    nonce++;
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Convert solution to RPC-compatible format (camelCase)
 */
export function solutionToRpcParams(solution: PoWSolution): {
  powNonce: number;
  powDifficulty: number;
  powNonceSpace: string;
  powHash: string;
  timestamp: number;
} {
  return {
    powNonce: Number(solution.nonce),
    powDifficulty: solution.challenge.difficulty,
    powNonceSpace: bytesToHex(solution.challenge.nonceSpace),
    powHash: bytesToHex(solution.hash),
    timestamp: solution.challenge.timestamp,
  };
}

/**
 * Get difficulty for action type
 */
export function getDifficulty(actionType: ActionType, isTestnet = true): number {
  return isTestnet ? TESTNET_DIFFICULTY[actionType] : DIFFICULTY[actionType];
}

/**
 * Get PoW config for network
 */
export function getPoWConfig(isTestnet = true): PoWConfig {
  return isTestnet ? TESTNET_CONFIG : PRODUCTION_CONFIG;
}

/**
 * Estimate mining time in seconds
 */
export function estimateMiningTime(difficulty: number, hashRate = 1): number {
  const expectedAttempts = Math.pow(2, difficulty);
  return expectedAttempts / hashRate;
}
