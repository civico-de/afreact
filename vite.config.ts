import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

const ENTRIES = ["afreact.js", "afreact-admin.js"];

/** A chunk importing an entry would load it a second time, without ?r=, and define the elements twice. */
const entryImportedByNoChunk: Plugin = {
  name: "afreact-entry-imported-by-no-chunk",
  generateBundle(_options, bundle) {
    for (const chunk of Object.values(bundle)) {
      if (
        chunk.type === "chunk" &&
        [...chunk.imports, ...chunk.dynamicImports].some((name) => ENTRIES.includes(name))
      )
        this.error(`${chunk.fileName} imports an entry; move what it shares into a chunk group`);
    }
  },
};

// A string literal never holds a raw line break, so text like "ts(" in code matches none.
const LITERAL = String.raw`"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'`;
const TS_CALL = new RegExp(String.raw`\bts\(\s*(${LITERAL})|\bplural:\s*(${LITERAL})`, "g");

/** A quoted source literal's text. */
const unquote = (literal: string): string =>
  literal.startsWith("'")
    ? literal.slice(1, -1).replace(/\\(.)/g, "$1")
    : String(JSON.parse(literal));

/**
 * dist/strings.json lists the ts() texts of the sources: the minifier turns them into template
 * literals, which CiviCRM's string extraction does not read.
 */
const tsStrings = (): Plugin => {
  const strings = new Set<string>();
  return {
    name: "afreact-ts-strings",
    // The sources as written, before JSX and TypeScript are compiled.
    enforce: "pre",
    transform(code, id) {
      if (!/\/src\/.*\.tsx?$/.test(id) || id.includes(".test.")) return null;
      for (const match of code.matchAll(TS_CALL)) {
        const literal = match[1] ?? match[2];
        if (literal) strings.add(unquote(literal));
      }
      return null;
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "strings.json",
        source: `${JSON.stringify([...strings].sort(), null, 1)}\n`,
      });
    },
  };
};

// The entries and their stylesheets keep fixed names, which CiviCRM loads with its cache
// code (?r=…); lazy chunks carry a content hash instead.
export default defineConfig({
  // React Compiler (the oxc port) memoizes components and hooks at build time.
  plugins: [react({ compiler: { logDiagnostics: true } }), entryImportedByNoChunk, tsStrings()],
  // Chunks resolve against the entry's URL under ext/afreact/dist/.
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Maps for the browser-test coverage only; the shipped bundle references none.
    sourcemap: process.env.AFREACT_SOURCEMAP ? "hidden" : false,
    rolldownOptions: {
      // Builder code loads only on builder pages.
      input: { afreact: "src/main.tsx", "afreact-admin": "src/admin/main.tsx" },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "[name].[ext]",
        // Libraries shared with lazy chunks live in a chunk of their own; Downshift and its
        // dependencies load only with the first EntityRef.
        codeSplitting: {
          groups: [
            {
              name: "downshift",
              test: /node_modules\/(downshift|compute-scroll-into-view|prop-types|react-is|tslib|@babel\/runtime)\//,
              priority: 1,
              // Otherwise the group pulls in React, which the entry then loads from it.
              includeDependenciesRecursively: false,
            },
            // dnd-kit loads only with the first draggable table.
            {
              name: "dnd-kit",
              test: /node_modules\/@dnd-kit\//,
              priority: 1,
              includeDependenciesRecursively: false,
            },
            { name: "vendor", test: /node_modules/ },
          ],
        },
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
