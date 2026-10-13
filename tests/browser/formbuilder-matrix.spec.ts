/**
 * Every entity type FormBuilder can add, made into a new form and a new block in React's builder:
 * the type's default fields show, a field added by keyboard joins them, the
 * save keeps both on reopening, and the form renders the same fields under React and Angular,
 * neither raising an error. Reports the type and the step that failed.
 * MATRIX_TYPES=Individual,Activity checks only those types.
 */
import { stripVTControlCharacters } from "node:util";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { api, API_PAGE, axeFindings, isRecord, quietApi, setReactForms } from "./harness";

const RUN = Date.now().toString(36);
const TITLE = `Afreact matrix ${RUN} `;
const made: string[] = [];
/** afreact_forms as the run found it; afterAll puts it back. */
let reactForms: string[] | null = null;

const routeOf = (entity: string) => `civicrm/afreact-matrix-${RUN}-${entity.toLowerCase()}`;
const canvas = (page: Page) => page.locator("#afGuiEditor-canvas-body");
const canvasLabels = (page: Page) =>
  canvas(page).getByRole("textbox", { name: "Field label" }).allTextContents();

/** The types the palette's Add Entity menu offers on a new form. */
async function entityTypes(page: Page): Promise<string[]> {
  await page.goto("/civicrm/admin/afreact/afform#/create/form/Individual");
  await expect(canvas(page)).toBeVisible();
  const entities: unknown = await page.evaluate(
    () => window.CRM.vars?.afreactAdmin?.afGuiEditor?.entities,
  );
  if (!isRecord(entities)) throw new Error("No editor entities.");
  return Object.entries(entities)
    .filter(([, entity]) => isRecord(entity) && !!entity.defaults)
    .map(([type]) => type);
}

/** Picks a palette tile up and drops it at the first place the keyboard offers. */
async function dropTile(page: Page, tile: Locator): Promise<string> {
  const title = ((await tile.locator(".afreact-tile-title").textContent()) ?? "").trim();
  await tile.focus();
  await page.keyboard.press("Space");
  await expect(page.getByText(`Picked up ${title}.`)).toBeAttached();
  const region = page.locator("[id^=DndLiveRegion]");
  for (let step = 0; step < 8; step++) {
    const before = await region.textContent();
    await page.keyboard.press("ArrowDown");
    // A key that keeps the target announces nothing.
    await expect(region)
      .not.toHaveText(before ?? "", { timeout: 1_000 })
      .catch(() => undefined);
    if ((await region.textContent())?.includes(`${title} moved to place`)) break;
  }
  await page.keyboard.press("Space");
  await expect(page.getByText(`${title} dropped to place`)).toBeAttached();
  return title;
}

/** The free tiles of the open tab's palette group whose name ends in `group`. */
const freeTiles = (page: Page, group: RegExp) =>
  page
    .locator("#afGuiEditor-palette")
    .getByRole("group", { name: group })
    .first()
    .locator("[role=button]:not([aria-disabled=true])");

/**
 * Adds the first free field of the entity's own fields to its fieldset, by keyboard. A type
 * without boilerplate starts without the fieldset, which is placed first.
 */
async function addField(page: Page): Promise<string> {
  const free = freeTiles(page, /Fields$/);
  const fieldset = free.filter({ hasText: /^Fieldset for/ });
  if (await fieldset.count()) await dropTile(page, fieldset.first());
  return dropTile(page, free.filter({ hasNotText: /^Fieldset for/ }).first());
}

/** Saves a new form and returns the name it got. */
async function saveNew(page: Page): Promise<string> {
  const response = page.waitForResponse("**/civicrm/ajax/api4/Afform/save");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  // Recorded from the answer, so afterAll reverts it even when a later check fails.
  const answer: unknown = await (await response).json();
  const values: unknown = isRecord(answer) ? answer.values : null;
  const saved: unknown = Array.isArray(values) ? values.at(0) : null;
  if (isRecord(saved) && typeof saved.name === "string") made.push(saved.name);
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
  const name = /#\/edit\/(\w+)/.exec(page.url())?.[1];
  if (!name) throw new Error(`No form name in ${page.url()}`);
  expect(made).toContain(name);
  return name;
}

/** Focus offers the route's start; the rest is typed after it. */
async function typeRoute(page: Page, path: string) {
  const route = page.getByRole("textbox", { name: "Page Route" });
  await route.focus();
  await expect(route).toHaveValue("civicrm/");
  await route.pressSequentially(path.slice("civicrm/".length));
}

