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
export { initWasm, getWasm, isWasmLoaded, getVersion, type WasmModule, type WasmKeypair, type WasmDecayState, type WasmPowSolution, } from "./wasm-loader";
export { Keypair, encodeAddress, decodeAddress, verifySignature, isValidAddress, validateAddress, signMessage, } from "./identity";
export { sha256, leadingZeros, verifyPowDifficulty, contentId, doubleSha256, bytesToHex, hexToBytes, bytesEqual, concatBytes, } from "./crypto";
export { calculateDecay, calculateDecayWithHalfLife, getDecayConstants, survivalProbability, halfLivesFromProbability, isDecayedAtProbability, formatDecayState, formatDuration, } from "./decay";
export { mineIdentityPow, mineIdentityPowWithLimit, verifyIdentityPow, verifyIdentityPowWithHash, getDefaultIdentityPowDifficulty, estimateMiningTime, formatMiningTimeEstimate, createMiner, DEFAULT_IDENTITY_POW_DIFFICULTY, } from "./pow";
export { PowWorker, mineInBackground, type MiningState } from "./pow-worker";
export type { DecayState, PowSolution, PowProgressCallback, DecayConstants, AddressValidation, MiningOptions, PowWorkerMessage, PowWorkerResponse, SwimchainContextValue, } from "./types";
//# sourceMappingURL=index.d.ts.map