/**
 * afreact-if, afreact-required and afreact-disabled on React (docs/adr/0012-own-condition-attributes.md):
 * each phone row shows, requires and disables its fields by its own type, and saves what it shows.
 * Angular does not read these attributes, so the spec runs on React alone.
 */
import { expect, type Page } from "@playwright/test";
import { test } from "./coverage";
import { api, API_PAGE, AUTH } from "./harness";

const FORM = "/civicrm/afreact/render?name=afformAfreactDemoRowRules&renderer=react";
const RUN = Date.now().toString(36);
const contacts: number[] = [];

const control = (page: Page, name: string, selector = "input") =>
  page.locator(`.afreact-render af-field[name="${name}"] ${selector}`);

test.afterAll(async ({ browser }) => {
  if (!contacts.length) return;
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  await page.goto(API_PAGE);
  await api(page, "Contact", "delete", { where: [["id", "IN", contacts]], useTrash: false });
  await context.close();
});

// deviation:row-conditions
test("each phone row applies its own conditions and saves what it shows", async ({ page }) => {
  await page.goto(FORM);
  const types = control(page, "phone_type_id", "select");
  await expect(types).toHaveCount(2);
  await types.nth(0).selectOption({ label: "Phone" });
  await types.nth(1).selectOption({ label: "Mobile" });

  const extensions = control(page, "phone_ext");
  await expect(extensions.nth(0)).toHaveJSProperty("required", true);
  await expect(extensions.nth(1)).toHaveJSProperty("required", false);
  await expect(page.locator('.afreact-render af-field[name="mobile_provider_id"]')).toHaveCount(1);
  const billing = control(page, "is_billing");
  await expect(billing.nth(0)).toBeEnabled();
  await expect(billing.nth(1)).toBeDisabled();

  await control(page, "last_name").fill(`RowRules${RUN}`);
  const phones = control(page, "phone");
  await phones.nth(0).fill("111");
  await phones.nth(1).fill("222");
  await extensions.nth(0).fill("7");
  await billing.nth(0).check();
  await page.locator(".afreact-render button.af-button").click();
  await expect(page.getByText("Contact saved.")).toBeVisible();

  await page.goto(API_PAGE);
  const saved = await api<{
    contact_id: number;
    phone: string;
    phone_ext: string | null;
    is_billing: boolean;
  }>(page, "Phone", "get", {
    select: ["contact_id", "phone", "phone_ext", "is_billing"],
    where: [["contact_id.last_name", "=", `RowRules${RUN}`]],
    orderBy: { phone: "ASC" },
  });
  contacts.push(...new Set(saved.map((phone) => phone.contact_id)));
  expect(
    saved.map(({ phone, phone_ext, is_billing }) => ({ phone, phone_ext, is_billing })),
  ).toEqual([
    { phone: "111", phone_ext: "7", is_billing: true },
    { phone: "222", phone_ext: null, is_billing: false },
  ]);
});