async function build(page: Page, type: "form" | "block", entity: string): Promise<string> {
  // A new document, so the previous editor's canvas cannot pass for this one.
  await page.goto("about:blank");
  await page.goto(`/civicrm/admin/afreact/afform#/create/${type}/${entity}`);
  await expect(canvas(page)).toBeVisible();
  const title = page.getByRole("textbox", { name: /^Title/ });
  await title.fill(`${TITLE}${type} ${entity}`);
  if (type === "form") {
    await typeRoute(page, routeOf(entity));
  }
  const before = await canvasLabels(page);
  // The entity's tab follows Settings and Elements.
  await page.getByRole("tablist", { name: "Form parts" }).getByRole("tab").nth(2).click();
  const added = await addField(page);
  await expect.poll(() => canvasLabels(page)).toContain(added);
  const after = await canvasLabels(page);
  expect(after.length).toBe(before.length + 1);
  const name = await saveNew(page);
  await page.goto("about:blank");
  await page.goto(`/civicrm/admin/afreact/afform#/edit/${name}`);
  await expect(page.getByRole("textbox", { name: /^Title/ })).toHaveValue(
    `${TITLE}${type} ${entity}`,
  );
  await expect.poll(() => canvasLabels(page)).toEqual(after);
  if (type === "form")
    await expect(page.getByRole("textbox", { name: "Page Route" })).toHaveValue(routeOf(entity));
  return name;
}

/** The fields a rendered form shows, by name and label, in order. */
async function renderedFields(page: Page, route: string) {
  await page.goto(`/${route}`);
  const fields = page.locator("af-form af-field[name]");
  await expect(fields.first()).toBeVisible();
  return fields.evaluateAll((all) =>
    all.map((field) => {
      const label = field.querySelector("label")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      return `${field.getAttribute("name") ?? ""}: ${label.replace(/\s*\*$/, "")}`;
    }),
  );
}

/** The form's fields as React renders them, then as Angular does. */
async function renderBoth(page: Page, name: string, route: string) {
  await setReactForms(page, [name]);
  const react = await renderedFields(page, route);
  await expect(page.locator(".afreact-form")).toBeVisible();
  await setReactForms(page, []);
  const angular = await renderedFields(page, route);
  await expect(page.locator(".afreact-form")).toHaveCount(0);
  return { react, angular };
}

/** Records the afreact_forms setting before a test first changes it. */
async function keepReactForms(page: Page) {
  if (reactForms) return;
  await page.goto(API_PAGE);
  const [setting] = await api<{ value: unknown }>(page, "Setting", "get", {
    select: ["afreact_forms"],
  });
  reactForms = Array.isArray(setting?.value) ? setting.value.map(String) : [];
}

test.setTimeout(1_800_000);

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  if (reactForms) {
    await page.goto(API_PAGE);
    await quietApi(page, "Setting", "set", { values: { afreact_forms: reactForms } });
  }
  if (made.length)
    await quietApi(page, "Afform", "revert", {
      where: [
        ["name", "IN", made],
        ["has_base", "=", false],
      ],
    });
  await page.close();
});

test("builds, saves and renders a form and a block of every entity type", async ({ page }) => {
  page.setDefaultTimeout(30_000);
  const raised: string[] = [];
  page.on("pageerror", (error) => raised.push(`page error ${error.message.split("\n")[0] ?? ""}`));
  page.on("console", (message) => {
    if (message.type() === "error")
      raised.push(`console error ${message.text().split("\n")[0] ?? ""}`);
  });
  page.on("dialog", (dialog) => {
    raised.push(`${dialog.type()} dialog`);
    void dialog.accept();
  });
  await keepReactForms(page);
  const only = process.env.MATRIX_TYPES?.split(",");
  const types = (await entityTypes(page)).filter((type) => !only || only.includes(type));
  expect(types.length).toBeGreaterThan(0);
  const found: string[] = [];
  for (const entity of types) {
    for (const type of ["form", "block"] as const) {
      raised.length = 0;
      const step = `${type} ${entity}`;
      try {
        const name = await build(page, type, entity);
        if (type === "form") {
          const { react, angular } = await renderBoth(page, name, routeOf(entity));
          if (JSON.stringify(react) !== JSON.stringify(angular))
            found.push(
              `${step}: React ${JSON.stringify(react)} Angular ${JSON.stringify(angular)}`,
            );
        }
        for (const error of raised) found.push(`${step}: ${error}`);
      } catch (error) {
        const lines =
          error instanceof Error ? stripVTControlCharacters(error.message).split("\n") : ["failed"];
        const message = lines
          .filter(
            (line, index) =>
              index === 0 || /^(Locator|Received|Timeout|Expected)/.test(line.trim()),
          )
          .map((line) => line.trim())
          .join(" ");
        found.push(`${step}: ${[message, ...raised].join(", ")}`);
        // The page as the step left it, for the report.
        await page.screenshot({ path: `test-results/matrix-${type}-${entity}.png` });
        await page.goto("about:blank");
      }
    }
  }
  expect(found).toEqual([]);
});

