import { expect, test, type Page } from "@playwright/test";
import { api, axeFindings, ownFindings } from "./harness";

const LABEL = "Afreact display probe";
const TAGS = ["Afreact display probe A", "Afreact display probe B"] as const;
const params = {
  version: 4,
  select: ["id", "label"],
  orderBy: {},
  where: [["label", "LIKE", `${LABEL}%`]],
};
const FORM = "afreactDisplayProbeForm";
const pages = { angular: "/civicrm/admin/search", react: "/civicrm/admin/afreact/search" };

async function cleanUp(page: Page) {
  await page.goto("/civicrm/admin/afreact/search#/list");
  await api(page, "Job", "delete", { where: [["api_entity", "LIKE", "SK_AfreactDisplayProbe%"]] });
  await api(page, "Afform", "revert", { where: [["name", "=", FORM]] });
  await api(page, "SavedSearch", "delete", { where: [["label", "LIKE", `${LABEL}%`]] });
  await api(page, "Tag", "delete", { where: [["label", "IN", TAGS]] });
}

async function open(page: Page, renderer: keyof typeof pages, label: string, type = "Table") {
  await page.goto(
    `${pages[renderer]}#/create/Tag?label=${encodeURIComponent(label)}&params=${encodeURIComponent(JSON.stringify(params))}`,
  );
  await expect(page.locator("#crm-saved-search-label")).toHaveValue(label);
  await page.getByRole("button", { name: "Add..." }).click();
  await page
    .getByRole(renderer === "react" ? "menuitem" : "link", { name: type, exact: true })
    .click();
}

