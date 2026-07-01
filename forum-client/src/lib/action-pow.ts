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
import type {
  MineRequest,
  CancelRequest,
  WorkerResponse,
} from './action-pow-worker';

// =========================================================================
// Web Worker for Argon2id PoW (M-FORUM-2 fix)
// =========================================================================

let powWorker: Worker | null = null;
let workerRequestId = 0;
const pendingMines = new Map<string, {
  resolve: (solution: PoWSolution) => void;
  reject: (error: Error) => void;
  onProgress?: ProgressCallback;
  challenge: PoWChallenge;
}>();

/**
 * Initialize the PoW worker lazily
 */
function getWorker(): Worker | null {
  if (powWorker) {
    return powWorker;
  }

  // Only create worker in browser environment with Worker support
  if (typeof Worker === 'undefined') {
    return null;
  }

  try {
    powWorker = new Worker(
      new URL('./action-pow-worker.ts', import.meta.url),
      { type: 'module' }
    );

    powWorker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;

      if (response.type === 'progress') {
        const pending = pendingMines.get(response.id);
        if (pending?.onProgress) {
          pending.onProgress(response.attempts, response.elapsedMs, response.hashRate);
        }
        return;
      }

      if (response.type === 'result') {
        const pending = pendingMines.get(response.id);
        if (pending) {
          pendingMines.delete(response.id);
          if (response.error) {
            pending.reject(new Error(response.error));
          } else if (response.nonce !== undefined && response.hash) {
            const solution: PoWSolution = {
              challenge: pending.challenge,
              nonce: BigInt(response.nonce),
              hash: new Uint8Array(response.hash),
            };
            pending.resolve(solution);
          } else {
            pending.reject(new Error('Invalid worker response'));
          }
        }
      }
    };

    powWorker.onerror = (error) => {
      console.error('[ActionPow] Worker error:', error);
      // Reject all pending requests
      for (const [id, pending] of pendingMines) {
        pending.reject(new Error('Worker error'));
        pendingMines.delete(id);
      }
      // Reset worker to allow retry
      powWorker = null;
    };

    return powWorker;
  } catch (err) {
    console.warn('[ActionPow] Failed to create worker, falling back to main thread:', err);
    return null;
  }
}

/**
 * Cancel a mining operation by request ID
 */
export function cancelMining(requestId: string): void {
  const worker = getWorker();
  if (worker) {
    const cancelReq: CancelRequest = {
      type: 'cancel',
      id: requestId,
    };
    worker.postMessage(cancelReq);
  }
}

/** Action types per SPEC_03 */
export enum ActionType {
  SpaceCreation = 0x01,
  Post = 0x02,
  Reply = 0x03,
  Engage = 0x04,
  IdentityUpdate = 0x05,
  Edit = 0x06,
  Invite = 0x07,
  SpamAttestation = 0x08, // Per SPEC_12 §3.2
}

/** Default difficulty per action type (mainnet) */
export const DIFFICULTY: Record<ActionType, number> = {
  [ActionType.SpaceCreation]: 22,
  [ActionType.Post]: 20,
  [ActionType.Reply]: 18,
  [ActionType.Engage]: 16,
  [ActionType.IdentityUpdate]: 20,
  [ActionType.Edit]: 18, // Same as Reply
  [ActionType.Invite]: 18, // Same as Reply
  [ActionType.SpamAttestation]: 18, // Per SPEC_12 §3.2
};

/** Testnet difficulty (reduced by ~10 bits) */
export const TESTNET_DIFFICULTY: Record<ActionType, number> = {
  [ActionType.SpaceCreation]: 12,
  [ActionType.Post]: 10,
  [ActionType.Reply]: 8,
  [ActionType.Engage]: 6,
  [ActionType.IdentityUpdate]: 10,
  [ActionType.Edit]: 8, // Same as Reply
  [ActionType.Invite]: 8, // Same as Reply
  [ActionType.SpamAttestation]: 8, // Per SPEC_12 §3.2
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
 * Create a challenge with a pre-computed content hash (no re-hashing)
 *
 * Use this for engagement PoW where the contentId is already a hash
 * (e.g., "sha256:abc123..."). The server expects the raw 32-byte hash
 * in the PoW challenge, not SHA256 of the hash string.
 *
 * @param actionType - The action type
 * @param contentHash - Pre-computed 32-byte content hash (raw bytes, not hex string)
 * @param authorPubkey - 32-byte author public key
 * @param difficulty - PoW difficulty (leading zero bits)
 * @returns PoW challenge ready for mining
 */
export function createChallengeWithRawHash(
  actionType: ActionType,
  contentHash: Uint8Array,
  authorPubkey: Uint8Array,
  difficulty: number,
): PoWChallenge {
  if (contentHash.length !== 32) {
    throw new Error(`Content hash must be 32 bytes, got ${contentHash.length}`);
  }
  if (authorPubkey.length !== 32) {
    throw new Error(`Author pubkey must be 32 bytes, got ${authorPubkey.length}`);
  }

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

    nonce++;
  }
}

