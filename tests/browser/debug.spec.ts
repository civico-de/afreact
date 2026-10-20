/**
 * The viewer's debug mode: off by default, switched on the support page; then a floating button on
 * the builders and forms React renders opens a panel with the classic builder or Angular one link
 * away, and what the page runs: Angular islands, other extensions' modules and elements, SQL.
 */
import { expect, type Page } from "@playwright/test";
import { test } from "./coverage";
import { axeFindings, coreBuilders, debugOn, debugPanel, ownFindings } from "./harness";

coreBuilders();

const debugButton = (page: Page) => page.getByRole("button", { name: "Debug", exact: true });

test("without the switch the builder has no debug button and no classic link", async ({ page }) => {
  await page.goto("/civicrm/admin/afreact/search#/list");
  await expect(page.locator("afreact-builder table").first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(debugButton(page)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open in the classic builder" })).toHaveCount(0);
});

test("the support page's switch brings the button, whose panel links the classic builder", async ({
  page,
}) => {
  await page.goto("/civicrm/admin/afreact");
  await page.getByRole("checkbox", { name: /Show a debug button/ }).check();
  await page.goto("/civicrm/admin/afreact/search#/list");
  const builder = (await debugPanel(page)).getByRole("region", { name: "Builder" });
  await expect(builder.getByRole("link", { name: "Open in the classic builder" })).toHaveAttribute(
    "href",
    /\/civicrm\/admin\/search#\/list$/,
  );
  await expect(builder).toContainText("civicrm/admin/search#/list");
  // The dev stack's one foreign extension brings its modules to the SearchKit builder.
  await expect(builder).toContainText("afreactIslandAdmin");
  await expect(debugButton(page)).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(builder).toHaveCount(0);
  await expect(debugButton(page)).toBeFocused();
});

test("the panel names the Angular island a display editor runs", async ({ page }) => {
  await debugOn(page);
  const params = { version: 4, select: ["id", "label"], orderBy: {}, where: [] };
  await page.goto(
    `/civicrm/admin/afreact/search#/create/Tag?label=Afreact+debug+probe&params=${encodeURIComponent(JSON.stringify(params))}`,
  );
  await page.getByRole("button", { name: "Add..." }).click();
  await page.getByRole("menuitem", { name: "Island", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Island note" })).toBeVisible();
  const builder = (await debugPanel(page)).getByRole("region", { name: "Builder" });
  await expect(builder).toContainText("Angular islandssearch-admin-display-afreact-island");
});

test("a form's panel gives its layout source, its displays' SQL and the form under Angular", async ({
  page,
}) => {
  await debugOn(page);
  // A contact summary tab's search form: the render page picks the user's own contact.
  await page.goto("/civicrm/afreact/render?name=afsearchTabNote&renderer=react");
  await expect(page.locator(".afreact-render afreact-form > div")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  const form = (await debugPanel(page)).getByRole("region", { name: "Form afsearchTabNote" });
  await expect(form).toContainText("Layout sourcepage");
  await expect(form).toContainText("Search displays");
  await expect(form.locator("dt", { hasText: /^SQL of / })).not.toHaveCount(0);
  await expect(
    form
      .locator("dd")
      .filter({ hasText: /SELECT/ })
      .first(),
  ).toBeVisible();
  await form.getByRole("link", { name: "Open with Angular" }).click();
  await expect(page).toHaveURL(/renderer=angular/);
  await expect(page.locator("afsearch-tab-note")).toBeVisible();
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`axe finds nothing in the panel beyond the theme contrast core shares (${colorScheme})`, async ({
    page,
  }) => {
    await debugOn(page);
    await page.emulateMedia({ colorScheme });
    await page.goto("/civicrm/admin/afreact/search#/list");
    await debugPanel(page);
    await expect(page.locator("#afreact-debug-panel")).toBeVisible();
    const shown = await axeFindings(page, ".afreact-debug-host");
    // Core's settings form in the same theme: its Save button is the Debug button's twin.
    await page.goto("/civicrm/admin/setting/afreact");
    await expect(page.locator(".crm-container form .crm-button").first()).toBeVisible();
    const core = await axeFindings(page, ".crm-container form");
    expect(ownFindings(shown, core), "findings the core settings form does not share").toEqual([]);
  });
}
