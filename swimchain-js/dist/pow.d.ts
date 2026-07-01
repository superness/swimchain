/**
 * Proof-of-Work mining and verification
 *
 * Provides identity PoW mining using SHA-256.
 * NOTE: This does NOT include Argon2id action PoW due to WASM memory constraints.
 */
import type { PowSolution, MiningOptions } from "./types";
/**
 * Default identity PoW difficulty (20 bits of leading zeros)
 */
export declare const DEFAULT_IDENTITY_POW_DIFFICULTY = 20;
/**
 * Mine identity proof-of-work
 *
 * This is a blocking operation that may take several seconds for high difficulties.
 * For non-blocking mining, use `PowWorker` or call this in a Web Worker.
 *
 * @param publicKey - 32-byte Ed25519 public key
 * @param difficulty - Number of leading zero bits required (1-64)
 * @returns PoW solution
 * @throws Error if mining fails
 *
 * @example
 * ```ts
 * const keypair = new Keypair();
 * const solution = mineIdentityPow(keypair.publicKey(), 8);
 * console.log(`Found nonce ${solution.nonce} in ${solution.elapsedMs}ms`);
 * ```
 */
export declare function mineIdentityPow(publicKey: Uint8Array, difficulty?: number): PowSolution;
/**
 * Mine identity proof-of-work with attempt limit
 *
 * @param publicKey - 32-byte Ed25519 public key
 * @param difficulty - Number of leading zero bits required
 * @param maxAttempts - Maximum number of hash attempts
 * @returns PoW solution
 * @throws Error if max attempts exceeded
 */
export declare function mineIdentityPowWithLimit(publicKey: Uint8Array, difficulty: number, maxAttempts: number): PowSolution;
/**
 * Verify identity proof-of-work
 *
 * @param pubkey - 32-byte Ed25519 public key
 * @param timestamp - Timestamp used in the PoW (UNIX seconds)
 * @param nonce - The nonce value
 * @param difficulty - Required number of leading zero bits
 * @returns true if proof is valid
 *
 * @example
 * ```ts
 * const isValid = verifyIdentityPow(
 *   publicKey,
 *   solution.timestamp,
 *   solution.nonce,
 *   8
 * );
 * ```
 */
export declare function verifyIdentityPow(pubkey: Uint8Array, timestamp: bigint | number, nonce: bigint | number, difficulty: number): boolean;
/**
 * Verify identity proof-of-work and get the hash
 *
 * @param pubkey - 32-byte Ed25519 public key
 * @param timestamp - Timestamp used in the PoW
 * @param nonce - The nonce value
 * @param difficulty - Required number of leading zero bits
 * @returns The hash if valid, null otherwise
 */
export declare function verifyIdentityPowWithHash(pubkey: Uint8Array, timestamp: bigint | number, nonce: bigint | number, difficulty: number): Uint8Array | null;
/**
 * Get the default identity PoW difficulty
 *
 * @returns Default difficulty (20)
 */
export declare function getDefaultIdentityPowDifficulty(): number;
/**
 * Estimate time to mine at a given difficulty
 *
 * @param difficulty - Number of leading zero bits required
 * @param hashRate - Estimated hashes per second (default: 500000)
 * @returns Estimated time in seconds
 *
 * @example
 * ```ts
 * const estimate = estimateMiningTime(20);
 * console.log(`Expected mining time: ${estimate.toFixed(1)} seconds`);
 * ```
 */
export declare function estimateMiningTime(difficulty: number, hashRate?: number): number;
/**
 * Format mining time estimate
 *
 * @param difficulty - Number of leading zero bits required
 * @param hashRate - Estimated hashes per second
 * @returns Human-readable time estimate
 */
export declare function formatMiningTimeEstimate(difficulty: number, hashRate?: number): string;
/**
 * Create a mining function with options
 *
 * @param options - Mining options
 * @returns Mining function
 */
export declare function createMiner(options?: MiningOptions): (publicKey: Uint8Array) => PowSolution;
//# sourceMappingURL=pow.d.ts.map