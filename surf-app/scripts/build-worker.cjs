#!/usr/bin/env node
// Bundles the engage PoW worker (scripts/worker-src/engage.worker.mjs) into
// web/workers/engage.worker.js — a same-origin classic worker script.
// esbuild is not a surf-app dependency; resolve it from feed-client's
// node_modules (present transitively via vite), same trick build-channels.cjs
// uses for vite itself.
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const ENTRY = path.resolve(__dirname, 'worker-src', 'engage.worker.mjs');
const OUT_DIR = path.resolve(__dirname, '..', 'web', 'workers');
const OUT_FILE = path.join(OUT_DIR, 'engage.worker.js');
const MAX_BYTES = 2 * 1024 * 1024; // ~2 MB budget; hash-wasm inlines its argon2 wasm as base64

function buildWorker() {
  const esbuildPkg = path.join(REPO, 'feed-client', 'node_modules', 'esbuild');
  if (!fs.existsSync(esbuildPkg)) {
    throw new Error(
      `esbuild not found at ${esbuildPkg} — run "npm install" in feed-client first`
    );
  }
  const esbuild = require(esbuildPkg);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  esbuild.buildSync({
    entryPoints: [ENTRY],
    outfile: OUT_FILE,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    legalComments: 'none',
    logLevel: 'info',
  });

  const out = fs.readFileSync(OUT_FILE, 'utf8');

  // Fail loudly if bundling silently dropped the argon2 path (e.g. a broken
  // relative import to swimchain-react's action-pow.js resolving to nothing).
  if (!out.includes('argon2id')) {
    throw new Error(
      'engage.worker.js: bundled output does not contain "argon2id" — the ' +
        'hash-wasm mining path was not bundled'
    );
  }

  const bytes = Buffer.byteLength(out, 'utf8');
  if (bytes > MAX_BYTES) {
    throw new Error(
      `engage.worker.js: bundle is ${(bytes / 1024 / 1024).toFixed(2)} MB, ` +
        `exceeds the ~2 MB budget (hash-wasm's argon2 wasm should be inlined ` +
        `as base64, not fetched separately — something changed)`
    );
  }

  // hash-wasm 4.12.0 (the version resolved here, via swimchain-react's own
  // node_modules) inlines every WASM binary as a base64 string compiled
  // directly into the JS and calls WebAssembly.instantiate() on the decoded
  // bytes — verified by grepping the installed package's dist/index.esm.js
  // for `fetch(` (absent) and for long base64 runs starting with the wasm
  // magic header's base64 encoding "AGFzbQ" (present, several MB total
  // across all algorithms). That means CSP's `script-src 'self'
  // 'wasm-unsafe-eval'` (already landed in A1/D4) is what covers WASM
  // instantiation here — no fetched .wasm asset, so no additional
  // `connect-src`/asset-copy step is needed for this worker.
  if (out.includes('fetch(')) {
    console.warn(
      'engage.worker.js: bundle contains "fetch(" — verify no external .wasm ' +
        'asset load snuck in (expected: fully inlined base64 WASM)'
    );
  }

  console.log(`engage.worker.js bundled: ${(bytes / 1024).toFixed(1)} KiB -> ${OUT_FILE}`);
}

if (require.main === module) {
  buildWorker();
}

module.exports = { buildWorker };
