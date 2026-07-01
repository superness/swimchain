import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Alias old package name to new (swimchain-react dist files still reference chainsocial)
      '@chainsocial/core': '@swimchain/core',
    },
    // Preserve symlinks for proper resolution
    preserveSymlinks: false,
  },
  optimizeDeps: {
    exclude: ['@swimchain/core', '@swimchain/react'],
  },
  assetsInclude: ['**/*.wasm'],
  base: './', // Use relative paths for embedding in desktop-app
  build: {
    target: 'esnext',
    sourcemap: true,
  },
  server: {
    port: 5179, // feed-client port
    strictPort: true,
    headers: {
      // Required for WASM to work with SharedArrayBuffer
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    fs: {
      // Allow serving files from ALL parent directories up to root
      allow: [
        '/',  // Allow everything (development only)
      ],
      strict: false,
    },
  },
  worker: {
    format: 'es',
  },
});
