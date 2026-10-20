/**
 * Same scenario against both renderers of the same Afform definitions; the
 * assertions are shared, only the way a widget is operated differs (Angular
 * uses select2 and the jQuery datepicker, React native inputs).
 */
import { expect, type Page, type Request } from "@playwright/test";
import { test } from "./coverage";
import { api, API_PAGE, AUTH, driver, PAGES, type Renderer } from "./harness";

const RUN = Date.now().toString(36);

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
  await expect(
    page.locator(".afreact-demo section").first().locator("input").first(),
  ).toBeVisible();
  await expect(page.locator(".afreact-demo table tbody tr a[href]").first()).toBeVisible();
  // Until the prefill lands, Angular blocks the form and React disables its submit button,
  // which the browser then skips on Enter.
  await expect(page.locator(".blockOverlay")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save" })).toBeEnabled();
}

const created: Partial<Record<Renderer, Saved>> = {};

test.afterAll(async ({ browser }) => {
  const ids = Object.values(created).map((saved) => saved.id);
  if (!ids.length) return;
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  await page.goto(API_PAGE);
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
        page.locator(".afreact-demo section").first().locator(":invalid").first(),
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
      // Enter in a text field submits, as the form element on core's Afform page makes it.
      await form.field("last_name").locator("input").press("Enter");
      await expect(page.getByText("Contact saved.")).toBeVisible();

      const [saved, ...more] = await savedContact(page, lastName);
      expect(more).toEqual([]);
      expect(saved).toMatchObject({
        first_name: "Paula",
        "gender_id:label": "Female",
        birth_date: "1980-05-17",
        source: "Afreact demo",
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
  const search = page.locator(".afreact-demo section").nth(1);
  // Only a page request answers a click: SearchKit's row_count call may still be in flight.
  const isPageRun = (request: Request) =>
    request.url().includes("/ajax/api4") &&
    decodeURIComponent(request.postData() ?? "").includes('"return":"page:');
  // SearchKit's getResultsPronto drops a search started within 300 ms of the previous one, or
  // before its debounce timer has fired; the margin covers a late timer.
  const debounceMs = 300 + 200;
  let lastRun = 0;
  page.on("request", (request) => {
    if (isPageRun(request)) lastRun = Date.now();
  });
  // Angular swaps in placeholder rows while a page loads; wait for the answer and real rows.
  const reload = async (step: string, action: () => Promise<void>) => {
    await new Promise((resolve) => {
      setTimeout(resolve, Math.max(0, lastRun + debounceMs - Date.now()));
    });
    // A dropped click fails here at once instead of at the test timeout.
    const launched = page.waitForRequest(isPageRun, { timeout: 5_000 }).catch(() => {
      throw new Error(
        `${step} started no search within 5 s (${Date.now() - lastRun} ms after the last)`,
      );
    });
    const answered = page.waitForResponse((response) => isPageRun(response.request()));
    // Together, so a failing click or wait leaves no promise without a handler.
    await Promise.all([launched, answered, action()]);
    await expect(search.locator("tbody tr").first().locator("a[href]")).toBeVisible();
  };
  const rows = async (renderer: Renderer, ...clicks: string[]) => {
    await page.goto(PAGES[renderer]);
    await waitReady(page);
    for (const click of clicks) {
      await reload(`${renderer}: ${click}`, () =>
        click === "Next"
          ? search.locator(".pagination-next a").click()
          : search.locator("th", { hasText: click }).click(),
      );
    }
    return search
      .locator("tbody tr")
      .evaluateAll((trs: HTMLElement[]) =>
        trs.map((tr) => tr.innerText.replace(/\s+/g, " ").trim()),
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
