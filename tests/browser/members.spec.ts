/**
 * The demo members page: a filtered table with a conditional rewrite and muted rows, and a count
 * table below the fieldset. Rows are compared without the members' names.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { api, API_PAGE, type Renderer } from "./harness";

const LOAD = { timeout: 30_000 };
const PAGE = "/civicrm/afreact/render?name=afsearchAfreactDemoMembers&renderer=";

interface Seen {
  count: string;
  rows: string[][];
  reduced: { count: string; rows: string[][] };
  total: string;
}

/** Membership id, type, status, dates, fee and whether the row is muted; no member names. */
async function rows(table: Locator): Promise<string[][]> {
  await expect(table.locator(".crm-search-loading-placeholder")).toHaveCount(0, LOAD);
  return table.locator("tbody tr").evaluateAll((trs) =>
    trs.map((tr) => {
      const cells = [...tr.querySelectorAll("td:not(.crm-search-ctrl-column)")];
      const muted = cells.every((cell) => cell.classList.contains("text-muted"));
      const texts = cells.slice(1).map((cell) => (cell.textContent ?? "").trim());
      return [tr.getAttribute("data-entity-id") ?? "", ...texts, String(muted)];
    }),
  );
}

interface Fee {
  id: number;
  "Afreact_Demo_Fee.Reduced": boolean | null;
  "Afreact_Demo_Fee.Reason:label": string | null;
}

async function look(page: Page, renderer: Renderer, reducedCount: number): Promise<Seen> {
  await page.goto(PAGE + renderer);
  const [members, byType] = [0, 1].map((index) =>
    page.locator(".afreact-render table.table").nth(index),
  );
  if (!members || !byType) throw new Error("Two tables expected");
  const count = page.locator(".afreact-render .crm-search-display-pager").first();
  await expect(members.locator("tbody tr").first()).toBeVisible(LOAD);
  const seen = {
    count: (await count.innerText()).split("\n")[0] ?? "",
    rows: await rows(members),
    total: (await byType.locator("tfoot td").last().innerText()).trim(),
  };
  await page
    .locator('.afreact-render af-field[name="Afreact_Demo_Fee.Reduced"]')
    .getByLabel("Yes")
    .check();
  await expect(count).toContainText(new RegExp(`(^|\\D)${String(reducedCount)} results?\\b`), LOAD);
  return {
    ...seen,
    reduced: { count: (await count.innerText()).split("\n")[0] ?? "", rows: await rows(members) },
  };
}

test("both renderers show the members page alike", async ({ page }) => {
  await page.goto(API_PAGE);
  const tally = async (where: unknown[][]) =>
    String((await api(page, "Membership", "get", { select: ["id"], where })).length);
  const all = await tally([]);
  const current = await tally([["status_id.is_current_member", "=", true]]);
  const reduced = await tally([["Afreact_Demo_Fee.Reduced", "=", true]]);
  const fees = new Map(
    (
      await api<Fee>(page, "Membership", "get", {
        select: ["id", "Afreact_Demo_Fee.Reduced", "Afreact_Demo_Fee.Reason:label"],
      })
    ).map((fee) => [String(fee.id), fee]),
  );

  const angular = await look(page, "angular", Number(reduced));
  const react = await look(page, "react", Number(reduced));
  expect(react.count).toBe(angular.count);
  expect(react.rows).toEqual(angular.rows);
  expect(react.reduced).toEqual(angular.reduced);
  expect(react.reduced.rows).toHaveLength(Number(reduced));
  // The rewrite shows the reason only for a reduced fee, also where a full member has one.
  const shown = [...react.rows, ...react.reduced.rows];
  expect(shown.map((row) => row[5])).toEqual(
    shown.map((row) => {
      const stored = fees.get(row[0] ?? "");
      return stored?.["Afreact_Demo_Fee.Reduced"] ? stored["Afreact_Demo_Fee.Reason:label"] : "";
    }),
  );
  expect(
    react.rows.some((row) => {
      const stored = fees.get(row[0] ?? "");
      return !stored?.["Afreact_Demo_Fee.Reduced"] && !!stored?.["Afreact_Demo_Fee.Reason:label"];
    }),
  ).toBe(true);
  // Expired memberships are muted.
  expect(react.rows.filter((row) => row[2] === "Expired").every((row) => row[6] === "true")).toBe(
    true,
  );
  expect(react.rows.some((row) => row[2] === "Expired")).toBe(true);

  // deviation:display-outside-fieldset-form
  // Core runs the count table without its form and drops its filter on current members.
  expect(react.total).toBe(current);
  expect(angular.total).toBe(all);
  expect(current).not.toBe(all);
});
