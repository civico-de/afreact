import { expect, test, type Page } from "@playwright/test";
import { loadParams } from "../../src/admin/search/editor";
import { searchRoundTrip } from "../../src/admin/search/roundTrip";
import { api, axeFindings, ownFindings } from "./harness";

// The editor's models name problems with core's ts(); outside the page it only fills placeholders.
globalThis.ts = (text, params = {}) =>
  text.replace(/%(\d+)/g, (match, key: string) => (key in params ? String(params[key]) : match));

const LABEL = "Afreact editor probe";
const TAGS = ["Afreact editor probe A", "Afreact editor probe B"];

interface Stored {
  id: number;
  label: string;
  api_entity: string;
  api_params: Record<string, unknown>;
  form_values: unknown;
  description: string | null;
}

async function cleanUp(page: Page) {
  await page.goto("/civicrm/admin/afreact/search#/list");
  await api(page, "SavedSearch", "delete", { where: [["label", "LIKE", `${LABEL}%`]] });
  await api(page, "Tag", "delete", { where: [["label", "IN", TAGS]] });
}

const stored = (page: Page, id: number) =>
  api<Stored>(page, "SavedSearch", "get", {
    select: ["id", "label", "api_entity", "api_params", "form_values", "description"],
    where: [["id", "=", id]],
  }).then((rows) => rows[0]);

