import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

/** A chunk importing the entry would load it a second time, without ?r=, and define the elements twice. */
const entryImportedByNoChunk: Plugin = {
  name: "afreact-entry-imported-by-no-chunk",
  generateBundle(_options, bundle) {
    for (const chunk of Object.values(bundle)) {
      if (
        chunk.type === "chunk" &&
        [...chunk.imports, ...chunk.dynamicImports].includes("afreact.js")
      )
        this.error(`${chunk.fileName} imports afreact.js; move what it shares into a chunk group`);
    }
  },
};

// The entry and its stylesheet keep fixed names, which CiviCRM loads with its cache
// code (?r=…); lazy chunks carry a content hash instead.
export default defineConfig({
  plugins: [react(), entryImportedByNoChunk],
  // Chunks resolve against the entry's URL under ext/afreact/dist/.
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rolldownOptions: {
      input: "src/main.tsx",
      output: {
        entryFileNames: "afreact.js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "afreact.[ext]",
        // Libraries shared with lazy chunks live in a chunk of their own.
        codeSplitting: { groups: [{ name: "vendor", test: /node_modules/ }] },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
    coverage: {
      include: ["src/**"],
      exclude: ["src/**/*.test.*", "src/test/**", "src/api/entities.gen.ts"],
    },
  },
});
