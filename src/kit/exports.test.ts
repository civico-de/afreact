import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import * as compilerRuntime from "./compiler-runtime";
import * as jsxRuntime from "./jsx-runtime";
import * as react from "./react";
import * as reactDom from "./react-dom";
import * as reactDomClient from "./react-dom-client";

const require = createRequire(import.meta.url);

/** What the production build the bundle holds exports; internals serve React's own packages, which share its chunk. */
const publicNames = (build: string): string[] => {
  const [pkg = "", ...file] = build.split("/");
  const module: unknown = require(join(dirname(require.resolve(pkg)), ...file));
  if (typeof module !== "object" || module === null) throw new Error(`${build} exports nothing`);
  return Object.keys(module)
    .filter((key) => !key.startsWith("__"))
    .sort();
};

test.each([
  ["react", "react/cjs/react.production.js", react],
  ["react-dom", "react-dom/cjs/react-dom.production.js", reactDom],
  ["react-dom/client", "react-dom/cjs/react-dom-client.production.js", reactDomClient],
  ["react/jsx-runtime", "react/cjs/react-jsx-runtime.production.js", jsxRuntime],
  ["react/compiler-runtime", "react/cjs/react-compiler-runtime.production.js", compilerRuntime],
])("the kit's %s passes on every export but the internals", (_name, build, kit) => {
  const exported = Object.keys(kit).filter((key) => key !== "default");
  expect(exported.sort()).toEqual(publicNames(build));
});
