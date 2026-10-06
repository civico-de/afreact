/**
 * Drag in a tree display: the navigation entries of navtree.spec, moved among siblings and under
 * another parent on both renderers, compared by what the API stores afterwards.
 */
import { expect, test, type Page } from "@playwright/test";
import { api, AUTH, keysListened, type Renderer } from "./harness";

const RUN = Date.now().toString(36);
const NAME = `afreact_treedrag_${RUN}`;
const LOAD = { timeout: 30_000 };
const render = (renderer: Renderer) =>
  `/civicrm/afreact/render?name=afsearchAfreactDemoTreeDrag&renderer=${renderer}#?name=${NAME}`;

const items = (page: Page) =>
  page.locator(".afreact-render .crm-search-display-tree li", {
    has: page.locator(":scope > .crm-draggable"),
  });
const item = (page: Page, label: string) =>
  items(page).filter({
    has: page.locator(':scope > [class*="crm-search-col"] > span', {
      hasText: new RegExp(`^\\s*${label}\\s*$`),
    }),
  });
const handle = (page: Page, label: string) =>
  page.getByRole("button", { name: `Move ${label}`, exact: true });
const announced = (page: Page) => page.locator('[id^="DndLiveRegion"]');

/** Picks the item up by keyboard; its own line is marked as the target once the drag is measured. */
async function pickUp(page: Page, label: string) {
  await handle(page, label).focus();
  await page.keyboard.press("Space");
  await expect(announced(page)).toHaveText(`Picked up ${label}.`);
  await expect(item(page, label).and(page.locator("[data-over]"))).toHaveCount(1);
  await keysListened(page);
}

/** Each item's label with the label of the item it hangs under. */
async function shown(page: Page) {
  return items(page).evaluateAll((all) =>
    all.map((li) => {
      const label = li.querySelector(':scope > [class*="crm-search-col"] span')?.textContent?.trim();
      const parent = li.parentElement?.closest("li");
      const above = parent?.querySelector(':scope > [class*="crm-search-col"] span')?.textContent?.trim();
      return [above ?? null, label ?? ""];
    }),
  );
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

async function remove(page: Page) {
  await page.goto("/civicrm/afreact/compare");
  const found = await api<{ id: number }>(page, "Navigation", "get", {
    select: ["id"],
    where: [["name", "LIKE", `${NAME}%`]],
    orderBy: { id: "DESC" },
  });
  for (const { id } of found) await api(page, "Navigation", "delete", { where: [["id", "=", id]] });
}

/** Root > A (1) > A1; Root > B (2) > B1; Root > C (3). Inactive, so the menu stays as it is. */
async function create(page: Page) {
  await remove(page);
  const entry = async (values: Record<string, unknown>) => {
    const [made] = await api<{ id: number }>(page, "Navigation", "create", {
      values: { is_active: false, ...values },
    });
    if (!made) throw new Error("Navigation.create returned nothing");
    return made.id;
  };
  const root = await entry({ name: NAME, label: "Root", weight: 99 });
  for (const [letter, weight, child] of [
    ["A", 1, true],
    ["B", 2, true],
    ["C", 3, false],
  ] as const) {
    const parent = await entry({ name: `${NAME}_${letter}`, label: letter, weight, parent_id: root });
    if (child) await entry({ name: `${NAME}_${letter}1`, label: `${letter}1`, weight: 1, parent_id: parent });
  }
}

/** C moved under A after A1, then B1 moved to the first place under Root. */
const MOVED = [
  [null, "Root", 99],
  ["A", "A1", 1],
  ["A", "C", 2],
  ["Root", "B1", 1],
  ["Root", "A", 2],
  ["Root", "B", 3],
];

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: AUTH });
  await remove(await context.newPage());
  await context.close();
});

test.describe.configure({ mode: "serial" });

test("react: items move under another parent and among siblings by keyboard", async ({ page }) => {
  await create(page);
  await page.goto(render("react"));
  await expect(item(page, "C")).toBeVisible(LOAD);
  expect(await shown(page)).toEqual([
    [null, "Root"],
    ["Root", "A"],
    ["A", "A1"],
    ["Root", "B"],
    ["B", "B1"],
    ["Root", "C"],
  ]);

  // Up from C: the first place under B1, after B1, under B, after B, under A1, after A1.
  await pickUp(page, "C");
  for (const place of ["first under B1", "after B1", "first under B", "after B", "first under A1", "after A1"]) {
    await page.keyboard.press("ArrowUp");
    await expect(announced(page)).toHaveText(`C moved ${place}.`);
  }
  await page.keyboard.press("Space");
  await expect(announced(page)).toHaveText("C dropped after A1.");
  await expect.poll(() => shown(page)).toEqual([
    [null, "Root"],
    ["Root", "A"],
    ["A", "A1"],
    ["A", "C"],
    ["Root", "B"],
    ["B", "B1"],
  ]);

  // Up from B1: under B, after B, under C, after C, under A1, after A1, under A, after A, under Root.
  await expect(handle(page, "B1")).toHaveAttribute("aria-disabled", "false");
  await pickUp(page, "B1");
  for (const place of [
    "first under B",
    "after B",
    "first under C",
    "after C",
    "first under A1",
    "after A1",
    "first under A",
    "after A",
    "first under Root",
  ]) {
    await page.keyboard.press("ArrowUp");
    await expect(announced(page)).toHaveText(`B1 moved ${place}.`);
  }
  await page.keyboard.press("Space");
  await expect.poll(() => shown(page)).toEqual([
    [null, "Root"],
    ["Root", "B1"],
    ["Root", "A"],
    ["A", "A1"],
    ["A", "C"],
    ["Root", "B"],
  ]);
  await expect.poll(() => stored(page)).toEqual(MOVED);

  // Down from A with its branch, among the same siblings: after B, taking B's weight.
  await expect(handle(page, "A")).toHaveAttribute("aria-disabled", "false");
  await pickUp(page, "A");
  await expect(item(page, "A1")).toHaveCount(0);
  await page.keyboard.press("ArrowDown");
  await expect(announced(page)).toHaveText("A moved after B.");
  await page.keyboard.press("Space");
  await expect.poll(() => shown(page)).toEqual([
    [null, "Root"],
    ["Root", "B1"],
    ["Root", "B"],
    ["Root", "A"],
    ["A", "A1"],
    ["A", "C"],
  ]);
  await expect.poll(() => stored(page)).toEqual([
    [null, "Root", 99],
    ["A", "A1", 1],
    ["A", "C", 2],
    ["Root", "B1", 1],
    ["Root", "B", 2],
    ["Root", "A", 3],
  ]);
});

for (const renderer of ["react", "angular"] as const) {
  test(`${renderer}: dragging C onto A1 stores it under A`, async ({ page }) => {
    await create(page);
    await page.goto(render(renderer));
    await expect(item(page, "C")).toBeVisible(LOAD);
    const from = await item(page, "C").locator(".crm-draggable").first().boundingBox();
    const to = await item(page, "A1").boundingBox();
    if (!from || !to) throw new Error("No box for C or A1");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    // Up to A1's top half, then down past its middle: core's sortable moves past an item only
    // in the direction of travel, and then puts the item after it.
    const x = to.x + from.width;
    await page.mouse.move(x, to.y + to.height * 0.25, { steps: 12 });
    await page.mouse.move(x, to.y + to.height * 0.6, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => stored(page)).toEqual([
      [null, "Root", 99],
      ["A", "A1", 1],
      ["A", "C", 2],
      ["B", "B1", 1],
      ["Root", "A", 1],
      ["Root", "B", 2],
    ]);
  });
}
