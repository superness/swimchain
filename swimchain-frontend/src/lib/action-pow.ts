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
 */

import { argon2id, createSHA256 } from 'hash-wasm';

/** Action types per SPEC_03 */
export enum ActionType {
  SpaceCreation = 0x01,
  Post = 0x02,
  Reply = 0x03,
  Engage = 0x04,
  IdentityUpdate = 0x05,
  SpamAttestation = 0x06,
}

/** Default difficulty per action type (mainnet) */
export const DIFFICULTY = {
  [ActionType.SpaceCreation]: 22,
  [ActionType.Post]: 20,
  [ActionType.Reply]: 18,
  [ActionType.Engage]: 16,
  [ActionType.IdentityUpdate]: 20,
  [ActionType.SpamAttestation]: 22,
};

/** Testnet difficulty (reduced by ~10 bits) */
export const TESTNET_DIFFICULTY = {
  [ActionType.SpaceCreation]: 12,
  [ActionType.Post]: 10,
  [ActionType.Reply]: 8,
  [ActionType.Engage]: 6,
  [ActionType.IdentityUpdate]: 10,
  [ActionType.SpamAttestation]: 12,
};

/** PoW configuration per SPEC_03 */
export interface PoWConfig {
  memoryKib: number;
  iterations: number;
  parallelism: number;
}

/** Production config (64 MiB - too heavy for browser) */
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

/** Challenge structure per SPEC_03 */
export interface PoWChallenge {
  actionType: ActionType;
  contentHash: Uint8Array; // 32 bytes
  authorId: Uint8Array;    // 32 bytes (public key)
  timestamp: number;       // Unix seconds
  difficulty: number;      // Leading zero bits required
  nonceSpace: Uint8Array;  // 8 bytes random
}

/** Solution structure per SPEC_03 */
export interface PoWSolution {
  challenge: PoWChallenge;
  nonce: bigint;
  hash: Uint8Array; // 32 bytes
}

/** Progress callback */
export type ProgressCallback = (attempts: number, elapsedMs: number, hashRate: number) => void;

/** Cancellation check */
export type CancellationCheck = () => boolean;

/**
 * Compute SHA-256 hash of data
 */
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hasher = await createSHA256();
  hasher.update(data);
  return hasher.digest('binary');
}

/**
 * Serialize a challenge to 82-byte canonical format per SPEC_03 §4.2
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

/**
 * Count leading zero bits in a hash
 */
export function leadingZeros(hash: Uint8Array): number {
  let zeros = 0;
  for (const byte of hash) {
    if (byte === 0) {
      zeros += 8;
    } else {
      // Count leading zeros in this byte
      zeros += Math.clz32(byte) - 24; // clz32 counts for 32-bit, subtract 24 for 8-bit
      break;
    }
  }
  return zeros;
}

/**
 * Generate a random nonce space
 */
export function generateNonceSpace(): Uint8Array {
  const nonceSpace = new Uint8Array(8);
  crypto.getRandomValues(nonceSpace);
  return nonceSpace;
}

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

/**
 * Compute PoW solution for a challenge
 *
 * This is the main mining function. It iterates through nonces until
 * it finds one that produces a hash with the required leading zeros.
 *
 * @param challenge The challenge to solve
 * @param config PoW configuration (memory, iterations, parallelism)
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
    // Check cancellation
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

    // Progress callback every 10 attempts (Argon2id is slow)
    if (attempts % 10 === 0) {
      const elapsedMs = Date.now() - startTime;
      const hashRate = (attempts / elapsedMs) * 1000;
      onProgress?.(attempts, elapsedMs, hashRate);
    }

    // Yield a macrotask periodically so the browser can repaint and process input.
    // This path has no Web Worker, so without yielding, a long mining run (e.g. a
    // Post at testnet difficulty ≈ hundreds/thousands of hashes) freezes the whole
    // UI — progress never updates and Cancel can't be clicked. Yielding keeps it
    // responsive at a negligible throughput cost.
    if (attempts % 8 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    nonce++;
  }
}

/**
 * Convert solution to RPC-compatible format
 */
export function solutionToRpcParams(solution: PoWSolution): {
  pow_nonce: number;
  pow_difficulty: number;
  pow_nonce_space: string;
  pow_hash: string;
  timestamp: number;
} {
  return {
    pow_nonce: Number(solution.nonce),
    pow_difficulty: solution.challenge.difficulty,
    pow_nonce_space: Array.from(solution.challenge.nonceSpace)
      .map(b => b.toString(16).padStart(2, '0'))
      .join(''),
    pow_hash: Array.from(solution.hash)
      .map(b => b.toString(16).padStart(2, '0'))
      .join(''),
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
  // Expected attempts = 2^difficulty
  const expectedAttempts = Math.pow(2, difficulty);
  return expectedAttempts / hashRate;
}

/**
 * Compute pool PoW target (used for engagement pool contributions)
 *
 * Target = SHA256(content_hash || pool_id || prev_block_hash)
 *
 * @param contentHash - 32-byte content hash
 * @param poolId - 32-byte pool ID
 * @param prevBlockHash - Optional 32-byte previous block hash
 */
export async function computePoolPowTarget(
  contentHash: Uint8Array,
  poolId: Uint8Array,
  prevBlockHash?: Uint8Array,
): Promise<Uint8Array> {
  const zeroHash = new Uint8Array(32);
  const blockHash = prevBlockHash || zeroHash;

  // Concatenate: content_hash || pool_id || block_hash
  const preimage = new Uint8Array(32 + 32 + 32);
  preimage.set(contentHash, 0);
  preimage.set(poolId, 32);
  preimage.set(blockHash, 64);

  return sha256(preimage);
}

/**
 * Convert hex string to Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Convert Uint8Array to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
