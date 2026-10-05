/**
 * Bulk actions on both renderers: select two rows, disable them, then delete two, and compare
 * the table and the records afterwards. The demo display lists groups the test creates.
 */
import { expect, test, type Page } from "@playwright/test";
import { api, AUTH, type Renderer } from "./harness";

const RUN = Date.now().toString(36);
const PREFIX = "afreact_actions_";

const render = (renderer: Renderer) =>
  `/civicrm/afreact/render?name=afsearchAfreactDemoGroups&renderer=${renderer}`;

interface Group {
  title: string;
  is_active: boolean;
}

async function groups(page: Page): Promise<Group[]> {
  // APIv4 returns the id with every selection.
  const found = await api<Group>(page, "Group", "get", {
    select: ["title", "is_active"],
    where: [["name", "LIKE", `${PREFIX}%`]],
    orderBy: { title: "ASC" },
  });
  return found.map(({ title, is_active }) => ({ title, is_active }));
}

async function removeGroups(page: Page) {
  await page.goto("/civicrm/afreact/compare");
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

async function runTask(page: Page, titles: string[], task: string) {
  for (const title of titles) await row(page, title).locator(".crm-search-ctrl-select-row").check();
  await expect(page.locator(".afreact-render")).toContainText(
    `${String(titles.length)} selected of`,
  );
  await page.locator(".afreact-render .crm-search-task-menu").click();
  await page.locator(".afreact-render .dropdown-menu a", { hasText: task }).click();
  // Disable and delete ask first; the confirm button carries the task's title.
  await page.getByRole("button", { name: task }).click();
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

    await runTask(page, [a, b], "Disable Groups");
    await expect(row(page, a)).toContainText("No", LOAD);
    await expect(row(page, b)).toContainText("No");
    await expect(row(page, c)).toContainText("Yes");
    await expect(table(page).locator(".crm-search-ctrl-select-row:checked")).toHaveCount(0);
    expect(await groups(page)).toEqual([
      { title: a, is_active: false },
      { title: b, is_active: false },
      { title: c, is_active: true },
    ]);

    await runTask(page, [a, c], "Delete Groups");
    await expect(row(page, a)).toHaveCount(0, LOAD);
    await expect(row(page, c)).toHaveCount(0);
    await expect(table(page).locator("tbody tr")).toHaveCount(1);
    expect(await groups(page)).toEqual([{ title: b, is_active: false }]);
  });
}
