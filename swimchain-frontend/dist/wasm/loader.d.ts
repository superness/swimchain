/**
 * Local WASM loader for Swimchain clients
 * Uses Vite's ?url import to properly bundle the WASM file
 */
import * as wasm from "./chainsocial_wasm.js";
export declare function initWasm(): Promise<typeof wasm>;
export declare function getWasm(): typeof wasm;
export declare function isWasmLoaded(): boolean;
export * from "./chainsocial_wasm.js";
//# sourceMappingURL=loader.d.ts.map