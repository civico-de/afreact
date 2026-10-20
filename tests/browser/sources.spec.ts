/**
 * The layout sources of <afreact-form> must be interchangeable: the demo page
 * renders to the same DOM whether the layout comes from Afreact.getForm, from
 * the page, or from the compiled Angular module file.
 */
import { expect, type Page } from "@playwright/test";
import { test } from "./coverage";
import { isReady } from "../../src/compare/metrics";
import { axeFindings } from "./harness";

async function rendered(page: Page, source: string): Promise<string> {
  await page.goto(`/civicrm/afreact/demo${source === "api" ? "" : `?source=${source}`}`);
  await page.waitForFunction(`(${isReady.toString()})(document)`);
  await page.waitForLoadState("networkidle");
  const html = await page.locator(".afreact-demo").innerHTML();
  return numberIds(html.replaceAll(` source="${source}"`, ""));
}

/** React's useId() counts in mount order, which with `api` is the order the layouts arrive in. */
function numberIds(html: string): string {
  const ids = new Map<string, string>();
  return html.replaceAll(/_r_[0-9a-z]+_/g, (id) => {
    const numbered = ids.get(id) ?? `_r_${ids.size}_`;
    ids.set(id, numbered);
    return numbered;
  });
}

test("every layout source renders the demo page identically", async ({ page }) => {
  const api = await rendered(page, "api");
  expect(api).toContain("<form novalidate");
  expect(api).toContain("crm-admin-block-context-dropdown");
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

/** afform_admin's edit menus in `scope`: each one's links as text and address. */
async function editMenus(page: Page, scope: string) {
  return page
    .locator(`${scope} .crm-admin-block-context-dropdown`)
    .evaluateAll((menus) =>
      menus.map((menu) =>
        [...menu.querySelectorAll("li a")].map((link) => [
          link.textContent.replaceAll(/\s+/g, " ").trim(),
          link.getAttribute("href"),
        ]),
      ),
    );
}

test("the edit menus offer an admin the links Angular's do", async ({ page }) => {
  // The form's own route, where core's Angular runtime renders it.
  await page.goto("/civicrm/afreact/demo-angular");
  await expect(
    page.locator("afform-afreact-demo-contact .crm-admin-block-context-dropdown").first(),
  ).toBeAttached();
  const angular = await editMenus(page, "afform-afreact-demo-contact");
  expect(angular.flat().map(([text]) => text)).toContain(
    "Edit Afreact demo contact in FormBuilder",
  );
  await rendered(page, "api");
  const form = '[aria-labelledby="afreact-demo-form"]';
  expect(await editMenus(page, form)).toEqual(angular);

  await page.locator(form).getByRole("button", { name: "Configure" }).last().click();
  const edit = page.getByRole("menuitem", { name: "Edit Afreact demo contact in FormBuilder" });
  await expect(edit).toBeVisible();
  await expect(edit.locator("em")).toHaveText("Afreact demo contact");
  await expect(edit).toHaveAttribute("target", "_blank");
  expect(await axeFindings(page, ".crm-admin-block-context-dropdown.open")).toEqual([]);
});
