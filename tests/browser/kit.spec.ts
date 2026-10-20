/**
 * Another extension's module built on the kit (afreactdemo's js/kit-consumer.js): beside an
 * afreact form, on a page of its own and in a snippet, core's import map resolves `afreact/`,
 * everything runs on one React, and the kit's components work and pass axe.
 */
import { expect, test, type Page } from "@playwright/test";
import { axeFindings, isRecord, ownFindings } from "./harness";

const PAGE = "/civicrm/afreact/kit";
const REACT_CHUNK = /\/ext\/afreact\/dist\/chunks\/react-[\w-]+\.js(\?.*)?$/;

/** Opens a page once the consumer is drawn; collects the page's errors. */
async function open(page: Page, path = PAGE): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(path);
  await expect(page.getByRole("heading", { name: "Segment" })).toBeVisible();
  if (path === PAGE)
    await expect(page.locator("afreact-form af-field input").first()).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Field" })).toBeEnabled();
  return errors;
}

/** The URLs the page fetched. */
const fetched = (page: Page) =>
  page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name));

/** A module runs once per URL: one URL, query included, is one React. */
const reactUrls = (loaded: string[]) => [...new Set(loaded.filter((url) => REACT_CHUNK.test(url)))];

const count = (page: Page) => page.locator("#afreact-kit-consumer .badge");

test("the consumer module and the afreact form share one React", async ({ page }) => {
  const errors = await open(page);
  const map: unknown = JSON.parse(
    (await page.locator("script[type=importmap]").textContent()) ?? "null",
  );
  const imports = isRecord(map) && isRecord(map.imports) ? map.imports : {};
  // Each module with core's cache code, which a flush after an upgrade renews.
  expect(String(imports["afreact/kit.js"])).toMatch(/\/ext\/afreact\/dist\/kit\/kit\.js\?r=\w+$/);
  expect(String(imports["afreact/react.js"])).toMatch(/\/dist\/kit\/react\.js\?r=\w+$/);
  expect(imports["afreact/"]).toBeUndefined();
  const loaded = await fetched(page);
  expect(reactUrls(loaded)).toHaveLength(1);
  expect(loaded.some((url) => url.includes("/ext/afreact/dist/afreact.js"))).toBe(true);
  expect(loaded.some((url) => url.includes("/ext/afreact/dist/kit/kit.js?r="))).toBe(true);
  expect(errors).toEqual([]);
});

/** Picks the contact type Organization and waits for the count the API gives. */
async function countOrganizations(page: Page) {
  const field = page.getByRole("combobox", { name: "Field" });
  await field.click();
  await field.fill("Contact Type");
  await page.getByRole("option", { name: /^Contact Type/ }).click();
  await page.getByLabel("Value for Contact Type").selectOption({ label: "Organization" });
  const organizations = await page.evaluate(async () => {
    const result: unknown = await window.CRM.api4("Contact", "get", {
      select: ["row_count"],
      where: [["contact_type:name", "=", "Organization"]],
    });
    return Array.isArray(result) && "count" in result ? result.count : null;
  });
  await expect(count(page)).toHaveText(`${String(organizations)} contacts`);
}

test("the kit works on a page without afreact's own bundle", async ({ page }) => {
  const errors = await open(page, "/civicrm/afreact/kit-only");
  await countOrganizations(page);
  const loaded = await fetched(page);
  expect(reactUrls(loaded)).toHaveLength(1);
  expect(loaded.some((url) => url.includes("/ext/afreact/dist/afreact.js"))).toBe(false);
  expect(errors).toEqual([]);
});

test("the consumer's element mounts in a snippet with the module the outer page loaded", async ({
  page,
}) => {
  const errors = await open(page, "/civicrm/afreact/kit-host");
  await expect(page.locator("#afreact-kit-host #afreact-kit-consumer")).toBeVisible();
  await countOrganizations(page);
  expect(reactUrls(await fetched(page))).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("the kit's field picker, condition, count, notice and dialog work in the consumer", async ({
  page,
}) => {
  const errors = await open(page);
  await expect(page.locator("#afreact-kit-consumer [role=status]").first()).toContainText(
    "Pick a field",
  );
  await expect(count(page)).toHaveText(/^\d+ contacts$/);

  const field = page.getByRole("combobox", { name: "Field" });
  await field.click();
  await field.fill("Birth");
  await page.getByRole("option", { name: /^Birth Date/ }).click();
  await expect(page.getByRole("combobox", { name: "Operator for Birth Date" })).toBeVisible();
  await page.getByLabel("Value for Birth Date").selectOption("range");
  // The ranges are core's relative_date_filters.
  const ranges = page.locator("#afreact-kit-consumer .afreact-date-input select").nth(1);
  await expect(ranges.locator("option[value='this.year']")).toBeAttached();
  await ranges.selectOption("this.year");
  await expect(count(page)).toHaveText(/^\d+ contacts$/);

  await countOrganizations(page);

  const explain = page.getByRole("button", { name: "Explain" });
  await explain.click();
  const dialog = page.getByRole("dialog", { name: "Explanation" });
  await expect(dialog).toContainText("contact_type");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(explain).toBeFocused();
  expect(errors).toEqual([]);
});

for (const colorScheme of ["light", "dark"] as const)
  test(`axe finds nothing on the kit's components beyond the theme contrast core shares (${colorScheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await open(page);
    const field = page.getByRole("combobox", { name: "Field" });
    await field.click();
    await field.fill("Birth");
    await page.getByRole("option", { name: /^Birth Date/ }).click();
    await expect(count(page)).toHaveText(/^\d+ contacts$/);
    const kit = await axeFindings(page, "#afreact-kit-consumer");
    // Core's settings form in the same theme.
    await page.goto("/civicrm/admin/setting/afreact");
    await page.locator(".crm-container form .crm-button").first().waitFor();
    const core = await axeFindings(page, ".crm-container form");
    expect(ownFindings(kit, core), "findings core's settings form does not share").toEqual([]);
  });
