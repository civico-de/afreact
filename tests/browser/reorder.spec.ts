/**
 * Drag to reorder: options of a group the test creates, moved by keyboard (React only; core's
 * table has no keyboard path) and by pointer on both renderers, checked in the stored weights.
 */
import { expect, test, type Page } from "@playwright/test";
import { api, API_PAGE, AUTH, keysListened, type Renderer } from "./harness";

const GROUP = "afreact_demo_order";
const LABELS = ["Order A", "Order B", "Order C"];

const render = (renderer: Renderer) =>
  `/civicrm/afreact/render?name=afsearchAfreactDemoOrder&renderer=${renderer}`;

/** The labels by stored weight, and the weights, which stay 1, 2, 3. */
async function stored(page: Page): Promise<{ label: string; weight: number }[]> {
  const found = await api<{ label: string; weight: number }>(page, "OptionValue", "get", {
    select: ["label", "weight"],
    where: [["option_group_id:name", "=", GROUP]],
    orderBy: { weight: "ASC" },
  });
  return found.map(({ label, weight }) => ({ label, weight }));
}
const order = (labels: string[]) => labels.map((label, index) => ({ label, weight: index + 1 }));

async function removeGroup(page: Page) {
  await page.goto(API_PAGE);
  await api(page, "OptionValue", "delete", { where: [["option_group_id:name", "=", GROUP]] });
  await api(page, "OptionGroup", "delete", { where: [["name", "=", GROUP]] });
}

async function createGroup(page: Page) {
  await removeGroup(page);
  await api(page, "OptionGroup", "create", { values: { name: GROUP, title: GROUP } });
  await api(page, "OptionValue", "save", {
    records: LABELS.map((label, index) => ({
      "option_group_id:name": GROUP,
      label,
      value: String(index + 1),
      weight: index + 1,
    })),
  });
}

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: AUTH });
  await removeGroup(await context.newPage());
  await context.close();
});

const LOAD = { timeout: 30_000 };
const rows = (page: Page) => page.locator(".afreact-render .crm-search-display table tbody tr");
const row = (page: Page, label: string) => rows(page).filter({ hasText: label });
// dnd-kit's live region at the end of the body.
const announced = (page: Page) => page.locator('[id^="DndLiveRegion"]');
/** The pick-up is announced before dnd-kit has measured the rows; arrow keys work only after. */
const measured = async (page: Page, label: string) => {
  await expect(row(page, label)).toHaveAttribute("data-over");
  await keysListened(page);
};
async function shown(page: Page) {
  const texts = await rows(page).locator('[data-field-name="label"]').allTextContents();
  return texts.map((text) => text.trim());
}

/** Drags a row by its handle onto the row of `onto` with the mouse, in small steps. */
async function pointerMove(page: Page, label: string, onto: string) {
  const from = await row(page, label).locator(".crm-draggable").boundingBox();
  const to = await row(page, onto).boundingBox();
  if (!from || !to) throw new Error(`No box for ${label} or ${onto}`);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, to.y + to.height * 0.75, { steps: 10 });
  await page.mouse.up();
}

test.describe.configure({ mode: "serial" });

// deviation:keyboard-row-reorder
test("react: moves a row by keyboard and keeps the order after a reload", async ({ page }) => {
  await createGroup(page);
  await page.goto(render("react"));
  const handle = page.getByRole("button", { name: "Move Order A" });
  await expect(handle).toBeVisible(LOAD);
  await expect(handle).toHaveClass(/crm-draggable/);

  await handle.focus();
  await page.keyboard.press("Space");
  await expect(announced(page)).toHaveText("Picked up Order A, position 1 of 3.");
  await measured(page, "Order A");
  await page.keyboard.press("ArrowDown");
  await expect(announced(page)).toHaveText("Order A moved to position 2 of 3.");
  await page.keyboard.press("Space");
  await expect(announced(page)).toHaveText("Order A dropped at position 2 of 3.");
  expect(await shown(page)).toEqual(["Order B", "Order A", "Order C"]);
  await expect.poll(() => stored(page)).toEqual(order(["Order B", "Order A", "Order C"]));
  await expect(handle).toBeFocused();

  await page.reload();
  await expect(row(page, "Order C")).toBeVisible(LOAD);
  expect(await shown(page)).toEqual(["Order B", "Order A", "Order C"]);

  // Back to the start, upwards.
  await page.getByRole("button", { name: "Move Order A" }).focus();
  await page.keyboard.press("Space");
  await expect(announced(page)).toHaveText("Picked up Order A, position 2 of 3.");
  await measured(page, "Order A");
  await page.keyboard.press("ArrowUp");
  await expect(announced(page)).toHaveText("Order A moved to position 1 of 3.");
  await page.keyboard.press("Space");
  await expect.poll(() => stored(page)).toEqual(order(LABELS));
  expect(await shown(page)).toEqual(LABELS);
});

for (const renderer of ["react", "angular"] as const) {
  test(`${renderer}: moves a row by pointer and stores the same weights`, async ({ page }) => {
    await createGroup(page);
    await page.goto(render(renderer));
    await expect(row(page, "Order C")).toBeVisible(LOAD);
    await pointerMove(page, "Order A", "Order C");
    await expect.poll(() => stored(page)).toEqual(order(["Order B", "Order C", "Order A"]));
    await expect.poll(() => shown(page)).toEqual(["Order B", "Order C", "Order A"]);
    // Core writes the new weights into its rows but the cells keep the old text (upstream-bugs.md).
    const weight = renderer === "react" ? /^\s*3\s*$/ : /^\s*1\s*$/;
    await expect(row(page, "Order A").locator('[data-field-name="weight"]')).toHaveText(weight);
  });
}
