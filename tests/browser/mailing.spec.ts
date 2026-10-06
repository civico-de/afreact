/**
 * The mailing task on the contacts demo: each renderer makes a mailing for its own pair of
 * contacts, and the mailing, its hidden group and the group's members must come out alike.
 */
import { expect, test, type Page } from "@playwright/test";
import { api, AUTH, type Renderer } from "./harness";

const RUN = Date.now().toString(36);
const LOAD = { timeout: 30_000 };
const lastName = (renderer: Renderer) => `Mail${RUN}${renderer}`;
const render = (renderer: Renderer) =>
  `/civicrm/afreact/render?name=afsearchAfreactDemoContacts&renderer=${renderer}` +
  `#?last_name=${lastName(renderer)}`;

interface Made {
  name: string;
  template_type: string | null;
  group: { is_hidden: boolean; "group_type:name": string[] };
  members: number[];
}

const contacts: Partial<Record<Renderer, number[]>> = {};
const mailings: number[] = [];
const groups: number[] = [];

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  await page.goto("/civicrm/afreact/compare");
  for (const renderer of ["react", "angular"] as const) {
    const created = await api<{ id: number }>(page, "Individual", "save", {
      records: ["aa", "bb"].map((first) => ({
        first_name: first,
        last_name: lastName(renderer),
        "email_primary.email": `${first}.${lastName(renderer)}@example.org`,
      })),
    });
    contacts[renderer] = created.map((contact) => contact.id);
  }
  await context.close();
});

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  await page.goto("/civicrm/afreact/compare");
  if (mailings.length) await api(page, "Mailing", "delete", { where: [["id", "IN", mailings]] });
  if (groups.length) await api(page, "Group", "delete", { where: [["id", "IN", groups]] });
  const ids = Object.values(contacts).flat();
  if (ids.length)
    await api(page, "Contact", "delete", { where: [["id", "IN", ids]], useTrash: false });
  await context.close();
});

/** The mailing the browser landed on, its include group and the group's members by position. */
async function made(page: Page, renderer: Renderer, mailingId: number): Promise<Made> {
  const ids = contacts[renderer] ?? [];
  const [mailing] = await api<Pick<Made, "name" | "template_type">>(page, "Mailing", "get", {
    select: ["name", "template_type"],
    where: [["id", "=", mailingId]],
  });
  const [include] = await api<{ entity_id: number }>(page, "MailingGroup", "get", {
    select: ["entity_id"],
    where: [
      ["mailing_id", "=", mailingId],
      ["group_type", "=", "Include"],
    ],
  });
  if (!mailing || !include) throw new Error(`Mailing ${String(mailingId)} has no include group`);
  groups.push(include.entity_id);
  const [group] = await api<Made["group"]>(page, "Group", "get", {
    select: ["is_hidden", "group_type:name"],
    where: [["id", "=", include.entity_id]],
  });
  if (!group) throw new Error(`Group ${String(include.entity_id)} is gone`);
  const members = await api<{ contact_id: number }>(page, "GroupContact", "get", {
    select: ["contact_id"],
    where: [
      ["group_id", "=", include.entity_id],
      ["status", "=", "Added"],
    ],
  });
  return {
    name: mailing.name,
    template_type: mailing.template_type,
    group: { is_hidden: group.is_hidden, "group_type:name": group["group_type:name"] },
    members: members.map((row) => ids.indexOf(row.contact_id)).sort(),
  };
}

async function compose(page: Page, renderer: Renderer): Promise<number> {
  await page.goto(render(renderer));
  const rows = page.locator(".afreact-render tbody tr");
  await expect(rows).toHaveCount(2, LOAD);
  for (const row of await rows.all()) await row.locator(".crm-search-ctrl-select-row").check();
  await page.locator(".afreact-render .crm-search-task-menu").click();
  await page.locator(".afreact-render .dropdown-menu a", { hasText: "CiviMail" }).click();
  const dialog =
    renderer === "react"
      ? page.getByRole("dialog", { name: /CiviMail/ })
      : page.locator(".ui-dialog", { hasText: "CiviMail" });
  await expect(
    dialog.getByText("All of the selected contacts have active email addresses."),
  ).toBeVisible(LOAD);
  await dialog.getByRole("textbox", { name: /Mailing Name/ }).fill(`Afreact ${RUN} ${renderer}`);
  await dialog.getByRole("button", { name: "Create Mailing" }).click();
  await page.waitForURL(/civicrm\/a\/?#\/mailing\/\d+/, LOAD);
  const id = Number(/mailing\/(\d+)/.exec(page.url())?.[1]);
  mailings.push(id);
  return id;
}

test("both renderers make the same mailing for the selected contacts", async ({ page }) => {
  const seen: Partial<Record<Renderer, Made>> = {};
  for (const renderer of ["react", "angular"] as const)
    seen[renderer] = await made(page, renderer, await compose(page, renderer));
  expect({ ...seen.react, name: "" }).toEqual({ ...seen.angular, name: "" });
  expect(seen.react).toEqual({
    name: `Afreact ${RUN} react`,
    template_type: seen.react?.template_type ?? null,
    group: { is_hidden: true, "group_type:name": ["Mailing List"] },
    members: [0, 1],
  });
});
