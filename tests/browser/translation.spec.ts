/**
 * The add translation task on the message templates listing: both renderers offer the same
 * locales, mark the template's own translation as existing and open the editor alike.
 * Core master only, where the site offers more than one language.
 */
import { expect, type Page } from "@playwright/test";
import { test } from "./coverage";
import { api, API_PAGE, AUTH, quietApi, type Renderer } from "./harness";

const RUN = Date.now().toString(36);
const LOAD = { timeout: 30_000 };
const FORM = "afsearchMessageTemplates";
const TITLE = `Afreact translation ${RUN}`;
const render = (renderer: Renderer) =>
  `/civicrm/afreact/render?name=${FORM}&renderer=${renderer}#?keyword=${TITLE}`;

interface Offered {
  template: string;
  locales: string[];
  selected: string;
  opened: string;
}

let template = 0;
let available = false;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  await page.goto(API_PAGE);
  const forms = await quietApi(page, "Afform", "get", { where: [["name", "=", FORM]] });
  const tasks = forms.length
    ? await quietApi<Record<string, unknown>>(page, "SearchDisplay", "getSearchTasks", {
        savedSearch: "Message_Templates_User",
        display: "Message_Templates_User_Table",
      })
    : [];
  available = tasks.some((task) => task.name === "add_translation");
  if (available) {
    const [created] = await quietApi<{ id: number }>(page, "MessageTemplate", "create", {
      values: { msg_title: TITLE, msg_subject: "Subject", msg_text: "Text" },
    });
    template = created?.id ?? 0;
    // One translation of its own, which both dialogs mark as existing.
    await quietApi(page, "Translation", "create", {
      values: {
        entity_table: "civicrm_msg_template",
        entity_id: template,
        entity_field: "msg_subject",
        language: "de_DE",
        string: "Betreff",
        "status_id:name": "active",
      },
    });
  }
  await context.close();
});

test.afterAll(async ({ browser }) => {
  if (!template) return;
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  await page.goto(API_PAGE);
  await api(page, "Translation", "delete", {
    where: [
      ["entity_table", "=", "civicrm_msg_template"],
      ["entity_id", "=", template],
    ],
  });
  await api(page, "MessageTemplate", "delete", { where: [["id", "=", template]] });
  await context.close();
});

/** The locale radios' labels, each with its "(existing)" marker, without the Other choice. */
const radios = (scope: ReturnType<Page["locator"]>) =>
  scope
    .locator(".radio label")
    .evaluateAll((all) =>
      all
        .filter((label) => label.querySelector('input[type="radio"]:not([value="other"])'))
        .map((label) => (label.textContent ?? "").replace(/\s+/g, " ").trim()),
    );

async function addTranslation(page: Page, renderer: Renderer): Promise<Offered> {
  await page.goto(render(renderer));
  const rows = page.locator(
    ".afreact-render af-tab:visible tbody tr, .afreact-render tbody tr:visible",
  );
  await expect(rows).toHaveCount(1, LOAD);
  await rows.first().locator(".crm-search-ctrl-select-row").check();
  await page.locator(".afreact-render .crm-search-task-menu:visible").click();
  await page
    .locator(".afreact-render .dropdown-menu a:visible", { hasText: "Add Translation" })
    .click();
  const dialog =
    renderer === "react"
      ? page.getByRole("dialog", { name: "Add Translation" })
      : page.locator(".ui-dialog", { hasText: "Add Translation" });
  const field = dialog.locator("input[disabled]").first();
  await expect(field).toHaveValue(TITLE, LOAD);
  await expect(dialog.locator(".radio input:checked")).toHaveCount(1, LOAD);
  const offered = {
    template: await field.inputValue(),
    locales: await radios(dialog),
    selected: (
      (await dialog
        .locator(".radio label", { has: page.locator("input:checked") })
        .textContent()) ?? ""
    ).trim(),
  };
  await dialog.getByRole("button", { name: "Add" }).click();
  await page.waitForURL(/messageTemplates\/edit/, LOAD);
  return { ...offered, opened: new URL(page.url()).pathname + new URL(page.url()).hash };
}

test("both renderers offer the same locales and open the editor alike", async ({ page }) => {
  test.skip(!available, "Add Translation exists on core master only, with several languages");
  const seen: Partial<Record<Renderer, Offered>> = {};
  for (const renderer of ["angular", "react"] as const)
    seen[renderer] = await addTranslation(page, renderer);
  expect(seen.react).toEqual(seen.angular);
  expect(seen.react).toMatchObject({
    template: TITLE,
    opened: `/civicrm/admin/messageTemplates/edit#/edit?id=${String(template)}&lang=en_US`,
  });
  expect(seen.react?.locales).toEqual(["English (United States)", "German (existing)"]);
});
