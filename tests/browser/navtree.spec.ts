/**
 * Drag to reorder in a hierarchical table: navigation entries the test creates, two parents with
 * a child each. Both renderers store the same weight when a parent is dragged past its sibling;
 * React moves the sub-row along and refuses a drop under another parent (upstream-bugs.md).
 */
import { expect, type Page } from "@playwright/test";
import { test } from "./coverage";
import { api, API_PAGE, AUTH, keysListened, type Renderer } from "./harness";

const RUN = Date.now().toString(36);
const NAME = `afreact_tree_${RUN}`;
const LOAD = { timeout: 30_000 };
const render = (renderer: Renderer) =>
  `/civicrm/afreact/render?name=afsearchAfreactDemoNavTree&renderer=${renderer}#?name=${NAME}`;

const rows = (page: Page) => page.locator(".afreact-render .crm-search-display table tbody tr");
const row = (page: Page, label: string) =>
  rows(page).filter({
    has: page.locator('[data-field-name="label"]', { hasText: new RegExp(`^\\s*${label}\\s*$`) }),
  });
const handle = (page: Page, label: string) =>
  page.getByRole("button", { name: `Move ${label}`, exact: true });
const announced = (page: Page) => page.locator('[id^="DndLiveRegion"]');
const measured = async (page: Page, label: string) => {
  await expect(row(page, label)).toHaveAttribute("data-over");
  await keysListened(page);
};
async function shown(page: Page) {
  const texts = await rows(page).locator('[data-field-name="label"]').allTextContents();
  return texts.map((text) => text.trim());
}

/** The entries by label with their stored weight and parent, ordered by parent then weight. */
async function stored(page: Page) {
  const found = await api<{ label: string; weight: number; "parent_id.label": string | null }>(
    page,
    "Navigation",
    "get",
    {
      select: ["label", "weight", "parent_id.label"],
      where: [["name", "LIKE", `${NAME}%`]],
      orderBy: { "parent_id.label": "ASC", weight: "ASC", label: "ASC" },
    },
  );
  return found.map((entry) => [entry["parent_id.label"], entry.label, entry.weight]);
}

/** Children go before their parents, which the API will not delete while they have any. */
async function remove(page: Page) {
  await page.goto(API_PAGE);
  const found = await api<{ id: number }>(page, "Navigation", "get", {
    select: ["id"],
    where: [["name", "LIKE", `${NAME}%`]],
    orderBy: { id: "DESC" },
  });
  for (const { id } of found) await api(page, "Navigation", "delete", { where: [["id", "=", id]] });
}

/**
 * Tree > Tree A (1) > Tree A1; Tree > Tree B (2) > Tree B1. A root of its own keeps the weights
 * of A and B among themselves (top-level entries share theirs with the whole menu); inactive, so
 * the menu stays as it is.
 */
async function create(page: Page) {
  await remove(page);
  const entry = async (values: Record<string, unknown>) => {
    const [made] = await api<{ id: number }>(page, "Navigation", "create", {
      values: { is_active: false, ...values },
    });
    if (!made) throw new Error("Navigation.create returned nothing");
    return made.id;
  };
  const root = await entry({ name: NAME, label: "Tree", weight: 99 });
  for (const [letter, weight] of [
    ["A", 1],
    ["B", 2],
  ] as const) {
    const parent = await entry({
      name: `${NAME}_${letter}`,
      label: `Tree ${letter}`,
      weight,
      parent_id: root,
    });
    await entry({
      name: `${NAME}_${letter}1`,
      label: `Tree ${letter}1`,
      weight: 1,
      parent_id: parent,
    });
  }
}

/** The entries once Tree A took Tree B's weight: the API moves B up to make room. */
const MOVED = [
  [null, "Tree", 99],
  ["Tree", "Tree B", 1],
  ["Tree", "Tree A", 2],
  ["Tree A", "Tree A1", 1],
  ["Tree B", "Tree B1", 1],
];

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: AUTH });
  await remove(await context.newPage());
  await context.close();
});

test.describe.configure({ mode: "serial" });

