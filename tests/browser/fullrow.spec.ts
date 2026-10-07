/**
 * Full-row editing (editableRow.full) on both renderers: a click on one cell opens every
 * editable cell of the row, the control column's Save button stores all of them in one go and
 * Escape drops the row's changes. Each renderer edits its own contact, found by last name.
 */
import { expect, test, type Page } from "@playwright/test";
import { api, AUTH, type Renderer } from "./harness";

const RUN = Date.now().toString(36);
const LOAD = { timeout: 30_000 };
const render = (renderer: Renderer, lastName: string) =>
  `/civicrm/afreact/render?name=afsearchAfreactDemoEditableRow&renderer=${renderer}` +
  `#?last_name=${lastName}`;
const cell = (page: Page, field: string) =>
  page.locator(`.afreact-render tbody td[data-field-name="${field}"]`);
/** The cell's text as seen; React's edit button also names its column for screen readers. */
const shown = (page: Page, field: string) => async () =>
  cell(page, field).evaluate((td) => {
    const copy = td.cloneNode(true);
    if (!(copy instanceof HTMLElement)) throw new Error("The cell's clone is no element.");
    for (const hidden of copy.querySelectorAll(".sr-only")) hidden.remove();
    return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
  });
const editors = (page: Page) => page.locator(".afreact-render crm-search-display-editable");
const rowButtons = (page: Page) =>
  page.locator(".afreact-render td.crm-search-ctrl-column .btn-group");

interface Saved {
  job_title: string;
  "gender_id:name": string;
}

const contacts: number[] = [];

test.afterAll(async ({ browser }) => {
  if (!contacts.length) return;
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  await page.goto("/civicrm/afreact/compare");
  await api(page, "Contact", "delete", { where: [["id", "IN", contacts]], useTrash: false });
  await context.close();
});

/** A contact of this run, shown alone in the display. */
async function open(page: Page, renderer: Renderer): Promise<number> {
  const lastName = `Row${RUN}${renderer}`;
  await page.goto("/civicrm/afreact/compare");
  const [created] = await api<{ id: number }>(page, "Individual", "create", {
    values: {
      first_name: "Aa",
      last_name: lastName,
      job_title: "Pilot",
      "gender_id:name": "Female",
    },
  });
  if (!created) throw new Error("Individual.create returned no contact");
  contacts.push(created.id);
  await page.goto(render(renderer, lastName));
  await expect.poll(shown(page, "job_title"), LOAD).toBe("Pilot");
  return created.id;
}

async function choose(page: Page, renderer: Renderer, label: string) {
  if (renderer === "react") {
    await cell(page, "gender_id:label").locator("select").selectOption({ label });
    return;
  }
  // Core focuses the clicked cell's editor, which opens the select2 list.
  await page.locator(".select2-drop-active").getByText(label, { exact: true }).click();
}

async function edit(page: Page, renderer: Renderer, id: number): Promise<Saved> {
  await cell(page, "job_title").locator(".crm-editable-enabled").click();
  await expect(editors(page)).toHaveCount(2);
  await expect(rowButtons(page)).toHaveCount(1);
  // The cells carry no buttons of their own in this mode.
  await expect(page.locator(".crm-search-display-editable-buttons")).toHaveCount(0);

  // Escape drops the typed change.
  const text = cell(page, "job_title").locator("input").first();
  await text.fill("Nobody");
  await text.press("Escape");
  await expect(editors(page)).toHaveCount(0);
  await expect.poll(shown(page, "job_title"), LOAD).toBe("Pilot");

  await cell(page, "gender_id:label").locator(".crm-editable-enabled").click();
  await expect(editors(page)).toHaveCount(2);
  // The option first: core's list opens with the focus and closes when it moves on.
  await choose(page, renderer, "Male");
  await cell(page, "job_title").locator("input").first().fill("Captain");
  await rowButtons(page).locator(".btn-success").click();
  await expect.poll(shown(page, "job_title"), LOAD).toBe("Captain");
  await expect.poll(shown(page, "gender_id:label"), LOAD).toBe("Male");
  await expect(editors(page)).toHaveCount(0);

  const [saved] = await api<Saved>(page, "Individual", "get", {
    select: ["job_title", "gender_id:name"],
    where: [["id", "=", id]],
  });
  if (!saved) throw new Error(`Individual ${String(id)} is gone`);
  return { job_title: saved.job_title, "gender_id:name": saved["gender_id:name"] };
}

test("both renderers edit a whole row alike", async ({ page }) => {
  const saved: Partial<Record<Renderer, Saved>> = {};
  for (const renderer of ["react", "angular"] as const)
    saved[renderer] = await edit(page, renderer, await open(page, renderer));
  expect(saved.react).toEqual(saved.angular);
  expect(saved.react).toEqual({ job_title: "Captain", "gender_id:name": "Male" });
});
