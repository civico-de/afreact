/**
 * Bulk actions on both renderers: select two rows, download them, update them, disable them,
 * then delete two, and compare the table and the records afterwards. The demo display lists
 * groups the test creates.
 */
import { expect, test, type Page } from "@playwright/test";
import { text } from "node:stream/consumers";
import { api, API_PAGE, AUTH, type Renderer } from "./harness";

const RUN = Date.now().toString(36);
const PREFIX = "afreact_actions_";

const render = (renderer: Renderer) =>
  `/civicrm/afreact/render?name=afsearchAfreactDemoGroups&renderer=${renderer}`;

interface Group {
  title: string;
  is_active: boolean;
  description: string | null;
}

async function groups(page: Page): Promise<Group[]> {
  // APIv4 returns the id with every selection.
  const found = await api<Group>(page, "Group", "get", {
    select: ["title", "is_active", "description"],
    where: [["name", "LIKE", `${PREFIX}%`]],
    orderBy: { title: "ASC" },
  });
  return found.map(({ title, is_active, description }) => ({ title, is_active, description }));
}

async function removeGroups(page: Page) {
  await page.goto(API_PAGE);
  await api(page, "Group", "delete", { where: [["name", "LIKE", `${PREFIX}%`]] });
}

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: AUTH });
  await removeGroups(await context.newPage());
  await context.close();
});

const LOAD = { timeout: 30_000 };
const table = (page: Page) => page.locator(".afreact-render .crm-search-display table");
const row = (page: Page, title: string) => table(page).locator("tbody tr", { hasText: title });

async function openTask(page: Page, titles: string[], task: string) {
  for (const title of titles) await row(page, title).locator(".crm-search-ctrl-select-row").check();
  await expect(page.locator(".afreact-render")).toContainText(
    `${String(titles.length)} selected of`,
  );
  await page.locator(".afreact-render .crm-search-task-menu").click();
  await page.locator(".afreact-render .dropdown-menu a", { hasText: task }).click();
}

async function runTask(page: Page, titles: string[], task: string, confirm = task) {
  await openTask(page, titles, task);
  // Disable and delete ask first; the confirm button carries the task's title.
  await page.getByRole("button", { name: confirm }).click();
}

/** The update dialog's field picker: a native select on React, select2 on Angular. */
async function pickUpdateField(page: Page, renderer: Renderer, label: string) {
  if (renderer === "react") {
    await page.getByRole("combobox", { name: "Add Value" }).selectOption({ label });
    await page.getByRole("dialog").getByRole("button", { name: "Add" }).click();
    return;
  }
  // The picker is disabled until the fields have loaded.
  await page.locator(".ui-dialog .select2-container:not(.select2-container-disabled)").click();
  await page.locator("#select2-drop input.select2-input").pressSequentially(label);
  await page.locator("#select2-drop .select2-result-label", { hasText: label }).first().click();
}

for (const renderer of ["react", "angular"] as const) {
  test(`${renderer}: disables and deletes the selected rows`, async ({ page }) => {
    await removeGroups(page);
    const titles = ["A", "B", "C"].map((letter) => `Actions ${RUN} ${letter}`);
    await api(page, "Group", "save", {
      records: titles.map((title, index) => ({
        title,
        name: `${PREFIX}${RUN}_${String(index)}`,
        is_active: true,
      })),
    });
    const [a = "", b = "", c = ""] = titles;
    await page.goto(render(renderer));
    await expect(row(page, c)).toBeVisible(LOAD);

    const download = page.waitForEvent("download");
    await runTask(page, [a, b], "Download Spreadsheet", "Download");
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.csv$/);
    // A stream, not path(): the browser may run on a remote server.
    const lines = (await text(await file.createReadStream())).trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines.slice(1).join("\n")).toContain(a);
    expect(lines.slice(1).join("\n")).toContain(b);
    expect(lines.join("\n")).not.toContain(c);
    await expect(page.locator(".afreact-render .crm-search-task-dialog, .ui-dialog")).toHaveCount(
      0,
      LOAD,
    );
    // A download leaves the selection as it is.
    await expect(table(page).locator(".crm-search-ctrl-select-row:checked")).toHaveCount(2);
    for (const title of [a, b])
      await row(page, title).locator(".crm-search-ctrl-select-row").uncheck();

    await openTask(page, [a, b], "Update Groups");
    await pickUpdateField(page, renderer, "Group Description");
    // Angular's value input carries no label (comparison.md, "Update dialog").
    const value =
      renderer === "react"
        ? page.getByRole("dialog").getByRole("textbox", { name: "Group Description" })
        : page.locator(".ui-dialog crm-search-input textarea");
    await value.fill("Updated");
    await page.getByRole("button", { name: "Update Groups" }).click();
    await expect(table(page).locator(".crm-search-ctrl-select-row:checked")).toHaveCount(0, LOAD);
    expect(await groups(page)).toEqual([
      { title: a, is_active: true, description: "Updated" },
      { title: b, is_active: true, description: "Updated" },
      { title: c, is_active: true, description: null },
    ]);

    await runTask(page, [a, b], "Disable Groups");
    await expect(row(page, a)).toContainText("No", LOAD);
    await expect(row(page, b)).toContainText("No");
    await expect(row(page, c)).toContainText("Yes");
    await expect(table(page).locator(".crm-search-ctrl-select-row:checked")).toHaveCount(0);
    expect(await groups(page)).toEqual([
      { title: a, is_active: false, description: "Updated" },
      { title: b, is_active: false, description: "Updated" },
      { title: c, is_active: true, description: null },
    ]);

    await runTask(page, [a, c], "Delete Groups");
    await expect(row(page, a)).toHaveCount(0, LOAD);
    await expect(row(page, c)).toHaveCount(0);
    await expect(table(page).locator("tbody tr")).toHaveCount(1);
    expect(await groups(page)).toEqual([{ title: b, is_active: false, description: "Updated" }]);
  });
}