test.describe("SearchKit search editor", () => {
  test.beforeEach(async ({ page }) => {
    await cleanUp(page);
    await api(page, "Tag", "save", {
      records: TAGS.map((label) => ({ label, used_for: ["civicrm_contact"] })),
    });
  });
  test.afterEach(async ({ page }) => {
    await cleanUp(page);
  });

  test("creates a search, previews it and saves it as one record", async ({ page }) => {
    const params = {
      version: 4,
      select: ["id", "label"],
      orderBy: {},
      where: [["label", "LIKE", `${LABEL}%`]],
    };
    await page.goto(
      `/civicrm/admin/afreact/search#/create/Tag?label=${encodeURIComponent(LABEL)}&params=${encodeURIComponent(JSON.stringify(params))}`,
    );
    const editor = page.locator("afreact-builder");
    await expect(editor.getByRole("textbox", { name: "Saved Search label" })).toHaveValue(LABEL);
    await editor.getByRole("button", { name: "Search", exact: true }).click();
    await expect(editor.getByRole("cell", { name: TAGS[0] })).toBeVisible();
    await expect(editor.getByRole("cell", { name: TAGS[1] })).toBeVisible();
    expect(await axeFindings(page, "afreact-builder")).toEqual([]);
    for (const tab of ["Select Fields", "Filter Conditions", "Query Info"]) {
      await editor.getByRole("button", { name: tab }).click();
      await expect(editor.getByRole("button", { name: tab })).toHaveAttribute(
        "aria-current",
        "true",
      );
      expect(await axeFindings(page, "afreact-builder"), tab).toEqual([]);
    }
    await editor.getByRole("button", { name: "Add..." }).click();
    await editor.getByRole("menuitem", { name: "Table" }).click();
    await expect(editor.getByRole("textbox", { name: "Name", exact: true })).toHaveValue(
      `${LABEL} Table 1`,
    );
    expect(await axeFindings(page, "afreact-builder"), "display").toEqual([]);

    await editor.getByRole("button", { name: "Configure Settings" }).click();
    await editor.getByRole("textbox", { name: "Description" }).fill("Probe description");
    await editor.getByRole("button", { name: "Save", exact: true }).click();
    await expect(editor.getByRole("button", { name: "Saved" })).toBeVisible();
    await expect(page).toHaveURL(/#\/edit\/\d+$/);
    const id = Number(/#\/edit\/(\d+)$/.exec(page.url())?.[1]);
    const record = await stored(page, id);
    expect(record).toMatchObject({
      label: LABEL,
      api_entity: "Tag",
      description: "Probe description",
    });
    expect(record?.api_params).toMatchObject({ select: ["id", "label"], where: params.where });

    // Dark mode: beyond what core's own editor shows, nothing.
    await page.emulateMedia({ colorScheme: "dark" });
    const react = await axeFindings(page, "afreact-builder");
    await page.goto(`/civicrm/admin/search#/edit/${String(id)}`);
    await expect(page.locator("#crm-saved-search-label")).toHaveValue(LABEL);
    const angular = await axeFindings(page, "#bootstrap-theme");
    expect(ownFindings(react, angular)).toEqual([]);
    await page.emulateMedia({ colorScheme: "light" });
  });

  test("builds conditions and joins through the editor's controls", async ({ page }) => {
    const params = {
      version: 4,
      select: ["id", "label"],
      orderBy: {},
      where: [],
      join: [],
      groupBy: [],
      having: [],
    };
    await page.goto(
      `/civicrm/admin/afreact/search#/create/Tag?label=${encodeURIComponent(`${LABEL} controls`)}&params=${encodeURIComponent(JSON.stringify(params))}`,
    );
    const editor = page.locator("afreact-builder");
    await editor.getByRole("button", { name: "Filter Conditions" }).click();
    const panel = editor.getByRole("region");
    await panel.getByRole("combobox", { name: "Select field" }).first().fill("Label");
    await page.getByRole("option", { name: "Tag Label" }).click();
    const value = panel.getByRole("textbox").last();
    await value.fill(TAGS[0] ?? "");
    await value.blur();
    expect(await axeFindings(page, "afreact-builder"), "conditions").toEqual([]);
    await editor.getByRole("button", { name: "Search", exact: true }).click();
    await expect(editor.getByRole("cell", { name: TAGS[0] })).toBeVisible();
    await expect(editor.getByRole("cell", { name: TAGS[1] })).toHaveCount(0);

    await editor.getByRole("button", { name: "Search For" }).click();
    await panel.getByRole("combobox", { name: "Join Entity" }).fill("Tag");
    await page.getByRole("listbox", { name: "Join Entity" }).getByRole("option").first().click();
    expect(await axeFindings(page, "afreact-builder"), "join").toEqual([]);
    await editor.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(/#\/edit\/\d+$/);
    const record = await stored(page, Number(/#\/edit\/(\d+)$/.exec(page.url())?.[1]));
    expect(record?.api_params.where).toEqual([["label", "=", TAGS[0]]]);
    expect(record?.api_params.join).toHaveLength(1);
  });

  test("saves an unchanged search back as it was, as core's editor does", async ({ page }) => {
    const [created] = await api<{ id: number }>(page, "SavedSearch", "create", {
      values: {
        label: `${LABEL} round trip`,
        api_entity: "Tag",
        api_params: {
          version: 4,
          select: ["id", "label", "COUNT(used_for) AS COUNT_used_for"],
          where: [["label", "LIKE", `${LABEL}%`]],
          groupBy: ["id"],
          join: [],
          having: [],
          orderBy: { label: "ASC" },
        },
      },
    });
    const id = created?.id ?? 0;
    const before = await stored(page, id);
    await page.goto(`/civicrm/admin/afreact/search#/edit/${String(id)}`);
    const editor = page.locator("afreact-builder");
    const label = editor.getByRole("textbox", { name: "Saved Search label" });
    await expect(label).toHaveValue(`${LABEL} round trip`);
    // An edit and its undo leave the record as it was; saving then must change nothing.
    await label.fill(`${LABEL} round trip!`);
    await label.fill(`${LABEL} round trip`);
    await label.fill(`${LABEL} round trip `);
    await label.fill(`${LABEL} round trip`);
    await expect(editor.getByRole("button", { name: "Saved" })).toBeDisabled();
    await label.fill(`${LABEL} round trip 2`);
    await editor.getByRole("button", { name: "Save", exact: true }).click();
    await expect(editor.getByRole("button", { name: "Saved" })).toBeVisible();
    const after = await stored(page, id);
    expect({ ...after, label: before?.label }).toEqual(before);
  });

  test("asks before leaving unsaved changes and keeps history intact when refused", async ({
    page,
  }) => {
    await page.goto("/civicrm/admin/afreact/search#/list");
    const editor = page.locator("afreact-builder");
    await expect(editor.getByRole("searchbox", { name: "Filter by label" })).toBeVisible();
    await page.evaluate(() => {
      window.location.hash = "#/create/Tag";
    });
    const label = editor.getByRole("textbox", { name: "Saved Search label" });
    await label.fill(`${LABEL} unsaved`);
    page.once("dialog", (dialog) => void dialog.dismiss());
    await page.evaluate(() => {
      window.location.hash = "#/list?tab=template";
    });
    await expect(label).toHaveValue(`${LABEL} unsaved`);
    expect(new URL(page.url()).hash).toMatch(/^#\/create\/Tag/);
    page.once("dialog", (dialog) => void dialog.dismiss());
    await page.evaluate(() => {
      window.history.back();
    });
    await expect(label).toHaveValue(`${LABEL} unsaved`);
    await expect.poll(() => new URL(page.url()).hash).toMatch(/^#\/create\/Tag/);
    // The list the editor was opened from is still the entry before it.
    page.once("dialog", (dialog) => void dialog.accept());
    await page.evaluate(() => {
      window.history.back();
    });
    await expect(editor.getByRole("searchbox", { name: "Filter by label" })).toBeVisible();
    expect(new URL(page.url()).hash).toBe("#/list");
  });
});

// Reports IDs and paths only: a search's conditions can hold personal data.
test("every search on the site saves back unedited as core's editor would", async ({ page }) => {
  await page.goto("/civicrm/admin/afreact/search#/list");
  const ids = await api<{ id: number }>(page, "SavedSearch", "get", { select: ["id"] });
  const found: string[] = [];
  for (const { id } of ids) {
    const [record] = await api<Record<string, unknown>>(
      page,
      "SavedSearch",
      "get",
      loadParams(id, "edit"),
    );
    try {
      if (!record) throw new Error("not loaded");
      const { differs } = searchRoundTrip(record);
      if (differs.length) found.push(`${String(id)}: ${differs.join(", ")}`);
    } catch (error) {
      found.push(`${String(id)}: ${error instanceof Error ? error.message : "load failed"}`);
    }
  }
  expect(ids.length).toBeGreaterThan(0);
  expect(found).toEqual([]);
});

test.describe("SearchKit search editor parity", () => {
  const TITLE = `${LABEL} group`;
  const params = {
    version: 4,
    select: [
      "id",
      "display_name",
      "COUNT(Contact_Email_contact_id_01.email) AS COUNT_Contact_Email_contact_id_01_email",
    ],
    orderBy: {},
    where: [["contact_type:name", "=", "Individual"]],
    groupBy: ["id"],
    join: [
      [
        "Email AS Contact_Email_contact_id_01",
        "LEFT",
        ["id", "=", "Contact_Email_contact_id_01.contact_id"],
      ],
    ],
    having: [],
  };
  const pages = { angular: "/civicrm/admin/search", react: "/civicrm/admin/afreact/search" };

  async function removeProbes(page: Page) {
    await page.goto("/civicrm/admin/afreact/search#/list");
    await api(page, "Group", "delete", { where: [["title", "LIKE", `${TITLE}%`]] });
    await api(page, "SavedSearch", "delete", { where: [["label", "LIKE", `${LABEL}%`]] });
  }
  test.beforeEach(async ({ page }) => {
    await removeProbes(page);
  });
  test.afterEach(async ({ page }) => {
    await removeProbes(page);
  });

  async function build(page: Page, renderer: keyof typeof pages) {
    const label = `${LABEL} ${renderer}`;
    await page.goto(
      `${pages[renderer]}#/create/Contact?label=${encodeURIComponent(label)}&params=${encodeURIComponent(JSON.stringify(params))}`,
    );
    await expect(page.locator("#crm-saved-search-label")).toHaveValue(label);
    await page.getByRole("button", { name: "Add..." }).click();
    await page
      .getByRole(renderer === "react" ? "menuitem" : "link", { name: "Smart Group" })
      .click();
    await page.locator("#crm-search-admin-group-title").fill(`${TITLE} ${renderer}`);
    await page.getByRole("checkbox", { name: "Mailing List" }).check();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(/#\/edit\/\d+$/);
    const id = Number(/#\/edit\/(\d+)$/.exec(page.url())?.[1]);
    const [search] = await api<Record<string, unknown>>(page, "SavedSearch", "get", {
      select: [
        "label",
        "api_entity",
        "api_params",
        "form_values",
        "description",
        "is_template",
        "expires_date",
        "timeout",
      ],
      where: [["id", "=", id]],
    });
    const groups = await api<Record<string, unknown>>(page, "Group", "get", {
      select: ["title", "description", "visibility", "group_type", "is_active", "is_hidden"],
      where: [["saved_search_id", "=", id]],
    });
    return {
      search: { ...search, id: undefined, label: undefined },
      groups: groups.map((group) => ({ ...group, id: undefined, title: undefined })),
    };
  }

  test("a search with a join, conditions, group by and a smart group saves as in core's editor", async ({
    page,
  }) => {
    const angular = await build(page, "angular");
    const react = await build(page, "react");
    expect(react.groups).toHaveLength(1);
    expect(react).toEqual(angular);
  });
});
