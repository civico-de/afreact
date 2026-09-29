/**
 * SearchKit tables on both renderers: the same cells, links, classes, toolbar, counts and totals,
 * row menus, collapsible rows and the reload after a popup form. The demo fixtures use every
 * column type the React table draws; the core forms are those it renders without a note.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { Renderer } from "./harness";

const render = (name: string, renderer: Renderer) =>
  `/civicrm/afreact/render?name=${name}&renderer=${renderer}`;

const FORMS = [
  "afsearchAfreactDemoFeatures",
  "afsearchAfreactDemoContactTypes",
  "afsearchSettingsDatePreferences",
  "afsearchEventTemplates",
];

/** The outermost displays; nested subsearch displays load only once opened. */
const displays = (page: Page) =>
  page.locator(".afreact-render .crm-search-display:not(.crm-search-display .crm-search-display)");

/**
 * Waits until rows, count and totals have loaded on either renderer. A busy stack answers
 * SearchDisplay.run in seconds, so the waits allow as long as readyAt() does.
 */
const LOAD = { timeout: 30_000 };
async function loaded(page: Page, name: string, renderer: Renderer) {
  await page.goto(render(name, renderer));
  await expect(displays(page).first().locator("table > tbody > tr").first()).toBeVisible(LOAD);
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".afreact-render .crm-search-loading-placeholder")).toHaveCount(
    0,
    LOAD,
  );
  // A header count shows once its row_count request answered, which may outlast network idle.
  await expect(page.locator(".afreact-render .form-inline > span:not(:has(label))")).toHaveCount(
    0,
    LOAD,
  );
}

interface LinkInfo {
  text: string;
  href: string | null;
  target: string | null;
  title: string | null;
  className: string | null;
}

interface CellInfo {
  className: string;
  text: string;
  title: string | null;
  field: string | null;
  /** Classes of a message box inside the cell, such as the one of "None found." */
  alert: string | null;
  links: LinkInfo[];
}

interface DisplayInfo {
  description: string | null;
  headerCount: string | null;
  toolbar: LinkInfo[];
  headers: { text: string; className: string }[];
  rows: { id: string | null; className: string; cells: CellInfo[] }[];
  tally: string[][];
  pagerCount: string | null;
}

/**
 * What a reader and a link click get from each display. Angular writes empty attributes where
 * React leaves them out, and keeps hidden helpers in the DOM, so both are normalised away.
 */
async function observe(page: Page, name: string, renderer: Renderer): Promise<DisplayInfo[]> {
  await loaded(page, name, renderer);
  return displays(page).evaluateAll((all) => {
    const classes = (el: Element) =>
      [...el.classList].filter((token) => !token.startsWith("ng-")).join(" ");
    const attr = (el: Element, attribute: string) => {
      const value = el.getAttribute(attribute);
      return value === "" ? null : value;
    };
    const alert = (td: Element) => {
      const box = td.querySelector(":scope > .alert");
      return box ? classes(box) : null;
    };
    const text = (el: Element | null) => {
      if (!el) return "";
      const copy = el.cloneNode(true);
      if (!(copy instanceof Element)) return "";
      copy
        .querySelectorAll(".sr-only, .dropdown-menu, .ng-hide, [style*='visibility: hidden']")
        .forEach((hidden) => {
          hidden.remove();
        });
      return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
    };
    const links = (el: Element): LinkInfo[] =>
      [...el.querySelectorAll("a")]
        .filter((link) => !link.closest(".dropdown-menu"))
        .map((link) => ({
          text: text(link),
          href: attr(link, "href"),
          target: attr(link, "target"),
          title: attr(link, "title"),
          className: classes(link) || null,
        }));
    return all.map((display): DisplayInfo => {
      const table = display.querySelector(":scope > table");
      const toolbar = display.querySelector(":scope > .form-inline > .form-group.pull-right");
      const count = display.querySelector(":scope > .form-inline > span > label");
      return {
        description:
          text(display.querySelector(":scope > .crm-search-display-description")) || null,
        headerCount: count ? text(count) : null,
        toolbar: toolbar ? links(toolbar) : [],
        headers: [...(table?.querySelectorAll(":scope > thead > tr:first-child > th") ?? [])].map(
          (th) => ({ text: text(th), className: classes(th) }),
        ),
        rows: [...(table?.querySelectorAll(":scope > tbody > tr") ?? [])].map((tr) => ({
          id: attr(tr, "data-entity-id"),
          className: classes(tr),
          cells: [...tr.querySelectorAll(":scope > td")].map((td) => ({
            className: classes(td),
            text: text(td),
            title: attr(td, "title"),
            field: attr(td, "data-field-name"),
            alert: alert(td),
            links: links(td),
          })),
        })),
        tally: [...(table?.querySelectorAll("tr.crm-search-display-tally") ?? [])].map((tr) =>
          [...tr.querySelectorAll(":scope > td")].map((td) => text(td)),
        ),
        pagerCount: text(display.querySelector(".crm-search-display-pager .form-inline")) || null,
      };
    });
  });
}

