/**
 * The render page's placement picker: a placed form opens with the user's own contact, a contact
 * chosen in the picker's autocomplete reaches the form, and a cleared pick shows it without one.
 */
import { expect, type Page } from "@playwright/test";
import { test } from "./coverage";
import { AUTH, axeFindings, ownFindings, quietApi } from "./harness";

const RUN = Date.now().toString(36);
const FORM = "afformAfreactTestPicker";
const LAST = `Picker ${RUN}`;
const LAYOUT = `<af-form ctrl="afform">
  <af-entity type="Individual" name="Individual1" label="Individual 1" actions="{create: false, update: true}" security="RBAC" autofill="entity_id" />
  <fieldset af-fieldset="Individual1" class="af-container" af-title="Individual 1">
    <af-field name="last_name" />
  </fieldset>
</af-form>`;

let contactId = 0;
let ownId = 0;

test.beforeAll(async ({ browser }) => {
  const page = await (await browser.newContext({ storageState: AUTH })).newPage();
  await quietApi(page, "Afform", "create", {
    layoutFormat: "html",
    values: {
      name: FORM,
      type: "form",
      title: `Afreact picker ${RUN}`,
      permission: ["access CiviCRM"],
      placement: ["contact_summary_tab"],
      layout: LAYOUT,
    },
  });
  await quietApi(page, "System", "flush", {});
  const [contact] = await quietApi<{ id: number }>(page, "Individual", "create", {
    values: { last_name: LAST },
  });
  contactId = contact?.id ?? 0;
  const [own] = await quietApi<{ id: number }>(page, "Contact", "get", {
    select: ["id"],
    where: [["id", "=", "user_contact_id"]],
  });
  ownId = own?.id ?? 0;
  await page.context().close();
});

test.afterAll(async ({ browser }) => {
  const page = await (await browser.newContext({ storageState: AUTH })).newPage();
  if (contactId)
    await quietApi(page, "Contact", "delete", { where: [["id", "=", contactId]], useTrash: false });
  await quietApi(page, "Afform", "revert", { where: [["name", "=", FORM]] });
  await quietApi(page, "System", "flush", {});
  await page.context().close();
});

const picker = (page: Page) => page.locator("form.afreact-placement-picker");
const lastName = (page: Page) =>
  page.locator(`afreact-form[name="${FORM}"] af-field[name="last_name"] input`);

test("a contact picked in the autocomplete reaches the form on the render route", async ({
  page,
}) => {
  await page.goto(`/civicrm/afreact/render?name=${FORM}&renderer=react`);
  const input = picker(page).locator("#afreact-placement-contact_id");
  await expect(input).toHaveValue(String(ownId));
  await expect(page.locator(`afreact-form[name="${FORM}"]`)).toHaveAttribute(
    "options",
    JSON.stringify({ contact_id: ownId }),
  );
  // Core's crmLoad handler turns the input into its select2 autocomplete.
  const choice = page.locator("#s2id_afreact-placement-contact_id .select2-choice");
  await expect(choice).toBeVisible();
  await choice.click();
  await page.locator("#select2-drop input.select2-input").pressSequentially(LAST);
  await page.locator("#select2-drop .select2-result-label", { hasText: LAST }).first().click();
  await expect(input).toHaveValue(String(contactId));
  await picker(page).getByRole("button", { name: "Show" }).click();

  await expect(page).toHaveURL(
    (url) =>
      url.pathname.endsWith("/civicrm/afreact/render") &&
      url.searchParams.get("name") === FORM &&
      url.searchParams.get("renderer") === "react" &&
      url.searchParams.get("placement_contact_id") === String(contactId),
  );
  await expect(lastName(page)).toHaveValue(LAST);
});

test("a cleared pick shows the form without a record", async ({ page }) => {
  await page.goto(`/civicrm/afreact/render?name=${FORM}&renderer=react&placement_contact_id=`);
  await expect(picker(page).locator("#afreact-placement-contact_id")).toHaveValue("");
  await expect(page.locator(`afreact-form[name="${FORM}"]`)).not.toHaveAttribute("options", /./);
  await expect(page.locator(`afreact-form[name="${FORM}"] > div`)).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(lastName(page)).toHaveValue("");
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`axe finds nothing in the picker beyond what core's widgets show (${colorScheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto(`/civicrm/afreact/render?name=${FORM}&renderer=react`);
    await expect(page.locator("#s2id_afreact-placement-contact_id .select2-choice")).toBeVisible();
    // select2 gives its generated focus input role="button", as on every core autocomplete.
    const shown = (await axeFindings(page, "form.afreact-placement-picker")).filter(
      (finding) => !finding.startsWith("aria-allowed-role: #s2id_"),
    );
    // Core's settings form in the same theme: its Save button is the Show button's twin.
    await page.goto("/civicrm/admin/setting/afreact");
    await expect(page.locator(".crm-container form .crm-button").first()).toBeVisible();
    const core = await axeFindings(page, ".crm-container form");
    expect(ownFindings(shown, core), "findings the core settings form does not share").toEqual([]);
  });
}
