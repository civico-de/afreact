/**
 * A form in the afreact_forms setting is rendered by React wherever core places it: its page,
 * a contact summary tab and block, the contact actions popup, a case summary block and an event
 * management tab. The same
 * steps run with the form left to Angular and handed to React, and must observe the same.
 */
import {
  expect as baseExpect,
  test,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";
import { api, AUTH, quietApi, setReactForms, type Renderer } from "./harness";

// Switching the renderer rebuilds the menu, and the first pages after it fill cold caches.
const expect = baseExpect.configure({ timeout: 20_000 });
test.setTimeout(360_000);

const RUN = Date.now().toString(36);
const FORM = "afformAfreactTestPlaced";
const TITLE = `Afreact placed ${RUN}`;
const ROUTE = `civicrm/afreact/test-placed-${RUN}`;
const LAYOUT = `<af-form ctrl="afform">
  <af-entity type="Individual" name="Individual1" label="Individual 1" actions="{create: false, update: true}" security="RBAC" autofill="entity_id" />
  <fieldset af-fieldset="Individual1" class="af-container" af-title="Individual 1">
    <af-field name="first_name" />
    <af-field name="last_name" />
  </fieldset>
  <button class="af-button btn btn-primary" crm-icon="fa-check" ng-click="afform.submit()">Save</button>
</af-form>`;

let contactId = 0;
let caseId = 0;
let eventId = 0;

async function adminPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: AUTH });
  return context.newPage();
}

const renderWith = (page: Page, renderer: Renderer) =>
  setReactForms(page, renderer === "react" ? [FORM] : []);

test.beforeAll(async ({ browser }) => {
  const page = await adminPage(browser);
  await quietApi(page, "Afform", "create", {
    layoutFormat: "html",
    values: {
      name: FORM,
      type: "form",
      title: TITLE,
      server_route: ROUTE,
      permission: ["access CiviCRM"],
      placement: [
        "contact_summary_tab",
        "contact_summary_block",
        "contact_summary_actions",
        "case_summary_block",
        "event_manage_tab",
      ],
      layout: LAYOUT,
    },
  });
  // Core caches each placement's forms in the metadata cache, which saving a form leaves stale.
  await quietApi(page, "System", "flush", {});
  const [contact] = await quietApi<{ id: number }>(page, "Individual", "create", {
    values: { first_name: "Placed", last_name: `Afreact ${RUN}` },
  });
  contactId = contact?.id ?? 0;
  const [created] = await quietApi<{ id: number }>(page, "Case", "create", {
    values: {
      "case_type_id:name": "housing_support",
      contact_id: contactId,
      creator_id: "user_contact_id",
      subject: `Afreact ${RUN}`,
      "status_id:name": "Open",
    },
  });
  caseId = created?.id ?? 0;
  const [event] = await quietApi<{ id: number }>(page, "Event", "create", {
    values: { title: `Afreact ${RUN}`, "event_type_id:name": "Meeting", start_date: "2030-01-01" },
  });
  eventId = event?.id ?? 0;
  await page.context().close();
});

test.afterAll(async ({ browser }) => {
  const page = await adminPage(browser);
  await renderWith(page, "angular");
  if (eventId) await quietApi(page, "Event", "delete", { where: [["id", "=", eventId]] });
  if (caseId)
    await quietApi(page, "Case", "delete", { where: [["id", "=", caseId]], useTrash: false });
  if (contactId)
    await quietApi(page, "Contact", "delete", { where: [["id", "=", contactId]], useTrash: false });
  await quietApi(page, "Afform", "revert", { where: [["name", "=", FORM]] });
  await quietApi(page, "System", "flush", {});
  await page.context().close();
});

/** The placed form: React's host element, or the directive core writes for Angular. */
function placed(scope: Page | Locator, renderer: Renderer): Locator {
  return scope.locator(
    renderer === "react" ? `afreact-form[name="${FORM}"]` : "afform-afreact-test-placed",
  );
}

const input = (form: Locator, name: string) => form.locator(`af-field[name="${name}"] input`);

interface Observed {
  title: string;
  breadcrumb: string[];
  pageName: string;
  tab: string;
  block: string;
  popupName: string;
  popupClosed: boolean;
  savedName: string;
  caseBlock: string;
  eventTab: string;
  hosts: number[];
}

