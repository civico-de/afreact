import { expect, test } from "@playwright/test";
import { axeFindings, quietApi } from "./harness";

const setBuilders = (page: import("@playwright/test").Page, builders: string[]) =>
  quietApi(page, "Setting", "set", { values: { afreact_builders: builders } });

test.describe("builder pages", () => {
  test.afterEach(async ({ page }) => {
    await setBuilders(page, []);
  });

  test("the own route links each screen to the classic builder", async ({ page }) => {
    await page.goto("/civicrm/admin/afreact/search#/edit/1");
    const classic = page.getByRole("link", { name: "Open in the classic builder" });
    await expect(classic).toHaveAttribute("href", /\/civicrm\/admin\/search\/classic#\/edit\/1$/);
    expect(await axeFindings(page, "afreact-builder")).toEqual([]);
  });

  test("a builder taken over opens React at core's route, core's builder at the classic one", async ({
    page,
  }) => {
    await setBuilders(page, ["search_kit"]);
    await page.goto("/civicrm/admin/search#/list");
    await expect(page.locator("afreact-builder")).toBeVisible();
    await expect(page.locator("[ng-app], .ng-scope")).toHaveCount(0);
    await page.goto("/civicrm/admin/search/classic#/list");
    await expect(
      page.locator("crm-search-admin-search-listing, [ng-view] .ng-scope").first(),
    ).toBeVisible();
    await expect(page.locator("afreact-builder")).toHaveCount(0);
  });
});
