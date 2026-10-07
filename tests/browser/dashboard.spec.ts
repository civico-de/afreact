/**
 * Afform dashlets on core's dashboard: a form in the afreact_forms setting renders with React,
 * the others with Angular, side by side. The test adds both demo dashlets to the admin's
 * dashboard and puts the admin's dashboard rows back afterwards.
 */
import {
  expect as baseExpect,
  test,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";
import { AUTH, quietApi, setReactForms } from "./harness";

// Switching the renderer clears the Angular cache, so the first dashboard load assembles it cold.
const expect = baseExpect.configure({ timeout: 20_000 });
test.setTimeout(180_000);

const LISTED = "afsearchAfreactDemoDashletContacts";
const UNLISTED = "afsearchAfreactDemoDashletContactTypes";
const DIRECTIVE = {
  [LISTED]: "afsearch-afreact-demo-dashlet-contacts",
  [UNLISTED]: "afsearch-afreact-demo-dashlet-contact-types",
};

interface Row {
  id: number;
  dashboard_id: number;
  column_no: number;
  weight: number;
  is_active: boolean;
}

let dashlets: { id: number; name: string }[] = [];
let previous: Row[] = [];

const mine = () => [
  ["contact_id", "=", "user_contact_id"],
  ["dashboard_id", "IN", dashlets.map((row) => row.id)],
];

const adminPage = async (browser: Browser) =>
  (await browser.newContext({ storageState: AUTH })).newPage();

test.beforeAll(async ({ browser }) => {
  const page = await adminPage(browser);
  // Afform creates the demo dashlets as managed records.
  await quietApi(page, "System", "flush", {});
  dashlets = await quietApi(page, "Dashboard", "get", {
    select: ["id", "name"],
    where: [["name", "IN", [LISTED, UNLISTED]]],
  });
  baseExpect(dashlets.map((row) => row.name).sort()).toEqual([UNLISTED, LISTED].sort());
  previous = await quietApi(page, "DashboardContact", "get", {
    select: ["id", "dashboard_id", "column_no", "weight", "is_active"],
    where: mine(),
  });
  await quietApi(page, "DashboardContact", "save", {
    records: dashlets.map((row, index) => ({
      dashboard_id: row.id,
      column_no: index,
      weight: 0,
      is_active: true,
    })),
    defaults: { contact_id: "user_contact_id" },
    match: ["contact_id", "dashboard_id"],
  });
  await page.context().close();
});

test.afterAll(async ({ browser }) => {
  const page = await adminPage(browser);
  await setReactForms(page, []);
  const kept = previous.map((row) => row.dashboard_id);
  await quietApi(page, "DashboardContact", "delete", {
    where: [...mine(), ...(kept.length ? [["dashboard_id", "NOT IN", kept]] : [])],
  });
  if (previous.length) await quietApi(page, "DashboardContact", "save", { records: previous });
  await page.context().close();
});

/** The dashlet titled after a demo form, and the element that renders it. */
function dashlet(page: Page, name: typeof LISTED | typeof UNLISTED, react: boolean) {
  const host = page.locator(react ? `afreact-form[name="${name}"]` : DIRECTIVE[name]);
  return { box: page.locator(".crm-dashlet").filter({ has: host }), host };
}

// A data row, not one of the placeholder rows both renderers show while loading.
const firstRow = (host: Locator) => host.locator("tbody tr[data-entity-id]").first();

test("a listed Afform dashlet renders with React next to an unlisted one in Angular", async ({
  page,
}) => {
  await setReactForms(page, [LISTED]);
  await page.goto("/civicrm/dashboard?reset=1");
  const react = dashlet(page, LISTED, true);
  const angular = dashlet(page, UNLISTED, false);
  await expect(firstRow(react.host)).toBeVisible();
  await expect(firstRow(angular.host)).toBeVisible();
  await expect(page.locator(DIRECTIVE[LISTED])).toHaveCount(0);
  await expect(page.locator(`afreact-form[name="${UNLISTED}"]`)).toHaveCount(0);
  // Core's dashboard loads no Angular module for the React dashlet.
  const modules: unknown = await page.evaluate("CRM.angular.modules");
  expect(modules).not.toContain(LISTED);
  expect(modules).toContain(UNLISTED);

  // Refresh puts the element back; it searches again.
  const rerun = page.waitForRequest(/\/civicrm\/ajax\/api4\/SearchDisplay\/run/);
  await react.box.getByRole("button", { name: "Refresh" }).click();
  await rerun;
  await expect(firstRow(react.host)).toBeVisible();

  // Fullscreen renders the form in core's dialog and gives it back on close.
  await react.box.getByRole("button", { name: "View fullscreen" }).click();
  const dialog = page.locator(".ui-dialog-content");
  await expect(firstRow(dialog.locator(`afreact-form[name="${LISTED}"]`))).toBeVisible();
  await page.locator(".ui-dialog").getByRole("button", { name: "Close" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(firstRow(dashlet(page, LISTED, true).host)).toBeVisible();

  await setReactForms(page, []);
  await page.goto("/civicrm/dashboard?reset=1");
  await expect(firstRow(dashlet(page, LISTED, false).host)).toBeVisible();
  await expect(firstRow(dashlet(page, UNLISTED, false).host)).toBeVisible();
  await expect(page.locator("afreact-form")).toHaveCount(0);
});
