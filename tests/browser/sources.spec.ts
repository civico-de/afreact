/**
 * The layout sources of <afreact-form> must be interchangeable: the demo page
 * renders to the same DOM whether the layout comes from Afreact.getForm, from
 * the page, or from the compiled Angular module file.
 */
import { expect, test, type Page } from "@playwright/test";
import { isReady } from "../../src/compare/metrics";

async function rendered(page: Page, source: string): Promise<string> {
  await page.goto(`/civicrm/afreact/demo${source === "api" ? "" : `?source=${source}`}`);
  await page.waitForFunction(`(${isReady.toString()})(document)`);
  await page.waitForLoadState("networkidle");
  const html = await page.locator(".afreact-demo").innerHTML();
  return html.replaceAll(` source="${source}"`, "");
}

test("every layout source renders the demo page identically", async ({ page }) => {
  const api = await rendered(page, "api");
  expect(api).toContain("<form novalidate");
  expect(api).not.toContain("crm-admin-block-context-dropdown");
  for (const source of ["page", "bundle"]) {
    expect(await rendered(page, source), source).toBe(api);
  }
});

test("page and bundle sources never call getForm", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await rendered(page, "page");
  expect(requests.filter((url) => /angular-modules|Afreact\/getForm/.test(url))).toEqual([]);
  requests.length = 0;
  await rendered(page, "bundle");
  expect(requests.filter((url) => url.includes("angular-modules"))).toHaveLength(1);
  expect(requests.filter((url) => url.includes("Afreact/getForm"))).toEqual([]);
});
