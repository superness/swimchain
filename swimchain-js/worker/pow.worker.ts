/**
 * Web Worker for PoW mining
 *
 * Runs PoW mining in a separate thread to avoid blocking the main thread.
 * This worker must be bundled separately and loaded as a module worker.
 */

import type { PowWorkerMessage, PowWorkerResponse, PowSolution } from "../src/types";

// WASM module types
interface WasmPowResult {
  nonce: bigint;
  attempts: bigint;
  elapsedMs: number;
  timestamp: bigint;
  hash(): Uint8Array;
  leadingZeros(): number;
  hashRate(): number;
  free(): void;
}

interface WasmModule {
  mine_identity_pow(publicKey: Uint8Array, difficulty: number): WasmPowResult;
  mineIdentityPowWithLimit(
    publicKey: Uint8Array,
    difficulty: number,
    maxAttempts: bigint
  ): WasmPowResult;
}

let wasm: WasmModule | null = null;
let cancelled = false;

/**
 * Initialize the WASM module
 */
async function initWasm(): Promise<void> {
  if (wasm) return;

  // Dynamic import of WASM module
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wasmModule = await import("../pkg/swimchain_wasm.js") as any;
  await wasmModule.default();
  wasm = wasmModule as WasmModule;
}

/**
 * Convert WASM result to PowSolution
 */
function toPowSolution(result: WasmPowResult): PowSolution {
  const solution: PowSolution = {
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
 * Post a message to the main thread
 */
function postResponse(response: PowWorkerResponse): void {
  self.postMessage(response);
}

/**
 * Handle messages from the main thread
 */
self.onmessage = async (event: MessageEvent<PowWorkerMessage>) => {
  const message = event.data;

  switch (message.type) {
    case "init":
      try {
        await initWasm();
        postResponse({ type: "ready" });
      } catch (error) {
        postResponse({
          type: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
      break;

    case "cancel":
      cancelled = true;
      break;

    case "mine":
      if (!wasm) {
        postResponse({
          type: "error",
          message: "WASM not initialized. Send 'init' message first.",
        });
        return;
      }

      cancelled = false;

      try {
        const { publicKey, difficulty, maxAttempts } = message;

        let result: WasmPowResult;
        if (maxAttempts !== undefined) {
          result = wasm.mineIdentityPowWithLimit(
            publicKey,
            difficulty,
            BigInt(maxAttempts)
          );
        } else {
          result = wasm.mine_identity_pow(publicKey, difficulty);
        }

        if (!cancelled) {
          const solution = toPowSolution(result);
          postResponse({ type: "complete", solution });
        }
      } catch (error) {
        if (!cancelled) {
          postResponse({
            type: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
      break;
  }
};

// Notify that the worker is loaded (before WASM init)
self.postMessage({ type: "loaded" });
