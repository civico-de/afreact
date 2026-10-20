/**
 * In-place editing and the column picker on both renderers: a text cell saved with Enter, an
 * option list saved with the Save button and a contact reference picked from the autocomplete
 * must store the same values, and the picker must hide and show the same columns. Each renderer
 * edits its own contact, found by last name.
 */
import { expect, type Page } from "@playwright/test";
import { test } from "./coverage";
import { api, API_PAGE, AUTH, type Renderer } from "./harness";

const RUN = Date.now().toString(36);
const LOAD = { timeout: 30_000 };
const render = (renderer: Renderer, lastName: string) =>
  `/civicrm/afreact/render?name=afsearchAfreactDemoEditable&renderer=${renderer}#?last_name=${lastName}`;
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
const editor = (page: Page) => page.locator(".afreact-render crm-search-display-editable");

interface Saved {
  job_title: string;
  "gender_id:name": string;
  employer_id: number | null;
}

const contacts: number[] = [];
let employer = 0;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  await page.goto(API_PAGE);
  const [created] = await api<{ id: number }>(page, "Organization", "create", {
    values: { organization_name: `Employer ${RUN}` },
  });
  if (!created) throw new Error("Organization.create returned no contact");
  employer = created.id;
  contacts.push(employer);
  await context.close();
});

test.afterAll(async ({ browser }) => {
  if (!contacts.length) return;
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  await page.goto(API_PAGE);
  await api(page, "Contact", "delete", { where: [["id", "IN", contacts]], useTrash: false });
  await context.close();
});

/** A contact of this run, shown alone in the display. */
async function open(page: Page, renderer: Renderer): Promise<number> {
  const lastName = `Edit${RUN}${renderer}${String(contacts.length)}`;
  await page.goto(API_PAGE);
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

/** Picks an option in core's select2 or React's native select. */
async function choose(page: Page, renderer: Renderer, label: string) {
  if (renderer === "react") {
    await editor(page).locator("select").selectOption({ label });
    return;
  }
  // Core focuses the editor's input, which opens the select2 list.
  await page.locator(".select2-drop-active").getByText(label, { exact: true }).click();
}

async function edit(page: Page, renderer: Renderer, id: number): Promise<Saved> {
  await cell(page, "job_title").locator(".crm-editable-enabled").click();
  const text = editor(page).locator("input").first();
  await text.fill("Captain");
  await text.press("Enter");
  await expect.poll(shown(page, "job_title"), LOAD).toBe("Captain");
  await expect(editor(page)).toHaveCount(0);

  await cell(page, "gender_id:label").locator(".crm-editable-enabled").click();
  await choose(page, renderer, "Male");
  await editor(page).locator(".crm-search-display-editable-buttons .btn-success").click();
  await expect.poll(shown(page, "gender_id:label"), LOAD).toBe("Male");

  await cell(page, "employer_id.display_name").locator(".crm-editable-enabled").click();
  // Core's select2 types into the dropdown's own input; React's combobox into the cell's.
  const search =
    renderer === "react"
      ? editor(page).getByRole("combobox")
      : page.locator("#select2-drop .select2-input");
  await search.fill(`Employer ${RUN}`);
  const option =
    renderer === "react"
      ? editor(page).getByRole("option", { name: `Employer ${RUN}` })
      : page.locator("#select2-drop .select2-result", { hasText: `Employer ${RUN}` });
  await option.click();
  await editor(page).locator(".crm-search-display-editable-buttons .btn-success").click();
  await expect.poll(shown(page, "employer_id.display_name"), LOAD).toBe(`Employer ${RUN}`);

  const [saved] = await api<Saved>(page, "Individual", "get", {
    select: ["job_title", "gender_id:name", "employer_id"],
    where: [["id", "=", id]],
  });
  if (!saved) throw new Error(`Individual ${String(id)} is gone`);
  return {
    job_title: saved.job_title,
    "gender_id:name": saved["gender_id:name"],
    employer_id: saved.employer_id,
  };
}

const headers = (page: Page) =>
  page
    .locator(".afreact-render thead th")
    .evaluateAll((all) => all.map((th) => (th.textContent ?? "").trim()));

async function pick(page: Page): Promise<string[][]> {
  const picker = page.locator(".afreact-render details", { hasText: "Pick Columns" });
  await picker.locator("summary").click();
  const seen = [await headers(page)];
  await picker.getByRole("checkbox", { name: "Job title" }).uncheck();
  seen.push(await headers(page));
  await picker.getByRole("button", { name: "None" }).click();
  seen.push(await headers(page));
  await picker.getByRole("button", { name: "All" }).click();
  await expect(cell(page, "job_title")).toBeVisible(LOAD);
  seen.push(await headers(page));
  return seen;
}

test("both renderers save an in-place edit alike", async ({ page }) => {
  const saved: Partial<Record<Renderer, Saved>> = {};
  for (const renderer of ["react", "angular"] as const)
    saved[renderer] = await edit(page, renderer, await open(page, renderer));
  expect(saved.react).toEqual(saved.angular);
  expect(saved.react).toEqual({
    job_title: "Captain",
    "gender_id:name": "Male",
    employer_id: employer,
  });
});

test("both renderers pick columns alike", async ({ page }) => {
  const seen: Partial<Record<Renderer, string[][]>> = {};
  for (const renderer of ["react", "angular"] as const) {
    await open(page, renderer);
    seen[renderer] = await pick(page);
  }
  expect(seen.react).toEqual(seen.angular);
  expect(seen.react).toEqual([
    ["Name", "Job title", "Gender", "Employer"],
    ["Name", "Gender", "Employer"],
    [],
    ["Name", "Job title", "Gender", "Employer"],
  ]);
});

// Core opens an editor only by mouse and keeps a failed one as a placeholder (upstream-bugs.md).
test("React edits by keyboard and keeps a failed editor open", async ({ page }) => {
  await open(page, "react");
  const value = cell(page, "job_title").getByRole("button", { name: /^Edit Job title/ });
  await value.focus();
  await page.keyboard.press("F2");
  const text = editor(page).getByRole("textbox", { name: /^Job title, / });
  await expect(text).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(value).toBeFocused();

  // The server's answer when the edit finds nothing to save (InlineEdit::updateExistingRow).
  await page.route(
    (url) => url.href.includes("ajax/api4/SearchDisplay/inlineEdit"),
    (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error_code: 0, error_message: "Inline edit failed." }),
      }),
  );
  await page.keyboard.press("Enter");
  await text.fill("Captain");
  await text.press("Enter");
  await expect(editor(page).locator(".alert-danger")).toHaveText("Inline edit failed.", LOAD);
  await expect(text).toHaveValue("Captain");
  await expect(text).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator(".afreact-render [role=status]", { hasText: "Not saved" })).toHaveText(
    "Not saved: Inline edit failed.",
  );
});
