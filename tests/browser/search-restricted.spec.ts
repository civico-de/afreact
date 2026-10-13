/**
 * The SearchKit builder and display page for users without admin rights: one who may manage
 * only their own searches, and one who may only view. React offers and refuses what core does.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import { api, coreBuilders } from "./harness";

coreBuilders();

const LABEL = "Afreact restricted probe";
const NAME = "afreact_restricted_probe";
const PASSWORD = "afreact-restricted-probe";
const USERS = {
  owner: { role: "afreact_probe_owner", permissions: ["access CiviCRM", "manage own search_kit"] },
  viewer: { role: "afreact_probe_viewer", permissions: ["access CiviCRM"] },
} as const;
type Who = keyof typeof USERS;
const username = (who: Who) => `afreact-probe-${who}`;
const pages = {
  angular: { admin: "/civicrm/admin/search", display: "/civicrm/search" },
  react: { admin: "/civicrm/admin/afreact/search", display: "/civicrm/afreact/search" },
};
const params = {
  version: 4,
  select: ["id", "label"],
  where: [["label", "LIKE", `${LABEL}%`]],
};

async function cleanUp(page: Page) {
  await page.goto("/civicrm/admin/afreact/search#/list");
  await api(page, "SavedSearch", "delete", { where: [["label", "LIKE", `${LABEL}%`]] });
  await api(page, "Tag", "delete", { where: [["label", "LIKE", `${LABEL}%`]] });
  const users = await api<{ contact_id: number }>(page, "User", "get", {
    select: ["contact_id"],
    where: [["username", "LIKE", "afreact-probe-%"]],
  });
  await api(page, "User", "delete", { where: [["username", "LIKE", "afreact-probe-%"]] });
  if (users.length)
    await api(page, "Contact", "delete", {
      useTrash: false,
      where: [["id", "IN", users.map((user) => user.contact_id)]],
    });
  await api(page, "Role", "delete", { where: [["name", "LIKE", "afreact_probe_%"]] });
}

async function createUser(page: Page, who: Who) {
  const { role, permissions } = USERS[who];
  const [saved] = await api<{ id: number }>(page, "Role", "create", {
    values: { name: role, label: role, permissions },
  });
  const [contact] = await api<{ id: number }>(page, "Contact", "create", {
    values: { contact_type: "Individual", first_name: "Probe", last_name: who },
  });
  if (!saved || !contact) throw new Error(`The ${who} probe user was not created.`);
  await api(page, "User", "create", {
    actorPassword: "admin",
    values: {
      contact_id: contact.id,
      username: username(who),
      uf_name: `${username(who)}@example.org`,
      password: PASSWORD,
      roles: [saved.id],
    },
  });
}

/** A page logged in as the probe user, in a context of its own. */
async function logIn(browser: Browser, baseURL: string | undefined, who: Who) {
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/civicrm/login");
  await page.getByRole("textbox", { name: "Username" }).fill(username(who));
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("button", { name: /log in/i }).click();
  await expect(page).not.toHaveURL(/\/civicrm\/login/, { timeout: 30_000 });
  return page;
}

async function createSearch(page: Page, label: string) {
  const [search] = await api<{ id: number }>(page, "SavedSearch", "create", {
    values: {
      name: label === LABEL ? NAME : undefined,
      label,
      api_entity: "Tag",
      api_params: params,
    },
    chain: {
      display: [
        "SearchDisplay",
        "create",
        {
          values: {
            saved_search_id: "$id",
            name: "probe_table",
            label: "Probe tags",
            type: "table",
            settings: { columns: [{ type: "field", key: "label", label: "Tag" }] },
          },
        },
      ],
    },
  });
  if (!search) throw new Error(`The search ${label} was not created.`);
  return search.id;
}