test("builds, saves and renders a form of two entities, several fields and a block", async ({
  page,
}) => {
  page.setDefaultTimeout(30_000);
  const raised: string[] = [];
  page.on("pageerror", (error) => raised.push(`page error ${error.message.split("\n")[0] ?? ""}`));
  page.on("console", (message) => {
    if (message.type() === "error")
      raised.push(`console error ${message.text().split("\n")[0] ?? ""}`);
  });
  page.on("dialog", (dialog) => {
    raised.push(`${dialog.type()} dialog`);
    void dialog.accept();
  });
  await keepReactForms(page);
  const route = routeOf("composite");
  await page.goto("/civicrm/admin/afreact/afform#/create/form/Individual");
  await expect(canvas(page)).toBeVisible();
  await page.getByRole("textbox", { name: /^Title/ }).fill(`${TITLE}composite`);
  await typeRoute(page, route);
  const tabs = page.getByRole("tablist", { name: "Form parts" }).getByRole("tab");
  await tabs.nth(2).click();
  const before = await canvasLabels(page);
  const fields = [await addField(page), await addField(page), await addField(page)];
  // A block core ships, not one an earlier run left behind.
  await dropTile(
    page,
    freeTiles(page, /^Blocks$/)
      .filter({ hasNotText: TITLE })
      .first(),
  );
  await page.getByRole("button", { name: "Add Entity" }).click();
  await page.locator(".dropdown-menu").getByText("Activity", { exact: true }).click();
  await expect(tabs).toHaveCount(4);
  await tabs.nth(3).click();
  fields.push(await addField(page), await addField(page));
  await expect.poll(() => canvasLabels(page)).toEqual(expect.arrayContaining(fields));
  const after = await canvasLabels(page);
  // The block's own fields count beside the five added.
  expect(after.length).toBeGreaterThan(before.length + fields.length);
  const name = await saveNew(page);
  await page.goto("about:blank");
  await page.goto(`/civicrm/admin/afreact/afform#/edit/${name}`);
  await expect.poll(() => canvasLabels(page)).toEqual(after);
  await expect(tabs).toHaveCount(4);
  const saved = await api<{ layout: string }>(page, "Afform", "get", {
    select: ["layout"],
    layoutFormat: "html",
    where: [["name", "=", name]],
  });
  expect(saved[0]?.layout).toContain(`name="Activity1"`);
  const { react, angular } = await renderBoth(page, name, route);
  expect(react.length).toBeGreaterThanOrEqual(fields.length);
  expect(react).toEqual(angular);
  expect(raised).toEqual([]);
});

test("embeds a block of several fields in a form of two entities of one type", async ({ page }) => {
  page.setDefaultTimeout(30_000);
  const raised: string[] = [];
  page.on("pageerror", (error) => raised.push(`page error ${error.message.split("\n")[0] ?? ""}`));
  page.on("console", (message) => {
    if (message.type() === "error")
      raised.push(`console error ${message.text().split("\n")[0] ?? ""}`);
  });
  page.on("dialog", (dialog) => {
    raised.push(`${dialog.type()} dialog`);
    void dialog.accept();
  });
  await keepReactForms(page);
  const tabs = page.getByRole("tablist", { name: "Form parts" }).getByRole("tab");

  const blockTitle = `${TITLE}varied block`;
  await page.goto("/civicrm/admin/afreact/afform#/create/block/Individual");
  await expect(canvas(page)).toBeVisible();
  await page.getByRole("textbox", { name: /^Title/ }).fill(blockTitle);
  await tabs.nth(2).click();
  const blockFields = [await addField(page), await addField(page), await addField(page)];
  await expect.poll(() => canvasLabels(page)).toEqual(expect.arrayContaining(blockFields));
  await saveNew(page);

  const route = routeOf("two-individuals");
  await page.goto("about:blank");
  await page.goto("/civicrm/admin/afreact/afform#/create/form/Individual");
  await expect(canvas(page)).toBeVisible();
  await page.getByRole("textbox", { name: /^Title/ }).fill(`${TITLE}two individuals`);
  await typeRoute(page, route);
  await tabs.nth(2).click();
  await dropTile(
    page,
    freeTiles(page, /^Blocks$/)
      .filter({ hasText: blockTitle })
      .first(),
  );
  await page.getByRole("button", { name: "Add Entity" }).click();
  await page.locator(".dropdown-menu").getByText("Individual", { exact: true }).click();
  await expect(tabs).toHaveCount(4);
  await tabs.nth(3).click();
  const second = [await addField(page), await addField(page)];
  const labels = await canvasLabels(page);
  for (const label of [...blockFields, ...second]) expect(labels).toContain(label);
  const name = await saveNew(page);

  await page.goto("about:blank");
  await page.goto(`/civicrm/admin/afreact/afform#/edit/${name}`);
  await expect.poll(() => canvasLabels(page)).toEqual(labels);
  await expect(tabs).toHaveCount(4);
  const { react, angular } = await renderBoth(page, name, route);
  // The block's fields show once for its entity, the second entity's own fields beside them.
  for (const label of [...blockFields, ...second])
    expect(react.some((field) => field.endsWith(`: ${label}`))).toBe(true);
  expect(react).toEqual(angular);
  expect(raised).toEqual([]);
});

