/**
 * Same scenario against both renderers of the same Afform definitions; the
 * assertions are shared, only the way a widget is operated differs (Angular
 * uses select2 and the jQuery datepicker, React native inputs).
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

type Renderer = "react" | "angular";
const PAGES: Record<Renderer, string> = {
  react: "/civicrm/facade/demo",
  angular: "/civicrm/facade/angular",
};
const RUN = Date.now().toString(36);

interface Driver {
  field(name: string): Locator;
  fill(name: string, value: string): Promise<void>;
  select(name: string, label: string): Promise<void>;
  date(name: string, isoDate: string): Promise<void>;
  selected(name: string): Promise<string>;
}

function driver(page: Page, renderer: Renderer): Driver {
  const form = page.locator(".facade-demo section").first();
  const field = (name: string) =>
    renderer === "react"
      ? form.locator(`.af-field-${name}`).first()
      : form.locator(`af-field[name="${name}"]`).first();
  return {
    field,
    fill: (name, value) => field(name).locator("input, textarea").first().fill(value),
    async select(name, label) {
      if (renderer === "react") {
        await field(name).locator("select").selectOption({ label });
        return;
      }
      await field(name).locator(".select2-choice").click();
      await page
        .locator(".select2-drop-active .select2-result-label", { hasText: label })
        .first()
        .click();
    },
    async date(name, isoDate) {
      if (renderer === "react") {
        await field(name).locator("input").fill(isoDate);
        return;
      }
      // The datepicker's visible input takes the site's input format (mm/dd/yy by default).
      const [year, month, day] = isoDate.split("-");
      const input = field(name).locator("input:visible").first();
      await input.fill(`${month}/${day}/${year}`);
      await input.press("Escape");
      await input.blur();
      await expect(
        field(name).locator("input[type=hidden], input:not(:visible)").first(),
      ).toHaveValue(isoDate);
    },
    async selected(name) {
      if (renderer === "react") {
        return field(name)
          .locator("select")
          .evaluate((select: HTMLSelectElement) => select.selectedOptions[0]?.text ?? "");
      }
      return (await field(name).locator(".select2-chosen").innerText()).trim();
    },
  };
}

async function api<T>(page: Page, entity: string, action: string, params: object): Promise<T[]> {
  return page.evaluate(
    ([e, a, p]) =>
      (window as unknown as { CRM: { api4: (...args: unknown[]) => Promise<unknown> } }).CRM.api4(
        e,
        a,
        p,
      ),
    [entity, action, params] as const,
  ) as Promise<T[]>;
}

interface Saved {
  id: number;
  first_name: string;
  last_name: string;
  "gender_id:label": string | null;
  birth_date: string | null;
  source: string | null;
  do_not_email: boolean;
  emails: { id: number; email: string; "location_type_id:label": string; is_primary: boolean }[];
}

async function savedContact(page: Page, lastName: string): Promise<Saved[]> {
  return api<Saved>(page, "Individual", "get", {
    select: [
      "id",
      "first_name",
      "last_name",
      "gender_id:label",
      "birth_date",
      "source",
      "do_not_email",
    ],
    where: [["last_name", "=", lastName]],
    chain: {
      emails: [
        "Email",
        "get",
        {
          select: ["email", "location_type_id:label", "is_primary"],
          where: [["contact_id", "=", "$id"]],
          orderBy: { id: "ASC" },
        },
      ],
    },
  });
}

async function waitReady(page: Page) {
  await expect(page.locator(".facade-demo section").first().locator("input").first()).toBeVisible();
  await expect(page.locator(".facade-demo table tbody tr a[href]").first()).toBeVisible();
}

const created: Partial<Record<Renderer, Saved>> = {};

test.afterAll(async ({ browser }) => {
  const ids = Object.values(created).map((saved) => saved.id);
  if (!ids.length) return;
  const context = await browser.newContext({ storageState: "e2e/.auth/admin.json" });
  const page = await context.newPage();
  await page.goto("/civicrm/facade/compare");
  await api(page, "Contact", "delete", { where: [["id", "IN", ids]], useTrash: false });
  await context.close();
});

for (const renderer of ["react", "angular"] as const) {
  test.describe(renderer, () => {
    test("rejects an empty submission without calling Afform.submit", async ({ page }) => {
      const submits: string[] = [];
      page.on(
        "request",
        (request) => request.url().includes("/Afform/submit") && submits.push(request.url()),
      );
      await page.goto(PAGES[renderer]);
      await waitReady(page);
      await page.getByRole("button", { name: "Save" }).click();
      await expect(
        page.locator(".facade-demo section").first().locator(":invalid").first(),
      ).toBeAttached();
      expect(submits).toEqual([]);
    });

    test("creates a contact with a joined email", async ({ page }) => {
      const form = driver(page, renderer);
      const lastName = `Parity${RUN}${renderer}`;
      await page.goto(PAGES[renderer]);
      await waitReady(page);
      await form.fill("first_name", "Paula");
      await form.fill("last_name", lastName);
      await form.select("gender_id", "Female");
      await form.date("birth_date", "1980-05-17");
      await form.fill("email", `paula.${lastName.toLowerCase()}@example.org`);
      await form.select("location_type_id", "Work");
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText("Contact saved.")).toBeVisible();

      const [saved, ...more] = await savedContact(page, lastName);
      expect(more).toEqual([]);
      expect(saved).toMatchObject({
        first_name: "Paula",
        "gender_id:label": "Female",
        birth_date: "1980-05-17",
        source: "Facade demo",
        do_not_email: false,
        emails: [
          {
            email: `paula.${lastName.toLowerCase()}@example.org`,
            "location_type_id:label": "Work",
            is_primary: true,
          },
        ],
      });
      created[renderer] = saved;
    });

    test("prefills and updates the contact from the URL", async ({ page }) => {
      const contact = created[renderer];
      test.skip(!contact, "depends on the create scenario");
      const form = driver(page, renderer);
      // Angular-style hash arguments; the React renderer reads them too.
      await page.goto(`${PAGES[renderer]}#?Individual1=${contact!.id}`);
      await waitReady(page);
      await expect(form.field("first_name").locator("input")).toHaveValue("Paula");
      await expect(form.field("last_name").locator("input")).toHaveValue(contact!.last_name);
      await expect(form.field("email").locator("input")).toHaveValue(contact!.emails[0]!.email);
      expect(await form.selected("gender_id")).toBe("Female");
      expect(await form.selected("location_type_id")).toBe("Work");

      await form.fill("first_name", "Paulina");
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText("Contact saved.")).toBeVisible();
      const [updated, ...more] = await savedContact(page, contact!.last_name);
      expect(more).toEqual([]);
      expect(updated).toMatchObject({
        id: contact!.id,
        first_name: "Paulina",
        emails: [{ email: contact!.emails[0]!.email, is_primary: true }],
      });
    });
  });
}

test("both renderers saved the same record", () => {
  test.skip(!created.react || !created.angular, "depends on both create scenarios");
  const normalise = (saved: Saved) => ({
    ...saved,
    id: 0,
    last_name: "",
    emails: saved.emails.map((email) => ({
      ...email,
      id: 0,
      email: email.email.replace(/parity\w+@/, "@"),
    })),
  });
  expect(normalise(created.react!)).toEqual(normalise(created.angular!));
});

test("both renderers show the same table pages and sort order", async ({ page }) => {
  const search = page.locator(".facade-demo section").nth(1);
  // Angular swaps in placeholder rows while a page loads; wait for the answer and real rows.
  const reload = async (action: () => Promise<void>) => {
    const answered = page.waitForResponse((response) => response.url().includes("/ajax/api4"));
    await action();
    await answered;
    await expect(search.locator("tbody tr").first().locator("a[href]")).toBeVisible();
  };
  const nextPage: Record<Renderer, () => Locator> = {
    react: () => search.getByRole("button", { name: "Next" }),
    angular: () => search.locator(".pagination-next a"),
  };
  const rows = async (renderer: Renderer, ...clicks: string[]) => {
    await page.goto(PAGES[renderer]);
    await waitReady(page);
    for (const click of clicks) {
      await reload(() =>
        click === "Next"
          ? nextPage[renderer]().click()
          : search.locator("th", { hasText: click }).click(),
      );
    }
    return search
      .locator("tbody tr")
      .evaluateAll((trs) =>
        trs.map((tr) => (tr as HTMLElement).innerText.replace(/\s+/g, " ").trim()),
      );
  };

  const first = await rows("react");
  const sorted = await rows("react", "Email", "Email");
  const next = await rows("react", "Next");
  // Guard against both renderers ignoring a click: each step must change the rows.
  expect(first).toHaveLength(10);
  expect(sorted).not.toEqual(first);
  expect(next).not.toEqual(first);
  expect(await rows("angular")).toEqual(first);
  expect(await rows("angular", "Email", "Email")).toEqual(sorted);
  expect(await rows("angular", "Next")).toEqual(next);
});
