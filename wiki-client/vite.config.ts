import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
export default defineConfig({
    plugins: [react()],
    test: {
        // src/lib/resolveSpaces.test.ts predates vitest here — it's a plain
        // tsx-run script (`npx tsx src/lib/resolveSpaces.test.ts`, see its own
        // header) that calls process.exit() directly, which vitest treats as a
        // crash if it's swept up by the default include glob. Exclude it by
        // name so it keeps running via tsx while `npx vitest run` covers the
        // real vitest suite (e.g. src/hooks/__tests__/configListener.test.ts).
        exclude: [...configDefaults.exclude, 'src/lib/resolveSpaces.test.ts'],
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
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
        sourcemap: false,
    },
    server: {
        port: 5185, // wiki-client port
        strictPort: true,
        headers: {
            // Required for WASM to work with SharedArrayBuffer
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
        },
        fs: {
            // Allow serving files from ALL parent directories up to root
            allow: [
                '/', // Allow everything (development only)
            ],
            strict: false,
        },
    },
    worker: {
        format: 'es',
    },
});
