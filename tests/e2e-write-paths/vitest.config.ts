import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // wiki-client imports the SDK via a file: dep whose node_modules
      // symlink doesn't resolve from this project root on Windows —
      // point at the package root so the exports map serves the built
      // dist (raw src breaks wasm init for consumers of the dist build).
      '@swimchain/frontend': resolve(__dirname, '../../swimchain-frontend'),
    },
  },
  test: {
    globalSetup: ['./harness/global-setup.ts'],
    setupFiles: ['./harness/browser-shims.ts'],
    include: ['tests/**/*.test.ts'],
    // One shared regtest node -> run test files sequentially.
    fileParallelism: false,
    // Argon2id mining + node startup need generous timeouts.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    teardownTimeout: 60_000,
  },
});
