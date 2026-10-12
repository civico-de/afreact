/**
 * Search forms with filters on both renderers: the first search takes its filters from the
 * field defaults, the URL, stored values or a saved filter set, with one page request and no
 * rows the filters exclude; changed filters search once typing pauses and survive a reload.
 */
import { expect, test, type Browser, type Page, type Request } from "@playwright/test";
import { api, API_PAGE, AUTH, isRecord, type Renderer } from "./harness";

const RUN = Date.now().toString(36);
const PREFIX = `Afreact filters ${RUN}`;
const GROUPS = "afsearchManageGroups";
const IMPORTS = "afsearchMyImports";

const render = (form: string, renderer: Renderer, hash = "") =>
  `/civicrm/afreact/render?name=${form}&renderer=${renderer}${hash}`;
const titleHash = (title: string) => `#?title=${encodeURIComponent(title)}`;

/**
 * SearchDisplay.run's parameters when the request asks for a page of rows: CRM.api4 posts
 * one call as `params`, Angular's crmApi4 a batch as `calls`.
 */
function pageRun(request: Request): Record<string, unknown> | null {
  if (!request.url().includes("/ajax/api4")) return null;
  const body = new URLSearchParams(request.postData() ?? "");
  const single = body.get("params");
  const batch = body.get("calls");
  const candidates: unknown[] = [];
  if (single && request.url().includes("/SearchDisplay/run")) candidates.push(JSON.parse(single));
  if (batch) {
    const calls: unknown = JSON.parse(batch);
    if (isRecord(calls))
      for (const call of Object.values(calls))
        if (Array.isArray(call) && call[0] === "SearchDisplay" && call[1] === "run")
          candidates.push(call[2]);
  }
  return (
    candidates
      .filter(isRecord)
      .find((params) => typeof params.return === "string" && params.return.startsWith("page:")) ??
    null
  );
}

// Rows as they reach the DOM, placeholders left out, so a row shown only briefly counts too.
const RECORD_ROWS = () => {
  const seen: string[] = [];
  Object.assign(window, { afreactSeenRows: seen });
  new MutationObserver(() => {
    for (const row of document.querySelectorAll(".afreact-render tbody tr")) {
      // React's editable cells also name their column for screen readers.
      const copy = row.cloneNode(true);
      if (!(copy instanceof Element)) throw new Error("The row's clone is no element.");
      for (const hidden of copy.querySelectorAll(".sr-only")) hidden.remove();
      const text = (copy.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text && !row.querySelector(".crm-search-loading-placeholder") && !seen.includes(text))
        seen.push(text);
    }
  }).observe(document, { childList: true, subtree: true, characterData: true });
};

interface Loaded {
  /** `filters` of each page request. */
  runs: unknown[];
  /** Text of the given column, row by row, once the page has settled. */
  rows: string[];
  /** Every row the page showed at any time. */
  seen: string[];
}

/** The texts in the column headed `header`, found by its position among the headers. */
async function column(page: Page, header: string): Promise<string[]> {
  const table = page.locator(".afreact-render table").first();
  const headers = (await table.locator("thead th").allInnerTexts()).map((text) => text.trim());
  const index = headers.indexOf(header);
  if (index < 0) throw new Error(`No column "${header}" in ${JSON.stringify(headers)}`);
  // React's editable cells also name their column for screen readers.
  const cells = await table.locator(`tbody tr td:nth-child(${index + 1})`).evaluateAll((all) =>
    all.map((td) => {
      const copy = td.cloneNode(true);
      if (!(copy instanceof Element)) throw new Error("The cell's clone is no element.");
      for (const hidden of copy.querySelectorAll(".sr-only")) hidden.remove();
      return copy.textContent ?? "";
    }),
  );
  return cells.map((text) => text.trim());
}

