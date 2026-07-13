import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
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
    port: 5182,
    strictPort: false,
    headers: {
      // Required for WASM (SharedArrayBuffer) used by Argon2id PoW
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  worker: { format: 'es' },
});
