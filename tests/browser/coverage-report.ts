/**
 * Turns the V8 coverage that E2E_COVERAGE=1 collected into Istanbul data for src/, by area:
 *   AFREACT_SOURCEMAP=1 bun run build && E2E_COVERAGE=1 playwright test && bun tests/browser/coverage-report.ts
 * After `vitest run --coverage --coverage.reporter=json` it also counts the lines either suite runs.
 */
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Profiler } from "node:inspector";
import { mergeProcessCovs } from "@bcoe/v8-coverage";
import { convert } from "ast-v8-to-istanbul";
import { parseAstAsync } from "vite";
import { RAW } from "./coverage";
import { isRecord } from "./harness";

type Entry = Pick<Profiler.ScriptCoverage, "url" | "functions">;
type FileData = Awaited<ReturnType<typeof convert>>[string];
type SourceMap = Parameters<typeof convert>[0]["sourceMap"];

const OUT = "coverage/e2e";
const UNIT = "coverage/coverage-final.json";
const AREAS = ["src/search/", "src/admin/search/", "src/afform/", "src/admin/afform/"];
const OWN = /^src\/.*\.tsx?$/;
const NOT_OWN = /\.test\.|^src\/test\//;

if (!existsSync(RAW)) {
  console.error(`No ${RAW}: run the browser tests with E2E_COVERAGE=1 first.`);
  process.exit(1);
}
const isEntries = (value: unknown): value is Entry[] =>
  Array.isArray(value) &&
  value.every(
    (entry) => isRecord(entry) && typeof entry.url === "string" && Array.isArray(entry.functions),
  );
const isMap = (value: unknown): value is NonNullable<SourceMap> =>
  isRecord(value) && typeof value.mappings === "string" && Array.isArray(value.sources);
async function readJson<T>(path: string, is: (value: unknown) => value is T): Promise<T> {
  const value: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!is(value)) throw new Error(`${path} is not what the report reads.`);
  return value;
}

const files = await readdir(RAW);
const entries = (
  await Promise.all(files.map((name) => readJson(`${RAW}/${name}`, isEntries)))
).flat();
// The served bundle is the local dist/, without the cache query.
const local = (url: string) => resolve("dist", new URL(url).pathname.split("/dist/")[1] ?? "");
const result: Profiler.ScriptCoverage[] = entries.map((entry, i) => ({
  scriptId: String(i),
  url: local(entry.url),
  functions: entry.functions,
}));
// A chunk no page loaded counts with every line unrun.
const bundle = (await readdir("dist", { recursive: true }))
  .filter((name) => name.endsWith(".js"))
  .map((name) => resolve("dist", name));
for (const url of bundle) {
  if (result.some((script) => script.url === url)) continue;
  const { length } = await readFile(url, "utf8");
  const ranges = [{ startOffset: 0, endOffset: length, count: 0 }];
  result.push({
    scriptId: url,
    url,
    functions: [{ functionName: "", isBlockCoverage: true, ranges }],
  });
}
const merged = mergeProcessCovs([{ result }]).result;

if (!["afreact.js", "afreact-admin.js"].every((entry) => existsSync(`dist/${entry}.map`))) {
  console.error("No source maps in dist/: build with AFREACT_SOURCEMAP=1.");
  process.exit(1);
}
const data: Record<string, FileData> = {};
for (const script of merged) {
  // Generated chunks such as the bundler's runtime have no source in src/.
  if (!existsSync(`${script.url}.map`)) {
    console.error(`Skipped ${script.url}: no source map.`);
    continue;
  }
  const code = await readFile(script.url, "utf8");
  const converted = await convert({
    code,
    ast: parseAstAsync(code),
    sourceMap: await readJson(`${script.url}.map`, isMap),
    coverage: { url: pathToFileURL(script.url).href, functions: script.functions },
  });
  for (const [path, file] of Object.entries(converted)) {
    const rel = path.replace(`${process.cwd()}/`, "");
    if (!OWN.test(rel) || NOT_OWN.test(rel)) continue;
    const into = data[rel];
    if (into) add(into, file);
    else data[rel] = file;
  }
}

/** The same source from two chunks counts once, its hits added. */
function add(into: FileData, file: FileData) {
  for (const [k, n] of Object.entries(file.s)) into.s[k] = (into.s[k] ?? 0) + n;
  for (const [k, n] of Object.entries(file.f)) into.f[k] = (into.f[k] ?? 0) + n;
  for (const [k, hits] of Object.entries(file.b))
    into.b[k] = hits.map((n, i) => n + (into.b[k]?.[i] ?? 0));
}

const isReport = (value: unknown): value is Record<string, FileData> =>
  isRecord(value) &&
  Object.values(value).every(
    (file) => isRecord(file) && isRecord(file.statementMap) && isRecord(file.s),
  );
const unit = existsSync(UNIT) ? await readJson(UNIT, isReport) : undefined;
/** Each line a statement starts on, and whether one of them ran. */
const lines = (file: FileData | undefined, into = new Map<number, boolean>()) => {
  for (const [k, loc] of Object.entries(file?.statementMap ?? {}))
    into.set(loc.start.line, (into.get(loc.start.line) ?? false) || (file?.s[k] ?? 0) > 0);
  return into;
};

const pct = (hit: number, all: number) => (all ? ((100 * hit) / all).toFixed(1) : "-");
for (const area of AREAS) {
  const own = Object.entries(data).filter(([path]) => path.startsWith(area));
  const count = (pick: (file: FileData) => number[]) => {
    const all = own.flatMap(([, file]) => pick(file));
    return [all.filter(Boolean).length, all.length] as const;
  };
  const [s, sAll] = count((file) => Object.values(file.s));
  const [b, bAll] = count((file) => Object.values(file.b).flat());
  const [f, fAll] = count((file) => Object.values(file.f));
  console.log(
    `${area}: ${own.length} files, statements ${pct(s, sAll)}%, branches ${pct(b, bAll)}%, functions ${pct(f, fAll)}%`,
  );
  if (!unit) continue;
  const both = Object.entries(unit)
    .map(([path, file]) => [path.replace(`${process.cwd()}/`, ""), file] as const)
    .filter(([path]) => path.startsWith(area))
    .flatMap(([path, file]) => [...lines(data[path], lines(file)).values()]);
  console.log(`  with Vitest: lines ${pct(both.filter(Boolean).length, both.length)}%`);
}
await mkdir(OUT, { recursive: true });
await writeFile(`${OUT}/coverage-final.json`, JSON.stringify(data));
await rm(RAW, { recursive: true });
console.log(`${OUT}/coverage-final.json from ${files.length} pages`);
