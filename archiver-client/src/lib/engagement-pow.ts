/**
 * Engagement Proof-of-Work for Archiver Client
 *
 * Uses real Argon2id PoW from @swimchain/react's action-pow library.
 * This replaces the mocked setTimeout-based engagement.
 */

import {
  computePow,
  createEngageChallenge,
  solutionToRpcParams,
  getConfig,
  type PoWSolution,
  type ProgressCallback,
  type CancellationCheck,
} from '@swimchain/react';

/**
 * Result of mining engagement PoW
 */
export interface EngagementPowResult {
  /** Nonce that satisfies the difficulty requirement */
  nonce: string;
  /** Difficulty used */
  difficulty: number;
  /** Random nonce space (hex) */
  nonceSpace: string;
  /** Hash result (hex) */
  hash: string;
  /** Ed25519 signature (64-byte hex, 128 hex chars) */
  signature: string;
  /** Timestamp when mining started */
  timestamp: number;
  /** Number of attempts needed */
  attempts: number;
  /** Time taken in milliseconds */
  elapsedMs: number;
}

/**
 * Mine engagement PoW for a content ID
 *
 * This performs real Argon2id PoW computation.
 *
 * @param contentId - Content ID to engage with (sha256:... format)
 * @param authorPubkeyHex - Author's public key in hex format (64 chars)
 * @param isTestnet - Whether to use testnet difficulty (default: true)
 * @param onProgress - Optional progress callback
 * @param isCancelled - Optional cancellation check
 * @returns PoW result with all necessary RPC parameters
 */
export async function mineEngagementPow(
  contentId: string,
  authorPubkeyHex: string,
  isTestnet: boolean = true,
  onProgress?: ProgressCallback,
  isCancelled?: CancellationCheck
): Promise<EngagementPowResult> {
  const startTime = Date.now();
  let lastAttempts = 0;

  // Create challenge for engagement
  const challenge = await createEngageChallenge(contentId, authorPubkeyHex, isTestnet);

  // Get config for network
  const config = getConfig(isTestnet);

  // Mine the solution
  const solution = await computePow(
    challenge,
    config,
    (attempts, elapsedMs, hashRate) => {
      lastAttempts = attempts;
      onProgress?.(attempts, elapsedMs, hashRate);
    },
    isCancelled
  );

  const elapsedMs = Date.now() - startTime;
  const rpcParams = solutionToRpcParams(solution);

  return {
    nonce: rpcParams.pow_nonce,
    difficulty: rpcParams.pow_difficulty,
    nonceSpace: rpcParams.pow_nonce_space,
    hash: rpcParams.pow_hash,
    signature: rpcParams.signature,
    timestamp: rpcParams.timestamp,
    attempts: lastAttempts,
    elapsedMs,
  };
}

/**
 * Estimate mining time for engagement PoW
 *
 * @param isTestnet - Whether using testnet difficulty
 * @param hashRate - Estimated hash rate (hashes per second)
 * @returns Estimated time in seconds
 */
export function estimateEngagementMiningTime(
  isTestnet: boolean = true,
  hashRate: number = 1
): number {
  // Testnet: difficulty 6 = 2^6 = 64 expected attempts
  // Mainnet: difficulty 16 = 2^16 = 65536 expected attempts
  const difficulty = isTestnet ? 6 : 16;
  const expectedAttempts = Math.pow(2, difficulty);
  return expectedAttempts / hashRate;
}

// Re-export types for convenience
export type { PoWSolution, ProgressCallback, CancellationCheck };
