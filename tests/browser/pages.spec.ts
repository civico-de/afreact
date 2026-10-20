/**
 * Ready times of the tour's pages on both renderers, on the render page: a cold load gets a
 * fresh browser context (empty HTTP cache), warm loads reuse one; the order rotates per round.
 * Measured as in production (debug off); the previous debug setting is restored afterwards.
 * Numbers go to stdout, the report and test-results/pages.md; the assertions guard the harness.
 */
import { expect, type BrowserContext } from "@playwright/test";
import { test } from "./coverage";
import { mkdir, writeFile } from "node:fs/promises";
import { median } from "../../src/compare/metrics";
import { AUTH, setDebug, type Renderer } from "./harness";

const ROW = ".crm-search-display table tbody tr";
/** The tour's pages (tour.video.ts) with what must show before a page counts as ready. */
const PAGES: { form: string; ready: string; suffix?: string }[] = [
  { form: "afsearchAfreactDemoGroups", ready: ROW },
  // Unfiltered: the tour filters for a contact it creates itself.
  {
    form: "afsearchAfreactDemoEditable",
    ready: 'tbody td[data-field-name="job_title"] .crm-editable-enabled',
  },
  { form: "afsearchAfreactDemoOrder", ready: ROW },
  { form: "afsearchAfreactDemoFeatures", ready: ROW },
  { form: "afsearchAfreactDemoContactTypes", ready: ROW },
  { form: "afformAfreactDemoTabs", ready: 'af-field[name="first_name"] input' },
  { form: "afsearchAfreactDemoList", ready: ".crm-search-display-listitem" },
  { form: "afsearchAfreactDemoGrid", ready: ".crm-search-display-griditem" },
  { form: "afsearchAfreactDemoTree", ready: ".crm-search-display li" },
  { form: "afsearchAfreactDemoRanges", ready: ROW },
  { form: "afsearchAdministerMembershipTypes", ready: ROW },
  { form: "afsearchCiviCRMQueues", ready: ROW },
  { form: "afsearchSettingsDatePreferences", ready: ROW },
  { form: "afsearchPrintPagePDFFormats", ready: ROW },
  { form: "afsearchSiteEmailAddresses", ready: ROW },
  { form: "afformAfreactDemoFields", ready: 'af-field[name="nick_name"] iframe' },
];
const RENDERERS: Renderer[] = ["angular", "react"];
const ROUNDS = Number(process.env.PAGES_ROUNDS ?? 5);

let debugBefore: unknown;
// Per test: after a failure Playwright starts a new worker and reruns beforeAll, which would read
// the switched-off value as the one to restore.
test.beforeEach(async ({ browser }) => {
  debugBefore = await setDebug(browser, false);
});
test.afterEach(async ({ browser }) => {
  await setDebug(browser, debugBefore);
});

async function readyMs(context: BrowserContext, renderer: Renderer, index: number) {
  const { form, ready, suffix } = PAGES[index]!;
  const page = await context.newPage();
  await page.goto(`/civicrm/afreact/render?name=${form}&renderer=${renderer}${suffix ?? ""}`, {
    waitUntil: "commit",
  });
  const stamp = await page.waitForFunction(
    (selector) => document.querySelector(selector) !== null && performance.now(),
    ready,
    { polling: "raf", timeout: 30_000 },
  );
  const ms: unknown = await stamp.jsonValue();
  await page.close();
  if (typeof ms !== "number") throw new Error(`${form}: stamped ${String(ms)}, not a time`);
  return ms;
}

type Runs = Record<string, Record<Renderer, number[]>>;
const runs = (): Runs =>
  Object.fromEntries(PAGES.map(({ form }) => [form, { angular: [], react: [] }]));

function table(cold: Runs, warm: Runs): string {
  const cell = (form: string, part: Runs, renderer: Renderer) =>
    String(Math.round(median(part[form]![renderer])));
  return [
    `Ready times in ms, median of ${ROUNDS}: cold (fresh context) and warm (shared context)`,
    "| page | Angular cold | React cold | Angular warm | React warm |",
    "|---|---|---|---|---|",
    ...PAGES.map(
      ({ form }) =>
        `| ${form} | ${cell(form, cold, "angular")} | ${cell(form, cold, "react")} | ${cell(form, warm, "angular")} | ${cell(form, warm, "react")} |`,
    ),
  ].join("\n");
}

test("measures cold and warm loads of every tour page on both renderers", async ({
  browser,
}, testInfo) => {
  test.setTimeout(ROUNDS * PAGES.length * 30_000);
  const cold = runs();
  const warm = runs();
  const warmContext = await browser.newContext({ storageState: AUTH });
  // One unmeasured load per page fills the warm context's cache.
  for (const renderer of RENDERERS) {
    for (let index = 0; index < PAGES.length; index++) await readyMs(warmContext, renderer, index);
  }
  for (let round = 0; round < ROUNDS; round++) {
    for (let index = 0; index < PAGES.length; index++) {
      const { form } = PAGES[index]!;
      // Alternate which renderer goes first, so neither always follows the other.
      const order = (round + index) % 2 ? [...RENDERERS].reverse() : RENDERERS;
      for (const renderer of order) {
        const coldContext = await browser.newContext({ storageState: AUTH });
        cold[form]![renderer].push(await readyMs(coldContext, renderer, index));
        await coldContext.close();
        warm[form]![renderer].push(await readyMs(warmContext, renderer, index));
      }
    }
  }
  await warmContext.close();

  const report = table(cold, warm);
  console.log(report);
  await testInfo.attach("pages.md", { body: report, contentType: "text/markdown" });
  await mkdir("test-results", { recursive: true });
  await writeFile("test-results/pages.md", `${report}\n`);
  for (const { form } of PAGES) {
    for (const renderer of RENDERERS) expect(cold[form]![renderer]).toHaveLength(ROUNDS);
  }
});
