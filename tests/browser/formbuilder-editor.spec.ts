import { expect, test, type Page } from "@playwright/test";
import { api, axeFindings, isRecord, keysListened, quietApi } from "./harness";

const EDITOR = "/civicrm/admin/afreact/afform#/edit/afformQuickAddIndividual";
const PROBE = "afformAfreactEditorProbe";
const JOIN_BLOCK = "afblockAfreactJoinProbe";
const ANY_ENTITY_BLOCK = "Afreact any entity probe";
const LAYOUT =
  '<af-form ctrl="afform"><af-entity type="Individual" name="Individual1" actions="{create: true, update: true}" security="RBAC" />' +
  '<fieldset af-fieldset="Individual1" class="af-container"><af-field name="first_name" /><af-field name="last_name" /></fieldset>' +
  '<button class="af-button btn btn-primary" crm-icon="fa-check" ng-click="afform.submit()">Submit</button></af-form>';

/** Values core's editor evaluates: it saves the first translated, drops the second and fails on the third. */
const GIVEN_NAME = "{label: ts('Given name'), afform_default: options.search_query}";
const EVALUATED = LAYOUT.replace(
  '<af-field name="first_name" />',
  `<af-field name="first_name" defn="${GIVEN_NAME}" />`,
).replace(
  '<af-field name="last_name" />',
  `<af-field name="last_name" defn="{help_pre: 'a' 'b'}" />`,
);

const saveProbe = (page: Page, layout: string) =>
  quietApi(page, "Afform", "save", {
    records: [{ name: PROBE, type: "form", title: "Afreact editor probe", layout }],
    layoutFormat: "html",
  });

interface Stored {
  name: string;
  title: string;
  layout: unknown;
}

const stored = (page: Page) =>
  api<Stored>(page, "Afform", "get", {
    select: ["name", "title", "layout"],
    layoutFormat: "shallow",
    // Saving pretty-prints the markup, as core's editor does; the comparison ignores that.
    formatWhitespace: true,
    where: [["name", "=", PROBE]],
  });

/** The field labels on the canvas, in document order. */
const labels = (page: Page) =>
  page.locator("#afGuiEditor-canvas-body .af-gui-field .af-gui-node-title [crm-ui-editable]");

