/**
 * Web Worker for Argon2id PoW mining
 *
 * Offloads CPU-intensive Argon2id computation to prevent main thread blocking.
 * Fixes M-FORUM-2: Argon2id blocks main thread for 15-60s.
 */

import { argon2id } from 'hash-wasm';

/** PoW configuration */
export interface PoWConfig {
  memoryKib: number;
  iterations: number;
  parallelism: number;
}

/** Mining request from main thread */
export interface MineRequest {
  type: 'mine';
  id: string;
  serializedChallenge: Uint8Array;
  nonceSpace: Uint8Array;
  difficulty: number;
  config: PoWConfig;
  startNonce: bigint;
}

/** Progress update to main thread */
export interface ProgressUpdate {
  type: 'progress';
  id: string;
  attempts: number;
  elapsedMs: number;
  hashRate: number;
}

/** Mining result */
export interface MineResult {
  type: 'result';
  id: string;
  nonce?: string; // bigint serialized as string
  hash?: Uint8Array;
  error?: string;
}

/** Cancel request */
export interface CancelRequest {
  type: 'cancel';
  id: string;
}

export type WorkerRequest = MineRequest | CancelRequest;
export type WorkerResponse = ProgressUpdate | MineResult;

// Track cancelled requests
const cancelledIds = new Set<string>();

/**
 * Count leading zero bits in a hash
 */
function leadingZeros(hash: Uint8Array): number {
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

/**
 * Mine a PoW solution in the worker
 */
async function mineInWorker(request: MineRequest): Promise<void> {
  const { id, serializedChallenge, nonceSpace, difficulty, config, startNonce } = request;

  let nonce = BigInt(startNonce);
  const startTime = Date.now();
  let attempts = 0;

  // Pre-allocate input buffer (challenge + 8 nonce bytes)
  const input = new Uint8Array(serializedChallenge.length + 8);
  input.set(serializedChallenge, 0);
  const view = new DataView(input.buffer);

  while (true) {
    // Check cancellation
    if (cancelledIds.has(id)) {
      cancelledIds.delete(id);
      const result: MineResult = {
        type: 'result',
        id,
        error: 'Mining cancelled',
      };
      self.postMessage(result);
      return;
    }

    // Set nonce as big-endian u64
    view.setBigUint64(serializedChallenge.length, nonce, false);

    // Compute Argon2id hash
    const hash = await computeArgon2id(input, nonceSpace, config);
    attempts++;

    // Check if hash meets difficulty
    if (leadingZeros(hash) >= difficulty) {
      const result: MineResult = {
        type: 'result',
        id,
        nonce: nonce.toString(),
        hash,
      };
      self.postMessage(result);
      return;
    }

    // Progress update every 10 attempts (Argon2id is slow)
    if (attempts % 10 === 0) {
      const elapsedMs = Date.now() - startTime;
      const hashRate = (attempts / elapsedMs) * 1000;
      const progress: ProgressUpdate = {
        type: 'progress',
        id,
        attempts,
        elapsedMs,
        hashRate,
      };
      self.postMessage(progress);
    }

    nonce++;
  }
}

// Declare self as a worker global scope for proper typing
declare const self: Worker;

// Worker message handler
self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  if (request.type === 'cancel') {
    cancelledIds.add(request.id);
    return;
  }

  if (request.type === 'mine') {
    try {
      await mineInWorker(request);
    } catch (err) {
      const result: MineResult = {
        type: 'result',
        id: request.id,
        error: err instanceof Error ? err.message : 'Unknown mining error',
      };
      self.postMessage(result);
    }
  }
};