async function observe(page: Page, renderer: Renderer): Promise<Observed> {
  await renderWith(page, renderer);
  const hosts: number[] = [];
  const count = async (scope: Page | Locator) => {
    hosts.push(await placed(scope, "react").count());
  };

  await page.goto(`/${ROUTE}#?contact_id=${contactId}`);
  const form = placed(page, renderer).first();
  await expect(input(form, "first_name")).toHaveValue("Placed");
  const title = (await page.locator("h1").first().innerText()).trim();
  const breadcrumb = (await page.locator(".breadcrumb a, nav.breadcrumb a").allInnerTexts()).map(
    (text) => text.trim(),
  );
  const pageName = await input(form, "last_name").inputValue();
  await count(page);

  await page.goto(`/civicrm/contact/view?reset=1&cid=${contactId}`);
  const block = placed(page.locator("#contact-summary"), renderer).first();
  await expect(input(block, "first_name")).toHaveValue("Placed");
  const blockName = await input(block, "last_name").inputValue();
  const tabButton = page.getByRole("tab", { name: TITLE });
  await tabButton.click();
  const panel = page.locator(`#${await tabButton.getAttribute("aria-controls")}`);
  const tab = placed(panel, renderer).first();
  await expect(input(tab, "first_name")).toHaveValue("Placed");
  const tabName = await input(tab, "last_name").inputValue();
  await count(page);

  await page.locator("#crm-contact-actions-link").click();
  await page.locator("#crm-contact-actions-list").getByRole("link", { name: TITLE }).click();
  const dialog = page.locator(".ui-dialog-content");
  const popup = placed(dialog, renderer).first();
  await expect(input(popup, "first_name")).toHaveValue("Placed");
  const popupName = await input(popup, "last_name").inputValue();
  await count(dialog);
  await input(popup, "first_name").fill(`Saved ${renderer}`);
  await popup.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);
  const [saved] = await api<{ first_name: string }>(page, "Individual", "get", {
    select: ["first_name"],
    where: [["id", "=", contactId]],
  });
  await api(page, "Individual", "update", {
    where: [["id", "=", contactId]],
    values: { first_name: "Placed" },
  });

  await page.goto(`/civicrm/contact/view/case?reset=1&action=view&cid=${contactId}&id=${caseId}`);
  const caseBlock = placed(page, renderer).first();
  await expect(input(caseBlock, "first_name")).toHaveValue("Placed");
  const caseName = await input(caseBlock, "last_name").inputValue();
  await count(page);

  // The event tab passes event_id only, so the contact stays empty.
  await page.goto(`/civicrm/event/manage/settings?reset=1&action=update&id=${eventId}`);
  const eventButton = page.getByRole("tab", { name: TITLE });
  await eventButton.click();
  const eventPanel = page.locator(`#${await eventButton.getAttribute("aria-controls")}`);
  const eventTab = placed(eventPanel, renderer).first();
  await expect(input(eventTab, "first_name")).toBeVisible();
  const eventName = await input(eventTab, "last_name").inputValue();
  await count(eventPanel);

  return {
    title,
    breadcrumb,
    pageName,
    tab: tabName,
    block: blockName,
    popupName,
    popupClosed: true,
    savedName: saved?.first_name ?? "",
    caseBlock: caseName,
    eventTab: eventName,
    hosts,
  };
}

test("a listed form is rendered by React wherever core places it, as Angular renders it", async ({
  page,
}) => {
  const angular = await observe(page, "angular");
  const react = await observe(page, "react");
  const lastName = `Afreact ${RUN}`;
  expect(angular).toMatchObject({
    title: TITLE,
    pageName: lastName,
    tab: lastName,
    block: lastName,
    popupName: lastName,
    savedName: "Saved angular",
    caseBlock: lastName,
    eventTab: "",
    hosts: [0, 0, 0, 0, 0],
  });
  expect({ ...react, savedName: "", hosts: [] }).toEqual({ ...angular, savedName: "", hosts: [] });
  expect(react.savedName).toBe("Saved react");
  // Page, summary (tab and block), popup, case view, event tab.
  expect(react.hosts).toEqual([1, 2, 1, 1, 1]);
});
