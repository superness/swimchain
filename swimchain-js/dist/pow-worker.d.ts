/**
 * PoW Worker wrapper for main thread
 *
 * Provides a high-level API for non-blocking PoW mining using a Web Worker.
 */
import type { PowSolution, PowProgressCallback } from "./types";
/**
 * State of a mining operation
 */
export type MiningState = "idle" | "initializing" | "mining" | "complete" | "error" | "cancelled";
/**
 * Web Worker wrapper for non-blocking PoW mining
 *
 * @example
 * ```ts
 * const worker = new PowWorker();
 * await worker.init();
 *
 * try {
 *   const solution = await worker.mine(publicKey, 8);
 *   console.log(`Found nonce: ${solution.nonce}`);
 * } finally {
 *   worker.terminate();
 * }
 * ```
 */
export declare class PowWorker {
    private worker;
    private readyPromise;
    private state;
    private currentResolve;
    private currentReject;
    private progressCallback;
    /**
     * Create a new PowWorker
     *
     * Call `init()` before using `mine()`.
     */
    constructor();
    /**
     * Get the current mining state
     */
    getState(): MiningState;
    /**
     * Initialize the worker and load WASM
     *
     * @returns Promise that resolves when ready
     * @throws Error if worker creation fails
     */
    init(): Promise<void>;
    /**
     * Mine identity PoW in the background
     *
     * @param publicKey - 32-byte Ed25519 public key
     * @param difficulty - Number of leading zero bits required
     * @param onProgress - Optional progress callback (not yet implemented in WASM)
     * @returns Promise resolving to the PoW solution
     * @throws Error if mining fails or is cancelled
     */
    mine(publicKey: Uint8Array, difficulty: number, onProgress?: PowProgressCallback): Promise<PowSolution>;
    /**
     * Mine with a maximum attempt limit
     *
     * @param publicKey - 32-byte Ed25519 public key
     * @param difficulty - Number of leading zero bits required
     * @param maxAttempts - Maximum number of hash attempts
     * @returns Promise resolving to the PoW solution
     */
    mineWithLimit(publicKey: Uint8Array, difficulty: number, maxAttempts: number): Promise<PowSolution>;
    /**
     * Cancel the current mining operation
     *
     * Note: Due to WASM limitations, this may not immediately stop mining.
     * The current hash operation will complete before cancellation takes effect.
     */
    cancel(): void;
    /**
     * Terminate the worker
     *
     * Call this when done with the worker to free resources.
     */
    terminate(): void;
    /**
     * Handle messages from the worker
     */
    private handleMessage;
}
/**
 * Create a one-shot PoW miner
 *
 * Convenience function for mining without managing worker lifecycle.
 *
 * @param publicKey - 32-byte Ed25519 public key
 * @param difficulty - Number of leading zero bits required
 * @returns Promise resolving to the PoW solution
 *
 * @example
 * ```ts
 * const solution = await mineInBackground(publicKey, 8);
 * ```
 */
export declare function mineInBackground(publicKey: Uint8Array, difficulty: number): Promise<PowSolution>;
//# sourceMappingURL=pow-worker.d.ts.map