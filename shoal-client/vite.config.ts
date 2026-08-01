import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // The Shoal ships as a desktop app (Tauri), never as a hosted page under a path
  // prefix. Tauri's `frontendDist` serves `dist/` from its own asset root, so an
  // absolute base would 404 every script the packaged app tried to load.
  base: './',
  // The Fast-Refresh exclusion is carried over from trench-client deliberately, even
  // though no `*.worker.ts` exists in this project TODAY. @vitejs/plugin-react injects
  // `RefreshRuntime.injectIntoGlobalHook(window)` at the top of every module it
  // transforms in DEV; a Web Worker evaluating that dies instantly with
  // "ReferenceError: window is not defined", and production builds never inject it — so
  // the failure only ever shows up in `npm run dev`, after someone has moved the
  // Argon2id mining in `shoalSend.ts` off the main thread (which it will need, see
  // that file's own event-loop-starvation note). Costs nothing now; saves an hour then.
  plugins: [react({ exclude: [/\.worker\.ts$/] })],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    target: 'esnext',
    sourcemap: false,
    outDir: 'dist',
  },
  // Cargo's own progress output is the interesting half of `tauri dev`; letting Vite
  // wipe the terminal hides every compiler error behind a clear screen.
  clearScreen: false,
  server: {
    // Fixed and strict: `src-tauri/tauri.conf.json`'s `devUrl` points here, so a
    // silent fallback to another port would leave the shell staring at a blank window.
    // 5196 sits one above trench-client's 5195 so both can run at once.
    port: 5196,
    strictPort: true,
    watch: {
      // NOT boilerplate — this project's Vite root is `shoal-client/` itself (the plan
      // puts `index.html` and `vite.config.ts` at the package root), which means
      // `src-tauri/` and its multi-gigabyte `target/` sit INSIDE the watched tree.
      // trench-client never hit this because its Vite root is `trench-client/ui/`, a
      // sibling of `src-tauri/`. Without this, `tauri dev` dies mid-cargo-build with
      //   Error: EBUSY: resource busy or locked, watch
      //   '...\src-tauri\target\debug\build\tauri-<hash>\build_script_build.exe'
      // — chokidar trying to watch a file cargo is writing at that instant — and the
      // failure is reported only as `The "beforeDevCommand" terminated with a non-zero
      // status code`, which points at the wrong thing entirely. Observed live here.
      ignored: ['**/src-tauri/**'],
    },
  },
  worker: { format: 'es' },
});
