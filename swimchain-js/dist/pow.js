/**
 * Proof-of-Work mining and verification
 *
 * Provides identity PoW mining using SHA-256.
 * NOTE: This does NOT include Argon2id action PoW due to WASM memory constraints.
 */
import { getWasm } from "./wasm-loader";
/**
 * Default identity PoW difficulty (20 bits of leading zeros)
 */
export const DEFAULT_IDENTITY_POW_DIFFICULTY = 20;
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
export function mineIdentityPow(publicKey, difficulty = DEFAULT_IDENTITY_POW_DIFFICULTY) {
    const wasm = getWasm();
    const result = wasm.mine_identity_pow(publicKey, difficulty);
    const solution = {
        nonce: result.nonce,
        attempts: result.attempts,
        elapsedMs: result.elapsedMs,
        timestamp: result.timestamp,
        hash: result.hash(),
        leadingZeros: result.leadingZeros(),
        hashRate: result.hashRate(),
    };
    result.free();
    return solution;
}
/**
 * Mine identity proof-of-work with attempt limit
 *
 * @param publicKey - 32-byte Ed25519 public key
 * @param difficulty - Number of leading zero bits required
 * @param maxAttempts - Maximum number of hash attempts
 * @returns PoW solution
 * @throws Error if max attempts exceeded
 */
export function mineIdentityPowWithLimit(publicKey, difficulty, maxAttempts) {
    const wasm = getWasm();
    const result = wasm.mineIdentityPowWithLimit(publicKey, difficulty, BigInt(maxAttempts));
    const solution = {
        nonce: result.nonce,
        attempts: result.attempts,
        elapsedMs: result.elapsedMs,
        timestamp: result.timestamp,
        hash: result.hash(),
        leadingZeros: result.leadingZeros(),
        hashRate: result.hashRate(),
    };
    result.free();
    return solution;
}
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
export function verifyIdentityPow(pubkey, timestamp, nonce, difficulty) {
    const wasm = getWasm();
    return wasm.verify_identity_pow(pubkey, BigInt(timestamp), BigInt(nonce), difficulty);
}
/**
 * Verify identity proof-of-work and get the hash
 *
 * @param pubkey - 32-byte Ed25519 public key
 * @param timestamp - Timestamp used in the PoW
 * @param nonce - The nonce value
 * @param difficulty - Required number of leading zero bits
 * @returns The hash if valid, null otherwise
 */
export function verifyIdentityPowWithHash(pubkey, timestamp, nonce, difficulty) {
    const wasm = getWasm();
    return wasm.verifyIdentityPowWithHash(pubkey, BigInt(timestamp), BigInt(nonce), difficulty);
}
/**
 * Get the default identity PoW difficulty
 *
 * @returns Default difficulty (20)
 */
export function getDefaultIdentityPowDifficulty() {
    return getWasm().getDefaultIdentityPowDifficulty();
}
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
export function estimateMiningTime(difficulty, hashRate = 500000) {
    return getWasm().estimateMiningTime(difficulty, hashRate);
}
/**
 * Format mining time estimate
 *
 * @param difficulty - Number of leading zero bits required
 * @param hashRate - Estimated hashes per second
 * @returns Human-readable time estimate
 */
export function formatMiningTimeEstimate(difficulty, hashRate = 500000) {
    const seconds = estimateMiningTime(difficulty, hashRate);
    if (seconds < 1)
        return "< 1 second";
    if (seconds < 60)
        return `~${Math.round(seconds)} seconds`;
    if (seconds < 3600)
        return `~${Math.round(seconds / 60)} minutes`;
    if (seconds < 86400)
        return `~${Math.round(seconds / 3600)} hours`;
    return `~${Math.round(seconds / 86400)} days`;
}
/**
 * Create a mining function with options
 *
 * @param options - Mining options
 * @returns Mining function
 */
export function createMiner(options = {}) {
    const difficulty = options.difficulty ?? DEFAULT_IDENTITY_POW_DIFFICULTY;
    return (publicKey) => {
        if (options.maxAttempts) {
            return mineIdentityPowWithLimit(publicKey, difficulty, options.maxAttempts);
        }
        return mineIdentityPow(publicKey, difficulty);
    };
}
//# sourceMappingURL=pow.js.map