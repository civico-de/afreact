/**
 * The open case task on the contacts demo: each renderer opens a case for its own pair of
 * contacts, with the first contact's open case skipped, and the Case rows must come out alike.
 */
import { expect, test, type Page } from "@playwright/test";
import { api, API_PAGE, AUTH, type Renderer } from "./harness";

const RUN = Date.now().toString(36);
const LOAD = { timeout: 30_000 };
const lastName = (renderer: Renderer) => `Case${RUN}${renderer}`;
const subject = (renderer: Renderer) => `Subject ${RUN} ${renderer}`;
const render = (renderer: Renderer) =>
  `/civicrm/afreact/render?name=afsearchAfreactDemoContacts&renderer=${renderer}` +
  `#?last_name=${lastName(renderer)}`;

interface Opened {
  subject: string;
  "case_type_id:name": string;
  "status_id:name": string;
  contacts: number[];
}

const contacts: Partial<Record<Renderer, number[]>> = {};
const cases: number[] = [];

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  await page.goto(API_PAGE);
  for (const renderer of ["react", "angular"] as const) {
    const created = await api<{ id: number }>(page, "Individual", "save", {
      records: ["Aa", "Bb"].map((first) => ({ first_name: first, last_name: lastName(renderer) })),
    });
    contacts[renderer] = created.map((contact) => contact.id);
    // The first contact has a case open already, so the dialog offers to skip it.
    const [existing] = await api<{ id: number }>(page, "Case", "create", {
      values: {
        contact_id: created[0]?.id,
        "case_type_id:name": "housing_support",
        subject: `Existing ${RUN}`,
      },
    });
    if (existing) cases.push(existing.id);
  }
  await context.close();
});

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  await page.goto(API_PAGE);
  const ids = Object.values(contacts).flat();
  try {
    // Every case of the contacts, whatever the task did, before the contacts themselves.
    const clients = ids.length
      ? await api<{ case_id: number }>(page, "CaseContact", "get", {
          select: ["case_id"],
          where: [["contact_id", "IN", ids]],
        })
      : [];
    const caseIds = [...new Set([...cases, ...clients.map((row) => row.case_id)])];
    if (caseIds.length)
      await api(page, "Case", "delete", { where: [["id", "IN", caseIds]], useTrash: false });
  } finally {
    if (ids.length)
      await api(page, "Contact", "delete", { where: [["id", "IN", ids]], useTrash: false });
    await context.close();
  }
});

/** The cases the task opened for a renderer's contacts, the contacts replaced by their position. */
async function opened(page: Page, renderer: Renderer): Promise<Opened[]> {
  const ids = contacts[renderer] ?? [];
  const rows = await api<Omit<Opened, "contacts"> & { id: number }>(page, "Case", "get", {
    select: ["id", "subject", "case_type_id:name", "status_id:name"],
    where: [["subject", "=", subject(renderer)]],
    orderBy: { id: "ASC" },
  });
  const clients = await api<{ case_id: number; contact_id: number }>(page, "CaseContact", "get", {
    select: ["case_id", "contact_id"],
    where: [["case_id", "IN", rows.map((row) => row.id)]],
    orderBy: { contact_id: "ASC" },
  });
  return rows.map((row) => ({
    subject: row.subject,
    "case_type_id:name": row["case_type_id:name"],
    "status_id:name": row["status_id:name"],
    contacts: clients
      .filter((client) => client.case_id === row.id)
      .map((client) => ids.indexOf(client.contact_id)),
  }));
}

async function openCases(page: Page, renderer: Renderer) {
  await page.goto(render(renderer));
  const rows = page.locator(".afreact-render tbody tr");
  await expect(rows).toHaveCount(2, LOAD);
  for (const row of await rows.all()) await row.locator(".crm-search-ctrl-select-row").check();
  await page.locator(".afreact-render .crm-search-task-menu").click();
  await page.locator(".afreact-render .dropdown-menu a", { hasText: "Open New Case" }).click();
  if (renderer === "react") {
    const dialog = page.getByRole("dialog", { name: "Case - Open New Case" });
    await expect(dialog.getByText("1 contact already has an open case.")).toBeVisible(LOAD);
    await expect(dialog.getByRole("radio", { name: "Skip contact with open case" })).toBeChecked();
    await dialog.getByRole("textbox", { name: "Subject" }).fill(subject(renderer));
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden(LOAD);
    return;
  }
  const dialog = page.locator(".ui-dialog", { hasText: "Case - Open New Case" });
  await expect(dialog.getByText("1 contact already has an open case.")).toBeVisible(LOAD);
  await dialog.locator("crm-search-input input.form-control[type=text]").fill(subject(renderer));
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden(LOAD);
}

test("both renderers open the same cases, skipping the contact with one", async ({ page }) => {
  const seen: Partial<Record<Renderer, Opened[]>> = {};
  for (const renderer of ["react", "angular"] as const) {
    await openCases(page, renderer);
    await expect.poll(() => opened(page, renderer).then((rows) => rows.length), LOAD).toBe(1);
    seen[renderer] = await opened(page, renderer);
  }
  expect(seen.react).toEqual(seen.angular?.map((row) => ({ ...row, subject: subject("react") })));
  expect(seen.react).toEqual([
    {
      subject: subject("react"),
      "case_type_id:name": "housing_support",
      "status_id:name": "Open",
      contacts: [1],
    },
  ]);
});