/** Waits until a page request was answered and no placeholder or request is left. */
async function settled(page: Page) {
  await page.waitForFunction(
    () =>
      document.querySelector(".afreact-render tbody tr") !== null &&
      document.querySelector(".afreact-render .crm-search-loading-placeholder") === null,
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForLoadState("networkidle");
  // Past SearchKit's 600 ms filter debounce, so a late second search would show.
  await page.waitForTimeout(800);
}

async function load(
  page: Page,
  form: string,
  renderer: Renderer,
  hash: string,
  header: string,
): Promise<Loaded> {
  const runs: unknown[] = [];
  const listener = (request: Request) => {
    const params = pageRun(request);
    if (params) runs.push(params.filters);
  };
  await page.goto("about:blank");
  page.on("request", listener);
  await page.goto(render(form, renderer, hash));
  await settled(page);
  page.off("request", listener);
  const seen = await page.evaluate(() =>
    "afreactSeenRows" in window && Array.isArray(window.afreactSeenRows)
      ? window.afreactSeenRows.map(String)
      : [],
  );
  return { runs, rows: await column(page, header), seen };
}

async function adminPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  await page.goto(API_PAGE);
  return page;
}

test.describe("search filters", () => {
  // Each test loads several pages; the first loads after a cache clear compile the forms.
  test.describe.configure({ timeout: 180_000 });

  test.beforeAll(async ({ browser }) => {
    const page = await adminPage(browser);
    for (const [name, active] of [
      ["Alpha", true],
      ["Beta", true],
      ["Gamma", false],
    ] as const)
      await api(page, "Group", "create", {
        values: { title: `${PREFIX} ${name}`, is_active: active },
      });
    for (const name of ["one", "two"])
      await api(page, "UserJob", "create", {
        values: { label: `${PREFIX} import ${name}`, job_type: "contact_import", status_id: 2 },
      });
    await page.context().close();
  });

  test.afterAll(async ({ browser }) => {
    const page = await adminPage(browser);
    await api(page, "Group", "delete", { where: [["title", "LIKE", `${PREFIX}%`]] });
    await api(page, "SearchParamSet", "delete", { where: [["label", "LIKE", `${PREFIX}%`]] });
    await api(page, "UserJob", "delete", { where: [["label", "LIKE", `${PREFIX}%`]] });
    await page.context().close();
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(RECORD_ROWS);
  });

  test("both renderers search the URL's filters once and show the same rows", async ({ page }) => {
    for (const hash of [
      titleHash(PREFIX),
      `${titleHash(PREFIX)}&is_active=0`,
      `${titleHash(PREFIX)}&Manage_groups.title=${encodeURIComponent(`${PREFIX} Beta`)}`,
    ]) {
      const react = await load(page, GROUPS, "react", hash, "Title");
      const angular = await load(page, GROUPS, "angular", hash, "Title");
      expect(react.runs, hash).toEqual(angular.runs);
      expect(react.runs, hash).toHaveLength(1);
      expect(react.rows, hash).toEqual(angular.rows);
      // No row the filters exclude, not even for a moment.
      expect(
        react.seen.every((row) => row.includes(PREFIX)),
        hash,
      ).toBe(true);
    }
    const inactive = await load(page, GROUPS, "react", `${titleHash(PREFIX)}&is_active=0`, "Title");
    expect(inactive.rows).toEqual([`${PREFIX} Gamma`]);
  });

  test("both renderers start from the field defaults with one search", async ({ page }) => {
    const react = await load(page, GROUPS, "react", "", "Title");
    const angular = await load(page, GROUPS, "angular", "", "Title");
    expect(react.runs).toEqual([{ is_active: true }]);
    expect(angular.runs).toEqual(react.runs);
    expect(react.rows).toEqual(angular.rows);
    expect(react.seen.some((row) => row.includes(`${PREFIX} Gamma`))).toBe(false);
  });

  test("a saved filter set searches once, after it has loaded", async ({ page }) => {
    const [set] = await (async () => {
      await page.goto(API_PAGE);
      return api<{ id: number }>(page, "SearchParamSet", "create", {
        values: {
          afform_name: GROUPS,
          label: `${PREFIX} set`,
          filters: { title: { CONTAINS: `${PREFIX} Al` }, is_active: true },
        },
      });
    })();
    const react = await load(page, GROUPS, "react", `#?_s=${set?.id}`, "Title");
    expect(react.runs).toEqual([{ title: { CONTAINS: `${PREFIX} Al` }, is_active: true }]);
    expect(react.rows).toEqual([`${PREFIX} Alpha`]);
    expect(react.seen).toHaveLength(1);
    // Core's afFieldset resets to the defaults after loading the set, so Angular gets the
    // same filters through the URL for comparison.
    const angular = await load(page, GROUPS, "angular", titleHash(`${PREFIX} Al`), "Title");
    expect(angular.runs).toEqual(react.runs);
    expect(angular.rows).toEqual(react.rows);
  });

  test("typed filters search once typing pauses and come back on reload", async ({ page }) => {
    const typed = async (renderer: Renderer) => {
      await load(page, GROUPS, renderer, "", "Title");
      const runs: unknown[] = [];
      const listener = (request: Request) => {
        const params = pageRun(request);
        if (params) runs.push(params.filters);
      };
      page.on("request", listener);
      await page
        .locator('.afreact-render af-field[name="title"] input')
        .pressSequentially(`${PREFIX} B`, { delay: 30 });
      await expect.poll(() => runs.length).toBe(1);
      await settled(page);
      page.off("request", listener);
      return { runs, rows: await column(page, "Title"), hash: new URL(page.url()).hash };
    };
    const react = await typed("react");
    const angular = await typed("angular");
    expect(react.runs).toEqual(angular.runs);
    expect(react.rows).toEqual(angular.rows);
    expect(react.rows).toEqual([`${PREFIX} Beta`]);

    expect(new URLSearchParams(react.hash.replace(/^#\??/, "")).get("title")).toBe(`${PREFIX} B`);
    const reloaded = await load(page, GROUPS, "react", react.hash, "Title");
    expect(reloaded.runs).toEqual(react.runs);
    expect(reloaded.rows).toEqual(react.rows);
  });

  test("stored filters come back after a reload with one search", async ({ page }) => {
    const stored = async (renderer: Renderer) => {
      await page.goto(API_PAGE);
      // CRM.cache keeps the stored values in localStorage under a "CRM" prefix.
      await page.evaluate(() => {
        localStorage.removeItem("CRMafform:afsearchMyImportsMy_imports_display");
      });
      await load(page, IMPORTS, renderer, "", "Name");
      const label = page.locator('.afreact-render af-field[name="label"] input');
      await label.fill(`${PREFIX} import two`);
      await expect
        .poll(() => column(page, "Name"), { timeout: 10_000 })
        .toEqual([`${PREFIX} import two`]);
      // The address without the hash, so only the stored values can bring the filter back.
      return load(page, IMPORTS, renderer, "", "Name");
    };
    const react = await stored("react");
    const angular = await stored("angular");
    expect(react.runs).toEqual([{ label: `${PREFIX} import two` }]);
    expect(angular.runs).toEqual(react.runs);
    expect(react.rows).toEqual(angular.rows);
    expect(react.rows).toEqual([`${PREFIX} import two`]);
    expect(react.seen.every((row) => row.includes(`${PREFIX} import two`))).toBe(true);
    await expect(page.locator('.afreact-render af-field[name="label"] input')).toHaveValue(
      `${PREFIX} import two`,
    );
  });

  test("first rows of a filtered form: React against Angular", async ({ page }, testInfo) => {
    const hash = `${titleHash(PREFIX)}&is_active=1`;
    const firstRow = async (renderer: Renderer) => {
      await page.goto("about:blank");
      await page.goto(render(GROUPS, renderer, hash));
      const stamp = await page.waitForFunction(
        (prefix) =>
          [...document.querySelectorAll(".afreact-render tbody tr")].some((row) =>
            row.textContent?.includes(prefix),
          ) && performance.now(),
        PREFIX,
        { polling: "raf", timeout: 20_000 },
      );
      return Number(await stamp.jsonValue());
    };
    const median = (values: number[]) =>
      [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? NaN;
    const times: Record<Renderer, number[]> = { react: [], angular: [] };
    // Alternating, so a slow moment of the dev stack hits both alike.
    for (let run = 0; run < 5; run++)
      for (const renderer of ["react", "angular"] as const)
        times[renderer].push(await firstRow(renderer));
    const report = `first row, ms after navigation start (median of 5): React ${median(times.react).toFixed(0)}, Angular ${median(times.angular).toFixed(0)}\nReact ${times.react.map((t) => t.toFixed(0)).join(" ")}\nAngular ${times.angular.map((t) => t.toFixed(0)).join(" ")}`;
    await testInfo.attach("first-row.txt", { body: report, contentType: "text/plain" });
    console.log(report);
    expect(times.react.every(Number.isFinite)).toBe(true);
  });
});