async function save(page: Page) {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/#\/edit\/\d+$/);
  const id = Number(/#\/edit\/(\d+)$/.exec(page.url())?.[1]);
  const [display] = await api<{
    id: number;
    name: string;
    type: string;
    label: string;
    acl_bypass: boolean;
    settings: Record<string, unknown>;
  }>(page, "SearchDisplay", "get", {
    select: ["name", "type", "label", "acl_bypass", "settings"],
    where: [["saved_search_id", "=", id]],
  });
  if (!display) throw new Error(`Search ${String(id)} saved without a display.`);
  return { id, display };
}

test.describe("SearchKit table display editor", () => {
  test.beforeEach(async ({ page }) => {
    await cleanUp(page);
    await api(page, "Tag", "save", {
      records: TAGS.map((label) => ({ label, used_for: ["civicrm_contact"] })),
    });
  });
  test.afterEach(async ({ page }) => {
    await cleanUp(page);
  });

  test("configures custom columns, previews them and saves the settings", async ({ page }) => {
    await open(page, "react", LABEL);
    const editor = page.locator("afreact-builder");
    await editor.getByRole("radio", { name: "Use custom columns" }).check();
    await editor.getByText("Header", { exact: true }).first().click();
    await editor.getByRole("checkbox", { name: "Enable Column Picker" }).check();
    const labelColumn = editor.locator("fieldset.crm-draggable").nth(1);
    await labelColumn.locator("summary").click();
    await labelColumn.getByRole("combobox", { name: "Alignment" }).selectOption("text-center");
    await editor.getByRole("button", { name: "Preview" }).click();
    await expect(editor.getByRole("cell", { name: TAGS[0] })).toBeVisible();
    expect(await axeFindings(page, "afreact-builder")).toEqual([]);

    const { id, display } = await save(page);
    expect(display.type).toBe("table");
    expect(display.settings).toMatchObject({
      columnMode: "custom",
      toggleColumns: true,
      columns: [
        { type: "field", key: "id" },
        { type: "field", key: "label", alignment: "text-center" },
      ],
    });

    await page.emulateMedia({ colorScheme: "dark" });
    const react = await axeFindings(page, "afreact-builder");
    await page.goto(`/civicrm/admin/search#/edit/${String(id)}`);
    await expect(page.locator("#crm-saved-search-label")).toHaveValue(LABEL);
    const angular = await axeFindings(page, "#bootstrap-theme");
    expect(ownFindings(react, angular)).toEqual([]);
    await page.emulateMedia({ colorScheme: "light" });
  });

  for (const type of ["Table", "List", "Grid", "Tree", "Autocomplete", "DB Entity", "Data Entry"]) {
    test(`a new ${type} display saves with the settings core's editor gives it`, async ({
      page,
    }) => {
      const built = [];
      for (const renderer of ["angular", "react"] as const) {
        await open(page, renderer, `${LABEL} ${renderer}`, type);
        const { display } = await save(page);
        built.push({ ...display, id: undefined, name: undefined, label: undefined });
      }
      const [angular, react] = built;
      // Core adds description to the entity's metadata, so its new autocompletes search by it.
      if (type === "Autocomplete" && angular) {
        expect(angular.settings.searchFields).toEqual(["id", "label", "description"]);
        angular.settings = { ...angular.settings, searchFields: ["id", "label"] };
      }
      expect(react).toEqual(angular);
    });
  }

  test("a DB entity saves its refresh job, refreshes, and confirms renaming a column", async ({
    page,
  }) => {
    await open(page, "react", LABEL, "DB Entity");
    const editor = page.locator("afreact-builder");
    const name = "AfreactDisplayProbeDbEntity1";
    await expect(editor.getByRole("textbox", { name: "API Name" })).toHaveValue(name);
    await editor.getByRole("checkbox", { name: "Auto-Refresh" }).check();
    await editor.getByRole("combobox", { name: "Refresh frequency" }).selectOption("Daily");
    expect(await axeFindings(page, "afreact-builder")).toEqual([]);
    await page.emulateMedia({ colorScheme: "dark" });
    const react = await axeFindings(page, "afreact-builder");
    await page.emulateMedia({ colorScheme: "light" });
    const { id, display } = await save(page);
    expect(display.name).toBe(name);
    expect(display.settings).not.toHaveProperty("limit");
    const jobs = await api<{ is_active: boolean; run_frequency: string }>(page, "Job", "get", {
      select: ["is_active", "run_frequency"],
      where: [
        ["api_entity", "=", `SK_${name}`],
        ["api_action", "=", "refresh"],
      ],
    });
    expect(jobs).toEqual([expect.objectContaining({ is_active: true, run_frequency: "Daily" })]);
    await expect
      .poll(async () => (await api(page, `SK_${name}`, "get", { select: ["label"] })).length)
      .toBeGreaterThanOrEqual(TAGS.length);

    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(`/civicrm/admin/search#/edit/${String(id)}`);
    await page
      .getByRole("link", { name: /DB Entity 1/ })
      .first()
      .click();
    await expect(page.getByText("API Name")).toBeVisible();
    expect(ownFindings(react, await axeFindings(page, "#bootstrap-theme"))).toEqual([]);
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(`/civicrm/admin/afreact/search#/edit/${String(id)}`);

    await editor.getByRole("button", { name: `${LABEL} DB Entity 1`, exact: true }).click();
    await expect(editor.getByText(/^Last refreshed: /)).toBeVisible();
    const column = editor.locator("fieldset.crm-draggable").nth(1);
    await column.locator("summary").click();
    await column.getByRole("textbox", { name: "Name" }).fill("renamed");
    const messages: string[] = [];
    page.once("dialog", (dialog) => {
      messages.push(dialog.message());
      void dialog.dismiss();
    });
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => messages.length).toBe(1);
    expect(messages[0]).toContain(
      `In entity "${LABEL} DB Entity 1", rename column "label" to "renamed".`,
    );
    const [kept] = await api<{ settings: { columns: { name?: string }[] } }>(
      page,
      "SearchDisplay",
      "get",
      { select: ["settings"], where: [["name", "=", name]] },
    );
    expect(kept?.settings.columns[1]?.name).not.toBe("renamed");

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect
      .poll(async () => {
        const [saved] = await api<{ settings: { columns: { name?: string }[] } }>(
          page,
          "SearchDisplay",
          "get",
          { select: ["settings"], where: [["name", "=", name]] },
        );
        return saved?.settings.columns[1]?.name;
      })
      .toBe("renamed");
  });

  test("a data entry display saves required columns, defaults and footer totals", async ({
    page,
  }) => {
    await open(page, "react", LABEL, "Data Entry");
    const editor = page.locator("afreact-builder");
    const column = editor.locator("fieldset.crm-draggable").nth(1);
    await column.locator("summary").click();
    await column.getByRole("checkbox", { name: "Required" }).check();
    await column.getByRole("checkbox", { name: "Default Value" }).check();
    await column.getByRole("textbox", { name: /^Default value of / }).fill("Probe");
    await column.getByRole("combobox", { name: "Aggregate" }).selectOption("COUNT");
    await expect(column.locator("summary .crm-marker")).toBeVisible();
    expect(await axeFindings(page, "afreact-builder")).toEqual([]);
    await page.emulateMedia({ colorScheme: "dark" });
    const react = await axeFindings(page, "afreact-builder");
    await page.emulateMedia({ colorScheme: "light" });
    const { id, display } = await save(page);
    expect(display.settings).toMatchObject({
      tally: {},
      columns: [
        { key: "id", tally: { fn: "SUM" } },
        { key: "label", required: true, default: "Probe", tally: { fn: "COUNT" } },
      ],
    });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(`/civicrm/admin/search#/edit/${String(id)}`);
    await page
      .getByRole("link", { name: /Data Entry 1/ })
      .first()
      .click();
    await expect(page.getByText("Show Totals in Footer")).toBeAttached();
    expect(ownFindings(react, await axeFindings(page, "#bootstrap-theme"))).toEqual([]);
    await page.emulateMedia({ colorScheme: "light" });
  });

  test("warns that removing a display deletes the form embedding it", async ({ page }) => {
    const [search] = await api<{ id: number; name: string }>(page, "SavedSearch", "create", {
      values: { label: LABEL, api_entity: "Tag", api_params: params },
      chain: {
        display: [
          "SearchDisplay",
          "create",
          {
            values: { saved_search_id: "$id", name: "Embedded", label: "Embedded", type: "table" },
          },
        ],
      },
    });
    if (!search) throw new Error("The probe search was not created.");
    await api(page, "Afform", "create", {
      values: {
        name: FORM,
        title: "Display probe form",
        type: "search",
        layout: `<crm-search-display-table search-name="${search.name}" display-name="Embedded"></crm-search-display-table>`,
      },
    });
    await page.goto(`${pages.react}#/edit/${String(search.id)}`);
    // Clicked at once, before the forms using the search have loaded.
    await page.locator("afreact-builder").getByRole("button", { name: "Delete Embedded" }).click();
    await expect(
      page.getByText(
        'Form "Display probe form" will be deleted if the embedded display "Embedded" is deleted.',
      ),
    ).toBeVisible();
  });

  test("groups a list by a field, which leads the sort and drops the pager", async ({ page }) => {
    await open(page, "react", LABEL, "List");
    const editor = page.locator("afreact-builder");
    await editor.getByText("Settings", { exact: true }).last().click();
    await editor
      .getByRole("group", { name: "Group Sections By" })
      .getByRole("combobox")
      .fill("Label");
    await page.getByRole("option", { name: "Label" }).first().click();
    const tag = editor.getByRole("combobox", { name: "Header Tag" });
    await expect(tag).toHaveValue("h4");
    // Under the editor's h2, the group headers keep the heading order at h3.
    await tag.selectOption("h3");
    await expect(editor.getByText("Pager is unavailable while grouping")).toBeVisible();
    await editor.getByRole("button", { name: "Preview" }).click();
    await expect(editor.getByText(TAGS[0]).first()).toBeVisible();
    expect(await axeFindings(page, "afreact-builder")).toEqual([]);
    const { display } = await save(page);
    expect(display.settings).toMatchObject({
      section_group_by: "label",
      header_tag: "h3",
      pager: false,
      sort: [["label", "ASC"]],
    });
  });
});
