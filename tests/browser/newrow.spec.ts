/**
 * The "Add Option" row of editableRow.create on the custom field options page: React creates the
 * option through SearchDisplay.inlineEdit, as core's row does, which on 6.18.1 also logs a
 * TypeError per input (upstream-bugs.md, "The Add row of editableRow.create throws").
 */
import { expect, test, type Page } from "@playwright/test";
import { api, API_PAGE, AUTH, type Renderer } from "./harness";

const LOAD = { timeout: 30_000 };
const GROUP = `afreact_newrow_${Date.now().toString(36)}`;
const rows = (page: Page) => page.locator(".afreact-render .crm-search-display table tbody tr");

let groupId = 0;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  await page.goto(API_PAGE);
  const group = await api<{ id: number }>(page, "OptionGroup", "create", {
    values: { name: GROUP, title: GROUP },
  });
  groupId = group[0]!.id;
  await api(page, "OptionValue", "create", {
    values: { option_group_id: groupId, label: "First", value: "1" },
  });
  await context.close();
});

test.afterAll(async ({ browser }) => {
  if (!groupId) return;
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  await page.goto(API_PAGE);
  await api(page, "OptionGroup", "delete", { where: [["id", "=", groupId]] });
  await context.close();
});

async function labels(page: Page): Promise<string[]> {
  const values = await api<{ label: string }>(page, "OptionValue", "get", {
    select: ["label"],
    where: [["option_group_id", "=", groupId]],
    orderBy: { weight: "ASC" },
  });
  return values.map((value) => value.label);
}

async function addOption(page: Page, renderer: Renderer, label: string, how: "enter" | "button") {
  const filter = `#?option_group_id=${String(groupId)}`;
  const url = `/civicrm/afreact/render?name=afsearchCustomFieldOptions&renderer=${renderer}`;
  await page.goto(url + filter);
  await expect(rows(page).filter({ hasText: "First" })).toBeVisible(LOAD);
  await page.getByRole("button", { name: "Add Option" }).click();
  const input = page.locator(".crm-search-add-new-column input").first();
  await input.fill(label);
  if (how === "enter") await input.press("Enter");
  else await page.locator(".crm-search-add-new-column .btn-success").click();
}

test("React adds an option through the new row; the server fills the rest", async ({ page }) => {
  await addOption(page, "react", "Second", "enter");
  await expect(rows(page).filter({ hasText: "Second" })).toBeVisible(LOAD);
  await expect(page.getByRole("button", { name: "Add Option" })).toBeFocused();
  expect(await labels(page)).toEqual(["First", "Second"]);
  const values = await api<{ value: string; weight: number }>(page, "OptionValue", "get", {
    select: ["value", "weight"],
    where: [
      ["option_group_id", "=", groupId],
      ["label", "=", "Second"],
    ],
  });
  expect(values[0]).toMatchObject({ value: "2", weight: 2 });
});

test("Angular adds an option too, but logs a TypeError per input (6.18.1)", async ({ page }) => {
  // Angular's $exceptionHandler logs the error instead of throwing it to the page.
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await addOption(page, "angular", "Third", "button");
  await expect(rows(page).filter({ hasText: "Third" })).toBeVisible(LOAD);
  expect(await labels(page)).toContain("Third");
  expect(errors.join("\n")).toContain("Cannot read properties of undefined (reading 'columns')");
});
