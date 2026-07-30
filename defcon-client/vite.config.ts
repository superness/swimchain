import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // Served under /defcon/ on swimchain.io; set the base so assets resolve there.
  base: '/defcon/',
  plugins: [
    react({
      // Keep React Fast Refresh OFF the linked `file:../swimchain-*` packages.
      //
      // They ship pre-compiled .js that still contains jsx() calls, so
      // plugin-react matches them and prepends an UNCONDITIONAL
      // `import * as RefreshRuntime from "/@react-refresh"`. Its own body is
      // guarded by an `inWebWorker` check, but the import is not — and the
      // refresh runtime touches bare `window` at module scope. Any Web Worker
      // that imports `@swimchain/react` therefore dies on load in dev with
      // "ReferenceError: window is not defined". Dev-only — a production
      // build has no refresh runtime at all. Copied verbatim from
      // chips-client/vite.config.ts, which hit this first.
      //
      // These are dependencies, not source: they should never have been in the
      // Fast Refresh graph in the first place.
      exclude: [/swimchain-react[\\/]dist[\\/]/, /swimchain-js[\\/]dist[\\/]/],
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  optimizeDeps: {
    exclude: ['@swimchain/core', '@swimchain/react'],
  },
  build: {
    target: 'esnext',
    sourcemap: true,
  },
  server: {
    port: 5187,
    strictPort: false,
    // `@swimchain/core` is a `file:../swimchain-js` dependency, and its WASM
    // binary is loaded by a RAW fetch (WebAssembly.instantiateStreaming inside
    // pkg/swimchain_wasm.js), not by an import Vite rewrites. Vite's default
    // fs.allow is just this package's root — it only widens to the workspace
    // root when it finds a lockfile above, and this repo .gitignores
    // package-lock.json, so in a clean checkout there is none. The result is a
    // 403 on the .wasm and a dev server that renders SwimchainProvider's
    // loading fallback forever with nothing in the console. Dev-only; the
    // production build inlines the asset and never goes near this.
    fs: { allow: [path.resolve(__dirname, '..')] },
    headers: {
      // Required for WASM (SharedArrayBuffer) used by Argon2id PoW
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  worker: { format: 'es' },
});