/**
 * Compute PoW solution using Web Worker (non-blocking)
 *
 * Uses a dedicated Web Worker to prevent main thread blocking during
 * Argon2id computation. Falls back to main thread if worker unavailable.
 *
 * @param challenge The challenge to solve
 * @param config PoW configuration (memory, iterations, parallelism)
 * @param onProgress Optional progress callback
 * @param isCancelled Optional cancellation check (used for early rejection)
 * @returns Object containing the solution promise and a cancel function
 */
export function computePowViaWorker(
  challenge: PoWChallenge,
  config: PoWConfig,
  onProgress?: ProgressCallback,
  isCancelled?: CancellationCheck,
): { promise: Promise<PoWSolution>; requestId: string } {
  const worker = getWorker();
  const requestId = `pow-${++workerRequestId}`;

  if (!worker) {
    // Fallback to main thread if worker unavailable
    console.warn('[ActionPow] Worker unavailable, using main thread');
    return {
      promise: computePow(challenge, config, onProgress, isCancelled),
      requestId,
    };
  }

  const promise = new Promise<PoWSolution>((resolve, reject) => {
    // Check if already cancelled before starting
    if (isCancelled?.()) {
      reject(new Error('Mining cancelled'));
      return;
    }

    pendingMines.set(requestId, {
      resolve,
      reject,
      onProgress,
      challenge,
    });

    const serialized = serializeChallenge(challenge);

    const request: MineRequest = {
      type: 'mine',
      id: requestId,
      serializedChallenge: serialized,
      nonceSpace: challenge.nonceSpace,
      difficulty: challenge.difficulty,
      config,
      startNonce: 0n,
    };

    worker.postMessage(request);
  });

  return { promise, requestId };
}

/**
 * Convert solution to RPC-compatible format
 *
 * NOTE: pow_nonce is converted to Number which may truncate values > 2^53.
 * In practice, PoW solutions rarely exceed this limit due to difficulty settings.
 * A future fix should serialize as string and update server-side handling.
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
 * @throws Error if hex string is invalid (odd length or non-hex chars)
 */
export function hexToBytes(hex: string): Uint8Array {
  // Validate hex string format
  if (hex.length % 2 !== 0) {
    throw new Error(`Invalid hex string: odd length (${hex.length})`);
  }
  if (!/^[0-9a-fA-F]*$/.test(hex)) {
    throw new Error('Invalid hex string: contains non-hex characters');
  }

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

// =============================================================================
// Replace-In-Mempool (RIM) Support
// =============================================================================

/**
 * Compute the action hash used for Replace-In-Mempool (RIM) tracking.
 *
 * This hash uniquely identifies an action in the mempool and is used when
 * you want to replace a pending action before block formation.
 *
 * The hash is: sha256(actor || timestamp || action_type || content_hash)
 * - actor: 32 bytes (identity public key)
 * - timestamp: 8 bytes (big-endian u64)
 * - action_type: 1 byte
 * - content_hash: 32 bytes
 *
 * @param actor - Author's identity public key (32-byte hex or Uint8Array)
 * @param timestamp - Action timestamp (seconds since UNIX epoch)
 * @param actionType - The action type enum value
 * @param contentHash - Content hash (32-byte hex or Uint8Array)
 * @returns The action hash as a 32-byte hex string
 */
export async function computeActionHash(
  actor: string | Uint8Array,
  timestamp: number,
  actionType: ActionType,
  contentHash: string | Uint8Array,
): Promise<string> {
  const actorBytes = typeof actor === 'string' ? hexToBytes(actor) : actor;
  const contentBytes = typeof contentHash === 'string' ? hexToBytes(contentHash) : contentHash;

  if (actorBytes.length !== 32) {
    throw new Error('Actor must be 32 bytes');
  }
  if (contentBytes.length !== 32) {
    throw new Error('Content hash must be 32 bytes');
  }

  // Build preimage: actor(32) || timestamp(8) || action_type(1) || content_hash(32) = 73 bytes
  const preimage = new Uint8Array(73);
  let offset = 0;

  // actor: 32 bytes
  preimage.set(actorBytes, offset);
  offset += 32;

  // timestamp: 8 bytes big-endian
  const view = new DataView(preimage.buffer);
  view.setBigUint64(offset, BigInt(timestamp), false);
  offset += 8;

  // action_type: 1 byte
  preimage[offset] = actionType;
  offset += 1;

  // content_hash: 32 bytes
  preimage.set(contentBytes, offset);

  const hash = await sha256(preimage);
  return bytesToHex(hash);
}

/**
 * Helper to track pending action hashes for RIM.
 *
 * When you submit a post/reply/edit, store the returned action hash.
 * If you need to replace it before block formation (~30 seconds),
 * pass that hash as replacesPending in your new submission.
 *
 * Example usage:
 * ```typescript
 * // 1. Submit original post
 * const result = await rpc.submitPost({ ... });
 * const actionHash = await computeActionHash(authorId, timestamp, ActionType.Post, contentHash);
 *
 * // 2. Store the action hash locally
 * pendingActions.set(result.content_id, actionHash);
 *
 * // 3. If user edits within 30s, replace the pending action
 * const pendingHash = pendingActions.get(originalContentId);
 * await rpc.submitEdit({
 *   originalContentId,
 *   body: newBody,
 *   replacesPending: pendingHash, // <-- This replaces the pending action
 *   ...
 * });
 * ```
 */
