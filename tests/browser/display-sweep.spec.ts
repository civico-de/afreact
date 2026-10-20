/**
 * Every search with displays on the site, opened in core's builder and in React's with each
 * display tab visited, sends the same save: what each display editor's start-up normalizes
 * included; and React names no setting as unknown. Every write is caught and dropped.
 */
import { expect, type Page, type Route } from "@playwright/test";
import { test } from "./coverage";
import { diffPaths } from "../../src/admin/search/roundTrip";
import { api, coreBuilders } from "./harness";

coreBuilders();

const pages = { angular: "/civicrm/admin/search", react: "/civicrm/admin/afreact/search" };
const SUFFIX = " (sweep)";
const UNKNOWN_NOTICE = "This display has settings the React builder cannot edit";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Core's builder sends one batch, React each call on its own; both hold SavedSearch.save. */
function savedParams(route: Route): unknown {
  const body = new URLSearchParams(route.request().postData() ?? "");
  const calls = body.get("calls");
  if (calls !== null) {
    const batch: unknown = JSON.parse(calls);
    return isRecord(batch) && Array.isArray(batch.saved) ? batch.saved[2] : undefined;
  }
  return route.request().url().includes("/SavedSearch/save")
    ? JSON.parse(body.get("params") ?? "null")
    : undefined;
}

/** Any request that would write a search, in whatever shape it comes. */
const writesSearch = (route: Route) =>
  /SavedSearch|SearchDisplay/.test(route.request().url() + (route.request().postData() ?? "")) &&
  /save|create|update|delete/i.test(route.request().url() + (route.request().postData() ?? ""));

async function sentSave(page: Page, renderer: keyof typeof pages, id: number, displays: number) {
  let notices = 0;
  await page.goto(`${pages[renderer]}#/edit/${String(id)}`);
  const label = page.locator("#crm-saved-search-label");
  await expect(label).not.toHaveValue("");
  for (let index = 0; index < displays; index++) {
    await (
      renderer === "angular"
        ? page.locator('li[role="tab"][ng-repeat^="display in"] > a').nth(index)
        : page.locator(`button[id$="-tab-display_${String(index)}"]`)
    ).click();
    await page.waitForLoadState("networkidle");
    if (renderer === "react") notices += await page.getByText(UNKNOWN_NOTICE).count();
  }
  // Save is offered only for a change; the label's is taken out again below.
  await label.fill(`${await label.inputValue()}${SUFFIX}`);
  let sent: unknown;
  await page.route("**/civicrm/ajax/api4**", async (route) => {
    const params = savedParams(route);
    if (params !== undefined) sent = params;
    else if (!writesSearch(route)) return route.fallback();
    return route.abort();
  });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => sent !== undefined).toBe(true);
  await page.unrouteAll({ behavior: "ignoreErrors" });
  const records = isRecord(sent) && Array.isArray(sent.records) ? sent.records : [];
  const record: unknown = records[0];
  if (isRecord(record) && typeof record.label === "string")
    record.label = record.label.slice(0, -SUFFIX.length);
  return { sent, notices };
}

test.setTimeout(1_800_000);

test("every search saves after opening its displays as core's builder saves it", async ({
  page,
}) => {
  await page.goto("/civicrm/admin/afreact/search#/list");
  const searches = await api<{ id: number; displays: number }>(page, "SavedSearch", "get", {
    select: ["id", "COUNT(displays.id) AS displays"],
    join: [["SearchDisplay AS displays", "INNER", ["id", "=", "displays.saved_search_id"]]],
    groupBy: ["id"],
  });
  expect(searches.length).toBeGreaterThan(0);
  const only = process.env.SWEEP_SEARCHES?.split(",").map(Number);
  const swept = searches.filter(({ id }) => !only || only.includes(id));
  expect(swept.length).toBeGreaterThan(0);
  const found: string[] = [];
  for (const search of swept) {
    const angular = await sentSave(page, "angular", search.id, search.displays);
    const react = await sentSave(page, "react", search.id, search.displays);
    const paths = diffPaths(angular.sent, react.sent);
    if (paths.length) found.push(`${String(search.id)}: ${paths.join(", ")}`);
    if (react.notices)
      found.push(`${String(search.id)}: ${String(react.notices)} unknown settings notices`);
  }
  expect(found).toEqual([]);
});