test.describe("FormBuilder editor", () => {
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    // Forms this spec and earlier smoke runs created live only in the site's files.
    const forms = await quietApi<{ name: string }>(page, "Afform", "get", {
      select: ["name"],
      where: [
        ["has_base", "=", false],
        [
          "OR",
          [
            ["name", "IN", [PROBE, JOIN_BLOCK, "afformReactEditorSmoke"]],
            ["title", "=", ANY_ENTITY_BLOCK],
          ],
        ],
      ],
    });
    if (forms.length)
      await quietApi(page, "Afform", "revert", {
        where: [["name", "IN", forms.map((form) => form.name)]],
      });
    await page.close();
  });

  test("undo and redo select the palette tab each state was made in, as core's history does", async ({
    page,
  }) => {
    await page.goto(EDITOR);
    const palette = page.locator("#afGuiEditor-palette-config");
    const tab = (name: string) => palette.getByRole("tab", { name });
    await tab("Individual1").click();
    const update = palette.getByRole("checkbox", { name: "Update" });
    await expect(update).not.toBeChecked();
    await update.check();
    await tab("Settings").click();

    await page.getByRole("button", { name: "Undo (Ctrl-Z)" }).click();
    await expect(tab("Settings")).toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: "Redo (Ctrl-Shift-Z)" }).click();
    await expect(tab("Individual1")).toHaveAttribute("aria-selected", "true");
    await expect(update).toBeChecked();
  });

  // deviation:opened-form-saved deviation:undo-keys-outside-inputs deviation:redo-shift-z
  // deviation:undo-off-while-markup
  test("opens saved and undoes by keys outside inputs only, never while the markup is edited", async ({
    page,
  }) => {
    await saveProbe(page, LAYOUT);
    await page.goto(`/civicrm/admin/afreact/afform#/edit/${PROBE}`);
    const undo = page.getByRole("button", { name: "Undo (Ctrl-Z)" });
    await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
    await expect(undo).toBeDisabled();
    await page.getByRole("textbox", { name: /^Title/ }).fill("Changed");
    const changed = page.getByRole("heading", { name: /: Changed$/ });
    await expect(changed).toBeVisible();
    const palette = page.locator("#afGuiEditor-palette");
    await palette.getByRole("tab", { name: "Individual1" }).click();
    const update = palette.getByRole("checkbox", { name: "Update" });
    await update.uncheck();
    // In an input the keys stay the input's; outside they undo one step, and Shift redoes it.
    await update.press("Control+z");
    await undo.focus();
    await page.keyboard.press("Control+z");
    await expect(changed).toBeVisible();
    await palette.getByRole("tab", { name: "Individual1" }).click();
    await expect(update).toBeChecked();
    await page.keyboard.press("Control+Shift+Z");
    await expect(update).not.toBeChecked();

    await page.getByRole("tab", { name: "Markup" }).click();
    await page.getByRole("checkbox", { name: "Edit raw markup" }).check();
    await expect(undo).toBeDisabled();
  });

  // deviation:markup-entities-load-meta
  test("loads the fields of an entity the markup adds", async ({ page }) => {
    await saveProbe(page, LAYOUT);
    await page.goto(`/civicrm/admin/afreact/afform#/edit/${PROBE}`);
    await page.getByRole("tab", { name: "Markup" }).click();
    await page.getByRole("checkbox", { name: "Edit raw markup" }).check();
    await page.locator(".monaco-editor textarea").focus();
    // The first line opens af-form; the entity goes right after it.
    await page.keyboard.press("ControlOrMeta+Home");
    await page.keyboard.press("End");
    await page.keyboard.insertText(
      '<af-entity type="Activity" name="Activity1" actions="{create: true, update: true}" security="RBAC"></af-entity>',
    );
    // Leaving edit mode asks whether to apply the markup.
    await page.getByRole("checkbox", { name: "Edit raw markup" }).click();
    await page.getByRole("button", { name: "Apply changes" }).click();
    const palette = page.locator("#afGuiEditor-palette");
    await palette.getByRole("tab", { name: "Activity1" }).click();
    await expect(
      palette.getByRole("button", { name: "Subject", exact: true }).first(),
    ).toBeVisible();
  });

  for (const colorScheme of ["light", "dark"] as const)
    // deviation:view-page-link-contrast deviation:editable-placeholder-contrast
    test(`shows the View Page link and an empty title's placeholder in readable colours (${colorScheme})`, async ({
      page,
    }) => {
      await quietApi(page, "Afform", "save", {
        records: [
          {
            name: PROBE,
            type: "form",
            title: "Afreact editor probe",
            layout: LAYOUT,
            server_route: "civicrm/afreact-editor-probe",
          },
        ],
        layoutFormat: "html",
      });
      await page.emulateMedia({ colorScheme });
      await page.goto(`/civicrm/admin/afreact/afform#/edit/${PROBE}`);
      await expect(page.locator("a.afreact-view-page")).toBeVisible();
      await expect(page.locator('[data-placeholder="No title"]:empty').first()).toBeVisible();
      expect(
        await axeFindings(page, 'a.afreact-view-page, [data-placeholder="No title"]:empty'),
      ).toEqual([]);
    });

  // deviation:palette-tabs-flex-row
  test("keeps the palette tabs on one row, shrinking only the inactive ones", async ({ page }) => {
    const entities = ["Individual2", "Individual3", "Individual4", "Individual5"]
      .map(
        (name) =>
          `<af-entity type="Individual" name="${name}" actions="{create: true, update: true}" security="RBAC" />`,
      )
      .join("");
    await saveProbe(
      page,
      LAYOUT.replace('<af-form ctrl="afform">', `<af-form ctrl="afform">${entities}`),
    );
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.goto(`/civicrm/admin/afreact/afform#/edit/${PROBE}`);
    const palette = page.locator("#afGuiEditor-palette");
    await palette.getByRole("tab", { name: "Individual3" }).click();
    const tabs = palette.getByRole("tab");
    await expect(tabs).toHaveCount(7);
    const boxes = await tabs.evaluateAll((all) =>
      all.map((tab) => ({
        top: tab.getBoundingClientRect().top,
        clipped: tab.scrollWidth > tab.clientWidth,
        active: tab.getAttribute("aria-selected") === "true",
      })),
    );
    expect(new Set(boxes.map((box) => box.top)).size).toBe(1);
    expect(boxes.filter((box) => box.active)).toEqual([
      expect.objectContaining({ clipped: false }),
    ]);
    expect(boxes.some((box) => box.clipped)).toBe(true);
  });

  test("appends a token to a field label from the label's token menu", async ({ page }) => {
    await page.goto(EDITOR);
    const field = page.locator("#afGuiEditor-canvas-body .af-gui-field").first();
    const label = field.getByRole("textbox", { name: "Field label" });
    await expect(label).toHaveText("First Name");
    await label.click();
    await page.keyboard.press("Tab");
    await expect(field.getByRole("button", { name: "Insert Token" })).toBeFocused();
    await page.keyboard.press("Enter");
    const search = page.getByRole("combobox", { name: "Insert Token" });
    await expect(search).toBeFocused();
    const list = page.getByRole("listbox", { name: "Insert Token" });
    await expect(list.getByRole("group", { name: "Individual1" })).toBeVisible();
    await search.pressSequentially("last");
    await list.getByRole("option", { name: "Last Name" }).click();
    await expect(label).toHaveText("First Name [Individual1.0.last_name]");
    await page.getByRole("button", { name: "Undo (Ctrl-Z)" }).click();
    await expect(label).toHaveText("First Name");
  });

  test("moves a field by keyboard with the grip on its bar", async ({ page }) => {
    await page.goto(EDITOR);
    await expect(labels(page).first()).toHaveText("First Name");
    const before = await labels(page).allTextContents();
    const grip = page.getByRole("button", { name: "Move First Name" });
    await grip.focus();
    await expect(grip.locator("xpath=..")).toHaveCSS("opacity", "1");
    // Each key waits for its announcement, and the first arrow for the sensor to listen.
    const announced = (text: string) => expect(page.getByText(text)).toBeAttached();
    await page.keyboard.press("Space");
    await announced("Picked up First Name.");
    await keysListened(page);
    await page.keyboard.press("ArrowDown");
    await announced("First Name stays in its place.");
    await page.keyboard.press("ArrowDown");
    await announced("First Name moved to place 2 in Container.");
    await page.keyboard.press("Space");
    await announced("First Name dropped to place 2 in Container.");
    await expect(page.getByRole("button", { name: "Move First Name" })).toBeFocused();
    await expect(labels(page)).toHaveText(["Middle Name", "First Name", "Last Name", "Email"]);
    await page.getByRole("button", { name: "Undo (Ctrl-Z)" }).click();
    await expect(labels(page)).toHaveText(before);
  });

  test("moves by keyboard past an element of another kind, counting only what the canvas shows", async ({
    page,
  }) => {
    await page.goto(EDITOR);
    const grip = page.getByRole("button", { name: /^Move .*Submit/ });
    await grip.focus();
    const announced = (text: string | RegExp) => expect(page.getByText(text)).toBeAttached();
    await page.keyboard.press("Space");
    await announced(/^Picked up .*Submit/);
    await keysListened(page);
    // The form's end is the button's own place; the next step wraps to the top.
    await page.keyboard.press("ArrowDown");
    await announced(/Submit.* stays in its place\./);
    await page.keyboard.press("ArrowDown");
    // The af-entity before the fieldset is not drawn, so the button's place is 1, not 2.
    await announced(/Submit.* moved to place 1 in /);
    await page.keyboard.press("Space");
    await announced(/Submit.* dropped to place 1 in /);
    // The button now comes before the fieldset.
    expect(
      await page.evaluate(() => {
        const canvas = document.getElementById("afGuiEditor-canvas-body");
        const button = canvas?.querySelector(".af-gui-element.af-gui-button");
        const fieldset = canvas?.querySelector(".af-gui-container-type-fieldset");
        return !!(
          button &&
          fieldset &&
          button.compareDocumentPosition(fieldset) & Node.DOCUMENT_POSITION_FOLLOWING
        );
      }),
    ).toBe(true);
    // The button's element was drawn anew in another place; the focus follows it there.
    await expect(page.getByRole("button", { name: /^Move .*Submit/ })).toBeFocused();
    await page.getByRole("button", { name: "Undo (Ctrl-Z)" }).click();
  });

  test("adds a palette field by keyboard, refused outside its entity's fieldset", async ({
    page,
  }) => {
    await saveProbe(page, LAYOUT);
    await page.goto(`/civicrm/admin/afreact/afform#/edit/${PROBE}`);
    await expect(labels(page)).toHaveText(["First Name", "Last Name"]);
    const palette = page.locator("#afGuiEditor-palette");
    await palette.getByRole("tab", { name: "Individual1" }).click();
    const item = palette.getByRole("button", { name: "Middle Name", exact: true }).first();
    await item.focus();
    const announced = (text: string | RegExp) => expect(page.getByText(text)).toBeAttached();
    await page.keyboard.press("Space");
    await announced("Picked up Middle Name.");
    await keysListened(page);
    // The first target is before the fieldset, outside the field's entity.
    await page.keyboard.press("ArrowDown");
    await announced("Middle Name cannot move there.");
    await page.keyboard.press("ArrowDown");
    await announced(/^Middle Name moved to place 1 in /);
    await page.keyboard.press("Space");
    await announced(/^Middle Name dropped to place 1 in /);
    await expect(labels(page)).toHaveText(["Middle Name", "First Name", "Last Name"]);
  });

  test("saves once when Save is clicked twice while the markup is applied", async ({ page }) => {
    await saveProbe(page, LAYOUT);
    await page.goto(`/civicrm/admin/afreact/afform#/edit/${PROBE}`);
    await page.getByRole("tab", { name: "Markup" }).click();
    await page.getByRole("checkbox", { name: "Edit raw markup" }).check();
    await page.locator(".monaco-editor textarea").focus();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.insertText("<p>Saved once</p>");
    let saves = 0;
    page.on("request", (request) => {
      if (request.url().includes("/civicrm/ajax/api4/Afform/save")) saves++;
    });
    await page.getByRole("button", { name: "Save", exact: true }).dblclick();
    await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
    expect(saves).toBe(1);
  });

  // deviation:canvas-drag-drop
  test("moves a field by pointer to the line shown, and not at all over its own place", async ({
    page,
  }) => {
    await page.goto(EDITOR);
    await expect(labels(page).first()).toHaveText("First Name");
    const before = await labels(page).allTextContents();
    const center = async (name: string) => {
      const box = await page.getByRole("button", { name: `Move ${name}` }).boundingBox();
      if (!box) throw new Error(`No grip for ${name}`);
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    const marks = page.locator("#afGuiEditor-canvas-body [class*=afreact-drop-]");
    const from = await center("Last Name");
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 40, from.y + 12, { steps: 4 });
    await expect(page.locator(".afreact-drag-chip")).toHaveText("Last Name");
    await expect(marks).toHaveCount(0);
    const to = await center("First Name");
    await page.mouse.move(to.x + 40, to.y - 4, { steps: 8 });
    await expect(marks).toHaveClass(/afreact-drop-before/);
    await expect(marks.getByRole("button", { name: "Move First Name" })).toHaveCount(1);
    await page.mouse.up();
    await expect(labels(page)).toHaveText(["Last Name", "First Name", "Middle Name", "Email"]);

    await page.getByRole("button", { name: "Undo (Ctrl-Z)" }).click();
    await expect(labels(page)).toHaveText(before);
    const own = await center("Last Name");
    await page.mouse.move(own.x, own.y);
    await page.mouse.down();
    await page.mouse.move(own.x + 60, own.y + 10, { steps: 4 });
    await expect(page.locator(".afreact-drag-chip")).toBeVisible();
    await expect(marks).toHaveCount(0);
    await page.mouse.up();
    await expect(labels(page)).toHaveText(before);
    await expect(page.getByRole("button", { name: "Undo (Ctrl-Z)" })).toBeDisabled();
  });

  test("saves an edited title and leaves the layout as it was", async ({ page }) => {
    await quietApi(page, "Afform", "save", {
      records: [
        {
          name: PROBE,
          type: "form",
          title: "Afreact editor probe",
          layout: LAYOUT,
        },
      ],
      layoutFormat: "html",
    });
    await page.goto("/civicrm/admin/afreact/afform#/list");
    const [original] = await stored(page);
    await page.goto(`/civicrm/admin/afreact/afform#/edit/${PROBE}`);
    const title = page.getByRole("textbox", { name: /^Title/ });
    await expect(title).toHaveValue("Afreact editor probe");
    await title.fill("Afreact editor probe saved");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
    const [saved] = await stored(page);
    expect(saved?.title).toBe("Afreact editor probe saved");
    expect(saved?.layout).toEqual(original?.layout);
  });

  // deviation:save-keeps-ts-calls deviation:save-keeps-unread-attributes
  test("keeps attribute values core's editor evaluates, with the admin's page translated", async ({
    page,
  }) => {
    // The admin's language as core's ts() reads it, without a translation file on the site.
    await page.route(/\/js\/Common\.js/, async (route) => {
      const response = await route.fetch();
      const body = `${await response.text()}\nCRM.strings["Given name"] = "Vorname";\n`;
      await route.fulfill({ response, body });
    });
    await saveProbe(page, EVALUATED);
    await page.goto("/civicrm/admin/afreact/afform#/list");
    const [original] = await stored(page);
    await page.goto(`/civicrm/admin/afreact/afform#/edit/${PROBE}`);
    await expect(labels(page).first()).toHaveText("Vorname");
    await page.getByRole("textbox", { name: /^Title/ }).fill("Afreact editor probe saved");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
    const [saved] = await stored(page);
    expect(JSON.stringify(saved?.layout)).toContain(GIVEN_NAME);
    expect(saved?.layout).toEqual(original?.layout);
  });

  // deviation:markup-keeps-ts-calls
  test("keeps ts() in markup applied from the markup tab", async ({ page }) => {
    await saveProbe(page, EVALUATED);
    await page.goto(`/civicrm/admin/afreact/afform#/edit/${PROBE}`);
    await page.getByRole("tab", { name: "Markup" }).click();
    await page.getByRole("checkbox", { name: "Edit raw markup" }).check();
    await page.locator(".monaco-editor textarea").focus();
    await page.keyboard.press("ControlOrMeta+End");
    // insertText bypasses Monaco's tag auto-closing.
    await page.keyboard.insertText("<p>Added in markup</p>");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
    const layout = JSON.stringify((await stored(page))[0]?.layout);
    expect(layout).toContain("Added in markup");
    expect(layout).toContain(GIVEN_NAME);
  });

  test("keeps a block holding a join, which core's editor inlines on opening", async ({ page }) => {
    await quietApi(page, "Afform", "save", {
      records: [
        {
          name: JOIN_BLOCK,
          type: "block",
          title: "Afreact join probe",
          entity_type: "Individual",
          layout:
            '<div af-join="Email" min="1"><div class="af-container"><af-field name="email" /></div></div>',
        },
        {
          name: PROBE,
          type: "form",
          title: "Afreact editor probe",
          layout: LAYOUT.replace(
            '<af-field name="last_name" />',
            "<afblock-afreact-join-probe></afblock-afreact-join-probe>",
          ),
        },
      ],
      layoutFormat: "html",
    });
    await page.goto(`/civicrm/admin/afreact/afform#/edit/${PROBE}`);
    await expect(page.locator("#afGuiEditor-canvas-body")).toContainText("Email");
    await page.getByRole("textbox", { name: /^Title/ }).fill("Afreact editor probe saved");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
    const [saved] = await stored(page);
    const layout = JSON.stringify(saved?.layout);
    expect(layout).toContain('"#tag":"afblock-afreact-join-probe"');
    expect(layout).not.toContain("af-join");
  });

  // deviation:save-block-any-entity
  test("saves a container outside any fieldset as a block for any entity", async ({ page }) => {
    await saveProbe(
      page,
      LAYOUT.replace(
        "<button ",
        '<div class="af-container"><p class="af-text">Outside the fieldset</p></div><button ',
      ),
    );
    await page.goto(`/civicrm/admin/afreact/afform#/edit/${PROBE}`);
    const container = page.locator("#afGuiEditor-canvas-body .af-gui-container-type-div");
    await container.getByRole("button", { name: "Configure" }).first().click();
    await page.getByRole("button", { name: "Save as block" }).click();
    const dialog = page.getByRole("dialog", { name: "Save block" });
    await dialog.getByRole("textbox", { name: /^Title/ }).fill(ANY_ENTITY_BLOCK);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeHidden();
    const blocks = await api<{ entity_type: string }>(page, "Afform", "get", {
      select: ["entity_type"],
      where: [["title", "=", ANY_ENTITY_BLOCK]],
    });
    expect(blocks.map((block) => block.entity_type)).toEqual(["*"]);
  });

  test("refuses to save a container as a block for an entity the form lacks", async ({ page }) => {
    await saveProbe(
      page,
      LAYOUT.replace(
        "<button ",
        '<fieldset af-fieldset="Missing1" class="af-container"><div class="af-container"><p class="af-text">In a lost fieldset</p></div></fieldset><button ',
      ),
    );
    await page.goto(`/civicrm/admin/afreact/afform#/edit/${PROBE}`);
    const container = page.locator(
      '#afGuiEditor-canvas-body [data-entity="Missing1"] .af-gui-container-type-div',
    );
    await container.getByRole("button", { name: "Configure" }).first().click();
    await page.getByRole("button", { name: "Save as block" }).click();
    await expect(
      page.getByText("The form has no entity Missing1 to save this block for."),
    ).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Save block" })).toHaveCount(0);
  });
});

