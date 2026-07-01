/**
 * Local WASM loader for forum-client
 * Loads WASM from the src/wasm directory to avoid Vite path resolution issues
 */

// Import the WASM module directly from local copy
import init, * as wasm from "./chainsocial_wasm.js";

// Track initialization - use global to persist across HMR
// @ts-expect-error - Using global for HMR persistence
let initialized: boolean = globalThis.__swimchain_wasm_initialized ?? false;
// @ts-expect-error - Using global for HMR persistence
let initPromise: Promise<void> | null = globalThis.__swimchain_wasm_init_promise ?? null;

export async function initWasm(): Promise<typeof wasm> {
  if (initialized) {
    return wasm;
  }

  if (initPromise) {
    await initPromise;
    return wasm;
  }

  initPromise = (async () => {
    // Load the WASM binary
    const wasmUrl = new URL("./chainsocial_wasm_bg.wasm", import.meta.url);
    await init(wasmUrl);
    initialized = true;
    // Persist across HMR
    // @ts-expect-error - Using global for HMR persistence
    globalThis.__swimchain_wasm_initialized = true;
  })();
  // Persist promise across HMR
  // @ts-expect-error - Using global for HMR persistence
  globalThis.__swimchain_wasm_init_promise = initPromise;

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
export * from "./chainsocial_wasm.js";
