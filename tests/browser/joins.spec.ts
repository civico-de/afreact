/**
 * Two Email blocks of one contact. The server pairs record n with the contact's block n in the
 * layout (its location type, its prefilled record). Angular numbers blocks in the order they link
 * and per fieldset, React by layout position over the contact's fieldsets (upstream-bugs.md,
 * "Join blocks are numbered in link order").
 */
import { expect, type Page } from "@playwright/test";
import { test } from "./coverage";
import { api, API_PAGE, AUTH, quietApi, type Renderer } from "./harness";

const RUN = Date.now().toString(36);
const DEMO = "afformAfreactDemoJoins";
const SPLIT = "afformAfreactJoinFieldsets";
const render = (form: string, renderer: Renderer, hash = "") =>
  `/civicrm/afreact/render?name=${form}&renderer=${renderer}${hash}`;
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
  await page.goto(API_PAGE);
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
      await page.goto(render(DEMO, renderer));
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
      await page.goto(API_PAGE);
      const address = (kind: string) => `${kind}.${RUN}${renderer}@example.org`;
      const [contact] = await api<{ id: number }>(page, "Individual", "create", {
        values: { first_name: "Jo", last_name: `JoinsUpdate${RUN}${renderer}` },
        chain: {
          home: ["Email", "create", { values: emailValues(address("home"), 1) }],
          work: ["Email", "create", { values: emailValues(address("work"), 2) }],
        },
      });
      contacts.push(contact!.id);
      await page.goto(render(DEMO, renderer, `#?Individual1=${contact!.id}`));
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

const emailBlock = (location: number, label: string) =>
  `<div af-join="Email" actions="{update: true, delete: true}" data="{location_type_id: ${location}}">` +
  `<af-field name="email" defn="{label: '${label}'}" /></div>`;

/** The Home block in the contact's first fieldset, the Work block in a second one. */
test.describe("two fieldsets of one contact", () => {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: AUTH });
    const page = await context.newPage();
    await quietApi(page, "Afform", "create", {
      values: {
        name: SPLIT,
        title: SPLIT,
        type: "form",
        permission: ["access CiviCRM"],
        confirmation_type: "show_confirmation_message",
        confirmation_message: "Contact saved.",
        layout:
          '<af-form ctrl="afform">' +
          '<af-entity data="{contact_type: \'Individual\'}" type="Contact" name="Individual1" ' +
          'label="Individual 1" actions="{create: true, update: true}" security="RBAC" url-autofill="1" />' +
          '<fieldset af-fieldset="Individual1" class="af-container" af-title="Name">' +
          '<af-field name="first_name" /><af-field name="last_name" />' +
          emailBlock(1, "Home email") +
          '</fieldset><fieldset af-fieldset="Individual1" class="af-container" af-title="Work">' +
          emailBlock(2, "Work email") +
          "</fieldset>" +
          '<button class="af-button btn btn-primary" ng-click="afform.submit()">' +
          "{{:: ts('Save') }}</button></af-form>",
      },
    });
    // The Angular module list is cached, so the page would not know the new form.
    await quietApi(page, "System", "flush", {});
    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: AUTH });
    const page = await context.newPage();
    await quietApi(page, "Afform", "revert", { where: [["name", "=", SPLIT]] });
    await quietApi(page, "System", "flush", {});
    await context.close();
  });

  /** Angular's per-fieldset numbering is core's bug: both blocks share the contact's record 0. */
  const split: Record<
    Renderer,
    { created: [string, string][]; shown: [string, string]; updated: [string, string] }
  > = {
    react: {
      created: [
        ["home", "Home"],
        ["work", "Work"],
      ],
      shown: ["home", "work"],
      updated: ["home", "new"],
    },
    angular: { created: [["work", "Home"]], shown: ["home", "home"], updated: ["new", "work"] },
  };

  for (const renderer of ["react", "angular"] as const) {
    test.describe(renderer, () => {
      const address = (kind: string) => `${kind}.split${RUN}${renderer}@example.org`;

      test("saves each block to its own location type", async ({ page }) => {
        const lastName = `JoinsSplit${RUN}${renderer}`;
        await page.goto(render(SPLIT, renderer));
        await expect(input(page, "email")).toHaveCount(2);
        await input(page, "last_name").fill(lastName);
        await input(page, "email").nth(0).fill(address("home"));
        await input(page, "email").nth(1).fill(address("work"));
        await page.getByRole("button", { name: "Save" }).click();
        await expect(page.getByText("Contact saved.")).toBeVisible();
        const [saved] = await api<{ id: number }>(page, "Individual", "get", {
          select: ["id"],
          where: [["last_name", "=", lastName]],
        });
        contacts.push(saved!.id);
        expect(await emails(page, saved!.id)).toEqual(
          split[renderer].created.map(([kind, location]) => ({
            email: address(kind),
            "location_type_id:name": location,
          })),
        );
      });

      test("prefills and updates each block's own record", async ({ page }) => {
        await page.goto(API_PAGE);
        const [contact] = await api<{ id: number }>(page, "Individual", "create", {
          values: { first_name: "Jo", last_name: `JoinsSplitUpdate${RUN}${renderer}` },
          chain: {
            home: ["Email", "create", { values: emailValues(address("home"), 1) }],
            work: ["Email", "create", { values: emailValues(address("work"), 2) }],
          },
        });
        contacts.push(contact!.id);
        await page.goto(render(SPLIT, renderer, `#?Individual1=${contact!.id}`));
        await expect(input(page, "first_name")).toHaveValue("Jo");
        const [home, work] = split[renderer].shown;
        await expect(input(page, "email").nth(0)).toHaveValue(address(home));
        await expect(input(page, "email").nth(1)).toHaveValue(address(work));
        await input(page, "email").nth(1).fill(address("new"));
        await page.getByRole("button", { name: "Save" }).click();
        await expect(page.getByText("Contact saved.")).toBeVisible();
        const [homeAfter, workAfter] = split[renderer].updated;
        expect(await emails(page, contact!.id)).toEqual([
          { email: address(homeAfter), "location_type_id:name": "Home" },
          { email: address(workAfter), "location_type_id:name": "Work" },
        ]);
      });
    });
  }
});