for (const name of FORMS)
  test(`${name}: both renderers show the same cells, links and classes`, async ({ page }) => {
    const react = await observe(page, name, "react");
    const angular = await observe(page, name, "angular");
    expect(react).toEqual(angular);
    await expect(page.locator(".afreact-render [role=note]")).toHaveCount(0);
  });

test("the demo fixtures carry every feature the comparison relies on", async ({ page }) => {
  const [features] = await observe(page, "afsearchAfreactDemoFeatures", "react");
  expect(features).toMatchObject({
    description: "Synthetic contacts in every kind of column.",
    headerCount: "25 results",
    toolbar: [{ text: "Add contact", target: "crm-popup", className: "btn btn-primary" }],
    tally: [["Total", "Count: 25", "", "", "", "", "", "", "", ""]],
    pagerCount: "25 results",
  });
  const cells = features?.rows[0]?.cells ?? [];
  expect(cells.map((cell) => cell.className.split(" ")[0])).toEqual([
    "crm-search-ctrl-column",
    "crm-search-col-type-field",
    "crm-search-col-type-field",
    "crm-search-col-type-field",
    "crm-search-col-type-image",
    "crm-search-col-type-html",
    "crm-search-col-type-links",
    "crm-search-col-type-buttons",
    "crm-search-col-type-subsearch",
    "crm-search-col-type-menu",
  ]);
  expect(cells[1]?.links[0]).toMatchObject({ target: "_blank", text: "Arendt, Ada" });
  expect(cells[6]?.links.map((link) => link.text)).toEqual(["View", "Edit"]);
});

/** The first row's menu, opened: its items as core's dropdown lists them. */
async function rowMenu(page: Page, renderer: Renderer) {
  await loaded(page, "afsearchAfreactDemoFeatures", renderer);
  const cell = displays(page).locator("tbody tr").first().locator(".crm-search-col-type-menu");
  await cell.getByRole("button").click();
  const items = cell.locator(".dropdown-menu > li");
  await expect(items.first()).toBeVisible();
  return items.evaluateAll((all) =>
    all.map((li) => {
      const link = li.querySelector("a");
      return {
        className: (li.getAttribute("class") ?? "").replace(/\bng-\S+/g, "").trim(),
        text: (link?.textContent ?? "").replace(/\s+/g, " ").trim(),
        href: link?.getAttribute("href") ?? null,
        target: link?.getAttribute("target") ?? null,
      };
    }),
  );
}

test("row menus list the same links on both renderers", async ({ page }) => {
  const react = await rowMenu(page, "react");
  expect(react).toEqual(await rowMenu(page, "angular"));
  expect(react.map((item) => item.text)).toEqual(["View", "Edit", "Delete"]);
});

