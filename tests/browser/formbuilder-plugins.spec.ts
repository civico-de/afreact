/**
 * The FormBuilder editor's plugin contract with the afreactisland fixture's elements: an
 * element's settings, an input type on the canvas, a behavior and an entity's options.
 */
import { expect, test } from "@playwright/test";
import { api, quietApi } from "./harness";

const PROBE = "afformAfreactPluginProbe";
const LAYOUT =
  '<af-form ctrl="afform"><af-entity type="Household" name="Household1" actions="{create: true, update: true}" security="RBAC" />' +
  '<fieldset af-fieldset="Household1" class="af-container"><af-field name="household_name" defn="{input_type: \'IslandStars\'}" /></fieldset>' +
  '<afreact-island-note text="Island note"></afreact-island-note>' +
  '<button class="af-button btn btn-primary" ng-click="afform.submit()">Submit</button></af-form>';

interface Node {
  "#tag"?: string;
  "#children"?: Node[];
  [attribute: string]: unknown;
}

const find = (nodes: Node[], tag: string): Node | undefined => {
  for (const node of nodes) {
    if (node["#tag"] === tag) return node;
    const inner = find(node["#children"] ?? [], tag);
    if (inner) return inner;
  }
  return undefined;
};

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  const forms = await quietApi(page, "Afform", "get", {
    select: ["name"],
    where: [
      ["name", "=", PROBE],
      ["has_base", "=", false],
    ],
  });
  if (forms.length) await quietApi(page, "Afform", "revert", { where: [["name", "=", PROBE]] });
  await page.close();
});

// deviation:afform-plugin-parts
test("plugin elements edit an element, an input type, a behavior and an entity's options", async ({
  page,
}) => {
  await quietApi(page, "Afform", "save", {
    records: [{ name: PROBE, type: "form", title: "Afreact plugin probe", layout: LAYOUT }],
    layoutFormat: "html",
  });
  await page.goto(`/civicrm/admin/afreact/afform#/edit/${PROBE}`);
  const canvas = page.locator("#afGuiEditor-canvas-body");
  // The first load after a cache flush rebuilds the editor's metadata.
  await expect(canvas).toBeVisible({ timeout: 30_000 });

  const note = canvas.getByRole("textbox", { name: "Note text" });
  await expect(note).toHaveValue("Island note");
  await note.fill("Changed note");
  await note.press("Tab");

  const wide = canvas.getByRole("button", { name: "Wide stars" });
  await expect(canvas.locator("afreact-afform-admin-input-island-stars")).toContainText("★★★");
  await wide.click();
  await expect(wide).toHaveAttribute("aria-pressed", "true");

  const palette = page.locator("#afGuiEditor-palette-config");
  await palette.getByRole("tab", { name: /Household/ }).click();
  await palette.getByRole("checkbox", { name: "Island household" }).check();
  await palette.getByRole("combobox", { name: "Greeting" }).selectOption("warm");
  await expect(page.getByText("cannot be edited in the React builder")).toHaveCount(0);

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
  const [saved] = await api<{ layout: Node[] }>(page, "Afform", "get", {
    select: ["layout"],
    layoutFormat: "shallow",
    where: [["name", "=", PROBE]],
  });
  const layout = saved?.layout ?? [];
  expect(find(layout, "afreact-island-note")).toMatchObject({ text: "Changed note" });
  expect(find(layout, "af-field")).toMatchObject({ name: "household_name", class: "island-wide" });
  expect(find(layout, "af-entity")).toMatchObject({
    "island-household": "1",
    "island-greeting": "warm",
  });
});

// deviation:form-builder-panels
test("a builder panel blocks saving and puts its notes into the confirmation", async ({ page }) => {
  await quietApi(page, "Afform", "save", {
    records: [{ name: PROBE, type: "form", title: "Afreact plugin probe", layout: LAYOUT }],
    layoutFormat: "html",
  });
  await page.goto(`/civicrm/admin/afreact/afform#/edit/${PROBE}`);
  await expect(page.locator("#afGuiEditor-canvas-body")).toBeVisible({ timeout: 30_000 });
  let writes = 0;
  page.on("request", (request) => {
    if (request.url().includes("/Afform/save")) writes++;
  });
  const title = page.getByRole("textbox", { name: /^Title/ });
  await title.fill("Afreact plugin probe [block]");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const refusal = page.locator("#bootstrap-theme > .messages.error");
  await expect(refusal).toHaveText("The island form panel blocks this title.");
  // Saving again refuses again in a new alert, which screen readers announce.
  const first = await refusal.elementHandle();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => first?.evaluate((element) => element.isConnected)).toBe(false);
  await expect(refusal).toHaveText("The island form panel blocks this title.");
  expect(writes).toBe(0);

  await title.fill("Afreact plugin probe [note]");
  const asked = new Promise<string>((resolve) => {
    page.once("dialog", (dialog) => {
      resolve(dialog.message());
      void dialog.accept();
    });
  });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect(await asked).toContain("The island form panel notes this title.");
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
  await expect(page.locator("#bootstrap-theme > .messages.error")).toHaveCount(0);
  expect(writes).toBe(1);

  // Saving waits for a panel still checking, and a check that fails blocks the save.
  await title.fill("Afreact plugin probe [slow]");
  const checked = new Promise<string>((resolve) => {
    page.once("dialog", (dialog) => {
      resolve(dialog.message());
      void dialog.dismiss();
    });
  });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect(await checked).toContain("The island form panel checked this title.");
  await title.fill("Afreact plugin probe [fail]");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(refusal).toHaveText("The island form panel could not check this title.");
  expect(writes).toBe(1);
});

// deviation:form-editor-classic-only
test("an extension decorating core's builder sends saving to the classic builder", async ({
  page,
}) => {
  const NOTICE = "Other extensions change the classic FormBuilder";
  const joined = LAYOUT.replace(
    "</fieldset>",
    '<div af-join="Email"><div class="af-container"><af-field name="email" /></div></div></fieldset>',
  );
  await quietApi(page, "Afform", "save", {
    records: [{ name: PROBE, type: "form", title: "Afreact plugin probe", layout: joined }],
    layoutFormat: "html",
  });
  // The fixture's module, decorating core's editor directive.
  await page.route("**/afreactisland/ang/afreactIslandForm.js*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `${await response.text()}\nangular.module("afreactIslandForm").decorator("afGuiEditorDirective", ["$delegate", (d) => d]);`,
    });
  });
  await page.goto(`/civicrm/admin/afreact/afform#/edit/${PROBE}`);
  await expect(page.locator("#afGuiEditor-canvas-body")).toBeVisible({ timeout: 30_000 });
  const notice = page.getByRole("status").filter({ hasText: NOTICE });
  await expect(notice.getByRole("listitem")).toHaveText(["afreactIslandForm"]);
  await expect(
    notice.getByRole("link", { name: "Edit this form in the classic builder." }),
  ).toHaveAttribute("href", new RegExp(`/civicrm/admin/afform#/edit/${PROBE}$`));
  let writes = 0;
  page.on("request", (request) => {
    if (request.url().includes("/Afform/save")) writes++;
  });
  await page.getByRole("textbox", { name: /^Title/ }).fill("Afreact plugin probe changed");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("#bootstrap-theme > .messages.error")).toContainText(NOTICE);
  // Saving a container as a block is a save past the form's, held back the same way.
  await page.getByRole("button", { name: "Save...", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Save block" });
  await dialog.getByRole("textbox", { name: /^Title/ }).fill("Afreact plugin probe block");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(NOTICE);
  expect(writes).toBe(0);
});
