/**
 * Load metrics for the React renderer with each layout source and for the
 * Angular runtime: a cold load gets a fresh browser context (empty HTTP
 * cache), warm loads reuse one.
 * Measured as in production (debug off: minified core scripts, Angular modules
 * as a static file); the previous debug setting is restored afterwards.
 * Numbers go to stdout and the report; the assertions only guard the harness.
 */
import { writeFileSync } from "node:fs";
import { expect, test, type BrowserContext } from "@playwright/test";
import { median, resourceMetrics, type PageMetrics } from "../../src/compare/metrics";
import { AUTH, readyAt, setDebug } from "./harness";

const RENDERERS = ["react api", "react page", "react bundle", "angular"] as const;
type Renderer = (typeof RENDERERS)[number];
const PAGES: Record<Renderer, string> = {
  "react api": "/civicrm/afreact/demo",
  "react page": "/civicrm/afreact/demo?source=page",
  "react bundle": "/civicrm/afreact/demo?source=bundle",
  angular: "/civicrm/afreact/angular",
};
const METRICS = [
  "readyMs",
  "requests",
  "apiRequests",
  "scriptBytes",
  "styleBytes",
  "otherXhrBytes",
] as const satisfies readonly (keyof PageMetrics)[];
const runsPerRenderer = (): Record<Renderer, PageMetrics[]> => ({
  "react api": [],
  "react page": [],
  "react bundle": [],
  angular: [],
});
const ROUNDS = Number(process.env.COMPARE_ROUNDS ?? 5);

let debugBefore: unknown;
// Per test: after a failure Playwright starts a new worker and reruns beforeAll, which would read
// the switched-off value as the one to restore.
test.beforeEach(async ({ browser }) => {
  debugBefore = await setDebug(browser, false);
});
test.afterEach(async ({ browser }) => {
  await setDebug(browser, debugBefore);
});

async function load(context: BrowserContext, renderer: Renderer): Promise<PageMetrics> {
  const page = await context.newPage();
  await page.goto(PAGES[renderer], { waitUntil: "commit" });
  const readyMs = await readyAt(page);
  const entries = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter((entry) => entry instanceof PerformanceResourceTiming)
      .map(({ name, initiatorType, encodedBodySize }) => ({
        name,
        initiatorType,
        encodedBodySize,
      })),
  );
  await page.close();
  return { readyMs, ...resourceMetrics(entries) };
}

function table(title: string, runs: Record<Renderer, PageMetrics[]>): string {
  const cell = (renderer: Renderer, key: keyof PageMetrics) => {
    const value = median(runs[renderer].map((run) => run[key]));
    return key.endsWith("Bytes") ? `${(value / 1024).toFixed(1)} kB` : String(Math.round(value));
  };
  return [
    `${title} (median of ${ROUNDS})`,
    `| metric | ${RENDERERS.join(" | ")} |`,
    `|---|${RENDERERS.map(() => "---").join("|")}|`,
    ...METRICS.map(
      (key) => `| ${key} | ${RENDERERS.map((renderer) => cell(renderer, key)).join(" | ")} |`,
    ),
  ].join("\n");
}

test("measures cold and warm loads of every variant", async ({ browser }, testInfo) => {
  test.setTimeout(ROUNDS * 120_000);
  const cold = runsPerRenderer();
  const warm = runsPerRenderer();
  const warmContext = await browser.newContext({ storageState: AUTH });
  // One unmeasured load per variant fills the warm context's cache.
  for (const renderer of RENDERERS) await load(warmContext, renderer);

  for (let round = 0; round < ROUNDS; round++) {
    // Rotate the order so no variant always runs right after the same other one.
    const order = RENDERERS.map((_, index) => RENDERERS[(index + round) % RENDERERS.length]!);
    for (const renderer of order) {
      const coldContext = await browser.newContext({ storageState: AUTH });
      cold[renderer].push(await load(coldContext, renderer));
      await coldContext.close();
      warm[renderer].push(await load(warmContext, renderer));
    }
  }
  await warmContext.close();

  const report = `${table("Cold", cold)}\n\n${table("Warm", warm)}`;
  console.log(report);
  await testInfo.attach("metrics.md", { body: report, contentType: "text/markdown" });
  for (const renderer of RENDERERS) {
    expect(cold[renderer]).toHaveLength(ROUNDS);
    expect(Math.min(...cold[renderer].map((run) => run.apiRequests))).toBeGreaterThan(0);
  }
});