test("a row menu follows the menu button pattern on the keyboard", async ({ page }) => {
  await loaded(page, "afsearchAfreactDemoFeatures", "react");
  const cell = displays(page).locator("tbody tr").nth(1).locator(".crm-search-col-type-menu");
  const button = cell.getByRole("button", { name: "Actions Row Actions" });
  const menu = cell.getByRole("menu");
  const item = (name: string) => cell.getByRole("menuitem", { name });
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(menu).toBeVisible();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(item("View")).toBeFocused();
  await expectBelow(menu, button);
  await page.keyboard.press("ArrowDown");
  await expect(item("Edit")).toBeFocused();
  await page.keyboard.press("End");
  await expect(item("Delete")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(item("View")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(button).toBeFocused();
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("ArrowUp");
  await expect(item("Delete")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(menu).toBeHidden();
  await button.focus();
  await page.keyboard.press("Space");
  await expect(item("View")).toBeFocused();
  await page.mouse.click(5, 5);
  await expect(menu).toBeHidden();
});

/** The menu opens under its button, right-aligned as the column is. */
async function expectBelow(menu: Locator, button: Locator) {
  const [list, anchor] = [await menu.boundingBox(), await button.boundingBox()];
  if (!list || !anchor) throw new Error("menu and button must be laid out");
  expect(Math.abs(list.y - (anchor.y + anchor.height))).toBeLessThan(6);
  expect(Math.abs(list.x + list.width - (anchor.x + anchor.width))).toBeLessThan(2);
}

/** The row of a contact type, found by its machine name. */
const typeRow = (page: Page, name: string) =>
  displays(page)
    .locator("tbody tr")
    .filter({
      has: page.locator("td[data-field-name='name']", { hasText: new RegExp(`^\\s*${name}\\s*$`) }),
    });

/** Contact types shown before and after opening Individual's collapsed sub-types. */
async function collapse(page: Page, renderer: Renderer) {
  await loaded(page, "afsearchAfreactDemoContactTypes", renderer);
  const names = () =>
    displays(page)
      .locator("tbody td[data-field-name='name']")
      .evaluateAll((cells) => cells.map((cell) => cell.textContent.trim()));
  const before = await names();
  await typeRow(page, "Individual").locator(".crm-search-ctrl-toggle-row").click();
  await expect(displays(page).locator("tbody tr")).not.toHaveCount(before.length);
  const opened = await names();
  const child = await typeRow(page, "Afreact_Demo_Staff")
    .locator("td")
    .first()
    .getAttribute("class");
  return { before, opened, child: child?.replace(/\s+/g, " ").trim() };
}

test("collapsible rows open alike on both renderers", async ({ page }) => {
  const angular = await collapse(page, "angular");
  const react = await collapse(page, "react");
  expect(react).toEqual(angular);
  expect(react.before).toEqual(["Household", "Individual", "Organization"]);
  expect(react.opened).toEqual([
    "Household",
    "Individual",
    "Afreact_Demo_Staff",
    "Afreact_Demo_Volunteer",
    "Organization",
  ]);
  await expect(typeRow(page, "Individual").locator(".crm-search-ctrl-toggle-row")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
});

test("a crm-popup link opens CiviCRM's popup from the React table", async ({ page }) => {
  await loaded(page, "afsearchAfreactDemoFeatures", "react");
  await displays(page)
    .locator("tbody tr")
    .first()
    .locator(".crm-search-col-type-links")
    .getByRole("link", { name: "Edit" })
    .click();
  const dialog = page.locator(".ui-dialog");
  await expect(dialog).toBeVisible(LOAD);
  await expect(dialog.locator("form")).toBeVisible(LOAD);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

/**
 * Waits for the SearchDisplay.run calls core makes after CRM.popup announces a saved form on a
 * row link: the page again, and the count and totals it drops with the old results.
 */
async function reloads(page: Page, renderer: Renderer) {
  await loaded(page, "afsearchAfreactDemoFeatures", renderer);
  const runs: string[] = [];
  page.on("request", (request) => {
    runs.push(...runReturns(request.url(), request.postData()));
  });
  // What CRM.popup does on the link once its form saved.
  await page.evaluate(
    "CRM.$('.afreact-render .crm-search-col-type-links a').first().trigger('crmPopupFormSuccess')",
  );
  await expect.poll(() => [...runs].sort(), LOAD).toEqual(["page:1", "row_count", "tally"]);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** The return mode of each SearchDisplay.run in an APIv4 request, single or batched as crmApi4 sends. */
function runReturns(url: string, body: string | null): string[] {
  if (!url.includes("/civicrm/ajax/api4")) return [];
  const form = new URLSearchParams(body ?? "");
  const single = url.includes("SearchDisplay/run")
    ? [["SearchDisplay", "run", parse(form.get("params"))]]
    : [];
  const calls = parse(form.get("calls"));
  const batched = isRecord(calls) ? Object.values(calls) : [];
  return [...single, ...batched].flatMap((call) =>
    Array.isArray(call) && call[0] === "SearchDisplay" && call[1] === "run" && isRecord(call[2])
      ? [String(call[2].return)]
      : [],
  );
}

const parse = (json: string | null): unknown => (json === null ? null : JSON.parse(json));

test("both renderers reload the display after a popup form succeeds", async ({ page }) => {
  await reloads(page, "angular");
  await reloads(page, "react");
});
