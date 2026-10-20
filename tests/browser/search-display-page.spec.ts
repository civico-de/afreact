import { expect, type Page } from "@playwright/test";
import { test } from "./coverage";
import { api, axeFindings, coreBuilders } from "./harness";

coreBuilders();

const NAME = "afreact_page_probe";
const TAGS = ["Afreact page probe A", "Afreact page probe B"];

async function cleanUp(page: Page) {
  await page.goto("/civicrm/admin/afreact/search#/list");
  await api(page, "SavedSearch", "delete", { where: [["name", "=", NAME]] });
  await api(page, "Tag", "delete", { where: [["label", "IN", TAGS]] });
}

test.describe("SearchKit display page", () => {
  let searchId = 0;
  test.beforeEach(async ({ page }) => {
    await cleanUp(page);
    await api(page, "Tag", "save", {
      records: TAGS.map((label) => ({ label, used_for: ["civicrm_contact"] })),
    });
    const [search] = await api<{ id: number }>(page, "SavedSearch", "create", {
      values: {
        name: NAME,
        label: "Afreact page probe",
        api_entity: "Tag",
        api_params: {
          version: 4,
          select: ["id", "label"],
          where: [["label", "LIKE", "Afreact page probe%"]],
        },
      },
      chain: {
        display: [
          "SearchDisplay",
          "create",
          {
            values: {
              saved_search_id: "$id",
              name: "probe_table",
              label: "Probe tags",
              type: "table",
              settings: { columns: [{ type: "field", key: "label", label: "Tag" }] },
            },
          },
        ],
      },
    });
    searchId = search?.id ?? 0;
  });
  test.afterEach(async ({ page }) => {
    await cleanUp(page);
  });

  test("shows a named display with hash filters, its title and the edit link", async ({ page }) => {
    await page.goto(`/civicrm/afreact/search#/display/${NAME}/probe_table`);
    const table = page.locator("afreact-builder table");
    await expect(table.getByRole("cell", { name: TAGS[0] })).toBeVisible();
    await expect(table.getByRole("cell", { name: TAGS[1] })).toBeVisible();
    await expect(page.locator("h1").first()).toHaveText("Probe tags");
    await page.getByRole("button", { name: "Configure" }).click();
    await expect(page.getByRole("menuitem", { name: "Edit in SearchKit" })).toHaveAttribute(
      "href",
      new RegExp(`/civicrm/admin/search#/edit/${String(searchId)}$`),
    );
    await page.keyboard.press("Escape");
    expect(await axeFindings(page, "afreact-builder")).toEqual([]);

    await page.goto(
      `/civicrm/afreact/search#/display/${NAME}/probe_table?label=${encodeURIComponent(TAGS[1] ?? "")}`,
    );
    await expect(table.getByRole("cell", { name: TAGS[1] })).toBeVisible();
    await expect(table.getByRole("cell", { name: TAGS[0] })).toHaveCount(0);
  });

  test("shows the default display when the URL names none, as core's page", async ({ page }) => {
    await page.goto(`/civicrm/search#/display/${NAME}`);
    const angular = page.locator("crm-search-display table tbody tr");
    await expect(angular).toHaveCount(2);
    const angularTitle = (await page.locator("h1").first().textContent())?.trim();
    await page.goto(`/civicrm/afreact/search#/display/${NAME}`);
    await expect(page.locator("afreact-builder table tbody tr")).toHaveCount(2);
    await expect(page.locator("h1").first()).toHaveText(angularTitle ?? "");
  });
});