/** Each rendered field's name, shown value, whether it is required and whether it has a label. */
async function renderedStates(page: Page, route: string) {
  await page.goto(`/${route}`);
  const fields = page.locator("af-form af-field[name]");
  await expect(fields.first()).toBeVisible();
  return fields.evaluateAll((all) =>
    all.map((field) => {
      const input = field.querySelector("input:not([type=hidden])");
      const value = input instanceof HTMLInputElement ? input.value : null;
      return {
        name: field.getAttribute("name"),
        value,
        required: !!field.querySelector("[required]"),
        labelled: !!field.querySelector("label")?.textContent?.trim(),
      };
    }),
  );
}

test("keeps a default value, a required field and a hidden label through save and render", async ({
  page,
}) => {
  page.setDefaultTimeout(30_000);
  const raised: string[] = [];
  page.on("pageerror", (error) => raised.push(`page error ${error.message.split("\n")[0] ?? ""}`));
  page.on("dialog", (dialog) => {
    raised.push(`${dialog.type()} dialog`);
    void dialog.accept();
  });
  await keepReactForms(page);
  const route = routeOf("field-settings");
  await page.goto("/civicrm/admin/afreact/afform#/create/form/Individual");
  await expect(canvas(page)).toBeVisible();
  await page.getByRole("textbox", { name: /^Title/ }).fill(`${TITLE}field settings`);
  await typeRoute(page, route);
  await page.getByRole("tablist", { name: "Form parts" }).getByRole("tab").nth(2).click();
  const added = await addField(page);
  const configure = async (label: string) => {
    const field = canvas(page).locator(".af-gui-field").filter({ hasText: label }).first();
    await field.getByRole("button", { name: "Configure" }).first().click();
    return field;
  };
  const first = await configure("First Name");
  await first.getByRole("button", { name: "Default value" }).click();
  await first.getByRole("textbox", { name: "Default value" }).fill("Matrix default");
  await page.keyboard.press("Escape");
  const second = await configure("Last Name");
  const required = second.getByRole("button", { name: "Required" });
  await expect(required).toHaveAttribute("aria-pressed", "false");
  await required.click();
  await page.keyboard.press("Escape");
  const third = await configure(added);
  await third.getByRole("button", { name: "Label" }).click();
  await page.keyboard.press("Escape");
  const name = await saveNew(page);

  await setReactForms(page, [name]);
  const react = await renderedStates(page, route);
  await expect(page.locator(".afreact-form")).toBeVisible();
  await setReactForms(page, []);
  const angular = await renderedStates(page, route);
  const state = (field: string) => react.find((each) => each.name === field);
  expect(state("first_name")?.value).toBe("Matrix default");
  expect(state("last_name")?.required).toBe(true);
  expect(react.filter((each) => !each.labelled)).toHaveLength(1);
  expect(react).toEqual(angular);
  expect(raised).toEqual([]);
});

/** Each rendered table's headers and row count; no cell is read. */
async function renderedTables(page: Page, route: string) {
  await page.goto(`/${route}`);
  const tables = page.locator("#crm-container table");
  await expect(tables).toHaveCount(2);
  await expect(tables.first().locator("tbody tr").first()).toBeVisible();
  await expect(tables.last().locator("tbody tr").first()).toBeVisible();
  // Rows count once both displays replaced their loading placeholders.
  await expect(page.locator("#crm-container .crm-search-loading-placeholder")).toHaveCount(0);
  return tables.evaluateAll((all) =>
    all.map((table) => ({
      // What shows: names for screen readers (deviation:table-header-names) and shut menus left out.
      headers: [...table.querySelectorAll("thead th")].map((th) => {
        const shown = th.cloneNode(true);
        if (!(shown instanceof Element)) return "";
        for (const hidden of shown.querySelectorAll(".sr-only, .dropdown-menu")) hidden.remove();
        return shown.textContent?.replace(/\s+/g, " ").trim() ?? "";
      }),
      rows: table.querySelectorAll("tbody tr").length,
    })),
  );
}

