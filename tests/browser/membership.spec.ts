/**
 * The large demo form: each renderer signs up a member with an employer, a reduced fee, a
 * note and the newsletter, and the records both leave behind must be alike.
 */
import { expect, type Page } from "@playwright/test";
import { test } from "./coverage";
import { api, API_PAGE, AUTH, driver, type Renderer } from "./harness";

const RUN = Date.now().toString(36);
const LOAD = { timeout: 30_000 };
const lastName = (renderer: Renderer) => `Join${RUN}${renderer}`;
const employer = (renderer: Renderer) => `Employer ${RUN} ${renderer}`;
const FORM = "/civicrm/afreact/render?name=afformAfreactDemoMembership&renderer=";

interface Signup {
  job_title: string;
  emails: string[];
  membership: unknown[];
  relationships: unknown[];
  newsletter: string[];
  notes: string[];
}

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  await page.goto(API_PAGE);
  for (const [field, pattern] of [
    ["last_name", `Join${RUN}%`],
    ["organization_name", `Employer ${RUN}%`],
  ]) {
    await api(page, "Contact", "delete", { where: [[field, "LIKE", pattern]], useTrash: false });
  }
  await context.close();
});

async function signUp(page: Page, renderer: Renderer) {
  await page.goto(FORM + renderer);
  const about = page.getByRole("group", { name: "About you" });
  const membership = page.getByRole("group", { name: "Membership" });
  await expect(about).toBeVisible(LOAD);
  const person = driver(page, renderer, about);
  await person.fill("first_name", "Ada");
  await person.fill("last_name", lastName(renderer));
  await person.fill("email", `join.${RUN}.${renderer}@example.org`);
  await person.select("location_type_id", "Home");
  const address = driver(
    page,
    renderer,
    about.locator("af-field[name=street_address]").locator(".."),
  );
  await address.fill("street_address", "1 Example Road");
  await address.select("location_type_id", "Home");

  // The employer and the position appear once there is a job title.
  await expect(page.getByRole("group", { name: "Employer" })).toBeHidden();
  await person.fill("job_title", "Engineer");
  const position = page.getByRole("group", { name: "Your position there" });
  await expect(position).toBeVisible(LOAD);
  await driver(page, renderer, page.getByRole("group", { name: "Employer" })).fill(
    "organization_name",
    employer(renderer),
  );
  await driver(page, renderer, position).select("relationship_type_id", "Employee of");

  await membership.getByLabel("Reduced member").check();
  await driver(page, renderer, membership).date("start_date", "2026-10-01");
  // The reason appears with a reduced fee and is required then.
  const reason = membership.locator('af-field[name="Afreact_Demo_Fee.Reason"]');
  await expect(reason).toBeHidden();
  await membership.getByLabel("Yes").check();
  await expect(reason.locator("label .crm-marker")).toBeVisible(LOAD);
  await driver(page, renderer, membership).select("Afreact_Demo_Fee.Reason", "Student or trainee");

  await driver(page, renderer, page.getByRole("group", { name: "Anything else" })).fill(
    "note",
    "Glad to join.",
  );
  await page.getByRole("group", { name: "Stay informed" }).getByLabel("Newsletter").check();
  await page.getByRole("button", { name: "Become a member" }).click();
  await expect(page.getByText("Welcome! Your membership has been recorded.")).toBeVisible(LOAD);
}

/** APIv4 returns each row's id beside the selected fields. */
const withoutId = (rows: object[]) =>
  rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "id")));

/** What a renderer's sign-up stored, without ids, its renderer's name in place of "*". */
async function stored(page: Page, renderer: Renderer): Promise<Signup> {
  await page.goto(API_PAGE);
  const [contact] = await api<{ id: number; job_title: string }>(page, "Individual", "get", {
    select: ["id", "job_title"],
    where: [["last_name", "=", lastName(renderer)]],
  });
  if (!contact) throw new Error(`No contact for ${renderer}`);
  const of = [["contact_id", "=", contact.id]];
  const emails = await api<{ email: string }>(page, "Email", "get", {
    select: ["email"],
    where: of,
  });
  return {
    job_title: contact.job_title,
    emails: emails.map(({ email }) => email.replace(renderer, "*")),
    membership: withoutId(
      await api(page, "Membership", "get", {
        select: [
          "membership_type_id:name",
          "start_date",
          "source",
          "Afreact_Demo_Fee.Reduced",
          "Afreact_Demo_Fee.Reason",
        ],
        where: of,
      }),
    ),
    relationships: (
      await api<{ "relationship_type_id:name": string; "contact_id_b.organization_name": string }>(
        page,
        "Relationship",
        "get",
        {
          select: ["relationship_type_id:name", "contact_id_b.organization_name"],
          where: [["contact_id_a", "=", contact.id]],
        },
      )
    ).map((row) => ({
      type: row["relationship_type_id:name"],
      organization: row["contact_id_b.organization_name"].replace(renderer, "*"),
    })),
    newsletter: (
      await api<{ status: string }>(page, "GroupContact", "get", {
        select: ["status"],
        where: [...of, ["group_id:name", "=", "Afreact_Demo_Newsletter"]],
      })
    ).map(({ status }) => status),
    notes: (
      await api<{ note: string }>(page, "Note", "get", {
        select: ["note"],
        where: [
          ["entity_table", "=", "civicrm_contact"],
          ["entity_id", "=", contact.id],
        ],
      })
    ).map(({ note }) => note),
  };
}

test("both renderers sign up the same member", async ({ page }) => {
  const seen: Partial<Record<Renderer, Signup>> = {};
  for (const renderer of ["angular", "react"] as const) {
    await signUp(page, renderer);
    seen[renderer] = await stored(page, renderer);
  }
  expect(seen.react).toEqual(seen.angular);
  expect(seen.react).toEqual({
    job_title: "Engineer",
    emails: [`join.${RUN}.*@example.org`],
    membership: [
      {
        "membership_type_id:name": "Reduced",
        start_date: "2026-10-01",
        source: "Afreact demo membership",
        "Afreact_Demo_Fee.Reduced": true,
        "Afreact_Demo_Fee.Reason": "student",
      },
    ],
    relationships: [{ type: "Employee of", organization: `Employer ${RUN} *` }],
    newsletter: ["Added"],
    notes: ["Glad to join."],
  });
});
