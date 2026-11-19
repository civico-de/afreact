import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

/** What other extensions import through the `afreact/` import map prefix (docs/kit.md). */
const KIT = [
  "react",
  "react-dom",
  "react-dom-client",
  "jsx-runtime",
  "compiler-runtime",
  "react-query",
  "kit",
];
const ENTRIES = ["afreact.js", "afreact-admin.js", ...KIT.map((name) => `kit/${name}.js`)];

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

const REACT = /node_modules\/(react|react-dom|scheduler)\//;

/**
 * Modules whose state the entries and the kit share, each in exactly one chunk that is no entry:
 * a second copy splits hooks and context, or the query cache.
 */
const SHARED = [
  { name: "React", test: REACT, chunk: "react" },
  { name: "TanStack Query", test: /node_modules\/@tanstack\/(react-query|query-core)\// },
  { name: "the query client", test: /\/src\/api\/query\.ts$/ },
];

/** Every entry, the kit's included, runs on one React, one TanStack Query and one query client. */
const oneCopy: Plugin = {
  name: "afreact-one-copy",
  generateBundle(_options, bundle) {
    const chunks = Object.values(bundle).filter((output) => output.type === "chunk");
    const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
    const holderOf = ({ name, test, chunk: expected }: (typeof SHARED)[number]) => {
      const holders = chunks.filter((chunk) => chunk.moduleIds.some((id) => test.test(id)));
      const [holder] = holders;
      if (
        holders.length !== 1 ||
        !holder ||
        holder.isEntry ||
        (expected && holder.name !== expected)
      )
        this.error(
          `${name} must sit in one shared chunk${expected ? ` named ${expected}` : ""}, not in ${holders.map((c) => c.fileName).join(", ")}`,
        );
      return holder.fileName;
    };
    const holders = SHARED.map(holderOf);
    const [reactChunk = ""] = holders;
    const loads = (name: string, seen = new Set<string>()): boolean =>
      name === reactChunk ||
      (!seen.has(name) &&
        (byName.get(name)?.imports ?? []).some((next) => loads(next, seen.add(name))));
    for (const chunk of chunks)
      if (chunk.isEntry && !loads(chunk.fileName))
        this.error(`${chunk.fileName} does not load React from ${reactChunk}`);
  },
};

/**
 * dist/kit/<entry>.d.ts points at the declarations `tsc -p tsconfig.kit.json` writes to
 * dist/kit/types/, so `afreact/kit.js` resolves its types beside it.
 */
const kitDeclarations: Plugin = {
  name: "afreact-kit-declarations",
  generateBundle(_options, bundle) {
    for (const chunk of Object.values(bundle)) {
      if (chunk.type !== "chunk" || !chunk.isEntry || !chunk.name.startsWith("kit/")) continue;
      const source = `./types/${chunk.name}.js`;
      const lines = [`export * from "${source}";`];
      if (chunk.exports.includes("default")) lines.push(`export { default } from "${source}";`);
      this.emitFile({
        type: "asset",
        fileName: `${chunk.name}.d.ts`,
        source: `${lines.join("\n")}\n`,
      });
    }
  },
};

// A string literal never holds a raw line break, so text like "ts(" in code matches none.
const LITERAL = String.raw`"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'`;
const TS_CALL = new RegExp(
  String.raw`\bts\(\s*(${LITERAL})(?:\s*,\s*\{\s*plural:\s*(${LITERAL}))?`,
  "g",
);

/** A quoted source literal's text. */
const unquote = (literal: string): string =>
  literal.startsWith("'")
    ? literal.slice(1, -1).replace(/\\(.)/g, "$1")
    : String(JSON.parse(literal));

/**
 * dist/strings.json maps the ts() texts of the sources to their plural form or null: the minifier
 * turns them into template literals, which CiviCRM's string extraction does not read.
 */
const tsStrings = (): Plugin => {
  const strings = new Map<string, string | null>();
  return {
    name: "afreact-ts-strings",
    // The sources as written, before JSX and TypeScript are compiled.
    enforce: "pre",
    transform(code, id) {
      if (!/\/src\/.*\.tsx?$/.test(id) || id.includes(".test.")) return null;
      for (const [, text, plural] of code.matchAll(TS_CALL)) {
        if (!text) continue;
        const key = unquote(text);
        strings.set(key, plural ? unquote(plural) : (strings.get(key) ?? null));
      }
      return null;
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "strings.json",
        source: `${JSON.stringify(Object.fromEntries([...strings].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))), null, 1)}\n`,
      });
    },
  };
};

// The entries and their stylesheets keep fixed names, which CiviCRM loads with its cache
// code (?r=…); lazy chunks carry a content hash instead.
export default defineConfig({
  // React Compiler (the oxc port) memoizes components and hooks at build time.
  plugins: [
    react({ compiler: { logDiagnostics: true } }),
    entryImportedByNoChunk,
    oneCopy,
    kitDeclarations,
    tsStrings(),
  ],
  // Chunks resolve against the entry's URL under ext/afreact/dist/.
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Maps for the browser-test coverage only; the shipped bundle references none.
    sourcemap: process.env.AFREACT_SOURCEMAP ? "hidden" : false,
    rolldownOptions: {
      // Builder code loads only on builder pages.
      input: {
        afreact: "src/main.tsx",
        "afreact-admin": "src/admin/main.tsx",
        ...Object.fromEntries(KIT.map((name) => [`kit/${name}`, `src/kit/${name}.ts`])),
      },
      // The kit's entries keep their exports; afreact's own export nothing.
      preserveEntrySignatures: "allow-extension",
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "[name].[ext]",
        // Libraries shared with lazy chunks live in a chunk of their own; Downshift and its
        // dependencies load only with the first EntityRef.
        codeSplitting: {
          groups: [
            // One React for afreact's entries and the extensions that import the kit.
            { name: "react", test: REACT, priority: 2 },
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
