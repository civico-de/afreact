import { expect, test } from "@playwright/test";
import { axeFindings, debugOn, debugPanel, quietApi } from "./harness";

const setBuilders = (page: import("@playwright/test").Page, builders: string[]) =>
  quietApi(page, "Setting", "set", { values: { afreact_builders: builders } });

test.describe("builder pages", () => {
  test.afterEach(async ({ page }) => {
    await setBuilders(page, []);
  });

  test("the own route's debug panel links each screen to the classic builder", async ({ page }) => {
    await debugOn(page);
    await page.goto("/civicrm/admin/afreact/search#/edit/1");
    expect(await axeFindings(page, "afreact-builder")).toEqual([]);
    const classic = (await debugPanel(page)).getByRole("link", {
      name: "Open in the classic builder",
    });
    await expect(classic).toHaveAttribute("href", /\/civicrm\/admin\/search#\/edit\/1$/);
  });

  test("the settings page offers SearchKit and FormBuilder", async ({ page }) => {
    await page.goto("/civicrm/admin/setting/afreact");
    const options = page.locator(
      "select[name='afreact_builders[]'] option, select[name='afreact_builders'] option",
    );
    await expect(options).toHaveText(["SearchKit", "FormBuilder"]);
  });

  test("FormBuilder taken over opens React at core's routes, core's builder at the classic ones", async ({
    page,
  }) => {
    await setBuilders(page, ["afform"]);
    await debugOn(page);
    await page.goto("/civicrm/admin/afform#/list");
    await expect(page.locator("afreact-builder")).toBeVisible();
    await expect(page.locator("[ng-app], .ng-scope")).toHaveCount(0);
    await page.goto("/civicrm/admin/afform#/edit/afformQuickAddIndividual");
    await expect(page.locator("#afGuiEditor-canvas-body")).toBeVisible({ timeout: 30_000 });
    await expect(
      (await debugPanel(page)).getByRole("link", { name: "Open in the classic builder" }),
    ).toHaveAttribute(
      "href",
      /\/civicrm\/admin\/afform\/classic#\/edit\/afformQuickAddIndividual$/,
    );
    await page.goto("/civicrm/admin/afform/classic#/edit/afformQuickAddIndividual");
    await expect(page.locator("af-gui-editor")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("afreact-builder")).toHaveCount(0);
    await page.goto("/civicrm/admin/afform/submissions?name=afformQuickAddIndividual");
    await expect(page.locator("afreact-builder")).toBeVisible();
  });

  test("a builder taken over opens React at core's route, core's builder at the classic one", async ({
    page,
  }) => {
    await setBuilders(page, ["search_kit"]);
    await debugOn(page);
    await page.goto("/civicrm/admin/search#/list");
    await expect(page.locator("afreact-builder")).toBeVisible();
    await expect(page.locator("[ng-app], .ng-scope")).toHaveCount(0);
    await page.goto("/civicrm/admin/search/classic#/list");
    await expect(
      page.locator("crm-search-admin-search-listing, [ng-view] .ng-scope").first(),
    ).toBeVisible();
    await expect(page.locator("afreact-builder")).toHaveCount(0);
    await page.goto("/civicrm/admin/search#/list");
    await expect(
      (await debugPanel(page)).getByRole("link", { name: "Open in the classic builder" }),
    ).toHaveAttribute("href", /\/civicrm\/admin\/search\/classic#\/list$/);
  });
});
