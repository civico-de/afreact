/**
 * afformAfreactDemoTabs on both renderers: an af-tabset with fields in two tabs, a Toggle, and a
 * search display whose row count is the tab's badge. url-arg is left out: on 6.18 it blanks the
 * Angular tab set (comparison.md, "`url-arg` blanks the tab set outside the Angular page").
 */
import { expect, test, type Page } from "@playwright/test";
import { api, AUTH, type Renderer } from "./harness";

const RUN = Date.now().toString(36);
const render = (renderer: Renderer) =>
  `/civicrm/afreact/render?name=afformAfreactDemoTabs&renderer=${renderer}`;
const form = (page: Page) => page.locator(".afreact-render");
const tab = (page: Page, name: string) =>
  form(page).locator(`.crm-tab-button[data-name="${name}"]`);
const input = (page: Page, name: string) => form(page).locator(`af-field[name="${name}"] input`);

const contacts: number[] = [];

test.afterAll(async ({ browser }) => {
  if (!contacts.length) return;
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  await page.goto("/civicrm/afreact/compare");
  await api(page, "Contact", "delete", { where: [["id", "IN", contacts]], useTrash: false });
  await context.close();
});

for (const renderer of ["react", "angular"] as const) {
  test.describe(renderer, () => {
    test("shows core's tab markup with the first tab open", async ({ page }) => {
      await page.goto(render(renderer));
      const list = form(page).locator("af-tabset.crm-tabset > ul.nav.nav-tabs.crm-tab-list");
      await expect(list.locator("li.crm-tab-button")).toHaveCount(3);
      await expect(tab(page, "name")).toHaveClass(/\bactive\b/);
      await expect(tab(page, "privacy")).not.toHaveClass(/\bactive\b/);
      await expect(input(page, "first_name")).toBeVisible();
      await expect(input(page, "is_opt_out")).toBeHidden();
      await expect(input(page, "is_opt_out")).toHaveClass(/\bcrm-form-toggle\b/);
    });

    test("opens a tab on click and remembers it on reload", async ({ page }) => {
      await page.goto(render(renderer));
      await tab(page, "privacy").locator("a").click();
      await expect(tab(page, "privacy")).toHaveClass(/\bactive\b/);
      await expect(input(page, "is_opt_out")).toBeVisible();
      await expect(input(page, "first_name")).toBeHidden();
      await page.reload();
      await expect(tab(page, "privacy")).toHaveClass(/\bactive\b/);
      await expect(input(page, "is_opt_out")).toBeVisible();
    });

    test("counts the display's rows into its tab's badge", async ({ page }) => {
      await page.goto(render(renderer));
      const count = await page.evaluate(async () => {
        const result = await window.CRM.api4("Individual", "get", {
          select: ["row_count"],
          where: [["is_deleted", "=", false]],
        });
        return typeof result === "object" && result !== null && "count" in result
          ? String(result.count)
          : null;
      });
      expect(count).not.toBeNull();
      await expect(tab(page, "contacts").locator(".badge")).toHaveText(count ?? "");
      await tab(page, "contacts").locator("a").click();
      await expect(form(page).locator("table tbody tr").first()).toBeVisible();
    });

    test("submits the fields of a hidden tab", async ({ page }) => {
      const lastName = `Tabs${RUN}${renderer}`;
      await page.goto(render(renderer));
      await input(page, "last_name").fill(lastName);
      await tab(page, "privacy").locator("a").click();
      await input(page, "is_opt_out").check();
      await tab(page, "contacts").locator("a").click();
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText("Contact saved.")).toBeVisible();
      const [saved] = await api<{ id: number; is_opt_out: boolean }>(page, "Individual", "get", {
        select: ["id", "is_opt_out"],
        where: [["last_name", "=", lastName]],
      });
      contacts.push(saved!.id);
      expect(saved!.is_opt_out).toBe(true);
    });

    test("with a required field empty in a hidden tab, submits nothing", async ({ page }) => {
      const submits: string[] = [];
      page.on(
        "request",
        (request) => request.url().includes("/Afform/submit") && submits.push(request.url()),
      );
      await page.goto(render(renderer));
      await tab(page, "privacy").locator("a").click();
      await page.getByRole("button", { name: "Save" }).click();
      // Both alert the missing field on CiviCRM screens, so the click has been handled.
      await expect(page.locator("#crm-notification-container")).toContainText(
        "Please fill all required fields.",
      );
      // Angular stays on the tab without feedback; React opens the field's tab and focuses it.
      if (renderer === "react") {
        await expect(tab(page, "name")).toHaveClass(/\bactive\b/);
        await expect(input(page, "last_name")).toBeFocused();
      } else {
        await expect(tab(page, "privacy")).toHaveClass(/\bactive\b/);
        await expect(input(page, "last_name")).toBeHidden();
      }
      expect(submits).toEqual([]);
    });
  });
}

test("react: tabs follow the ARIA pattern with arrow keys", async ({ page }) => {
  await page.goto(render("react"));
  const first = page.getByRole("tab", { name: "Name" });
  await expect(first).toHaveAttribute("aria-selected", "true");
  await first.focus();
  await page.keyboard.press("ArrowRight");
  const privacy = page.getByRole("tab", { name: "Privacy" });
  await expect(privacy).toBeFocused();
  await expect(privacy).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "Privacy" })).toBeVisible();
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: /Contacts/ })).toBeFocused();
});