test("react: a parent moves with its sub-row past its sibling, never under it", async ({
  page,
}) => {
  await create(page);
  await page.goto(render("react"));
  await expect(row(page, "Tree B1")).toBeVisible(LOAD);
  expect(await shown(page)).toEqual(["Tree", "Tree A", "Tree A1", "Tree B", "Tree B1"]);

  await handle(page, "Tree A").focus();
  await page.keyboard.press("Space");
  await expect(announced(page)).toHaveText("Picked up Tree A, position 2 of 5.");
  await measured(page, "Tree A");
  // Over its own sub-row, then over the sibling; the announced place is where the row lands.
  await page.keyboard.press("ArrowDown");
  await expect(announced(page)).toHaveText("Tree A moved to position 2 of 5.");
  await page.keyboard.press("ArrowDown");
  await expect(announced(page)).toHaveText("Tree A moved to position 4 of 5.");
  await page.keyboard.press("Space");
  await expect(announced(page)).toHaveText("Tree A dropped at position 4 of 5.");
  await expect.poll(() => shown(page)).toEqual(["Tree", "Tree B", "Tree B1", "Tree A", "Tree A1"]);
  await expect.poll(() => stored(page)).toEqual(MOVED);

  // Dropped onto the other parent's child: nothing moves.
  // The handles come back once the weights the server answered are on the page.
  await expect(handle(page, "Tree A1")).toHaveAttribute("aria-disabled", "false");
  await handle(page, "Tree A1").focus();
  await page.keyboard.press("Space");
  await measured(page, "Tree A1");
  await page.keyboard.press("ArrowUp");
  await expect(announced(page)).toHaveText(
    "Tree A1 cannot move there: a row moves among its siblings only.",
  );
  await page.keyboard.press("ArrowUp");
  await expect(announced(page)).toHaveText(
    "Tree A1 cannot move there: a row moves among its siblings only.",
  );
  await page.keyboard.press("Space");
  await expect(announced(page)).toHaveText(
    "Tree A1 stays at position 5 of 5: a row moves among its siblings only.",
  );
  await expect(page.locator("#crm-notification-container")).toContainText(
    "Tree A1 stays where it is: a row moves among its siblings only.",
  );
  expect(await shown(page)).toEqual(["Tree", "Tree B", "Tree B1", "Tree A", "Tree A1"]);
});

/** Drags the handle of `name` to the middle of the row `target`. */
async function drag(page: Page, name: string, target: string) {
  const from = await row(page, name).locator(".crm-draggable").boundingBox();
  const to = await row(page, target).boundingBox();
  if (!from || !to) throw new Error(`No box for ${name} or ${target}`);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, to.y + to.height / 2, { steps: 10 });
  await page.mouse.up();
}

test("react: a drop on a sibling's sub-row places the row after that sibling", async ({ page }) => {
  await create(page);
  await page.goto(render("react"));
  await expect(row(page, "Tree B1")).toBeVisible(LOAD);
  await drag(page, "Tree A", "Tree B1");
  await expect.poll(() => stored(page)).toEqual(MOVED);
  await expect.poll(() => shown(page)).toEqual(["Tree", "Tree B", "Tree B1", "Tree A", "Tree A1"]);
});

for (const renderer of ["react", "angular"] as const) {
  test(`${renderer}: dragging a parent past its sibling stores the sibling's weight`, async ({
    page,
  }) => {
    await create(page);
    await page.goto(render(renderer));
    await expect(row(page, "Tree B1")).toBeVisible(LOAD);
    // Just past the sibling's middle: core's sortable then puts the row after it.
    const from = await row(page, "Tree A").locator(".crm-draggable").boundingBox();
    const to = await row(page, "Tree B").boundingBox();
    if (!from || !to) throw new Error("No box for Tree A or Tree B");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, to.y + to.height * 0.75, { steps: 10 });
    await page.mouse.up();
    await expect.poll(() => stored(page)).toEqual(MOVED);
    // Core moves the parent alone (upstream-bugs.md); React brings the sub-row.
    await expect
      .poll(() => shown(page))
      .toEqual(
        renderer === "react"
          ? ["Tree", "Tree B", "Tree B1", "Tree A", "Tree A1"]
          : ["Tree", "Tree A1", "Tree B", "Tree A", "Tree B1"],
      );
  });
}
