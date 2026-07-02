/**
 * Vitest setup for WASM testing
 *
 * This setup file patches the WASM initialization to work in Node.js
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Polyfill fetch to load WASM from filesystem
const originalFetch = globalThis.fetch;

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = input.toString();

  // Check if this is a WASM file request
  if (url.endsWith(".wasm") || url.includes("swimchain_wasm_bg.wasm")) {
    // Load from local filesystem
    const wasmPath = join(__dirname, "pkg", "swimchain_wasm_bg.wasm");
    const wasmBuffer = readFileSync(wasmPath);

    return new Response(wasmBuffer, {
      status: 200,
      headers: { "Content-Type": "application/wasm" },
    });
  }

  // Fall back to real fetch for other requests
  return originalFetch(input, init);
};
