/**
 * The saved search picker (af-search-param-sets) on both renderers: the same choices, buttons
 * and set details, and saving and deleting a set write the same records.
 */
import { expect, type Browser, type Page } from "@playwright/test";
import { test } from "./coverage";
import { api, API_PAGE, AUTH, axeFindings, ownFindings, quietApi, type Renderer } from "./harness";

const RUN = Date.now().toString(36);
const PREFIX = `Afreact sets ${RUN}`;
const FORM = "afsearchAfreactParamSetsProbe";
const LOAD = { timeout: 30_000 };
const LAYOUT =
  '<div af-fieldset=""><af-search-param-sets></af-search-param-sets>' +
  '<div class="af-container af-layout-inline">' +
  "<af-field name=\"title\" defn=\"{label: 'Title', search_operator: 'CONTAINS'}\"></af-field>" +
  "<af-field name=\"is_active\" defn=\"{input_type: 'Radio', label: 'Enabled', afform_default: true}\"></af-field>" +
  "</div>" +
  '<crm-search-display-table search-name="Manage_groups" display-name="Manage_groups"></crm-search-display-table></div>';

interface SetRow {
  id: number;
  label: string;
  filters: unknown;
  columns: unknown;
}

const picker = (page: Page) => page.locator(".afreact-render af-search-param-sets");

async function open(page: Page, renderer: Renderer, hash = "") {
  await page.goto("about:blank");
  await page.goto(`/civicrm/afreact/render?name=${FORM}&renderer=${renderer}${hash}`);
  await expect(page.locator(".afreact-render table tbody tr").first()).toBeVisible(LOAD);
  await expect(picker(page).locator("select")).toBeVisible();
}

/** The picker as it shows: the choices, then each visible button's name. */
async function shown(page: Page) {
  const options = await picker(page).locator("select option").allInnerTexts();
  const buttons = await picker(page)
    .locator(".crm-buttons > button:visible")
    .evaluateAll((all) =>
      all.map((button) =>
        `${button.textContent.trim() || (button.getAttribute("aria-label") ?? "")}${
          button.matches(":disabled") ? " (disabled)" : ""
        }`.replace(/\s+/g, " "),
      ),
    );
  return { options: options.map((text) => text.trim()), buttons };
}

/** The manage dialog's sets: summary, then each detail as "term: value". */
async function managed(page: Page) {
  await picker(page).locator("button[aria-label=Manage]").click();
  const dialog = page.locator("dialog.af-search-param-sets-manage[open]");
  await expect(dialog).toBeVisible();
  const items = dialog.locator("li", { hasText: PREFIX });
  for (const summary of await items.locator("summary").all()) await summary.click();
  const sets = await items.evaluateAll((all) =>
    all.map((item) => ({
      label: item.querySelector("summary")?.firstChild?.textContent?.trim(),
      details: [...item.querySelectorAll("dl > div")].map((row) =>
        `${row.querySelector("dt")?.textContent ?? ""}: ${row.querySelector("dd")?.textContent ?? ""}`.trim(),
      ),
    })),
  );
  await dialog.getByRole("button", { name: "Close" }).last().click();
  return sets;
}

async function setsLike(page: Page, label: string) {
  return api<SetRow>(page, "SearchParamSet", "get", {
    select: ["label", "filters", "columns"],
    where: [["label", "LIKE", label]],
  });
}

async function adminPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  await page.goto(API_PAGE);
  return page;
}

