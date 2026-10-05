/**
 * SearchKit list, grid and tree displays on both renderers: the same items, columns, labels and
 * classes, the same pager, grid tracks and list markers, and the tree's branches opening alike.
 */
import { expect, test, type Page } from "@playwright/test";
import type { Renderer } from "./harness";

const render = (name: string, renderer: Renderer) =>
  `/civicrm/afreact/render?name=${name}&renderer=${renderer}`;

const display = (page: Page) => page.locator(".afreact-render .crm-search-display").first();

/** Waits until the display holds its first results; SearchDisplay.run may take seconds. */
const LOAD = { timeout: 30_000 };
async function loaded(page: Page, name: string, renderer: Renderer, item: string) {
  await page.goto(render(name, renderer));
  await expect(display(page).locator(item).first()).toBeVisible(LOAD);
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".afreact-render .crm-search-loading-placeholder")).toHaveCount(
    0,
    LOAD,
  );
}

interface ColumnInfo {
  className: string;
  title: string | null;
  label: string;
  text: string;
}

interface ItemInfo {
  tag: string;
  className: string;
  columns: ColumnInfo[];
  /** The tree's open sub-items. */
  children: ItemInfo[];
  /** The tree's toggle: whether it shows, and the count it holds. */
  toggle: { visible: boolean; count: string } | null;
}

interface DisplayInfo {
  className: string;
  container: { tag: string; className: string; listStyle: string; tracks: number } | null;
  items: ItemInfo[];
  pager: string | null;
}

/** What a reader gets from the display; Angular's ng- classes and wrapper elements are skipped. */
function observe(page: Page): Promise<DisplayInfo> {
  return display(page).evaluate((root): DisplayInfo => {
    const classes = (el: Element) =>
      [...el.classList].filter((token) => !token.startsWith("ng-")).join(" ");
    const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
    const branchOf = (el: Element) =>
      el.querySelector(
        ":scope > ul.crm-search-display-tree-branch, :scope > crm-search-display-tree-branch > ul",
      );
    const item = (el: Element): ItemInfo => {
      const toggle = el.querySelector(":scope > .crm-search-display-tree-collapse-toggle");
      const branch = branchOf(el);
      return {
        tag: el.localName,
        className: classes(el),
        columns: [...el.querySelectorAll(":scope > div[class*='crm-search-col-type-']")].map(
          (column) => ({
            className: classes(column),
            title: column.getAttribute("title") || null,
            label: text(column.querySelector(":scope > label")),
            text: text(column.querySelector(":scope > span")),
          }),
        ),
        children: branch ? [...branch.querySelectorAll(":scope > li")].map(item) : [],
        toggle: toggle && {
          visible: getComputedStyle(toggle).visibility !== "hidden",
          count: text(toggle.querySelector(".crm-search-display-tree-branch-count")),
        },
      };
    };
    const container =
      root.querySelector(":scope > .crm-search-display-list-container") ??
      root.querySelector(":scope > .crm-search-display-grid-container");
    const tree = branchOf(root);
    const items = container
      ? [...container.children]
      : [...(tree?.querySelectorAll(":scope > li") ?? [])];
    return {
      className: classes(root),
      container: container && {
        tag: container.localName,
        className: classes(container),
        listStyle: getComputedStyle(container).listStyleType,
        tracks: getComputedStyle(container).gridTemplateColumns.split(" ").filter(Boolean).length,
      },
      items: items.map(item),
      pager: text(root.querySelector(".crm-search-display-pager .form-inline")) || null,
    };
  });
}

const FORMS = [
  { name: "afsearchAfreactDemoList", item: ".crm-search-display-listitem", counted: true },
  { name: "afsearchAfreactDemoGrid", item: ".crm-search-display-griditem" },
  { name: "afsearchAfreactDemoTree", item: "li" },
];

for (const { name, item, counted } of FORMS)
  test(`${name}: both renderers show the same items, columns and classes`, async ({ page }) => {
    // Core asks for the pager's count after the rows.
    const settled = async (renderer: Renderer) => {
      await loaded(page, name, renderer, item);
      if (counted) await expect(display(page).locator(".crm-search-display-pager label")).toBeVisible();
      return observe(page);
    };
    const angular = await settled("angular");
    const react = await settled("react");
    expect(react).toEqual(angular);
    await expect(page.locator(".afreact-render [role=note]")).toHaveCount(0);
  });

test("the demo displays carry what the comparison relies on", async ({ page }) => {
  await loaded(page, "afsearchAfreactDemoList", "react", ".crm-search-display-listitem");
  const list = await observe(page);
  expect(list.container).toMatchObject({ tag: "ol" });
  expect(list.items).toHaveLength(10);
  expect(list.pager).toMatch(/results/);
  expect(list.items[0]?.columns.map((column) => [column.className, column.label])).toEqual([
    ["font-bold crm-search-col-type-field crm-inline-block", ""],
    ["crm-search-col-type-field crm-inline-block", "Name"],
    ["crm-search-col-type-field", "Enabled"],
  ]);

  await loaded(page, "afsearchAfreactDemoGrid", "react", ".crm-search-display-griditem");
  const grid = await observe(page);
  expect(grid.container).toMatchObject({ tag: "div", tracks: 2 });
  expect(grid.items.map((entry) => entry.columns[0]?.text)).toEqual(["Mrs.", "Ms.", "Mr.", "Dr."]);
  // A form page knows no display label, so the list has no name there.
  await expect(display(page).getByRole("list").getByRole("listitem")).toHaveCount(4);
});

/** The tree's top items, then the same after opening Individual's sub-types. */
async function openIndividual(page: Page, renderer: Renderer) {
  await loaded(page, "afsearchAfreactDemoTree", renderer, "li");
  const before = await observe(page);
  await display(page)
    .locator("li", { hasText: "Individual" })
    .first()
    .locator(".crm-search-display-tree-collapse-toggle")
    .click();
  await expect(display(page).locator("li li")).not.toHaveCount(0);
  return { before, opened: await observe(page) };
}

test("tree branches open alike on both renderers, and React names their state", async ({
  page,
}) => {
  const angular = await openIndividual(page, "angular");
  const react = await openIndividual(page, "react");
  expect(react).toEqual(angular);
  const names = (items: ItemInfo[]): unknown[] =>
    items.map((entry) => {
      const name = entry.columns[1]?.text;
      return entry.children.length ? [name, names(entry.children)] : name;
    });
  expect(names(react.before.items)).toEqual(["Household", "Individual", "Organization"]);
  expect(names(react.opened.items)).toEqual([
    "Household",
    ["Individual", ["Afreact_Demo_Staff", "Afreact_Demo_Volunteer"]],
    "Organization",
  ]);
  const toggle = (name: string) =>
    display(page)
      .locator("li", { hasText: name })
      .first()
      .locator(".crm-search-display-tree-collapse-toggle")
      .first();
  await expect(toggle("Individual")).toHaveAttribute("aria-expanded", "true");
  await expect(toggle("Organization")).toHaveAttribute("aria-expanded", "false");
  await toggle("Organization").focus();
  await page.keyboard.press("Enter");
  await expect(toggle("Organization")).toHaveAttribute("aria-expanded", "true");
  await expect(display(page).locator("li li", { hasText: "Afreact_Demo_Club" })).toBeVisible();
});
