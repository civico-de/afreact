/**
 * Core's contribution batch form (batch_entry): each renderer starts a batch with a target total,
 * enters two contributions and imports them, and the contributions must come out alike.
 */
import { expect, test, type Page } from "@playwright/test";
import { api, AUTH, quietApi, type Renderer } from "./harness";

const RUN = Date.now().toString(36);
const LOAD = { timeout: 30_000 };
const IMPORT = { timeout: 90_000 };
const FORM = "afsearchContributionBatch";
const render = (renderer: Renderer) => `/civicrm/afreact/render?name=${FORM}&renderer=${renderer}`;
const lastName = (renderer: Renderer) => `Batch${RUN}${renderer}`;

interface Entered {
  contact: number;
  total: string;
  fee: string | null;
}

/** Two rows whose totals, 10.1 + 20.2, meet the batch's target of 30.3. */
const ENTRIES: Entered[] = [
  { contact: 0, total: "10.1", fee: "0.1" },
  { contact: 1, total: "20.2", fee: null },
];

const contacts: Partial<Record<Renderer, number[]>> = {};
const batches: number[] = [];

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  for (const renderer of ["react", "angular"] as const) {
    const created = await quietApi<{ id: number }>(page, "Individual", "save", {
      records: ["Aa", "Bb"].map((first) => ({ first_name: first, last_name: lastName(renderer) })),
    });
    contacts[renderer] = created.map((contact) => contact.id);
  }
  await context.close();
});

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  const ids = Object.values(contacts).flat();
  try {
    if (ids.length) {
      await quietApi(page, "Contribution", "delete", { where: [["contact_id", "IN", ids]] });
      await quietApi(page, "Contact", "delete", { where: [["id", "IN", ids]], useTrash: false });
    }
  } finally {
    if (batches.length)
      await quietApi(page, "UserJob", "delete", { where: [["id", "IN", batches]] });
    await context.close();
  }
});

/** The renderer's contributions, contacts replaced by their position. */
async function contributions(page: Page, renderer: Renderer) {
  const ids = contacts[renderer] ?? [];
  const rows = await api<Record<string, unknown> & { id: number; contact_id: number }>(
    page,
    "Contribution",
    "get",
    {
      select: [
        "contact_id",
        "total_amount",
        "fee_amount",
        "net_amount",
        "financial_type_id:name",
        "contribution_status_id:name",
      ],
      where: [["contact_id", "IN", ids]],
      orderBy: { total_amount: "ASC" },
    },
  );
  return rows.map(({ id: _id, contact_id: contact, ...row }) => ({
    ...row,
    contact: ids.indexOf(contact),
  }));
}

async function startBatch(page: Page, renderer: Renderer) {
  await page.goto(render(renderer));
  if (renderer === "react") {
    const form = page.getByRole("group", { name: "New Batch" });
    await form.getByRole("textbox", { name: "Name" }).fill(`Batch ${RUN} ${renderer}`, LOAD);
    await form.getByRole("spinbutton", { name: "Rows" }).fill("2");
    await form.getByRole("spinbutton", { name: "Total Amount" }).fill("30.3");
  } else {
    // Core's Name label points at an id the input does not have (see upstream bugs).
    await page.locator("#crm-create-new-batch-label").fill(`Batch ${RUN} ${renderer}`, LOAD);
    await page.getByLabel("Rows").fill("2");
    await page.getByLabel("Total Amount").fill("30.3");
  }
  await page.getByRole("button", { name: "Start New Batch" }).click();
  await expect(page).toHaveURL(/[#&?]batch=\d+/, LOAD);
  batches.push(Number(/batch=(\d+)/.exec(page.url())?.[1]));
}

async function enterRows(page: Page, renderer: Renderer) {
  const rows = page.locator(".afreact-render .crm-search-display-batch tbody tr");
  await expect(rows).toHaveCount(2, LOAD);
  for (const [index, entry] of ENTRIES.entries()) {
    const contact = `${lastName(renderer)}, ${["Aa", "Bb"][entry.contact] ?? ""}`;
    if (renderer === "react") {
      const row = `Row ${String(index + 1)}`;
      const combobox = page.getByRole("combobox", { name: `Contact, ${row}`, exact: true });
      await combobox.fill(contact);
      await page.getByRole("option", { name: contact }).click();
      await page
        .getByRole("textbox", { name: `Total Amount, ${row}`, exact: true })
        .fill(entry.total);
      if (entry.fee)
        await page
          .getByRole("textbox", { name: `Fee Amount, ${row}`, exact: true })
          .fill(entry.fee);
      await page
        .getByRole("combobox", { name: `Financial Type, ${row}`, exact: true })
        .selectOption({ label: "Donation" });
      continue;
    }
    // Cells by column: the row number, Contact, Total, Fee, Net, Status, Financial Type.
    const cell = (column: number) => rows.nth(index).locator("td").nth(column);
    await cell(1).locator(".select2-container").click();
    await page.locator("#select2-drop input").fill(contact);
    await page.locator("#select2-drop .select2-result-label", { hasText: contact }).click();
    await cell(2).locator("input").fill(entry.total);
    if (entry.fee) await cell(3).locator("input").fill(entry.fee);
    await cell(6).locator(".select2-container").click();
    await page.locator("#select2-drop .select2-result-label", { hasText: "Donation" }).click();
  }
  // The server fills a missing net amount itself, so the formula is checked on the page.
  const net = (index: number) => rows.nth(index).locator("td").nth(4);
  await expect(net(0)).toHaveText("10");
  await expect(net(1)).toHaveText("20.2");
}

async function runImport(page: Page, renderer: Renderer) {
  await page.getByRole("button", { name: "Run Import" }).click();
  if (renderer === "angular") {
    // Core adds the amounts in binary floating point: 10.1 + 20.2 misses 30.3 (see upstream bugs).
    const confirm = page.locator(".ui-dialog", { hasText: "Totals Mismatch" });
    await expect(confirm).toContainText("30.299999999999997", LOAD);
    await confirm.getByRole("button", { name: "Run Import" }).click();
  }
  await expect(page).toHaveURL(/civicrm\/import\/contact\/summary/, IMPORT);
}

test("both renderers import the same contributions from a batch with a target", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const seen: Partial<Record<Renderer, unknown[]>> = {};
  for (const renderer of ["react", "angular"] as const) {
    await startBatch(page, renderer);
    await enterRows(page, renderer);
    if (renderer === "react") {
      // The totals meet the target as typed, so the import asks nothing.
      await expect(page.locator("tfoot td", { hasText: "30.3 / 30.3" })).toHaveClass(
        /text-success/,
      );
    }
    await runImport(page, renderer);
    seen[renderer] = await contributions(page, renderer);
  }
  expect(seen.react).toEqual(seen.angular);
  expect(seen.react).toEqual([
    expect.objectContaining({ contact: 0, total_amount: 10.1, fee_amount: 0.1, net_amount: 10 }),
    expect.objectContaining({ contact: 1, total_amount: 20.2, net_amount: 20.2 }),
  ]);
});