test.describe("saved search picker", () => {
  test.beforeAll(async ({ browser }) => {
    const page = await adminPage(browser);
    await quietApi(page, "Afform", "create", {
      values: { name: FORM, type: "search", title: "Afreact sets probe", layout: LAYOUT },
    });
    // Angular's module list knows a new form only after a flush.
    await quietApi(page, "System", "flush", {});
    await page.context().close();
  });
  test.afterAll(async ({ browser }) => {
    const page = await adminPage(browser);
    await api(page, "SearchParamSet", "delete", { where: [["afform_name", "=", FORM]] });
    await api(page, "Afform", "revert", { where: [["name", "=", FORM]] });
    await page.context().close();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(API_PAGE);
    await api(page, "SearchParamSet", "delete", { where: [["afform_name", "=", FORM]] });
    for (const [label, title] of [
      [`${PREFIX} B`, "Beta"],
      [`${PREFIX} A`, "Alpha"],
    ])
      await api(page, "SearchParamSet", "create", {
        values: {
          afform_name: FORM,
          label,
          filters: { title: { CONTAINS: title }, is_active: false },
        },
      });
  });
  test("shows the choices, buttons and set details Angular shows", async ({ page }) => {
    const result: Record<Renderer, unknown> = { react: null, angular: null };
    for (const renderer of ["angular", "react"] as const) {
      await open(page, renderer);
      result[renderer] = { picker: await shown(page), sets: await managed(page) };
    }
    // Core shows a Yes/No filter's value as nothing (upstream-bugs.md); React names it.
    expect(JSON.stringify(result.react)).toBe(
      JSON.stringify(result.angular).replaceAll('"Enabled:"', '"Enabled: No"'),
    );
    expect(result.react).toMatchObject({
      picker: {
        options: ["- Saved searches -", `${PREFIX} A`, `${PREFIX} B`],
        buttons: ["Manage", "Save new"],
      },
      sets: [
        { label: `${PREFIX} A`, details: ["Title: CONTAINS Alpha", "Enabled: No"] },
        { label: `${PREFIX} B`, details: ["Title: CONTAINS Beta", "Enabled: No"] },
      ],
    });
  });

  test("picking a set names it in the URL and offers to clear it", async ({ page }) => {
    for (const renderer of ["angular", "react"] as const) {
      await open(page, renderer);
      await picker(page)
        .locator("select")
        .selectOption({ label: `${PREFIX} A` });
      await expect(page).toHaveURL(/#\?_s=\d+$/);
      await expect(picker(page).getByRole("button", { name: "Clear saved search" })).toBeVisible();
      await expect(page.locator('.afreact-render af-field[name="title"] input')).toHaveValue(
        "Alpha",
      );
    }
    // Core offers "Save changes" for the unchanged set, its columns `null` against `{}`
    // (upstream-bugs.md); React does not. deviation:param-set-unchanged-compare
    await expect(picker(page).getByRole("button", { name: "Save changes" })).toHaveCount(0);
    await page.locator('.afreact-render af-field[name="title"] input').fill("Alphabet");
    await expect(picker(page).getByRole("button", { name: "Save changes" })).toBeVisible();
    await picker(page).getByRole("button", { name: "Clear saved search" }).click();
    await expect(page).toHaveURL(/#\?_s=0$/);
  });

  test("saves the typed filters as a new set the way Angular does", async ({ page }) => {
    for (const renderer of ["angular", "react"] as const) {
      await open(page, renderer);
      await page.locator('.afreact-render af-field[name="title"] input').fill("Gamma");
      await picker(page).getByRole("button", { name: "Save new" }).click();
      const dialog = page.locator("dialog.af-search-param-set-new[open]");
      await dialog.getByRole("textbox", { name: "Name" }).fill(`${PREFIX} new ${renderer}`);
      await dialog.getByRole("button", { name: "Save" }).click();
      await expect(dialog).toBeHidden();
      const [saved] = await setsLike(page, `${PREFIX} new ${renderer}`);
      await expect(page).toHaveURL(new RegExp(`#\\?_s=${String(saved?.id)}$`));
      await expect(picker(page).locator("select")).toHaveValue(String(saved?.id));
    }
    const [angular] = await setsLike(page, `${PREFIX} new angular`);
    const [react] = await setsLike(page, `${PREFIX} new react`);
    expect(react?.filters).toEqual(angular?.filters);
    expect(react?.filters).toEqual({ title: { CONTAINS: "Gamma" }, is_active: true });
    expect(react?.columns).toEqual(angular?.columns);
  });

  test("updates the picked set with the current filters", async ({ page }) => {
    const [set] = await setsLike(page, `${PREFIX} A`);
    await open(page, "react", `#?_s=${String(set?.id)}`);
    const title = page.locator('.afreact-render af-field[name="title"] input');
    await expect(title).toHaveValue("Alpha");
    await title.fill("Delta");
    await picker(page).getByRole("button", { name: "Save changes" }).click();
    const dialog = page.locator("dialog.af-search-param-set-update[open]");
    await expect(dialog.locator("dd").first()).toHaveText("CONTAINS Alpha => CONTAINS Delta");
    expect(await axeFindings(page, "dialog.af-search-param-set-update")).toEqual([]);
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toBeHidden();
    await expect
      .poll(async () => (await setsLike(page, `${PREFIX} A`))[0]?.filters)
      .toEqual({
        title: { CONTAINS: "Delta" },
        is_active: false,
      });
    await expect(picker(page).getByRole("button", { name: "Save changes" })).toHaveCount(0);
  });

  test("axe finds nothing in the picker and its dialog beyond the theme contrast Angular shares", async ({
    page,
  }) => {
    const findings: Record<Renderer, string[]> = { react: [], angular: [] };
    for (const renderer of ["angular", "react"] as const) {
      await open(page, renderer);
      findings[renderer].push(...(await axeFindings(page, ".afreact-render af-search-param-sets")));
      await picker(page).locator("button[aria-label=Manage]").click();
      await page.locator("dialog.af-search-param-sets-manage[open] summary").first().click();
      findings[renderer].push(...(await axeFindings(page, "dialog.af-search-param-sets-manage")));
    }
    // Angular's select has no name (upstream-bugs.md).
    expect(findings.angular).toContain("select-name: select");
    expect(ownFindings(findings.react, findings.angular)).toEqual([]);
  });

  test("deletes a set from the manage dialog", async ({ page }) => {
    await open(page, "react");
    await picker(page).locator("button[aria-label=Manage]").click();
    const dialog = page.locator("dialog.af-search-param-sets-manage[open]");
    const item = dialog.locator("li", { hasText: `${PREFIX} B` });
    await item.locator("summary").click();
    await item.getByRole("button", { name: "Delete" }).click();
    await expect(item).toHaveCount(0);
    expect(await setsLike(page, `${PREFIX} B`)).toEqual([]);
  });
});
