/**
 * FormBuilder's submissions page in React against core's: title, columns and rows of the
 * default display core builds for the form.
 */
import { expect, test, type Page } from "@playwright/test";
import { api, coreBuilders, debugOn, debugPanel } from "./harness";

coreBuilders();

const NAME = "afformAfreactSubmissionsProbe";
const TITLE = "Afreact submissions probe";

async function table(page: Page) {
  const body = page.locator("table tbody");
  await expect(body.getByText("Probe A")).toBeVisible();
  const squash = (texts: string[]) => texts.map((text) => text.replaceAll(/\s+/g, " ").trim());
  return {
    title: (await page.locator("h1").first().innerText()).trim(),
    // Visible text: React names the menu column for screen readers, where core leaves it empty.
    headers: squash(
      await page.locator("table thead th").evaluateAll((cells) =>
        cells.map((cell) => {
          // What shows: a closed menu's items and React's names for screen readers stay out.
          const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
          let text = "";
          while (walker.nextNode()) {
            const parent = walker.currentNode.parentElement;
            if (parent?.checkVisibility() && !parent.closest(".sr-only"))
              text += walker.currentNode.textContent ?? "";
          }
          return text;
        }),
      ),
    ),
    rows: squash(await body.locator("tr").allInnerTexts()),
  };
}

test.describe("FormBuilder submissions", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/civicrm/admin/afreact/afform");
    await api(page, "Afform", "revert", { where: [["name", "=", NAME]] });
    await api(page, "Afform", "create", {
      values: {
        name: NAME,
        type: "form",
        title: TITLE,
        create_submission: true,
        layout:
          '<af-form ctrl="afform"><af-entity type="Individual" name="Individual1" data="{contact_type: \'Individual\'}"></af-entity>' +
          '<fieldset af-fieldset="Individual1"><af-field name="first_name"></af-field></fieldset></af-form>',
      },
    });
    for (const [first, date] of [
      ["Probe A", "2026-01-02 10:00:00"],
      ["Probe B", "2026-01-03 11:00:00"],
    ])
      await api(page, "AfformSubmission", "create", {
        values: {
          afform_name: NAME,
          submission_date: date,
          data: { Individual1: [{ fields: { first_name: first } }] },
        },
      });
  });
  test.afterEach(async ({ page }) => {
    await api(page, "AfformSubmission", "delete", {
      where: [["afform_name", "=", NAME]],
    });
    await api(page, "Afform", "revert", { where: [["name", "=", NAME]] });
  });

  test("lists a form's submissions as core's page does", async ({ page }) => {
    await debugOn(page);
    await page.goto(`/civicrm/admin/afform/submissions?name=${NAME}`);
    const angular = await table(page);
    expect(angular.title).toBe(`Submissions for ${TITLE}`);
    await page.goto(`/civicrm/admin/afreact/afform/submissions?name=${NAME}`);
    expect(await table(page)).toEqual(angular);
    await expect(
      page.locator("nav[aria-label=Breadcrumb]").getByRole("link", { name: "FormBuilder" }),
    ).toBeVisible();
    // Core's page needs the form's name too.
    await (
      await debugPanel(page)
    )
      .getByRole("link", { name: "Open in the classic builder" })
      .click();
    await expect(page).toHaveURL(new RegExp(`/civicrm/admin/afform/submissions\\?name=${NAME}$`));
    expect(await table(page)).toEqual(angular);
  });

  test("says when the address names no form or one that does not exist", async ({ page }) => {
    await page.goto("/civicrm/admin/afreact/afform/submissions");
    await expect(page.locator(".afreact-builder").getByRole("alert")).toHaveText(
      "The address names no form.",
    );
    // Core shows an empty table titled "Submissions for ".
    await page.goto("/civicrm/admin/afreact/afform/submissions?name=afformAfreactNoSuchForm");
    await expect(page.locator(".afreact-builder").getByRole("alert")).toHaveText(
      "No form afformAfreactNoSuchForm exists that you may see.",
    );
    await expect(page.locator("table")).toHaveCount(0);
  });
});
