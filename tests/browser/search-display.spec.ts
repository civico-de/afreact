import { expect, type Page } from "@playwright/test";
import { test } from "./coverage";
import { unknownSettings } from "../../src/admin/search/display/knownSettings";
import { api, axeFindings, coreBuilders, ownFindings } from "./harness";

coreBuilders();

const LABEL = "Afreact display probe";
const TAGS = ["Afreact display probe A", "Afreact display probe B"] as const;
const params = {
  version: 4,
  select: ["id", "label"],
  orderBy: {},
  where: [["label", "LIKE", `${LABEL}%`]],
};
const FORM = "afreactDisplayProbeForm";
const pages = {
  angular: "/civicrm/admin/search",
  react: "/civicrm/admin/afreact/search",
};

async function cleanUp(page: Page) {
  await page.goto("/civicrm/admin/afreact/search#/list");
  await api(page, "Job", "delete", {
    where: [["api_entity", "LIKE", "SK_AfreactDisplayProbe%"]],
  });
  await api(page, "Afform", "revert", { where: [["name", "=", FORM]] });
  await api(page, "SavedSearch", "delete", {
    where: [["label", "LIKE", `${LABEL}%`]],
  });
  await api(page, "Tag", "delete", { where: [["label", "IN", TAGS]] });
  await api(page, "OptionValue", "delete", {
    where: [
      ["option_group_id:name", "=", "search_display_type"],
      ["value", "=", "afreact-probe"],
    ],
  });
}

