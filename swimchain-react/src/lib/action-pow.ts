/**
 * Action Proof-of-Work for Swimchain
 *
 * Implements SPEC_03 action PoW using Argon2id.
 * This is DISTINCT from identity PoW (SHA-256) used for creating identities.
 *
 * Action PoW is required for:
 * - Creating posts (difficulty 20, testnet: 10)
 * - Creating replies (difficulty 18, testnet: 8)
 * - Engaging with content (difficulty 16, testnet: 6)
 * - Creating spaces (difficulty 22, testnet: 12)
 *
 * @packageDocumentation
 */

import { argon2id, createSHA256 } from 'hash-wasm';
import { hexToBytes, bytesToHex } from './utils';

// =========================================================================
// Types
// =========================================================================

/** Action types per SPEC_03 */
export enum ActionType {
  SpaceCreation = 0x01,
  Post = 0x02,
  Reply = 0x03,
  Engage = 0x04,
  IdentityUpdate = 0x05,
  SpamAttestation = 0x06,
}

/** PoW configuration */
export interface PoWConfig {
  memoryKib: number;
  iterations: number;
  parallelism: number;
}

/** Challenge structure per SPEC_03 */
export interface PoWChallenge {
  actionType: ActionType;
  contentHash: Uint8Array; // 32 bytes
  authorId: Uint8Array; // 32 bytes (public key)
  timestamp: number; // Unix seconds
  difficulty: number; // Leading zero bits required
  nonceSpace: Uint8Array; // 8 bytes random
}

/** Solution structure */
export interface PoWSolution {
  challenge: PoWChallenge;
  nonce: bigint;
  hash: Uint8Array; // 32 bytes
}

/** Progress callback */
export type ProgressCallback = (attempts: number, elapsedMs: number, hashRate: number) => void;

/** Cancellation check */
export type CancellationCheck = () => boolean;

// =========================================================================
// Constants
// =========================================================================

/** Default difficulty per action type (mainnet) */
export const DIFFICULTY: Record<ActionType, number> = {
  [ActionType.SpaceCreation]: 22,
  [ActionType.Post]: 20,
  [ActionType.Reply]: 18,
  [ActionType.Engage]: 16,
  [ActionType.IdentityUpdate]: 20,
  [ActionType.SpamAttestation]: 22,
};

/** Testnet difficulty (reduced for faster testing) */
export const TESTNET_DIFFICULTY: Record<ActionType, number> = {
  [ActionType.SpaceCreation]: 12,
  [ActionType.Post]: 10,
  [ActionType.Reply]: 8,
  [ActionType.Engage]: 6,
  [ActionType.IdentityUpdate]: 10,
  [ActionType.SpamAttestation]: 12,
};

/** Production config (64 MiB - heavy) */
export const PRODUCTION_CONFIG: PoWConfig = {
  memoryKib: 65536,
  iterations: 3,
  parallelism: 4,
};

/** Testnet config (8 MiB - reasonable for browser) */
export const TESTNET_CONFIG: PoWConfig = {
  memoryKib: 8192,
  iterations: 1,
  parallelism: 2,
};

/** Test/regtest config (1 MiB - fast) */
export const TEST_CONFIG: PoWConfig = {
  memoryKib: 1024,
  iterations: 1,
  parallelism: 1,
};

// =========================================================================
// Utilities
// =========================================================================

/**
 * Compute SHA-256 hash
 */
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hasher = await createSHA256();
  hasher.update(data);
  return hasher.digest('binary');
}

// Re-export hexToBytes and bytesToHex from shared utils
export { hexToBytes, bytesToHex } from './utils';

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
 * Generate a random nonce space (8 bytes)
 */
export function generateNonceSpace(): Uint8Array {
  const nonceSpace = new Uint8Array(8);
  crypto.getRandomValues(nonceSpace);
  return nonceSpace;
}

/**
 * Serialize a challenge to 82-byte canonical format per SPEC_03 §4.2
 */
export function serializeChallenge(challenge: PoWChallenge): Uint8Array {
  const buf = new Uint8Array(82);
  buf[0] = challenge.actionType;
  buf.set(challenge.contentHash, 1);
  buf.set(challenge.authorId, 33);

  const view = new DataView(buf.buffer);
  const ts = BigInt(challenge.timestamp);
  view.setBigUint64(65, ts, false); // big-endian

  buf[73] = challenge.difficulty;
  buf.set(challenge.nonceSpace, 74);

  return buf;
}

// =========================================================================
// Challenge Creation
// =========================================================================

/**
 * Create a challenge for content
 */
