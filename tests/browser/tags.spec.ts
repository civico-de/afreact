/**
 * The tag task on the contacts demo (an Individual search): React adds and removes tags through
 * EntityTag batches as core's dialog does on a Contact search. Core's own dialog looks tags up
 * for "Individual" and so offers none here (upstream-bugs.md, "The tag dialog offers no tags on a
 * contact-type search").
 */
import { expect, type Page } from "@playwright/test";
import { test } from "./coverage";
import { api, API_PAGE, AUTH } from "./harness";

const RUN = Date.now().toString(36);
const LOAD = { timeout: 30_000 };
const LAST_NAME = `Tags${RUN}`;
const render = (renderer: string) =>
  `/civicrm/afreact/render?name=afsearchAfreactDemoContacts&renderer=${renderer}#?last_name=${LAST_NAME}`;

const contacts: number[] = [];
let tagId = 0;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  await page.goto(API_PAGE);
  const [tag] = await api<{ id: number }>(page, "Tag", "create", {
    values: { name: `afreact_tags_${RUN}`, label: `Afreact ${RUN}`, used_for: ["civicrm_contact"] },
  });
  tagId = tag!.id;
  const created = await api<{ id: number }>(page, "Individual", "save", {
    records: ["Aa", "Bb"].map((first) => ({ first_name: first, last_name: LAST_NAME })),
  });
  contacts.push(...created.map((contact) => contact.id));
  await context.close();
});

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  await page.goto(API_PAGE);
  if (contacts.length)
    await api(page, "Contact", "delete", { where: [["id", "IN", contacts]], useTrash: false });
  if (tagId) await api(page, "Tag", "delete", { where: [["id", "=", tagId]] });
  await context.close();
});

/** The contacts of this run carrying the tag, by id. */
async function tagged(page: Page): Promise<number[]> {
  const rows = await api<{ entity_id: number }>(page, "EntityTag", "get", {
    select: ["entity_id"],
    where: [
      ["tag_id", "=", tagId],
      ["entity_id", "IN", contacts],
    ],
  });
  return rows.map((row) => row.entity_id).sort((a, b) => a - b);
}

async function openTagDialog(page: Page, renderer: string) {
  await page.goto(render(renderer));
  const rows = page.locator(".afreact-render tbody tr");
  await expect(rows).toHaveCount(2, LOAD);
  for (const row of await rows.all()) await row.locator(".crm-search-ctrl-select-row").check();
  await page.locator(".afreact-render .crm-search-task-menu").click();
  await page.locator(".afreact-render .dropdown-menu a", { hasText: "Tag" }).click();
}

test("React adds and removes a tag on the selected contacts", async ({ page }) => {
  await openTagDialog(page, "react");
  const dialog = page.getByRole("dialog", { name: "Tag - Add/Remove Tags" });
  await dialog.getByRole("listbox", { name: "Tags" }).selectOption({ label: `Afreact ${RUN}` });
  await dialog.getByRole("button", { name: "Add tags" }).click();
  await expect(dialog).toBeHidden(LOAD);
  await expect.poll(() => tagged(page), LOAD).toEqual([...contacts].sort((a, b) => a - b));

  await openTagDialog(page, "react");
  await dialog.getByRole("radio", { name: "Remove Tags" }).check();
  await dialog.getByRole("listbox", { name: "Tags" }).selectOption({ label: `Afreact ${RUN}` });
  await dialog.getByRole("button", { name: "Remove tags" }).click();
  await expect(dialog).toBeHidden(LOAD);
  await expect.poll(() => tagged(page), LOAD).toEqual([]);
});

test("core's dialog lists no tags on an Individual search (6.18.1)", async ({ page }) => {
  await openTagDialog(page, "angular");
  const dialog = page.locator(".ui-dialog", { hasText: "Tag - Add/Remove Tags" });
  await expect(dialog.locator("#crm-search-task-tag-tag")).toBeAttached(LOAD);
  const options = await dialog.locator("#crm-search-task-tag-tag").evaluate((input) => {
    const select2: unknown = window.CRM.$(input).data("select2");
    const isObject = (value: unknown): value is object =>
      typeof value === "object" && value !== null;
    const opts: unknown = isObject(select2) ? Reflect.get(select2, "opts") : null;
    const data: unknown = isObject(opts) ? Reflect.get(opts, "data") : null;
    return Array.isArray(data) ? data.length : null;
  });
  expect(options).toBe(0);
});
