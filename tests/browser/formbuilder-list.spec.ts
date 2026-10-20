/**
 * FormBuilder's listing in React against core's: the same rows per tab, the placement column
 * and the choices of the "New" menus.
 */
import { expect, type Page } from "@playwright/test";
import { test } from "./coverage";
import { api, axeFindings, coreBuilders } from "./harness";

coreBuilders();

const NAME = "afformAfreactListProbe";
const TITLE = "Afreact list probe";
// A form the filter leaves out, so the filtered rows differ from the first, unfiltered ones.
const DECOY = "afformAfreactListDecoy";
const REACT = "/civicrm/admin/afreact/afform";
const ANGULAR = "/civicrm/admin/afform";

const squash = (texts: string[]) => texts.map((text) => text.replaceAll(/\s+/g, " ").trim());

async function rows(page: Page, filter: string) {
  await page.getByPlaceholder("Search by name...").locator("visible=true").fill(filter);
  const body = page.locator("table:visible tbody");
  // The filtered run has shown its rows: no loading placeholder, no decoy, the probe alone.
  await expect(body.locator("tr")).toHaveText([new RegExp(TITLE)]);
  return squash(await body.locator("tr").allInnerTexts());
}

/** The choices of the visible "New" menu, opened by its toggle. */
async function choices(page: Page, type: string) {
  await page.locator(".btn.dropdown-toggle:visible", { hasText: `New ${type}` }).click();
  const menu = page.locator(".dropdown-menu:visible");
  await expect(menu.locator("li a[href^='#']").first()).toBeVisible();
  return menu.locator("li").evaluateAll((items) =>
    items.flatMap((item) => {
      if (item.classList.contains("divider")) return ["---"];
      const link = item.querySelector("a[href^='#']");
      return link
        ? [`${link.textContent.replaceAll(/\s+/g, " ").trim()} ${link.getAttribute("href")}`]
        : [];
    }),
  );
}

test.describe("FormBuilder listing", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(REACT);
    await api(page, "Afform", "revert", { where: [["name", "IN", [NAME, DECOY]]] });
    await api(page, "Afform", "create", {
      values: { name: DECOY, type: "form", title: "Afreact list decoy", is_public: false },
    });
    await api(page, "Afform", "create", {
      values: {
        name: NAME,
        type: "form",
        title: TITLE,
        server_route: "civicrm/afreact-list-probe",
        is_public: false,
        placement: ["contact_summary_tab", "dashboard_dashlet"],
        layout: '<af-form ctrl="afform"><p>Probe</p></af-form>',
      },
    });
  });
  test.afterEach(async ({ page }) => {
    await api(page, "Afform", "revert", { where: [["name", "IN", [NAME, DECOY]]] });
  });

  test("shows the rows and placements core's listing shows", async ({ page }) => {
    await page.goto(ANGULAR);
    const angular = await rows(page, TITLE);
    await page.goto(REACT);
    const react = await rows(page, TITLE);
    expect(react).toEqual(angular);
    const row = page.locator("table:visible tbody tr", { hasText: TITLE });
    await expect(row.getByRole("link", { name: "civicrm/afreact-list-probe" })).toHaveAttribute(
      "href",
      /\/civicrm\/afreact-list-probe$/,
    );
    await expect(row.locator("td li")).toHaveText([
      "civicrm/afreact-list-probe",
      "Contact Summary Tab",
      "Dashboard Dashlet",
    ]);
    expect(await axeFindings(page, "afreact-builder")).toEqual([]);
  });

  test("offers the choices core's New menus offer, primary entities sorted", async ({ page }) => {
    const tabs = [
      ["Submission Forms", "Submission Form"],
      ["Field Blocks", "Field Block"],
      ["Search Forms", "Search Form"],
    ];
    const angular: string[][] = [];
    await page.goto(ANGULAR);
    for (const [tab, type] of tabs) {
      await page.getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
      angular.push(await choices(page, type ?? ""));
      await page.keyboard.press("Escape");
    }
    await page.goto(REACT);
    for (const [index, [tab, type]] of tabs.entries()) {
      await page.getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
      const react = await choices(page, type ?? "");
      // Core means to sort the form choices by label, but sorts by a key they lack.
      const expected = index === 0 ? [...(angular[0] ?? [])].sort() : angular[index];
      expect(react, tab).toEqual(expected);
      expect(await axeFindings(page, "af-admin-list-menu"), tab).toEqual([]);
      await page.keyboard.press("Escape");
    }
  });

  test("keeps the filter within reach of the keyboard", async ({ page }) => {
    await page.goto(REACT);
    await page.getByRole("tab", { name: /^Search Forms/ }).click();
    const button = page.locator(".btn.dropdown-toggle:visible", { hasText: "New Search Form" });
    await button.focus();
    await page.keyboard.press("ArrowDown");
    // The list loads after opening; its filter then takes the focus.
    const filter = page.getByRole("searchbox", { name: "Filter" });
    await expect(filter).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Shift+Tab");
    await expect(filter).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(button).toBeFocused();
    await expect(filter).toBeHidden();
  });
});
