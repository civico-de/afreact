/**
 * Two Email blocks of one contact, Home behind an af-if and Work always shown. The server pairs
 * record n with block n of the layout (its location type, its prefilled record). Angular numbers
 * blocks in the order they link, so with Home hidden the Work block takes Home's record; React
 * keeps the layout position (comparison.md, "Join blocks are numbered in link order").
 */
import { expect, test, type Page } from "@playwright/test";
import { api, AUTH, type Renderer } from "./harness";

const RUN = Date.now().toString(36);
const render = (renderer: Renderer, hash = "") =>
  `/civicrm/afreact/render?name=afformAfreactDemoJoins&renderer=${renderer}${hash}`;
const input = (page: Page, name: string) =>
  page.locator(`.afreact-render af-field[name="${name}"] input`);

interface Email {
  id: number;
  email: string;
  "location_type_id:name": string;
}

async function emails(page: Page, contactId: number): Promise<Omit<Email, "id">[]> {
  const rows = await api<Email>(page, "Email", "get", {
    select: ["email", "location_type_id:name"],
    where: [["contact_id", "=", contactId]],
    orderBy: { "location_type_id:name": "ASC" },
  });
  return rows.map(({ email, "location_type_id:name": location }) => ({
    email,
    "location_type_id:name": location,
  }));
}

const emailValues = (email: string, location: number) => ({
  contact_id: "$id",
  email,
  location_type_id: location,
});

const contacts: number[] = [];

test.afterAll(async ({ browser }) => {
  if (!contacts.length) return;
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  await page.goto("/civicrm/afreact/compare");
  await api(page, "Contact", "delete", { where: [["id", "IN", contacts]], useTrash: false });
  await context.close();
});

/** What each renderer saves; Angular's numbering is core's bug, React's the layout's. */
const expected: Record<Renderer, { created: string; updated: [string, string] }> = {
  react: { created: "Work", updated: ["home", "new"] },
  angular: { created: "Home", updated: ["new", "work"] },
};

for (const renderer of ["react", "angular"] as const) {
  test.describe(renderer, () => {
    test("saves the Work block with the Home block hidden", async ({ page }) => {
      const lastName = `Joins${RUN}${renderer}`;
      await page.goto(render(renderer));
      await input(page, "last_name").fill(lastName);
      await expect(input(page, "email")).toHaveCount(1);
      await input(page, "email").fill(`work.${lastName.toLowerCase()}@example.org`);
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText("Contact saved.")).toBeVisible();
      const [saved] = await api<{ id: number }>(page, "Individual", "get", {
        select: ["id"],
        where: [["last_name", "=", lastName]],
      });
      contacts.push(saved!.id);
      expect(await emails(page, saved!.id)).toEqual([
        {
          email: `work.${lastName.toLowerCase()}@example.org`,
          "location_type_id:name": expected[renderer].created,
        },
      ]);
    });

    test("prefills and updates the Work record with the Home block hidden", async ({ page }) => {
      await page.goto("/civicrm/afreact/compare");
      const address = (kind: string) => `${kind}.${RUN}${renderer}@example.org`;
      const [contact] = await api<{ id: number }>(page, "Individual", "create", {
        values: { first_name: "Jo", last_name: `JoinsUpdate${RUN}${renderer}` },
        chain: {
          home: ["Email", "create", { values: emailValues(address("home"), 1) }],
          work: ["Email", "create", { values: emailValues(address("work"), 2) }],
        },
      });
      contacts.push(contact!.id);
      await page.goto(render(renderer, `#?Individual1=${contact!.id}`));
      await expect(input(page, "first_name")).toHaveValue("Jo");
      await expect(input(page, "email")).toHaveCount(1);
      // Angular's Work block shows the Home record.
      await expect(input(page, "email")).toHaveValue(
        address(renderer === "react" ? "work" : "home"),
      );
      await input(page, "email").fill(address("new"));
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText("Contact saved.")).toBeVisible();
      const [home, work] = expected[renderer].updated;
      expect(await emails(page, contact!.id)).toEqual([
        { email: address(home), "location_type_id:name": "Home" },
        { email: address(work), "location_type_id:name": "Work" },
      ]);
    });
  });
}
