/**
 * The relationship task on the contacts demo: each renderer relates its own pair of contacts to
 * the same organisation as its employees, and the Relationship rows must come out alike.
 */
import { expect, test, type Page } from "@playwright/test";
import { api, AUTH, type Renderer } from "./harness";

const RUN = Date.now().toString(36);
const LOAD = { timeout: 30_000 };
const lastName = (renderer: Renderer) => `Rel${RUN}${renderer}`;
const render = (renderer: Renderer) =>
  `/civicrm/afreact/render?name=afsearchAfreactDemoContacts&renderer=${renderer}` +
  `#?last_name=${lastName(renderer)}`;

interface Related {
  contact_id_a: number;
  contact_id_b: number;
  "relationship_type_id:name": string;
  is_active: boolean;
}

const contacts: Partial<Record<Renderer, number[]>> = {};
let employer = 0;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  await page.goto("/civicrm/afreact/compare");
  const [organisation] = await api<{ id: number }>(page, "Organization", "create", {
    values: { organization_name: `Employer ${RUN}` },
  });
  if (!organisation) throw new Error("Organization.create returned no contact");
  employer = organisation.id;
  for (const renderer of ["react", "angular"] as const) {
    const created = await api<{ id: number }>(page, "Individual", "save", {
      records: ["Aa", "Bb"].map((first) => ({ first_name: first, last_name: lastName(renderer) })),
    });
    contacts[renderer] = created.map((contact) => contact.id);
  }
  await context.close();
});

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  await page.goto("/civicrm/afreact/compare");
  const ids = [...Object.values(contacts).flat(), ...(employer ? [employer] : [])];
  if (ids.length)
    await api(page, "Contact", "delete", { where: [["id", "IN", ids]], useTrash: false });
  await context.close();
});

/** The relationships of a renderer's contacts, with their ids replaced by their position. */
async function related(page: Page, renderer: Renderer): Promise<Related[]> {
  const ids = contacts[renderer] ?? [];
  const rows = await api<Related>(page, "Relationship", "get", {
    select: ["contact_id_a", "contact_id_b", "relationship_type_id:name", "is_active"],
    where: [["contact_id_a", "IN", ids]],
    orderBy: { contact_id_a: "ASC" },
  });
  return rows.map((row) => ({
    contact_id_a: ids.indexOf(row.contact_id_a),
    contact_id_b: row.contact_id_b,
    "relationship_type_id:name": row["relationship_type_id:name"],
    is_active: row.is_active,
  }));
}

async function relate(page: Page, renderer: Renderer) {
  await page.goto(render(renderer));
  const rows = page.locator(".afreact-render tbody tr");
  await expect(rows).toHaveCount(2, LOAD);
  for (const row of await rows.all()) await row.locator(".crm-search-ctrl-select-row").check();
  await page.locator(".afreact-render .crm-search-task-menu").click();
  await page.locator(".afreact-render .dropdown-menu a", { hasText: "Add Relationship" }).click();
  if (renderer === "react") {
    const dialog = page.getByRole("dialog", { name: "Add Relationship" });
    await dialog.getByRole("combobox", { name: /Relationship Type/ }).selectOption({
      label: "Employee of",
    });
    const contact = dialog.getByRole("combobox", { name: /Contact/ });
    await contact.fill(`Employer ${RUN}`);
    await dialog.getByRole("option", { name: `Employer ${RUN}` }).click();
    await expect(dialog.getByRole("textbox", { name: /Description/ })).toBeVisible(LOAD);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden(LOAD);
    return;
  }
  const dialog = page.locator(".ui-dialog", { hasText: "Add Relationship" });
  await dialog.locator("#s2id_crm-search-task-relationship-relationship_type").click();
  await page.locator("#select2-drop .select2-input").fill("Employee of");
  await page.locator("#select2-drop .select2-result", { hasText: "Employee of" }).click();
  await dialog.locator("#s2id_crm-search-task-relationship-contact_id").click();
  await page.locator("#select2-drop .select2-input").fill(`Employer ${RUN}`);
  await page.locator("#select2-drop .select2-result", { hasText: `Employer ${RUN}` }).click();
  await expect(dialog.getByRole("textbox", { name: /Description/ })).toBeVisible(LOAD);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden(LOAD);
}

test("both renderers add the same relationships to the selected contacts", async ({ page }) => {
  const seen: Partial<Record<Renderer, Related[]>> = {};
  for (const renderer of ["react", "angular"] as const) {
    await relate(page, renderer);
    await expect.poll(() => related(page, renderer).then((rows) => rows.length), LOAD).toBe(2);
    seen[renderer] = await related(page, renderer);
  }
  expect(seen.react).toEqual(seen.angular);
  expect(seen.react).toEqual(
    [0, 1].map((contact_id_a) => ({
      contact_id_a,
      contact_id_b: employer,
      "relationship_type_id:name": "Employee of",
      is_active: true,
    })),
  );
});
