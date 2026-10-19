/**
 * An extra field in a repeated fieldset on both renderers: React keeps a value per item and
 * submits it with the item, as core does from 6.21; older cores share one form-level value.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import { coreHas } from "../../src/admin/version";
import { api, API_PAGE, AUTH, isRecord, quietApi, type Renderer } from "./harness";

const RUN = Date.now().toString(36);
const FORM = "afformAfreactRepeatExtrasProbe";
const LAST_NAME = `Extras ${RUN}`;
const LAYOUT = `<af-form ctrl="afform">
  <af-entity type="Individual" name="Individual1" label="Individual 1" actions="{create: true, update: false}" security="RBAC" />
  <fieldset af-fieldset="Individual1" class="af-container" af-title="Person" af-repeat="Add person" min="2">
    <af-field name="last_name" />
    <af-field defn="{name: 'note', label: 'Note', input_type: 'Text', data_type: 'String'}" />
  </fieldset>
  <button class="af-button btn btn-primary" ng-click="afform.submit()">Save</button>
</af-form>`;
// Core binds an extra field to its repeat item from 6.21 on (civicrm-core ec294d3293).
const PER_ITEM = { "6.21": "6.21.alpha1" };

async function adminPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: AUTH });
  return context.newPage();
}

test.beforeAll(async ({ browser }) => {
  const page = await adminPage(browser);
  await quietApi(page, "Afform", "create", {
    layoutFormat: "html",
    values: {
      name: FORM,
      type: "form",
      title: `Afreact repeat extras ${RUN}`,
      permission: ["access CiviCRM"],
      create_submission: true,
      confirmation_type: "show_confirmation_message",
      confirmation_message: "People saved.",
      layout: LAYOUT,
    },
  });
  await page.context().close();
});

test.afterAll(async ({ browser }) => {
  const page = await adminPage(browser);
  await quietApi(page, "Contact", "delete", {
    where: [["last_name", "=", LAST_NAME]],
    useTrash: false,
  });
  await quietApi(page, "AfformSubmission", "delete", { where: [["afform_name", "=", FORM]] });
  await quietApi(page, "Afform", "revert", { where: [["name", "=", FORM]] });
  await page.context().close();
});

interface Observed {
  shown: string[];
  submitted: unknown[];
  extra: unknown;
  stored: unknown[];
}

const extrasOf = (items: unknown) =>
  Array.isArray(items) ? items.map((item) => (isRecord(item) ? (item.extras ?? null) : null)) : [];

async function observe(page: Page, renderer: Renderer): Promise<Observed> {
  await page.goto(`/civicrm/afreact/render?name=${FORM}&renderer=${renderer}`);
  const form = page.locator(".afreact-render");
  const notes = form.getByLabel("Note");
  await expect(notes).toHaveCount(2);
  const lastNames = form.locator('af-field[name="last_name"] input');
  for (const [index, note] of ["First", "Second"].entries()) {
    await lastNames.nth(index).fill(LAST_NAME);
    await notes.nth(index).fill(note);
  }
  const shown = [await notes.nth(0).inputValue(), await notes.nth(1).inputValue()];

  const request = page.waitForRequest((sent) => sent.url().includes("Afform/submit"));
  await form.getByRole("button", { name: "Save" }).click();
  const params = new URLSearchParams((await request).postData() ?? "").get("params");
  const body: unknown = JSON.parse(params ?? "{}");
  const values = isRecord(body) && isRecord(body.values) ? body.values : {};
  await expect(form.locator(".afform-confirmation")).toContainText("People saved.");

  const [submission] = await api<{ data: unknown }>(page, "AfformSubmission", "get", {
    select: ["data"],
    where: [["afform_name", "=", FORM]],
    orderBy: { id: "DESC" },
    limit: 1,
  });
  const data = isRecord(submission?.data) ? submission.data : {};
  return {
    shown,
    submitted: extrasOf(values.Individual1),
    extra: isRecord(values.extra) ? values.extra.fields : null,
    stored: extrasOf(data.Individual1),
  };
}

/** The running core's version, without a builder page's heavy metadata load beside the test. */
async function coreVersion(page: Page): Promise<string> {
  await page.goto(API_PAGE);
  const [domain] = await api<{ version: string }>(page, "Domain", "get", {
    select: ["version"],
    currentDomain: true,
  });
  if (!domain) throw new Error("The site has no current domain.");
  return domain.version;
}

// deviation:repeat-extra-fields-per-item
test("each item of a repeated fieldset keeps and submits its own extra field", async ({ page }) => {
  const perItem = coreHas(await coreVersion(page), PER_ITEM);
  const react = await observe(page, "react");
  const byAngular = await observe(page, "angular");
  const own = [{ note: "First" }, { note: "Second" }];
  expect(react).toEqual({ shown: ["First", "Second"], submitted: own, extra: null, stored: own });
  // Before 6.21 Angular's items show and submit one form-level value, the one typed last.
  const shared = {
    shown: ["Second", "Second"],
    submitted: [null, null],
    extra: { note: "Second" },
    stored: [null, null],
  };
  // Angular always sends the form-level extra fields, empty here.
  expect(byAngular).toEqual(perItem ? { ...react, extra: {} } : shared);
});
