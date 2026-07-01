/**
 * PoW Worker wrapper for main thread
 *
 * Provides a high-level API for non-blocking PoW mining using a Web Worker.
 */
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
export class PowWorker {
    /**
     * Create a new PowWorker
     *
     * Call `init()` before using `mine()`.
     */
    constructor() {
        this.worker = null;
        this.readyPromise = null;
        this.state = "idle";
        this.currentResolve = null;
        this.currentReject = null;
        this.progressCallback = null;
        // Worker is created lazily in init()
    }
    /**
     * Get the current mining state
     */
    getState() {
        return this.state;
    }
    /**
     * Initialize the worker and load WASM
     *
     * @returns Promise that resolves when ready
     * @throws Error if worker creation fails
     */
    async init() {
        if (this.readyPromise) {
            return this.readyPromise;
        }
        this.state = "initializing";
        // Create the worker
        // The URL constructor with import.meta.url allows bundlers to handle the worker correctly
        this.worker = new Worker(new URL("../worker/pow.worker.ts", import.meta.url), { type: "module" });
        // Set up message handler
        this.worker.onmessage = (event) => {
            this.handleMessage(event.data);
        };
        this.worker.onerror = (error) => {
            console.error("PowWorker error:", error);
            if (this.currentReject) {
                this.currentReject(new Error(`Worker error: ${error.message}`));
                this.currentResolve = null;
                this.currentReject = null;
            }
        };
        // Wait for WASM initialization
        this.readyPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("Worker initialization timed out"));
            }, 30000);
            const originalHandler = this.worker.onmessage;
            this.worker.onmessage = (event) => {
                if (event.data.type === "ready") {
                    clearTimeout(timeout);
                    this.worker.onmessage = originalHandler;
                    this.state = "idle";
                    resolve();
                }
                else if (event.data.type === "error") {
                    clearTimeout(timeout);
                    reject(new Error(event.data.message));
                }
                // Also call original handler
                if (originalHandler && this.worker) {
                    originalHandler.call(this.worker, event);
                }
            };
            // Send init message
            this.worker.postMessage({ type: "init" });
        });
        return this.readyPromise;
    }
    /**
     * Mine identity PoW in the background
     *
     * @param publicKey - 32-byte Ed25519 public key
     * @param difficulty - Number of leading zero bits required
     * @param onProgress - Optional progress callback (not yet implemented in WASM)
     * @returns Promise resolving to the PoW solution
     * @throws Error if mining fails or is cancelled
     */
    async mine(publicKey, difficulty, onProgress) {
        if (!this.worker || !this.readyPromise) {
            throw new Error("Worker not initialized. Call init() first.");
        }
        await this.readyPromise;
        if (this.state === "mining") {
            throw new Error("Mining already in progress. Call cancel() first.");
        }
        this.state = "mining";
        this.progressCallback = onProgress ?? null;
        return new Promise((resolve, reject) => {
            this.currentResolve = resolve;
            this.currentReject = reject;
            this.worker.postMessage({
                type: "mine",
                publicKey,
                difficulty,
            });
        });
    }
    /**
     * Mine with a maximum attempt limit
     *
     * @param publicKey - 32-byte Ed25519 public key
     * @param difficulty - Number of leading zero bits required
     * @param maxAttempts - Maximum number of hash attempts
     * @returns Promise resolving to the PoW solution
     */
    async mineWithLimit(publicKey, difficulty, maxAttempts) {
        if (!this.worker || !this.readyPromise) {
            throw new Error("Worker not initialized. Call init() first.");
        }
        await this.readyPromise;
        if (this.state === "mining") {
            throw new Error("Mining already in progress. Call cancel() first.");
        }
        this.state = "mining";
        return new Promise((resolve, reject) => {
            this.currentResolve = resolve;
            this.currentReject = reject;
            this.worker.postMessage({
                type: "mine",
                publicKey,
                difficulty,
                maxAttempts,
            });
        });
    }
    /**
     * Cancel the current mining operation
     *
     * Note: Due to WASM limitations, this may not immediately stop mining.
     * The current hash operation will complete before cancellation takes effect.
     */
    cancel() {
        if (this.worker && this.state === "mining") {
            this.worker.postMessage({ type: "cancel" });
            this.state = "cancelled";
            if (this.currentReject) {
                this.currentReject(new Error("Mining cancelled"));
                this.currentResolve = null;
                this.currentReject = null;
            }
        }
    }
    /**
     * Terminate the worker
     *
     * Call this when done with the worker to free resources.
     */
    terminate() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
            this.readyPromise = null;
            this.state = "idle";
            this.currentResolve = null;
            this.currentReject = null;
        }
    }
    /**
     * Handle messages from the worker
     */
    handleMessage(message) {
        switch (message.type) {
            case "progress":
                if (this.progressCallback) {
                    this.progressCallback(message.attempts, message.elapsedMs);
                }
                break;
            case "complete":
                this.state = "complete";
                if (this.currentResolve) {
                    this.currentResolve(message.solution);
                    this.currentResolve = null;
                    this.currentReject = null;
                }
                break;
            case "error":
                this.state = "error";
                if (this.currentReject) {
                    this.currentReject(new Error(message.message));
                    this.currentResolve = null;
                    this.currentReject = null;
                }
                break;
        }
    }
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
export async function mineInBackground(publicKey, difficulty) {
    const worker = new PowWorker();
    try {
        await worker.init();
        return await worker.mine(publicKey, difficulty);
    }
    finally {
        worker.terminate();
    }
}
//# sourceMappingURL=pow-worker.js.map