export async function createChallenge(
  actionType: ActionType,
  content: Uint8Array,
  authorPubkey: Uint8Array,
  difficulty: number
): Promise<PoWChallenge> {
  const contentHash = await sha256(content);
  const timestamp = Math.floor(Date.now() / 1000);
  const nonceSpace = generateNonceSpace();

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
 * Create a challenge for a post
 */
export async function createPostChallenge(
  spaceId: string,
  title: string,
  body: string,
  authorPubkeyHex: string,
  isTestnet: boolean = true
): Promise<PoWChallenge> {
  const content = new TextEncoder().encode(`${spaceId}:${title}:${body}`);
  const authorPubkey = hexToBytes(authorPubkeyHex);
  const difficulty = isTestnet ? TESTNET_DIFFICULTY[ActionType.Post] : DIFFICULTY[ActionType.Post];
  return createChallenge(ActionType.Post, content, authorPubkey, difficulty);
}

/**
 * Create a challenge for a reply
 */
export async function createReplyChallenge(
  parentId: string,
  body: string,
  authorPubkeyHex: string,
  isTestnet: boolean = true
): Promise<PoWChallenge> {
  const content = new TextEncoder().encode(`${parentId}:${body}`);
  const authorPubkey = hexToBytes(authorPubkeyHex);
  const difficulty = isTestnet
    ? TESTNET_DIFFICULTY[ActionType.Reply]
    : DIFFICULTY[ActionType.Reply];
  return createChallenge(ActionType.Reply, content, authorPubkey, difficulty);
}

/**
 * Create a challenge for engagement
 */
export async function createEngageChallenge(
  contentId: string,
  authorPubkeyHex: string,
  isTestnet: boolean = true
): Promise<PoWChallenge> {
  const contentHashHex = contentId.startsWith('sha256:') ? contentId.slice(7) : contentId;
  const contentHash = hexToBytes(contentHashHex);
  const authorPubkey = hexToBytes(authorPubkeyHex);
  const difficulty = isTestnet
    ? TESTNET_DIFFICULTY[ActionType.Engage]
    : DIFFICULTY[ActionType.Engage];

  const timestamp = Math.floor(Date.now() / 1000);
  const nonceSpace = generateNonceSpace();

  return {
    actionType: ActionType.Engage,
    contentHash,
    authorId: authorPubkey,
    timestamp,
    difficulty,
    nonceSpace,
  };
}

/**
 * Create a challenge for space creation
 */
export async function createSpaceChallenge(
  name: string,
  authorPubkeyHex: string,
  isTestnet: boolean = true
): Promise<PoWChallenge> {
  const content = new TextEncoder().encode(`space:${name}`);
  const authorPubkey = hexToBytes(authorPubkeyHex);
  const difficulty = isTestnet
    ? TESTNET_DIFFICULTY[ActionType.SpaceCreation]
    : DIFFICULTY[ActionType.SpaceCreation];
  return createChallenge(ActionType.SpaceCreation, content, authorPubkey, difficulty);
}

// =========================================================================
// Mining
// =========================================================================

/**
 * Compute Argon2id hash for PoW
 */
async function computeArgon2id(
  input: Uint8Array,
  salt: Uint8Array,
  config: PoWConfig
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

/**
 * Compute PoW solution for a challenge
 *
 * This is the main mining function. It iterates through nonces until
 * it finds one that produces a hash with the required leading zeros.
 */
export async function computePow(
  challenge: PoWChallenge,
  config: PoWConfig,
  onProgress?: ProgressCallback,
  isCancelled?: CancellationCheck
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

    nonce = nonce + 1n;
  }
}

// =========================================================================
// Helpers
// =========================================================================

/**
 * Convert solution to RPC-compatible parameters
 *
 * Note: nonce is passed as a string to avoid precision loss for large values.
 * JavaScript numbers (IEEE 754 doubles) lose precision above 2^53.
 */
export function solutionToRpcParams(solution: PoWSolution): {
  pow_nonce: string;
  pow_difficulty: number;
  pow_nonce_space: string;
  pow_hash: string;
  timestamp: number;
} {
  return {
    pow_nonce: solution.nonce.toString(),
    pow_difficulty: solution.challenge.difficulty,
    pow_nonce_space: bytesToHex(solution.challenge.nonceSpace),
    pow_hash: bytesToHex(solution.hash),
    timestamp: solution.challenge.timestamp,
  };
}

/**
 * Get difficulty for action type based on network
 */
export function getDifficulty(actionType: ActionType, isTestnet: boolean = true): number {
  return isTestnet ? TESTNET_DIFFICULTY[actionType] : DIFFICULTY[actionType];
}

/**
 * Get PoW config based on network
 */
export function getConfig(isTestnet: boolean = true): PoWConfig {
  return isTestnet ? TESTNET_CONFIG : PRODUCTION_CONFIG;
}

/**
 * Estimate mining time in seconds
 */
export function estimateMiningTime(difficulty: number, hashRate: number = 1): number {
  const expectedAttempts = Math.pow(2, difficulty);
  return expectedAttempts / hashRate;
}
