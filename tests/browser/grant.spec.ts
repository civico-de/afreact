/**
 * The add grant task on the contacts demo: each renderer adds grants for its own pair of
 * contacts, with the first contact's grant skipped, and the Grant rows must come out alike.
 */
import { expect, type Page } from "@playwright/test";
import { test } from "./coverage";
import { api, API_PAGE, AUTH, type Renderer } from "./harness";

const RUN = Date.now().toString(36);
const LOAD = { timeout: 30_000 };
const lastName = (renderer: Renderer) => `Grant${RUN}${renderer}`;
const TYPE = `afreact_grant_${RUN}`;
const render = (renderer: Renderer) =>
  `/civicrm/afreact/render?name=afsearchAfreactDemoContacts&renderer=${renderer}` +
  `#?last_name=${lastName(renderer)}`;

interface Added {
  "grant_type_id:name": string;
  "status_id:name": string;
  amount_total: number;
  contact: number;
}

const contacts: Partial<Record<Renderer, number[]>> = {};
let typeId: number | undefined;

async function adminPage(page: Page) {
  await page.goto(API_PAGE);
}

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  await adminPage(page);
  // A fresh install has no grant type; the only one is the dialog's preset choice.
  const [type] = await api<{ id: number }>(page, "OptionValue", "create", {
    values: { "option_group_id.name": "grant_type", name: TYPE, label: `Grant type ${RUN}` },
  });
  typeId = type?.id;
  for (const renderer of ["react", "angular"] as const) {
    const created = await api<{ id: number }>(page, "Individual", "save", {
      records: ["Aa", "Bb"].map((first) => ({ first_name: first, last_name: lastName(renderer) })),
    });
    contacts[renderer] = created.map((contact) => contact.id);
    // The first contact has a grant already, so the dialog offers to skip it.
    await api(page, "Grant", "create", {
      values: {
        contact_id: created[0]?.id,
        "grant_type_id:name": TYPE,
        "status_id:name": "Submitted",
        amount_total: 1,
      },
    });
  }
  await context.close();
});

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  await adminPage(page);
  const ids = Object.values(contacts).flat();
  try {
    if (ids.length) {
      await api(page, "Grant", "delete", { where: [["contact_id", "IN", ids]] });
      await api(page, "Contact", "delete", { where: [["id", "IN", ids]], useTrash: false });
    }
  } finally {
    if (typeId) await api(page, "OptionValue", "delete", { where: [["id", "=", typeId]] });
    await context.close();
  }
});

/** The grants the task added for a renderer's contacts, the contact replaced by its position. */
async function added(page: Page, renderer: Renderer): Promise<Added[]> {
  const ids = contacts[renderer] ?? [];
  const rows = await api<Omit<Added, "contact"> & { id: number; contact_id: number }>(
    page,
    "Grant",
    "get",
    {
      select: ["contact_id", "grant_type_id:name", "status_id:name", "amount_total"],
      where: [
        ["contact_id", "IN", ids],
        ["amount_total", "=", 25],
      ],
      orderBy: { contact_id: "ASC" },
    },
  );
  // The API adds the id, which differs between the renderers.
  return rows.map(({ id: _id, contact_id, ...row }) => ({
    ...row,
    contact: ids.indexOf(contact_id),
  }));
}

async function addGrants(page: Page, renderer: Renderer) {
  await page.goto(render(renderer));
  const rows = page.locator(".afreact-render tbody tr");
  await expect(rows).toHaveCount(2, LOAD);
  for (const row of await rows.all()) await row.locator(".crm-search-ctrl-select-row").check();
  await page.locator(".afreact-render .crm-search-task-menu").click();
  await page.locator(".afreact-render .dropdown-menu a", { hasText: "Add New Grant" }).click();
  if (renderer === "react") {
    const dialog = page.getByRole("dialog", { name: "Grant - Add New Grant" });
    await expect(dialog.getByText("1 contact already has a grant.")).toBeVisible(LOAD);
    await expect(
      dialog.getByRole("radio", { name: "Skip contact with existing grant" }),
    ).toBeChecked();
    await dialog.getByRole("textbox", { name: "Total Amount Requested" }).fill("25");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden(LOAD);
    return;
  }
  const dialog = page.locator(".ui-dialog", { hasText: "Grant - Add New Grant" });
  await expect(dialog.getByText("1 contact already has a grant.")).toBeVisible(LOAD);
  // The second clause, the amount; the first is the type, preset to the only one.
  await dialog.locator("crm-search-input").nth(1).locator("input.form-control:visible").fill("25");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden(LOAD);
}

test("both renderers add the same grants, skipping the contact with one", async ({ page }) => {
  const seen: Partial<Record<Renderer, Added[]>> = {};
  for (const renderer of ["react", "angular"] as const) {
    await addGrants(page, renderer);
    await expect.poll(() => added(page, renderer).then((rows) => rows.length), LOAD).toBe(1);
    seen[renderer] = await added(page, renderer);
  }
  expect(seen.react).toEqual(seen.angular);
  expect(seen.react).toEqual([
    { "grant_type_id:name": TYPE, "status_id:name": "Submitted", amount_total: 25, contact: 1 },
  ]);
});
