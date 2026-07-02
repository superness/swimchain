import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // The @swimchain/* entries in node_modules are npm "file:" symlinks
      // that are not traversable when created under WSL and run on Windows
      // (or vice versa). Resolve the workspace package directly so test
      // files importing src modules can be transformed on both platforms.
      '@swimchain/core': path.resolve(__dirname, '../swimchain-js/dist/index.js'),
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'tests/'],
    },
  },
});
