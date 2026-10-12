import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Where React behaves differently from core, a `deviation:<slug>` marker names the place in the
 * docs, in the code that does it, and in the test that pins it.
 */
const ROOT = join(import.meta.dirname, "..");
const MARK = /deviation:([a-z0-9]+(?:-[a-z0-9]+)*)/g;
const SCANNED = ["src", "Civi", "tests", "templates", "ang", "css", "js", "xml"];
const SELF = join("src", "deviations.test.ts");

const markers = (path: string) =>
  [...readFileSync(join(ROOT, path), "utf8").matchAll(MARK)].map((match) => match[1] ?? "");

const filesIn = (dir: string) =>
  existsSync(join(ROOT, dir))
    ? readdirSync(join(ROOT, dir), { recursive: true, encoding: "utf8" })
        .map((name) => join(dir, name))
        .filter((path) => /\.(tsx?|css|php|tpl|html|js|xml|sh)$/.test(path) && path !== SELF)
    : [];

const isTest = (path: string) => /\.test\.tsx?$/.test(path) || path.startsWith("tests");

const docs = readdirSync(join(ROOT, "docs"))
  .filter((name) => name.endsWith(".md"))
  .flatMap((name) => markers(join("docs", name)));
const sources = SCANNED.flatMap(filesIn);
const inCode = new Set(sources.filter((path) => !isTest(path)).flatMap(markers));
const inTests = new Set(sources.filter(isTest).flatMap(markers));

describe("deviation markers", () => {
  it("name each deviation once in the docs", () => {
    expect(docs.filter((slug, index) => docs.indexOf(slug) !== index)).toEqual([]);
  });

  it("put each documented deviation in the code that does it and the test that pins it", () => {
    expect(docs.filter((slug) => !inCode.has(slug))).toEqual([]);
    expect(docs.filter((slug) => !inTests.has(slug))).toEqual([]);
  });

  it("mark no code or test with a deviation the docs do not describe", () => {
    expect([...inCode, ...inTests].filter((slug) => !docs.includes(slug))).toEqual([]);
  });
});
