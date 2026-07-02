/**
 * Local WASM loader for Swimchain clients
 * Uses Vite's ?url import to properly bundle the WASM file
 */

// Import the WASM module directly from local copy
import init, * as wasm from "./swimchain_wasm.js";
// Import WASM as URL - Vite will bundle this correctly
import wasmUrl from "./swimchain_wasm_bg.wasm?url";

// Track initialization
let initialized = false;
let initPromise: Promise<void> | null = null;

export async function initWasm(): Promise<typeof wasm> {
  if (initialized) {
    return wasm;
  }

  if (initPromise) {
    await initPromise;
    return wasm;
  }

  initPromise = (async () => {
    // Load the WASM binary using Vite-resolved URL
    await init(wasmUrl);
    initialized = true;
  })();

  await initPromise;
  return wasm;
}

export function getWasm(): typeof wasm {
  if (!initialized) {
    throw new Error(
      "WASM not initialized. Call initWasm() first and await its completion."
    );
  }
  return wasm;
}

export function isWasmLoaded(): boolean {
  return initialized;
}

// Re-export everything from the WASM module for convenience
export * from "./swimchain_wasm.js";
