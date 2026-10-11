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
const pages = { angular: "/civicrm/admin/search", react: "/civicrm/admin/afreact/search" };

async function cleanUp(page: Page) {
  await page.goto("/civicrm/admin/afreact/search#/list");
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
    type: string;
    label: string;
    settings: Record<string, unknown>;
  }>(page, "SearchDisplay", "get", {
    select: ["type", "label", "settings"],
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

  for (const type of ["Table", "List", "Grid", "Tree"]) {
    test(`a new ${type} display saves with the settings core's editor gives it`, async ({
      page,
    }) => {
      const built: Record<string, unknown> = {};
      for (const renderer of ["angular", "react"] as const) {
        await open(page, renderer, `${LABEL} ${renderer}`, type);
        const { display } = await save(page);
        built[renderer] = { ...display, id: undefined, label: undefined };
      }
      expect(built.react).toEqual(built.angular);
    });
  }

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