test("embeds two search displays of configuration records and renders them alike", async ({
  page,
}) => {
  page.setDefaultTimeout(30_000);
  const raised: string[] = [];
  page.on("pageerror", (error) => raised.push(`page error ${error.message.split("\n")[0] ?? ""}`));
  page.on("dialog", (dialog) => {
    raised.push(`${dialog.type()} dialog`);
    void dialog.accept();
  });
  await keepReactForms(page);
  const route = routeOf("searches");
  await page.goto(
    "/civicrm/admin/afreact/afform#/create/search/Administer_Location_Types.Location_Types_Table",
  );
  await expect(canvas(page)).toBeVisible();
  await page.getByRole("textbox", { name: /^Title/ }).fill(`${TITLE}searches`);
  await typeRoute(page, route);
  const tabs = page.getByRole("tablist", { name: "Form parts" }).getByRole("tab");
  await expect(tabs).toHaveCount(3);
  await page.getByRole("button", { name: "Add Search" }).click();
  await page
    .locator(".dropdown-menu")
    .getByText("Administer Contact Types: Contact Types Table", { exact: true })
    .click();
  await expect(tabs).toHaveCount(4);
  const name = await saveNew(page);
  await page.goto("about:blank");
  await page.goto(`/civicrm/admin/afreact/afform#/edit/${name}`);
  await expect(tabs).toHaveCount(4);
  await setReactForms(page, [name]);
  const react = await renderedTables(page, route);
  await expect(page.locator(".afreact-form")).toBeVisible();
  await setReactForms(page, []);
  const angular = await renderedTables(page, route);
  expect(react).toEqual(angular);
  expect(raised).toEqual([]);
});

test("prefills a form from a contact named in the URL, alike in both renderers", async ({
  page,
}) => {
  page.setDefaultTimeout(30_000);
  const raised: string[] = [];
  page.on("pageerror", (error) => raised.push(`page error ${error.message.split("\n")[0] ?? ""}`));
  await keepReactForms(page);
  // A fixture contact of the test's own, removed again below.
  await page.goto(API_PAGE);
  const [contact] = await api<{ id: number }>(page, "Contact", "create", {
    values: { contact_type: "Individual", first_name: "Matrixprobe", last_name: `Run ${RUN}` },
  });
  if (!contact) throw new Error("Contact.create returned nothing.");
  try {
    const route = routeOf("prefill");
    await page.goto("/civicrm/admin/afreact/afform#/create/form/Individual");
    await expect(canvas(page)).toBeVisible();
    await page.getByRole("textbox", { name: /^Title/ }).fill(`${TITLE}prefill`);
    await typeRoute(page, route);
    await page.getByRole("tablist", { name: "Form parts" }).getByRole("tab").nth(2).click();
    const options = page.locator("#afGuiEditor-palette .afreact-section-head > button", {
      hasText: "Options",
    });
    if ((await options.getAttribute("aria-expanded")) !== "true") await options.click();
    const autofill = page.getByRole("checkbox", { name: "Accept ID from URL" });
    await autofill.check();
    const name = await saveNew(page);

    const shown = async () => {
      await page.goto(`/${route}#?Individual1=${String(contact.id)}`);
      const first = page.locator("af-field[name=first_name] input");
      await expect(first).toHaveValue("Matrixprobe");
      return [
        await first.inputValue(),
        await page.locator("af-field[name=last_name] input").inputValue(),
      ];
    };
    await setReactForms(page, [name]);
    const react = await shown();
    await expect(page.locator(".afreact-form")).toBeVisible();
    await setReactForms(page, []);
    const angular = await shown();
    expect(react).toEqual(["Matrixprobe", `Run ${RUN}`]);
    expect(react).toEqual(angular);
    expect(raised).toEqual([]);
  } finally {
    await page.goto(API_PAGE);
    await quietApi(page, "Contact", "delete", {
      useTrash: false,
      where: [["id", "=", contact.id]],
    });
  }
});

