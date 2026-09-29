import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// One ES module plus one stylesheet with fixed names; CiviCRM's resource
// cache code (?r=…) handles cache busting, so no manifest is needed.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rolldownOptions: {
      input: "src/main.tsx",
      output: {
        entryFileNames: "afreact.js",
        assetFileNames: "afreact.[ext]",
        // Chunks would be loaded without the cache code.
        codeSplitting: false,
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