test.describe("FormBuilder routes against core's editor", () => {
  const TITLE = "Afreact route parity";
  const made: string[] = [];

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    if (made.length)
      await quietApi(page, "Afform", "revert", {
        where: [
          ["name", "IN", made],
          ["has_base", "=", false],
        ],
      });
    await page.close();
  });

  /** Saves what a route opens, titled alike, and reads it back without the names saving made. */
  async function saveFrom(page: Page, renderer: "angular" | "react", route: string) {
    const base = renderer === "react" ? "/civicrm/admin/afreact/afform" : "/civicrm/admin/afform";
    await page.goto(`${base}#${route}`);
    await expect(page.locator("#afGuiEditor-canvas-body")).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("textbox", { name: /^Title/ }).fill(TITLE);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(/#\/edit\/\w+$/);
    const name = /#\/edit\/(\w+)$/.exec(page.url())?.[1] ?? "";
    made.push(name);
    const [form] = await api<Record<string, unknown>>(page, "Afform", "get", {
      layoutFormat: "shallow",
      formatWhitespace: true,
      where: [["name", "=", name]],
    });
    if (!form) throw new Error(`${name} was not saved.`);
    const {
      name: _name,
      directive_name: _directive,
      module_name: _module,
      modified_date: _modified,
      ...rest
    } = form;
    return rest;
  }

  /**
   * Core's editor writes `input_attrs: {}` into a field's defn by reading a placeholder
   * (upstream-bugs.md); React leaves the defn as stored.
   */
  const withoutReadArtefacts = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(withoutReadArtefacts);
    if (!isRecord(value)) return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        key === "defn" && typeof item === "string"
          ? item.replace(/, input_attrs: \{\}(?=\}$)/, "")
          : withoutReadArtefacts(item),
      ]),
    );
  };

  for (const route of [
    "/create/form/Individual",
    "/create/block/Individual",
    "/clone/afformQuickAddIndividual",
  ])
    test(`saves ${route} as core's editor does`, async ({ page }) => {
      const angular = await saveFrom(page, "angular", route);
      const react = await saveFrom(page, "react", route);
      expect(react).toEqual(withoutReadArtefacts(angular));
    });
});
