import { defineConfig } from 'vitest/config';

export default defineConfig({
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
