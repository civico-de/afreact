/**
 * The field types of afformAfreactDemoFields and the search ranges of afsearchAfreactDemoRanges
 * on both renderers: each saves the same record, or sends SearchDisplay.run the same filters.
 * Location stays out: the proximity filter needs a geocoding provider.
 */
import { expect, test, type Page, type Request } from "@playwright/test";
import { api, AUTH, type Renderer } from "./harness";

const RUN = Date.now().toString(36);
const render = (form: string, renderer: Renderer) =>
  `/civicrm/afreact/render?name=${form}&renderer=${renderer}`;
const field = (page: Page, name: string) =>
  page.locator(`.afreact-render af-field[name="${name}"]`).first();

// A 1×1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

interface Saved {
  id: number;
  employer_id: number | null;
  gender_id: number | null;
  nick_name: string | null;
  image_URL: string | null;
  "employer_id.organization_name": string | null;
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

/** The saved contact; it and its employer are deleted after the run. */
async function saved(page: Page, lastName: string): Promise<Saved> {
  const [record] = await api<Saved>(page, "Individual", "get", {
    select: [
      "id",
      "employer_id",
      "employer_id.organization_name",
      "gender_id",
      "nick_name",
      "image_URL",
    ],
    where: [["last_name", "=", lastName]],
  });
  if (!record) throw new Error(`No contact ${lastName} saved`);
  contacts.push(record.id, ...(record.employer_id ? [record.employer_id] : []));
  return record;
}

for (const renderer of ["react", "angular"] as const) {
  test.describe(renderer, () => {
    test("saves a slider, rich text, an uploaded photo and a quick-added employer", async ({
      page,
    }) => {
      const lastName = `Fields${RUN}${renderer}`;
      const organization = `FieldsOrg${RUN}${renderer}`;
      await page.goto(render("afformAfreactDemoFields", renderer));
      await field(page, "last_name").locator("input").fill(lastName);

      // Options 1–3: the slider starts at 2, one step right is 3.
      const slider = field(page, "gender_id").locator("input[type=range]");
      await slider.focus();
      await slider.press("ArrowRight");

      const editor = field(page, "nick_name").frameLocator("iframe").locator("body");
      await editor.click();
      await editor.pressSequentially("Nick");

      await field(page, "image_URL")
        .locator("input[type=file]")
        .setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: PNG });

      // Core offers the link in the select2 list, React beside the field (comparison.md).
      if (renderer === "angular")
        await field(page, "employer_id").locator(".select2-choice").click();
      const links =
        renderer === "angular" ? page.locator(".select2-drop-active") : field(page, "employer_id");
      await links.getByRole("link", { name: "New Organization" }).click();
      const dialog = page.locator(".ui-dialog");
      await dialog.locator('af-field[name="organization_name"] input').fill(organization);
      await dialog.getByRole("button", { name: /Save|Submit/ }).click();
      await expect(dialog).toBeHidden();
      if (renderer === "angular")
        await expect(field(page, "employer_id").locator(".select2-chosen")).toHaveText(
          organization,
        );
      else await expect(field(page, "employer_id").getByRole("combobox")).toHaveValue(organization);

      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText("Contact saved.")).toBeVisible();
      const record = await saved(page, lastName);
      expect(record).toMatchObject({
        gender_id: 3,
        nick_name: "<p>Nick</p>",
        "employer_id.organization_name": organization,
      });
      expect(record.image_URL).toMatch(/\.png/);
    });

    test("saves the middle option of a slider nobody moved", async ({ page }) => {
      const lastName = `FieldsUntouched${RUN}${renderer}`;
      await page.goto(render("afformAfreactDemoFields", renderer));
      await field(page, "last_name").locator("input").fill(lastName);
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText("Contact saved.")).toBeVisible();
      expect(await saved(page, lastName)).toMatchObject({ gender_id: 2 });
    });
  });
}

/** The `filters` of SearchDisplay.run, sent alone (CRM.api4) or in a batch (crmApi4). */
function runFilters(request: Request): unknown[] {
  if (!request.url().includes("/ajax/api4")) return [];
  const body = new URLSearchParams(request.postData() ?? "");
  const single = body.get("params");
  if (single && request.url().includes("/SearchDisplay/run")) {
    const params = JSON.parse(single) as { filters?: unknown };
    return [params.filters];
  }
  const batch = body.get("calls");
  if (!batch) return [];
  return Object.values(JSON.parse(batch) as Record<string, unknown[]>)
    .filter((call) => call[0] === "SearchDisplay" && call[1] === "run")
    .map((call) => (call[2] as { filters?: unknown }).filters);
}

async function date(page: Page, renderer: Renderer, index: number, isoDate: string) {
  const inputs = field(page, "birth_date");
  if (renderer === "react") {
    await inputs.locator("input[type=date]").nth(index).fill(isoDate);
    return;
  }
  // The datepicker's visible input takes the site's input format (mm/dd/yy by default).
  const [year, month, day] = isoDate.split("-");
  const input = inputs.locator("input.crm-form-date").nth(index);
  await input.fill(`${month}/${day}/${year}`);
  await input.press("Escape");
  await input.blur();
}

const wanted = {
  id: { ">=": 1, "<=": 5 },
  birth_date: { ">=": "2000-01-01", "<=": "2000-12-31" },
};

for (const renderer of ["react", "angular"] as const) {
  test(`${renderer}: filters by a number range and a date range`, async ({ page }) => {
    const sent: unknown[] = [];
    page.on("request", (request) => {
      sent.push(...runFilters(request));
    });
    await page.goto(render("afsearchAfreactDemoRanges", renderer));
    const ids = field(page, "id").locator("input[type=number]");
    await ids.nth(0).fill("1");
    await ids.nth(1).fill("5");
    await date(page, renderer, 0, "2000-01-01");
    await date(page, renderer, 1, "2000-12-31");
    await expect.poll(() => sent.at(-1), { timeout: 10_000 }).toEqual(wanted);
  });
}