test("prints the request waterfall of a cold load", async ({ browser }, testInfo) => {
  const lines: string[] = [];
  for (const renderer of RENDERERS) {
    const context = await browser.newContext({ storageState: AUTH });
    const page = await context.newPage();
    await page.goto(PAGES[renderer], { waitUntil: "commit" });
    const readyMs = Math.round(await readyAt(page));
    const rows = await page.evaluate(() => {
      const [nav] = performance
        .getEntriesByType("navigation")
        .filter((entry) => entry instanceof PerformanceNavigationTiming);
      if (!nav) throw new Error("The page has no navigation timing");
      const resources = performance
        .getEntriesByType("resource")
        .filter((entry) => entry instanceof PerformanceResourceTiming)
        .filter(
          ({ initiatorType, name }) =>
            ["xmlhttprequest", "fetch"].includes(initiatorType) ||
            /afreact\.js|angular\.js|crm-ui|angular-modules/.test(name),
        )
        .map(({ name, startTime, responseEnd }) => ({
          name: new URL(name).pathname.replace(/^.*\/civicrm\//, ""),
          start: startTime,
          end: responseEnd,
        }));
      return [
        { name: "document", start: 0, end: nav.responseEnd },
        {
          name: "DOMContentLoaded",
          start: nav.domContentLoadedEventStart,
          end: nav.domContentLoadedEventEnd,
        },
        ...resources,
      ];
    });
    await context.close();
    lines.push(
      `${renderer} (ready ${readyMs} ms)`,
      "| request | start | end |",
      "|---|---|---|",
      ...rows.map((row) => `| ${row.name} | ${Math.round(row.start)} | ${Math.round(row.end)} |`),
      "",
    );
  }
  const report = lines.join("\n");
  console.log(report);
  await testInfo.attach("waterfall.md", { body: report, contentType: "text/markdown" });
  expect(lines.some((line) => line.includes("ajax/api4"))).toBe(true);
});

test("prints what a checkout template's island adds to a cold page", async ({
  browser,
}, testInfo) => {
  test.setTimeout(ROUNDS * 60_000);
  const runs: { ms: number; files: { name: string; bytes: number; decoded: number }[] }[] = [];
  let variableBytes = 0;
  for (let round = 0; round < ROUNDS; round++) {
    const context = await browser.newContext({ storageState: AUTH });
    const page = await context.newPage();
    // CiviCRM pages fetch more resources than the default buffer of 250 holds.
    await page.addInitScript(() => {
      performance.setResourceTimingBufferSize(2000);
    });
    await page.goto("/civicrm/afreact/render?name=afformAfreactCheckoutDonation&renderer=react");
    const card = page.locator(".afreact-render").getByLabel("Demo card");
    await expect(card).toBeVisible({ timeout: 30_000 });
    // The page's own requests (prefill, fonts) are done before the choice.
    await page.waitForLoadState("networkidle");
    const before = await page.evaluate(() => {
      const islands: unknown = Reflect.get(Object(window.CRM.vars?.afreact?.afCheckout), "islands");
      return {
        entries: performance.getEntriesByType("resource").length,
        variable: new TextEncoder().encode(JSON.stringify(islands)).length,
      };
    });
    variableBytes = before.variable;
    const ms = await card.evaluate(
      (radio) =>
        new Promise<number>((resolve) => {
          const start = performance.now();
          const shown = () => {
            if (document.querySelector("[ng-include] input")) resolve(performance.now() - start);
            else requestAnimationFrame(shown);
          };
          if (radio instanceof HTMLElement) radio.click();
          shown();
        }),
    );
    const files = await page.evaluate(
      (from) =>
        performance
          .getEntriesByType("resource")
          .slice(from)
          .filter((entry) => entry instanceof PerformanceResourceTiming)
          .map(({ name, encodedBodySize, decodedBodySize }) => ({
            name:
              new URL(name).searchParams.get("an") ??
              new URL(name).pathname.split("/").at(-1) ??
              name,
            bytes: encodedBodySize,
            decoded: decodedBodySize,
          })),
      before.entries,
    );
    runs.push({ ms, files });
    await context.close();
  }
  const [first] = runs;
  if (!first) throw new Error("No round ran.");
  const kB = (bytes: number) => `${(bytes / 1024).toFixed(1)} kB`;
  const report = [
    `Checkout island, cold (median of ${String(ROUNDS)}; the page variable is ${kB(variableBytes)})`,
    "| file | encoded | decoded |",
    "|---|---|---|",
    ...first.files.map((file) => `| ${file.name} | ${kB(file.bytes)} | ${kB(file.decoded)} |`),
    `| total | ${kB(median(runs.map((run) => run.files.reduce((sum, f) => sum + f.bytes, 0))))} | ${kB(median(runs.map((run) => run.files.reduce((sum, f) => sum + f.decoded, 0))))} |`,
    `| choice to template | ${String(Math.round(median(runs.map((run) => run.ms))))} ms | |`,
  ].join("\n");
  console.log(report);
  await testInfo.attach("checkout-island.md", { body: report, contentType: "text/markdown" });
  writeFileSync(testInfo.outputPath("checkout-island.md"), report);
  // With debug off the asset builder answers with a static file named after the modules' hash.
  expect(first.files.some((file) => /^angular-modules\b.*\.js$/.test(file.name))).toBe(true);
});
