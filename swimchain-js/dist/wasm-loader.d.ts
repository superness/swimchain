/**
 * WASM module loader for Swimchain
 *
 * Handles lazy loading and initialization of the WASM module.
 * The module is loaded once and cached for subsequent calls.
 */
export interface WasmModule {
    init(): void;
    version(): string;
    sha256(data: Uint8Array): Uint8Array;
    leading_zeros(hash: Uint8Array): number;
    verify_pow_difficulty(hash: Uint8Array, difficulty: number): boolean;
    content_id(data: Uint8Array): string;
    double_sha256(data: Uint8Array): Uint8Array;
    WasmKeypair: {
        new (): WasmKeypair;
        fromSeed(seed: Uint8Array): WasmKeypair;
    };
    encode_address(publicKey: Uint8Array): string;
    decode_address(address: string): Uint8Array;
    verify_signature(pubkey: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean;
    is_valid_address(address: string): boolean;
    calculate_decay(createdAtSecs: bigint, lastEngagementSecs: bigint, nowSecs: bigint): WasmDecayState;
    calculateDecayWithHalfLife(createdAtSecs: bigint, lastEngagementSecs: bigint, nowSecs: bigint, halfLifeSecs: bigint | undefined): WasmDecayState;
    getDecayFloorSecs(): bigint;
    getHalfLifeSecs(): bigint;
    getDecayThreshold(): number;
    mine_identity_pow(publicKey: Uint8Array, difficulty: number): WasmPowSolution;
    mineIdentityPowWithLimit(publicKey: Uint8Array, difficulty: number, maxAttempts: bigint): WasmPowSolution;
    verify_identity_pow(pubkey: Uint8Array, timestamp: bigint, nonce: bigint, difficulty: number): boolean;
    verifyIdentityPowWithHash(pubkey: Uint8Array, timestamp: bigint, nonce: bigint, difficulty: number): Uint8Array | null;
    getDefaultIdentityPowDifficulty(): number;
    estimateMiningTime(difficulty: number, hashRate?: number): number;
}
export interface WasmKeypair {
    publicKey(): Uint8Array;
    seed(): Uint8Array;
    sign(message: Uint8Array): Uint8Array;
    address(): string;
    free(): void;
}
export interface WasmDecayState {
    readonly currentHeat: number;
    readonly isDecayed: boolean;
    readonly isProtected: boolean;
    readonly halfLivesElapsed: number;
    readonly ageSeconds: bigint;
    readonly timeSinceEngagement: bigint;
    decayPercent(): number;
    description(): string;
    timeUntilDecay(): bigint;
    free(): void;
}
export interface WasmPowSolution {
    readonly nonce: bigint;
    readonly attempts: bigint;
    readonly elapsedMs: number;
    readonly timestamp: bigint;
    hash(): Uint8Array;
    leadingZeros(): number;
    hashRate(): number;
    free(): void;
}
/**
 * Initialize the WASM module
 *
 * This must be called before using any WASM functions.
 * Multiple calls are safe - the module is only loaded once.
 *
 * @returns Promise resolving to the initialized WASM module
 *
 * @example
 * ```ts
 * import { initWasm } from '@swimchain/core';
 *
 * await initWasm();
 * // Now WASM functions are available
 * ```
 */
export declare function initWasm(): Promise<WasmModule>;
/**
 * Get the initialized WASM module
 *
 * @throws Error if WASM is not initialized
 * @returns The WASM module
 *
 * @example
 * ```ts
 * import { getWasm } from '@swimchain/core';
 *
 * const wasm = getWasm();
 * const hash = wasm.sha256(data);
 * ```
 */
export declare function getWasm(): WasmModule;
/**
 * Check if the WASM module is loaded
 *
 * @returns true if WASM is ready to use
 */
export declare function isWasmLoaded(): boolean;
/**
 * Get the WASM library version
 *
 * @throws Error if WASM is not initialized
 * @returns Version string
 */
export declare function getVersion(): string;
//# sourceMappingURL=wasm-loader.d.ts.map