/** The probe searches the listing shows: label, the row's main button and its menu. */
async function listed(page: Page, renderer: keyof typeof pages) {
  await page.goto(`${pages[renderer].admin}#/list`);
  const rows =
    renderer === "react"
      ? page.getByRole("row", { name: new RegExp(LABEL) })
      : page.locator("crm-search-admin-search-listing tbody tr").filter({ hasText: LABEL });
  await expect(rows).toHaveCount(2);
  const found: [string, string | null, string[]][] = [];
  for (const row of await rows.all()) {
    const label = new RegExp(`${LABEL}( own)?`).exec((await row.textContent()) ?? "")?.[0] ?? "";
    const main = await row
      .getByRole("link", {
        name: /^(Edit search and displays|Create a new search based on this one)$/,
      })
      .first()
      .getAttribute("title");
    await row.getByRole("button", { name: "Row Actions" }).click();
    const items = row.getByRole(renderer === "react" ? "menuitem" : "link", {
      name: /Edit Search|View Results|Clone Search|Save as Template|Export Search|Delete|Revert/,
    });
    await expect(items.first()).toBeVisible();
    found.push([label, main, (await items.allInnerTexts()).map((text) => text.trim())]);
    await page.keyboard.press("Escape");
  }
  return found.sort(([a], [b]) => a.localeCompare(b));
}

/** What a new search offers: display types, setting the ACL bypass, the SQL in Query Info. */
async function offered(page: Page, renderer: keyof typeof pages) {
  await page.goto(
    `${pages[renderer].admin}#/create/Tag?label=${encodeURIComponent(`${LABEL} new`)}&params=${encodeURIComponent(JSON.stringify(params))}`,
  );
  await page.getByRole("button", { name: "Add..." }).click();
  const items = page.getByRole(renderer === "react" ? "menuitem" : "link", {
    name: /^(Table|List|Grid|Tree|Autocomplete|DB Entity|Data Entry|Chart)/,
  });
  await expect(items.first()).toBeVisible();
  const types = (await items.allInnerTexts()).map((text) => text.trim()).sort();
  await items
    .filter({ hasText: /^\s*Table/ })
    .first()
    .click();
  await expect(page.getByText("Enforce Permissions")).toBeVisible();
  // Core leaves the checkbox out, React shows it disabled with the reason as its title.
  const bypass = page.getByRole("checkbox", { name: /Enforce Permissions/ });
  const bypassOpen = (await bypass.count()) > 0 && (await bypass.isEnabled());
  await page.getByText("Query Info", { exact: true }).click();
  await expect(page.getByText("API:", { exact: true })).toBeVisible();
  return { types, bypassOpen, sql: await page.getByText("SQL:", { exact: true }).count() };
}

test.describe("SearchKit builder for restricted users", () => {
  test.beforeEach(async ({ page }) => {
    await cleanUp(page);
    await createUser(page, "owner");
    await createUser(page, "viewer");
    await api(page, "Tag", "create", { values: { label: `${LABEL} tag` } });
    await createSearch(page, LABEL);
  });
  test.afterEach(async ({ page }) => {
    await cleanUp(page);
  });

  test("a user managing their own searches is offered and refused what core's builder does", async ({
    browser,
    baseURL,
  }) => {
    const owner = await logIn(browser, baseURL, "owner");
    await createSearch(owner, `${LABEL} own`);
    const angular = await listed(owner, "angular");
    expect(await listed(owner, "react")).toEqual(angular);
    const core = await offered(owner, "angular");
    expect(core.types).not.toContain("DB Entity");
    expect(core.bypassOpen).toBe(false);
    expect(core.sql).toBe(0);
    expect(await offered(owner, "react")).toEqual(core);
    await owner.context().close();
  });

  test("a user who may only view sees the display page as core shows it, without an edit link", async ({
    browser,
    baseURL,
  }) => {
    const viewer = await logIn(browser, baseURL, "viewer");
    await viewer.goto(`${pages.angular.display}#/display/${NAME}/probe_table`);
    const angularRows = viewer.locator("crm-search-display table tbody tr");
    await expect(angularRows.first()).toHaveText(`${LABEL} tag`);
    const angular = await angularRows.allInnerTexts();
    expect(await viewer.getByText("Edit in SearchKit").count()).toBe(0);
    await viewer.goto(`${pages.react.display}#/display/${NAME}/probe_table`);
    const reactRows = viewer.locator("afreact-builder table tbody tr");
    await expect(reactRows.first()).toHaveText(`${LABEL} tag`);
    expect(await reactRows.allInnerTexts()).toEqual(angular);
    // React's display page puts the edit link in its Configure menu, which the viewer lacks.
    await expect(viewer.getByRole("button", { name: "Configure" })).toHaveCount(0);
    expect(await viewer.getByText("Edit in SearchKit").count()).toBe(0);
    await viewer.context().close();
  });
});
