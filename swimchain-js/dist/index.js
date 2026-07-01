/**
 * Swimchain Core Library
 *
 * Provides WASM-powered cryptographic operations, identity management,
 * content decay calculations, and proof-of-work mining.
 *
 * @example
 * ```ts
 * import { initWasm, Keypair, calculateDecay, mineIdentityPow } from '@swimchain/core';
 *
 * // Initialize WASM (required before using other functions)
 * await initWasm();
 *
 * // Create a new keypair
 * const keypair = new Keypair();
 * console.log(keypair.address()); // cs1...
 *
 * // Mine identity PoW
 * const solution = mineIdentityPow(keypair.publicKey(), 8);
 *
 * // Calculate decay
 * const decay = calculateDecay(createdAt, lastEngagement);
 *
 * // Clean up
 * keypair.free();
 * ```
 *
 * @packageDocumentation
 */
// WASM loader
export { initWasm, getWasm, isWasmLoaded, getVersion, } from "./wasm-loader";
// Identity
export { Keypair, encodeAddress, decodeAddress, verifySignature, isValidAddress, validateAddress, signMessage, } from "./identity";
// Crypto
export { sha256, leadingZeros, verifyPowDifficulty, contentId, doubleSha256, bytesToHex, hexToBytes, bytesEqual, concatBytes, } from "./crypto";
// Decay
export { calculateDecay, calculateDecayWithHalfLife, getDecayConstants, survivalProbability, halfLivesFromProbability, isDecayedAtProbability, formatDecayState, formatDuration, } from "./decay";
// PoW
export { mineIdentityPow, mineIdentityPowWithLimit, verifyIdentityPow, verifyIdentityPowWithHash, getDefaultIdentityPowDifficulty, estimateMiningTime, formatMiningTimeEstimate, createMiner, DEFAULT_IDENTITY_POW_DIFFICULTY, } from "./pow";
// PoW Worker (non-blocking)
export { PowWorker, mineInBackground } from "./pow-worker";
//# sourceMappingURL=index.js.map