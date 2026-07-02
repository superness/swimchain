import { defineConfig } from "vitest/config";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: true,
    testTimeout: 30000, // PoW tests may take time
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      // Alias the WASM file to be loaded from filesystem
      "../pkg/swimchain_wasm_bg.wasm": join(__dirname, "pkg/swimchain_wasm_bg.wasm"),
    },
  },
});
