import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // The Trench ships as a downloaded desktop installer (Tauri), not a hosted page
  // under swimchain.io/trench/ like reef/chess — this differs from the reef-client
  // config this file was scaffolded from (Task 1). Tauri's `frontendDist` serves
  // `dist/` from its own asset root, so an absolute `/trench/` base would 404 every
  // script/stylesheet the instant the packaged app tried to load them (verified:
  // `dist/index.html` baked `src="/trench/assets/..."`, which resolves against
  // nothing inside the Tauri webview). Tauri's CLI injects `TAURI_ENV_PLATFORM`
  // into `beforeDevCommand`/`beforeBuildCommand`'s environment (see
  // trench-client/src-tauri/tauri.conf.json) — present only when Tauri is driving
  // this build, so a bare `npm run build` for some future hosted deploy still gets
  // the path-prefixed base unchanged.
  base: process.env.TAURI_ENV_PLATFORM ? './' : '/trench/',
  // `pow.worker.ts` runs in a Web Worker (`self`, no `window`), not a page —
  // but the worker's own module graph isn't just itself. `optimizeDeps.exclude`
  // below keeps `@swimchain/react` OUT of esbuild's pre-bundle (so this
  // monorepo's `file:`-linked package live-reloads without a rebuild step),
  // which means Vite serves it through the SAME dev transform pipeline as
  // project source — including @vitejs/plugin-react's Fast Refresh preamble
  // injection (`import RefreshRuntime from "/@react-refresh"; RefreshRuntime.
  // injectIntoGlobalHook(window)`), normally harmless on the main thread but
  // fatal ("Uncaught ReferenceError: window is not defined") the instant a
  // worker evaluates it. `pow.worker.ts` only imports `computePow` from
  // `@swimchain/react`, but ES module evaluation runs the WHOLE barrel
  // (`dist/index.js`, which re-exports React hooks too) — so both the worker
  // file itself AND the `@swimchain/react` package need excluding from the
  // refresh transform. Dev-mode only (production `vite build` never injects
  // the refresh runtime), so `npm run build` stayed clean while every
  // founding/move submission that reached the worker died in `npm run dev`.
  plugins: [react({ exclude: [/\.worker\.ts$/, /swimchain-react/] })],
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
    port: 5195,
    strictPort: true,
    headers: {
      // Required for WASM (SharedArrayBuffer) used by Argon2id PoW
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    fs: {
      // `@swimchain/react` is `file:`-linked from two directories up (the
      // monorepo root) and excluded from optimizeDeps (see above) so it's
      // served as live source, not a pre-bundle — Vite's default fs.allow
      // (this project's own root) doesn't cover it, which 403s every request
      // for it depending on how/where the dev server process was launched.
      allow: [path.resolve(__dirname, '../..')],
    },
  },
  worker: { format: 'es' },
});
