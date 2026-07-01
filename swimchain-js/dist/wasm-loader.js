/**
 * WASM module loader for Swimchain
 *
 * Handles lazy loading and initialization of the WASM module.
 * The module is loaded once and cached for subsequent calls.
 */
// Module state
let wasmModule = null;
let initPromise = null;
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
export async function initWasm() {
    if (wasmModule) {
        return wasmModule;
    }
    if (initPromise) {
        return initPromise;
    }
    initPromise = (async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let wasm;
        // Always use the bundled path - Vite will handle the WASM file
        wasm = await import("../pkg/swimchain_wasm.js");
        await wasm.default();
        wasmModule = wasm;
        return wasmModule;
    })();
    return initPromise;
}
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
export function getWasm() {
    if (!wasmModule) {
        throw new Error("WASM not initialized. Call initWasm() first and await its completion.");
    }
    return wasmModule;
}
/**
 * Check if the WASM module is loaded
 *
 * @returns true if WASM is ready to use
 */
export function isWasmLoaded() {
    return wasmModule !== null;
}
/**
 * Get the WASM library version
 *
 * @throws Error if WASM is not initialized
 * @returns Version string
 */
export function getVersion() {
    return getWasm().version();
}
//# sourceMappingURL=wasm-loader.js.map