async function open(page: Page, renderer: keyof typeof pages, label: string, type = "Table") {
  await page.goto(
    `${pages[renderer]}#/create/Tag?label=${encodeURIComponent(label)}&params=${encodeURIComponent(JSON.stringify(params))}`,
  );
  await expect(page.locator("#crm-saved-search-label")).toHaveValue(label);
  await page.getByRole("button", { name: "Add..." }).click();
  await page
    .getByRole(renderer === "react" ? "menuitem" : "link", {
      name: type,
      exact: true,
    })
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
        built.push({
          ...display,
          id: undefined,
          name: undefined,
          label: undefined,
        });
      }
      const [angular, react] = built;
      expect(unknownSettings(angular?.type ?? "", angular?.settings)).toEqual([]);
      // Core adds description to the entity's metadata, so its new autocompletes search by it.
      if (type === "Autocomplete" && angular) {
        expect(angular.settings.searchFields).toEqual(["id", "label", "description"]);
        angular.settings = {
          ...angular.settings,
          searchFields: ["id", "label"],
        };
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
      .getByRole("tab", { name: /DB Entity 1/ })
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
        const [saved] = await api<{
          settings: { columns: { name?: string }[] };
        }>(page, "SearchDisplay", "get", {
          select: ["settings"],
          where: [["name", "=", name]],
        });
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
        {
          key: "label",
          required: true,
          default: "Probe",
          tally: { fn: "COUNT" },
        },
      ],
    });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(`/civicrm/admin/search#/edit/${String(id)}`);
    await page
      .getByRole("tab", { name: /Data Entry 1/ })
      .first()
      .click();
    await expect(page.getByText("Show Totals in Footer")).toBeAttached();
    expect(ownFindings(react, await axeFindings(page, "#bootstrap-theme"))).toEqual([]);
    await page.emulateMedia({ colorScheme: "light" });
  });

  test("a chart saves the same settings as core's editor and edits its columns and canvas", async ({
    page,
  }) => {
    const saved: Record<string, Record<string, unknown>> = {};
    for (const renderer of ["angular", "react"] as const) {
      await open(page, renderer, `${LABEL} ${renderer}`, "Chart");
      await page.getByRole("radio", { name: "Pie" }).check();
      await expect(page.getByRole("group", { name: "Values", exact: true })).toBeVisible();
      saved[renderer] = (await save(page)).display.settings;
    }
    expect(saved.react).toEqual(saved.angular);

    await open(page, "react", LABEL, "Chart");
    const editor = page.locator("afreact-builder");
    await editor.getByRole("radio", { name: "Pie" }).check();
    const values = editor.getByRole("group", { name: "Values", exact: true });
    await expect(values.getByRole("button", { name: "Add field" })).toHaveCount(0);
    await expect(values.getByRole("button", { name: /^Remove/ })).toHaveCount(0);
    await values.getByRole("combobox", { name: /^Field/ }).selectOption("id");
    const category = editor.getByRole("group", {
      name: "Category",
      exact: true,
    });
    await category.getByRole("button", { name: "Add field" }).click();
    await category
      .getByRole("combobox", { name: /^Field/ })
      .nth(1)
      .selectOption("label");
    await editor.getByRole("textbox", { name: "Title" }).fill("Probe chart");
    await editor.getByRole("spinbutton", { name: "Max segments to show" }).fill("4");
    await editor.getByRole("combobox", { name: "Show legend?" }).selectOption("right");
    await editor.getByRole("button", { name: "Preview" }).click();
    await expect(editor.locator("civi-search-display-chart-kit svg")).toBeVisible();
    expect(await axeFindings(page, "afreact-builder")).toEqual([]);
    await page.emulateMedia({ colorScheme: "dark" });
    const react = await axeFindings(page, "afreact-builder");
    await page.emulateMedia({ colorScheme: "light" });
    const { id, display } = await save(page);
    expect(display.settings).toMatchObject({
      chartType: "pie",
      maxSegments: 4,
      showLegend: "right",
      format: { title: "Probe chart" },
      columns: [
        { axis: "w", key: "id" },
        { axis: "y", key: "id" },
        {
          axis: "w",
          key: "label",
          label: "Tag Label",
          scaleType: "categorical",
        },
      ],
    });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(`/civicrm/admin/search#/edit/${String(id)}`);
    await page
      .getByRole("tab", { name: /Chart 1/ })
      .first()
      .click();
    await expect(page.getByText("Max segments to show")).toBeAttached();
    expect(ownFindings(react, await axeFindings(page, "#bootstrap-theme"))).toEqual([]);
    await page.emulateMedia({ colorScheme: "light" });
  });

  test("a chart of each type saves without settings its React editor would name as unknown", async ({
    page,
  }) => {
    await open(page, "react", LABEL, "Chart");
    const types = page.locator("afreact-builder").getByRole("radio");
    await expect(types.first()).toBeVisible();
    const names = await types.evaluateAll((radios) =>
      radios.map(
        (radio) =>
          radio.getAttribute("aria-label") ?? radio.closest("label")?.textContent?.trim() ?? "",
      ),
    );
    expect(names.length).toBeGreaterThan(3);
    const found: string[] = [];
    for (const name of names) {
      // A new document each time: a hash change alone keeps the editor's unsaved search.
      await page.goto("about:blank");
      await open(page, "react", `${LABEL} ${name}`, "Chart");
      await page.getByRole("radio", { name, exact: true }).check();
      const { display } = await save(page);
      found.push(
        ...unknownSettings("chart-kit", display.settings).map((path) => `${name}: ${path}`),
      );
    }
    expect(found).toEqual([]);
  });

  test("no display on the site has settings its React editor would name as unknown", async ({
    page,
  }) => {
    await page.goto("/civicrm/admin/afreact/search#/list");
    const displays = await api<{ name: string; type: string; settings: unknown }>(
      page,
      "SearchDisplay",
      "get",
      {
        select: ["name", "type", "settings"],
        where: [
          [
            "type",
            "IN",
            ["table", "list", "grid", "tree", "batch", "autocomplete", "entity", "chart-kit"],
          ],
        ],
      },
    );
    expect(displays.length).toBeGreaterThan(0);
    const found = displays.flatMap(({ name, type, settings }) =>
      unknownSettings(type, settings).map((path) => `${name}: ${path}`),
    );
    expect(found).toEqual([]);
  });

  // deviation:display-settings-unknown-kept
  test("names settings it cannot edit, links the classic builder and saves them back", async ({
    page,
  }) => {
    const settings = {
      columns: [{ type: "field", key: "label", label: "Label", sortable: true, ribbon: "red" }],
      mystery: { kept: 1 },
    };
    const [search] = await api<{ id: number }>(page, "SavedSearch", "create", {
      values: { label: LABEL, api_entity: "Tag", api_params: params },
      chain: {
        display: [
          "SearchDisplay",
          "create",
          {
            values: {
              saved_search_id: "$id",
              name: "Foreign",
              label: "Foreign",
              type: "table",
              settings,
            },
          },
        ],
      },
    });
    if (!search) throw new Error("The probe search was not created.");
    await page.goto(`${pages.react}#/edit/${String(search.id)}`);
    await page.locator('button[id$="-tab-display_0"]').click();
    const notice = page.getByRole("status").filter({ hasText: "cannot edit" });
    await expect(notice.locator("code")).toHaveText(["columns[0].ribbon", "mystery"]);
    await expect(
      notice.getByRole("link", { name: "Edit them in the classic builder." }),
    ).toHaveAttribute("href", `${pages.angular}#/edit/${String(search.id)}`);
    expect(await axeFindings(page, ".messages")).toEqual([]);
    await page.getByRole("textbox", { name: "Name", exact: true }).fill("Foreign kept");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect
      .poll(async () =>
        (
          await api<{ label: string; settings: typeof settings }>(page, "SearchDisplay", "get", {
            select: ["label", "settings"],
            where: [["saved_search_id", "=", search.id]],
          })
        ).map((d) => [d.label, d.settings.mystery, d.settings.columns[0]?.ribbon]),
      )
      .toEqual([["Foreign kept", { kept: 1 }, "red"]]);
  });

  test("warns that removing a display deletes the form embedding it", async ({ page }) => {
    const [search] = await api<{ id: number; name: string }>(page, "SavedSearch", "create", {
      values: { label: LABEL, api_entity: "Tag", api_params: params },
      chain: {
        display: [
          "SearchDisplay",
          "create",
          {
            values: {
              saved_search_id: "$id",
              name: "Embedded",
              label: "Embedded",
              type: "table",
            },
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

  // deviation:search-display-plugin-editors
  test("another extension's editor element edits its display type's settings", async ({ page }) => {
    await api(page, "OptionValue", "create", {
      values: {
        "option_group_id:name": "search_display_type",
        value: "afreact-probe",
        name: "crm-search-display-afreact-probe",
        label: "Probe",
        icon: "fa-flask",
      },
    });
    // A plugin's element: a select bound to settings.mode; no mode blocks saving.
    // As a string: the test runner's transpiler would add helpers the page lacks to a class.
    await page.addInitScript(`
      class ProbeEditor extends HTMLElement {
        select = document.createElement("select");
        connectedCallback() {
          this.select.setAttribute("aria-label", "Probe mode");
          for (const mode of ["", "a", "b"]) this.select.add(new Option(mode || "none", mode));
          this.select.addEventListener("change", () => {
            this.dispatchEvent(
              new CustomEvent("change", {
                detail: { settings: { mode: this.select.value, columns: [] } },
              }),
            );
          });
          this.append(this.select);
        }
        set display(display) {
          this.select.value = display.settings?.mode ?? "";
        }
        get validationMessage() {
          return this.select.value ? "" : "Choose a probe mode.";
        }
      }
      customElements.define("afreact-search-admin-display-afreact-probe", ProbeEditor);
      // Its renderer: names the search it was given (by name or as JSON) and the mode.
      class ProbeDisplay extends HTMLElement {
        connectedCallback() {
          const search = this.getAttribute("search") ?? "";
          const entity = search.startsWith("{") ? JSON.parse(search).api_entity : search;
          const mode = JSON.parse(this.getAttribute("settings") ?? "{}").mode;
          this.textContent = "Probe of " + entity + " in mode " + mode;
        }
      }
      customElements.define("civi-search-display-afreact-probe", ProbeDisplay);
    `);
    // A new document, so that the script runs: open() alone may only change the hash.
    await page.goto("about:blank");
    await open(page, "react", LABEL, "Probe");
    const editor = page.locator("afreact-builder");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(editor.getByText("Choose a probe mode.")).toBeVisible();
    await editor.getByRole("combobox", { name: "Probe mode" }).selectOption("b");
    await editor.getByRole("button", { name: "Preview" }).click();
    await expect(editor.locator("civi-search-display-afreact-probe")).toHaveText(
      "Probe of Tag in mode b",
    );
    const { id, display } = await save(page);
    expect(display).toMatchObject({
      type: "afreact-probe",
      settings: { mode: "b" },
    });
    const [search] = await api<{ name: string }>(page, "SavedSearch", "get", {
      select: ["name"],
      where: [["id", "=", id]],
    });
    await page.goto(`/civicrm/afreact/search#/display/${search?.name ?? ""}/${display.name}`);
    await expect(page.locator("civi-search-display-afreact-probe")).toHaveText(
      `Probe of ${search?.name ?? ""} in mode b`,
    );
  });

  // deviation:search-builder-panels
  test("another extension's builder panel follows the search and blocks saving", async ({
    page,
  }) => {
    // afreactisland names its panel in civi.afreact.assets; a "[block]" label blocks saving.
    await open(page, "react", LABEL);
    const panel = page.locator("afreact-island-panel");
    const seen = () =>
      panel.evaluate((element) => {
        const search: unknown = Reflect.get(element, "record");
        return search && typeof search === "object" && "label" in search ? search.label : null;
      });
    await expect.poll(seen).toBe(LABEL);
    const label = page.locator("#crm-saved-search-label");
    await label.fill(`${LABEL} [block]`);
    await expect(panel).toHaveText("The island panel blocks this label.");
    let writes = 0;
    page.on("request", (request) => {
      if (/SavedSearch|SearchDisplay/.test(request.postData() ?? request.url())) writes++;
    });
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const refusal = page.locator("afreact-builder .messages.error");
    await expect(refusal).toContainText("The island panel blocks this label.");
    // Saving again refuses again in a new alert, which screen readers announce.
    const first = await refusal.elementHandle();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => first?.evaluate((element) => element.isConnected)).toBe(false);
    await expect(refusal).toContainText("The island panel blocks this label.");
    expect(writes).toBe(0);
    await label.fill(LABEL);
    await expect(panel).toHaveText("");
    const { display } = await save(page);
    expect(display.type).toBe("table");
  });

  // deviation:search-builder-panels
  test("another extension's builder panel notes ask before saving", async ({ page }) => {
    await open(page, "react", LABEL);
    const label = page.locator("#crm-saved-search-label");
    await label.fill(`${LABEL} [note]`);
    let writes = 0;
    page.on("request", (request) => {
      if (/\/api4\/(SavedSearch|SearchDisplay)\/(save|create|update|delete)\b/.test(request.url()))
        writes++;
    });
    const asked: string[] = [];
    page.once("dialog", (dialog) => {
      asked.push(dialog.message());
      void dialog.dismiss();
    });
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect
      .poll(() => asked)
      .toEqual(["Other extensions report on this search:\n\nThe island panel notes this label."]);
    expect(writes).toBe(0);
    page.once("dialog", (dialog) => {
      void dialog.accept();
    });
    const { display } = await save(page);
    expect(display.type).toBe("table");
  });

  // deviation:search-builder-classic-only
  test("an extension decorating core's builder sends saving to the classic builder", async ({
    page,
  }) => {
    const NOTICE = "Other extensions change the classic search builder";
    await open(page, "react", LABEL);
    await expect(
      page.locator("afreact-builder").getByRole("status").filter({ hasText: NOTICE }),
    ).toHaveCount(0);
    // The island fixture's module, decorating core's builder directive as smartchart's does.
    await page.route("**/afreactisland/ang/afreactIslandAdmin.js*", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: `${await response.text()}\nangular.module("afreactIslandAdmin").decorator("crmSearchAdminDirective", ["$delegate", (d) => d]);`,
      });
    });
    await page.goto("about:blank");
    await open(page, "react", LABEL);
    const notice = page.locator("afreact-builder").getByRole("status").filter({ hasText: NOTICE });
    await expect(notice.getByRole("listitem")).toHaveText(["afreactIslandAdmin"]);
    await expect(notice.getByRole("link", { name: "Open the classic builder." })).toHaveAttribute(
      "href",
      /\/civicrm\/admin\/search#\/list$/,
    );
    let writes = 0;
    page.on("request", (request) => {
      if (/SavedSearch|SearchDisplay/.test(request.postData() ?? request.url())) writes++;
    });
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator("afreact-builder .messages.error")).toContainText(NOTICE);
    expect(writes).toBe(0);
  });

  // deviation:search-display-plugin-editors
  test("another extension's Angular display editor runs as an island", async ({ page }) => {
    const saved: Record<string, Record<string, unknown>> = {};
    const findings: Record<string, string[]> = {};
    const names: Record<string, string> = {};
    await page.addInitScript(() => {
      window.addEventListener("hashchange", () => {
        Reflect.set(
          window,
          "afreactHashChanges",
          Number(Reflect.get(window, "afreactHashChanges") ?? 0) + 1,
        );
      });
    });
    for (const renderer of ["angular", "react"] as const) {
      await open(page, renderer, `${LABEL} ${renderer}`, "Island");
      await page.getByRole("textbox", { name: "Island note" }).fill("From Angular");
      await page.getByRole("combobox", { name: "Island column" }).selectOption("label");
      if (renderer === "react") {
        // The island's ngRoute and $location leave the page's URL to React's own encoding.
        expect(await page.evaluate((): unknown => Reflect.get(window, "afreactHashChanges"))).toBe(
          undefined,
        );
        expect(page.url()).toContain(
          `label=${encodeURIComponent(LABEL).replaceAll("%20", "+")}+react`,
        );
      }
      findings[renderer] = await axeFindings(page, "search-admin-display-afreact-island");
      const { display } = await save(page);
      saved[renderer] = display.settings;
      names[renderer] = display.name;
    }
    expect(findings.react).toEqual(findings.angular);
    expect(saved.react).toEqual(saved.angular);
    expect(saved.react).toEqual({
      note: "From Angular",
      column: "label",
      columns: [],
    });

    const editor = page.locator("afreact-builder");
    const column = editor.getByRole("combobox", { name: "Island column" });
    const tab = editor.getByRole("button", {
      name: `${LABEL} react Island 1`,
      exact: true,
    });
    await tab.click();
    // The save's id and name reach the island, whose header now links the display.
    await expect(editor.getByRole("link", { name: "View Display" })).toHaveAttribute(
      "href",
      new RegExp(`#/display/[^/]+/${names.react ?? ""}$`),
    );
    await expect(column.getByRole("option")).toHaveText(["id", "label"]);
    // The editor reads the columns once, so the island is rebuilt with the search's new ones.
    await editor.getByRole("button", { name: "Select Fields" }).click();
    await editor
      .getByRole("group", { name: "Tag ID" })
      .getByRole("button", { name: "Remove Tag ID" })
      .click();
    await tab.click();
    await expect(column.getByRole("option")).toHaveText(["label"]);
    await expect(editor.getByRole("textbox", { name: "Island note" })).toHaveValue("From Angular");
    await editor.getByRole("button", { name: "Preview" }).click();
    await expect(editor.locator(".afreact-island-note")).toHaveText("Island note: From Angular");
    expect(await axeFindings(page, "afreact-builder")).toEqual([]);

    // A display added to a saved search keeps its island through the save, which names it.
    await editor.getByRole("button", { name: "Add..." }).click();
    await page.getByRole("menuitem", { name: "Island", exact: true }).click();
    await expect(editor.getByRole("link", { name: "View Display" })).toHaveCount(0);
    // The removed column may break the saved island display, whose settings React cannot carry.
    const asked = page.waitForEvent("dialog").then(async (dialog) => {
      const message = dialog.message();
      await dialog.accept();
      return message;
    });
    await editor.getByRole("button", { name: "Save", exact: true }).click();
    expect(await asked).toContain(`${LABEL} react Island 1`);
    await expect(editor.getByRole("link", { name: "View Display" })).toHaveAttribute(
      "href",
      /#\/display\/[^/]+\/[^/]+$/,
    );
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
