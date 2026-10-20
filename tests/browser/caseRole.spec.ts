/**
 * The assign role task on a case search: each renderer gives its own pair of cases the same
 * role, replacing the holder one case has already, and the relationships must come out alike.
 */
import { expect, type Page } from "@playwright/test";
import { test } from "./coverage";
import { api, AUTH, quietApi, type Renderer } from "./harness";

const RUN = Date.now().toString(36);
const LOAD = { timeout: 30_000 };
const FORM = "afsearchAfreactCaseRoles";
const SEARCH = "Afreact_Case_Roles";
const DISPLAY = "Afreact_Case_Roles_Table";
const ROLE = "Benefits Specialist";
const subject = (renderer: Renderer) => `Role ${RUN} ${renderer}`;
const render = (renderer: Renderer) =>
  `/civicrm/afreact/render?name=${FORM}&renderer=${renderer}#?subject=${subject(renderer)}`;

interface Holder {
  case: number;
  contact: number;
  active: boolean;
}

/** Per renderer: the contacts (two clients, the role's new holder, its old one) and the cases. */
const fixture: Partial<Record<Renderer, { contacts: number[]; cases: number[] }>> = {};
let roleType = 0;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  const [type] = await quietApi<{ id: number }>(page, "RelationshipType", "get", {
    select: ["id"],
    where: [["name_b_a", "=", ROLE]],
  });
  if (!type) throw new Error(`No relationship type ${ROLE}`);
  roleType = type.id;
  // Saved by name, so a run cut short before its cleanup does not block the next.
  await quietApi(page, "SavedSearch", "save", {
    match: ["name"],
    records: [
      {
        name: SEARCH,
        label: SEARCH,
        api_entity: "Case",
        api_params: { version: 4, select: ["id", "subject"], where: [] },
      },
    ],
  });
  await quietApi(page, "SearchDisplay", "save", {
    match: ["name"],
    records: [
      {
        name: DISPLAY,
        label: DISPLAY,
        "saved_search_id.name": SEARCH,
        type: "table",
        settings: {
          actions: true,
          columns: [{ type: "field", key: "subject", label: "Subject" }],
        },
      },
    ],
  });
  await quietApi(page, "Afform", "create", {
    values: {
      name: FORM,
      title: FORM,
      type: "search",
      layout:
        '<div af-fieldset=""><af-field name="subject"></af-field>' +
        `<crm-search-display-table search-name="${SEARCH}" display-name="${DISPLAY}">` +
        "</crm-search-display-table></div>",
    },
  });
  // The Angular module list is cached, so the page would not know the new form.
  await quietApi(page, "System", "flush", {});
  for (const renderer of ["react", "angular"] as const) {
    const created = await quietApi<{ id: number }>(page, "Individual", "save", {
      records: ["Aa", "Bb", "Cc", "Dd"].map((first) => ({
        first_name: first,
        last_name: `${ROLE.replace(" ", "")}${RUN}${renderer}`,
      })),
    });
    const [clientA, clientB, , oldHolder] = created.map((contact) => contact.id);
    const cases = await quietApi<{ id: number }>(page, "Case", "save", {
      records: [clientA, clientB].map((contact) => ({
        contact_id: contact,
        "case_type_id:name": "housing_support",
        subject: subject(renderer),
      })),
    });
    // The first case holds the role already, so the dialog asks whether to add or replace.
    await quietApi(page, "Relationship", "create", {
      values: {
        case_id: cases[0]?.id,
        relationship_type_id: roleType,
        contact_id_a: clientA,
        contact_id_b: oldHolder,
      },
    });
    fixture[renderer] = {
      contacts: created.map((contact) => contact.id),
      cases: cases.map((row) => row.id),
    };
  }
  await context.close();
});

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  const cases = Object.values(fixture).flatMap((row) => row.cases);
  const contacts = Object.values(fixture).flatMap((row) => row.contacts);
  try {
    if (cases.length)
      await quietApi(page, "Case", "delete", { where: [["id", "IN", cases]], useTrash: false });
    if (contacts.length)
      await quietApi(page, "Contact", "delete", {
        where: [["id", "IN", contacts]],
        useTrash: false,
      });
  } finally {
    await quietApi(page, "Afform", "revert", { where: [["name", "=", FORM]] });
    await quietApi(page, "SavedSearch", "delete", { where: [["name", "=", SEARCH]] });
    await quietApi(page, "System", "flush", {});
    await context.close();
  }
});