test("adds a filter field to a search form and renders the filter and table alike", async ({
  page,
}) => {
  page.setDefaultTimeout(30_000);
  const raised: string[] = [];
  page.on("pageerror", (error) => raised.push(`page error ${error.message.split("\n")[0] ?? ""}`));
  await keepReactForms(page);
  const route = routeOf("search-filter");
  await page.goto(
    "/civicrm/admin/afreact/afform#/create/search/Administer_Location_Types.Location_Types_Table",
  );
  await expect(canvas(page)).toBeVisible();
  await page.getByRole("textbox", { name: /^Title/ }).fill(`${TITLE}search filter`);
  await typeRoute(page, route);
  await page.getByRole("tablist", { name: "Form parts" }).getByRole("tab").nth(2).click();
  const filter = await dropTile(
    page,
    page
      .locator("#afGuiEditor-palette [role=group]")
      .filter({ hasNot: page.getByText(/^(Blocks|Calculated Fields)$/) })
      .locator("[role=button]:not([aria-disabled=true])")
      .first(),
  );
  await expect.poll(() => canvasLabels(page)).toContain(filter);
  const name = await saveNew(page);

  const shown = async () => {
    await page.goto(`/${route}`);
    await expect(page.locator("#crm-container table tbody tr").first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    return {
      filters: await page
        .locator("af-field[name]")
        .evaluateAll((all) => all.map((field) => field.getAttribute("name"))),
      rows: await page.locator("#crm-container table tbody tr").count(),
    };
  };
  await setReactForms(page, [name]);
  const react = await shown();
  await expect(page.locator(".afreact-form")).toBeVisible();
  await setReactForms(page, []);
  const angular = await shown();
  expect(react.filters).toHaveLength(1);
  expect(react).toEqual(angular);
  expect(raised).toEqual([]);
});

test("shows a field only once another is filled, alike in both renderers", async ({ page }) => {
  page.setDefaultTimeout(30_000);
  const raised: string[] = [];
  page.on("pageerror", (error) => raised.push(`page error ${error.message.split("\n")[0] ?? ""}`));
  await keepReactForms(page);
  const route = routeOf("conditional");
  await page.goto("/civicrm/admin/afreact/afform#/create/form/Individual");
  await expect(canvas(page)).toBeVisible();
  await page.getByRole("textbox", { name: /^Title/ }).fill(`${TITLE}conditional`);
  await typeRoute(page, route);
  const lastName = canvas(page).locator(".af-gui-field").filter({ hasText: "Last Name" }).first();
  await lastName.getByRole("button", { name: "Configure" }).first().click();
  await lastName.getByRole("button", { name: "Add Conditional Rules" }).click();
  const dialog = page.getByRole("dialog", { name: "Conditional Rules" });
  const visibility = dialog.getByRole("tabpanel").first();
  const picker = visibility.getByRole("combobox", { name: "Select field" });
  await picker.click();
  await picker.fill("First Name");
  await page
    .getByRole("option", { name: /First Name/ })
    .first()
    .click();
  await visibility
    .getByRole("combobox", { name: /^Operator for / })
    .selectOption({ label: "Not Empty" });
  // Floated clause rows once squeezed the buttons out of the dialog's left edge.
  const apply = dialog.getByRole("button", { name: "Apply Changes" });
  const [box, frame] = [await apply.boundingBox(), await dialog.boundingBox()];
  expect(box && frame && box.x >= frame.x && box.x + box.width <= frame.x + frame.width).toBe(true);
  await apply.click();
  await expect(dialog).toBeHidden();
  const name = await saveNew(page);

  const behaviour = async () => {
    await page.goto(`/${route}`);
    const first = page.locator("af-field[name=first_name] input");
    const last = page.locator("af-field[name=last_name] input");
    await expect(first).toBeVisible();
    const before = await last.isVisible();
    await first.fill("Matrix");
    await expect(last).toBeVisible();
    await first.fill("");
    await expect(last).toBeHidden();
    return before;
  };
  await setReactForms(page, [name]);
  expect(await behaviour()).toBe(false);
  await expect(page.locator(".afreact-form")).toBeVisible();
  await setReactForms(page, []);
  expect(await behaviour()).toBe(false);
  expect(raised).toEqual([]);
});

// deviation:repeat-bounds-on-blur
test("repeats an email block up to its maximum, alike in both renderers", async ({ page }) => {
  page.setDefaultTimeout(30_000);
  const raised: string[] = [];
  page.on("pageerror", (error) => raised.push(`page error ${error.message.split("\n")[0] ?? ""}`));
  await keepReactForms(page);
  const route = routeOf("repeat");
  await page.goto("/civicrm/admin/afreact/afform#/create/form/Individual");
  await expect(canvas(page)).toBeVisible();
  await page.getByRole("textbox", { name: /^Title/ }).fill(`${TITLE}repeat`);
  await typeRoute(page, route);
  await page.getByRole("tablist", { name: "Form parts" }).getByRole("tab").nth(2).click();
  await page.waitForLoadState("networkidle");
  const blocks = page.locator("#afGuiEditor-palette").getByRole("group", { name: "Blocks" });
  await dropTile(page, blocks.locator("[role=button]").filter({ hasText: /^Contact Email/ }));
  const join = canvas(page)
    .locator("af-gui-container")
    .filter({ has: page.getByRole("combobox", { name: "Select block" }) })
    .last();
  await join.getByRole("button", { name: "Configure" }).first().click();
  const min = page.getByRole("spinbutton", { name: "Minimum" });
  const max = page.getByRole("spinbutton", { name: "Maximum" });
  await expect(min).toHaveValue("1");
  // Typed digit by digit, "12" passes through 1, which once pulled the minimum down.
  await min.fill("2");
  await max.pressSequentially("12");
  await max.blur();
  await expect(min).toHaveValue("2");
  await max.fill("3");
  await max.blur();
  await expect(min).toHaveValue("2");
  await page.keyboard.press("Escape");
  const name = await saveNew(page);

  const behaviour = async () => {
    await page.goto(`/${route}`);
    const emails = page.locator("af-form af-field[name=email] input:visible");
    await expect(emails.first()).toBeVisible();
    const before = await emails.count();
    const add = page.getByRole("button", { name: "Add" });
    await add.click();
    await expect(emails).toHaveCount(before + 1);
    const addAtMax = (await add.isVisible()) && (await add.isEnabled());
    return { counts: [before, await emails.count()], addAtMax };
  };
  await setReactForms(page, [name]);
  const react = await behaviour();
  await expect(page.locator(".afreact-form")).toBeVisible();
  await setReactForms(page, []);
  const angular = await behaviour();
  expect(react).toEqual({ counts: [2, 3], addAtMax: false });
  expect(react).toEqual(angular);
  expect(raised).toEqual([]);
});

test("renders a select field as radio buttons with customised options, alike in both renderers", async ({
  page,
}) => {
  page.setDefaultTimeout(30_000);
  const raised: string[] = [];
  page.on("pageerror", (error) => raised.push(`page error ${error.message.split("\n")[0] ?? ""}`));
  await keepReactForms(page);
  const route = routeOf("options");
  await page.goto("/civicrm/admin/afreact/afform#/create/form/Individual");
  await expect(canvas(page)).toBeVisible();
  await page.getByRole("textbox", { name: /^Title/ }).fill(`${TITLE}options`);
  await typeRoute(page, route);
  await page.getByRole("tablist", { name: "Form parts" }).getByRole("tab").nth(2).click();
  await dropTile(page, freeTiles(page, /Fields$/).filter({ hasText: /^Gender/ }));
  const gender = canvas(page).locator(".af-gui-field").filter({ hasText: "Gender" }).first();
  await gender.getByRole("button", { name: "Configure" }).first().click();
  await page.getByRole("combobox", { name: "Type:" }).selectOption({ label: "Radio Buttons" });
  await page.getByRole("button", { name: "Customize options" }).click();
  const editor = canvas(page).locator(".af-gui-edit-options-enabled");
  const labels = editor.getByRole("textbox", { name: "Option label" });
  await expect(labels).toHaveText(["Female", "Male", "Other"]);
  await page.getByRole("button", { name: "Move Other up" }).click();
  await page.getByRole("button", { name: "Remove option Male" }).click();
  await labels.first().click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Woman");
  await page.keyboard.press("Enter");
  await expect(labels).toHaveText(["Woman", "Other"]);
  await canvas(page).getByRole("button", { name: "Done" }).click();
  await expect(gender.getByRole("radio")).toHaveCount(2);
  const name = await saveNew(page);

  const optionLabels = async () => {
    await page.goto(`/${route}`);
    // Only React groups the radios under the field's name.
    const radios = page.locator("#crm-container").getByRole("radio");
    await expect(radios.first()).toBeVisible();
    await page.getByRole("radio", { name: "Other" }).check();
    await expect(page.getByRole("radio", { name: "Other" })).toBeChecked();
    return radios.evaluateAll((all) =>
      all.map((radio) =>
        radio instanceof HTMLInputElement ? (radio.labels?.[0]?.textContent?.trim() ?? "") : "",
      ),
    );
  };
  await setReactForms(page, [name]);
  const react = await optionLabels();
  await expect(page.locator(".afreact-form")).toBeVisible();
  await setReactForms(page, []);
  const angular = await optionLabels();
  expect(react).toEqual(["Woman", "Other"]);
  expect(react).toEqual(angular);
  expect(raised).toEqual([]);
});

test("repeats a contact's fieldset and removes an added contact, alike in both renderers", async ({
  page,
}) => {
  page.setDefaultTimeout(30_000);
  const raised: string[] = [];
  page.on("pageerror", (error) => raised.push(`page error ${error.message.split("\n")[0] ?? ""}`));
  await keepReactForms(page);
  const route = routeOf("fieldset-repeat");
  await page.goto("/civicrm/admin/afreact/afform#/create/form/Individual");
  await expect(canvas(page)).toBeVisible();
  await page.getByRole("textbox", { name: /^Title/ }).fill(`${TITLE}fieldset repeat`);
  await typeRoute(page, route);
  // Selecting the fieldset opens its entity's tab while the route is still being typed.
  const fieldset = canvas(page).locator("af-gui-container.af-gui-fieldset").first();
  await fieldset.getByRole("button", { name: "Configure" }).first().click();
  await page.getByRole("checkbox", { name: "Repeat" }).check();
  await page.getByRole("spinbutton", { name: "Maximum" }).fill("2");
  await page.keyboard.press("Escape");
  const name = await saveNew(page);

  const behaviour = async () => {
    await page.goto(`/${route}`);
    const firstNames = page.locator("#crm-container").getByRole("textbox", { name: "First Name" });
    await expect(firstNames.first()).toBeVisible();
    const counts = [await firstNames.count()];
    const add = page.getByRole("button", { name: "Add" });
    await add.click();
    await expect(firstNames).toHaveCount(counts.length + 1);
    counts.push(await firstNames.count());
    const addAtMax = (await add.isVisible()) && (await add.isEnabled());
    await firstNames.last().fill("Second");
    // Core's remove button shows only an icon.
    const remove = page.locator("#crm-container .af-repeat-remove-btn");
    const removable = await remove.count();
    await remove.last().click();
    await expect(firstNames).toHaveCount(1);
    return { counts, addAtMax, removable, value: await firstNames.first().inputValue() };
  };
  await setReactForms(page, [name]);
  const react = await behaviour();
  await expect(page.locator(".afreact-form")).toBeVisible();
  await setReactForms(page, []);
  const angular = await behaviour();
  expect(react).toEqual({ counts: [1, 2], addAtMax: false, removable: 2, value: "" });
  expect(react).toEqual(angular);
  expect(raised).toEqual([]);
});

/** Buttons of the open dialog that reach past its edges, and its axe findings. */
async function dialogFlaws(page: Page, dialog: Locator): Promise<string[]> {
  const frame = await dialog.boundingBox();
  if (!frame) return ["dialog not shown"];
  const flaws: string[] = [];
  for (const button of await dialog.getByRole("button").all()) {
    const box = await button.boundingBox();
    if (box && (box.x < frame.x || box.x + box.width > frame.x + frame.width))
      flaws.push(`button "${((await button.textContent()) ?? "").trim()}" outside`);
  }
  return [...flaws, ...(await axeFindings(page, "dialog[open]"))];
}

// deviation:condition-badge-contrast
test("lays out each builder dialog within its frame and without an axe finding", async ({
  page,
}) => {
  page.setDefaultTimeout(30_000);
  await page.goto("/civicrm/admin/afreact/afform#/create/form/Individual");
  await expect(canvas(page)).toBeVisible();
  const found: string[] = [];

  const lastName = canvas(page).locator(".af-gui-field").filter({ hasText: "Last Name" }).first();
  await lastName.getByRole("button", { name: "Configure" }).first().click();
  await lastName.getByRole("button", { name: "Add Conditional Rules" }).click();
  const rules = page.getByRole("dialog", { name: "Conditional Rules" });
  const picker = rules
    .getByRole("tabpanel")
    .first()
    .getByRole("combobox", { name: "Select field" });
  await picker.click();
  await picker.fill("First Name");
  await page
    .getByRole("option", { name: /First Name/ })
    .first()
    .click();
  await rules.getByRole("combobox", { name: "Add a group of clauses" }).first().selectOption("OR");
  for (const flaw of await dialogFlaws(page, rules)) found.push(`Conditional Rules: ${flaw}`);
  await rules.getByRole("button", { name: "Cancel" }).click();
  await expect(rules).toBeHidden();

  await page
    .getByRole("tablist", { name: "Form parts" })
    .getByRole("tab", { name: "Elements" })
    .click();
  await dropTile(
    page,
    page
      .locator("#afGuiEditor-palette [role=button]")
      .filter({ hasText: /^Container/ })
      .first(),
  );
  const container = canvas(page).locator(".af-gui-container-type-div").first();
  await container.getByRole("button", { name: "Configure" }).first().click();
  await page.getByRole("button", { name: "Save as block" }).click();
  const block = page.getByRole("dialog", { name: "Save block" });
  for (const flaw of await dialogFlaws(page, block)) found.push(`Save block: ${flaw}`);
  await block.getByRole("button", { name: "Cancel" }).click();
  await expect(block).toBeHidden();

  expect(found).toEqual([]);
});

test("names and shows each of two entities added before either loaded", async ({ page }) => {
  page.setDefaultTimeout(30_000);
  await page.goto("/civicrm/admin/afreact/afform#/create/form/Individual");
  await expect(canvas(page)).toBeVisible();
  const held: (() => Promise<void>)[] = [];
  await page.route("**/civicrm/ajax/api4/Afform/loadAdminData", (route) => {
    held.push(() => route.continue());
  });
  for (let add = 0; add < 2; add++) {
    await page.getByRole("button", { name: "Add Entity" }).click();
    await page.locator(".dropdown-menu").getByText("Household", { exact: true }).click();
  }
  await expect.poll(() => held.length).toBe(2);
  await Promise.all(held.map((release) => release()));
  const tabs = page.getByRole("tablist", { name: "Form parts" }).getByRole("tab");
  await expect(tabs).toHaveCount(5);
  await expect(tabs).toHaveText([
    "Settings",
    "Elements",
    "Individual 1",
    "Household 1",
    "Household 2",
  ]);
  await expect(tabs.last()).toHaveAttribute("aria-selected", "true");
});
