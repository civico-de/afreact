import { expect, test, type Page } from "@playwright/test";
import { api, axeFindings, ownFindings } from "./harness";

const NAME = "afreact_list_probe";

async function cleanUp(page: Page) {
  await page.goto("/civicrm/admin/afreact/search#/list");
  await api(page, "SavedSearch", "delete", { where: [["name", "LIKE", `${NAME}%`]] });
  await api(page, "SearchSegment", "delete", { where: [["label", "=", "Afreact probe segment"]] });
}

test.describe("SearchKit listing", () => {
  test.beforeEach(async ({ page }) => {
    await cleanUp(page);
    await api(page, "SavedSearch", "create", {
      values: {
        name: NAME,
        label: "Afreact list probe",
        api_entity: "Contact",
        api_params: { version: 4, select: ["id"] },
      },
      chain: {
        display: [
          "SearchDisplay",
          "create",
          {
            values: {
              saved_search_id: "$id",
              name: "probe_table",
              label: "Probe table",
              type: "table",
              settings: { columns: [] },
            },
          },
        ],
      },
    });
  });
  test.afterEach(async ({ page }) => {
    await cleanUp(page);
  });

  test("filters, exports, deletes and imports a saved search", async ({ page }) => {
    await page.goto("/civicrm/admin/afreact/search#/list");
    await page.getByRole("searchbox", { name: "Filter by label" }).fill("Afreact list probe");
    const row = page.getByRole("row", { name: /Afreact list probe/ });
    await expect(row).toHaveCount(1);
    await expect(row.getByRole("button", { name: "1 Display" })).toBeVisible();
    await expect(page.getByText(/^1 result/)).toBeVisible();
    expect(await axeFindings(page, "afreact-builder")).toEqual([]);
    // Dark mode: beyond the theme contrast core's own listing shares, nothing.
    await page.emulateMedia({ colorScheme: "dark" });
    const react = await axeFindings(page, "afreact-builder");
    await page.goto("/civicrm/admin/search#/list");
    await expect(page.locator("crm-search-admin-search-listing tbody tr").first()).toBeVisible();
    const angular = await axeFindings(page, "#bootstrap-theme");
    expect(ownFindings(react, angular)).toEqual([]);
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/civicrm/admin/afreact/search#/list");
    await page.getByRole("searchbox", { name: "Filter by label" }).fill("Afreact list probe");

    await row.getByRole("button", { name: "Row Actions" }).click();
    await page.getByRole("menuitem", { name: "Export Search" }).click();
    const exportDialog = page.getByRole("dialog", { name: "Export Afreact list probe" });
    await expect(exportDialog.getByRole("checkbox", { name: "1 Display" })).toBeChecked();
    const output = await exportDialog.getByRole("textbox", { name: "Export" }).inputValue();
    expect(output).toContain(NAME);
    expect(await axeFindings(page, "dialog")).toEqual([]);
    await exportDialog.getByRole("button", { name: "Close" }).click();

    await row.getByRole("button", { name: "Row Actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    const confirm = page.getByRole("dialog", { name: "Delete Afreact list probe" });
    await expect(confirm.getByText("Includes 1 display which will also be deleted.")).toBeVisible();
    await confirm.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("No Saved Searches match filter criteria.")).toBeVisible();

    await page.getByRole("button", { name: "Import" }).click();
    const importDialog = page.getByRole("dialog", { name: "Import" });
    await importDialog.getByRole("textbox", { name: "Import" }).fill(output);
    await expect(
      importDialog.getByText("1 new Saved Search will be created.", { exact: false }),
    ).toBeVisible();
    await importDialog.getByRole("button", { name: "Import" }).click();
    await expect(importDialog).toBeHidden();
    await expect(page.getByRole("row", { name: /Afreact list probe/ })).toHaveCount(1);
  });

  test("creates and deletes a search segment", async ({ page }) => {
    await page.goto("/civicrm/admin/afreact/search#/list?tab=segment");
    await page.getByRole("button", { name: "New Segment" }).click();
    const dialog = page.getByRole("dialog", { name: "New Search Segment" });
    await dialog.getByRole("textbox", { name: "Name *" }).fill("Afreact probe segment");
    await dialog.getByRole("combobox", { name: "For *" }).fill("Contacts");
    await page
      .getByRole("option", { name: /^Contacts/ })
      .first()
      .click();
    await dialog.getByRole("textbox", { name: "Label of item 1" }).fill("Any");
    await dialog.getByRole("button", { name: "Default Item" }).click();
    await dialog.getByRole("button", { name: "Remove Any" }).click();
    await dialog.getByRole("textbox", { name: "Label of item 1" }).fill("Rest");
    expect(await axeFindings(page, "dialog")).toEqual([]);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    const row = page.getByRole("row", { name: /Afreact probe segment/ });
    await expect(row.getByRole("cell", { name: "Rest" })).toBeVisible();
    await row.getByRole("button", { name: "Delete" }).click();
    await page
      .getByRole("dialog", { name: "Delete Afreact probe segment" })
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(row).toHaveCount(0);
  });
});