/** The role's holders on a renderer's cases, cases and contacts replaced by their position. */
async function holders(page: Page, renderer: Renderer): Promise<Holder[]> {
  const { cases, contacts } = fixture[renderer] ?? { cases: [], contacts: [] };
  const rows = await api<{ case_id: number; contact_id_b: number; is_active: boolean }>(
    page,
    "Relationship",
    "get",
    {
      select: ["case_id", "contact_id_b", "is_active"],
      where: [
        ["case_id", "IN", cases],
        ["relationship_type_id", "=", roleType],
      ],
      orderBy: { case_id: "ASC", contact_id_b: "ASC" },
    },
  );
  return rows.map((row) => ({
    case: cases.indexOf(row.case_id),
    contact: contacts.indexOf(row.contact_id_b),
    active: row.is_active,
  }));
}

async function assignRole(page: Page, renderer: Renderer) {
  // The new holder, Cc, found by the pair's last name; the autocomplete lists sort names.
  const holder = `${ROLE.replace(" ", "")}${RUN}${renderer}, Cc`;
  await page.goto(render(renderer));
  const rows = page.locator(".afreact-render tbody tr");
  await expect(rows).toHaveCount(2, LOAD);
  for (const row of await rows.all()) await row.locator(".crm-search-ctrl-select-row").check();
  await page.locator(".afreact-render .crm-search-task-menu").click();
  await page.locator(".afreact-render .dropdown-menu a", { hasText: "Assign Role" }).click();
  if (renderer === "react") {
    const dialog = page.getByRole("dialog", { name: "Case - Assign Role" });
    await dialog.getByRole("combobox", { name: "Role Type" }).selectOption(`${roleType}_a_b`);
    await expect(dialog.getByText("1 cases already have this role assigned.")).toBeVisible(LOAD);
    const contact = dialog.getByRole("combobox", { name: "Contact" });
    await contact.fill(holder);
    await dialog.getByRole("option", { name: holder }).click();
    await dialog.getByRole("radio", { name: "Replace existing roles" }).check();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden(LOAD);
    return;
  }
  const dialog = page.locator(".ui-dialog", { hasText: "Case - Assign Role" });
  await dialog.locator(".select2-container").first().click();
  await page.locator("#select2-drop input").fill(`${ROLE} is`);
  await page.locator("#select2-drop .select2-result-label", { hasText: `${ROLE} is` }).click();
  await expect(dialog.getByText("1 cases already have this role assigned.")).toBeVisible(LOAD);
  await dialog.locator(".select2-container").nth(1).click();
  await page.locator("#select2-drop input").fill(holder);
  await page.locator("#select2-drop .select2-result-label", { hasText: holder }).click();
  await dialog.getByText("Replace existing roles").click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden(LOAD);
}

test("both renderers assign the same role, replacing the holder one case has", async ({ page }) => {
  const seen: Partial<Record<Renderer, Holder[]>> = {};
  for (const renderer of ["react", "angular"] as const) {
    await assignRole(page, renderer);
    await expect.poll(() => holders(page, renderer).then((rows) => rows.length), LOAD).toBe(3);
    seen[renderer] = await holders(page, renderer);
  }
  expect(seen.react).toEqual(seen.angular);
  expect(seen.react).toEqual([
    { case: 0, contact: 2, active: true },
    { case: 0, contact: 3, active: false },
    { case: 1, contact: 2, active: true },
  ]);
});
