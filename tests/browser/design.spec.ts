/**
 * React's form layout over the theme (css/afreact-form.css), on the large demo form: blocks keep
 * a gap, a repeat item's controls sit at its fields, a legend heads its fieldset.
 */
import { expect, test, type Locator } from "@playwright/test";

const FORM = "/civicrm/afreact/render?name=afformAfreactDemoMembership&renderer=react";
const LOAD = { timeout: 30_000 };

const box = async (locator: Locator) => {
  const found = await locator.boundingBox();
  if (!found) throw new Error(`no box for ${locator.toString()}`);
  return {
    ...found,
    right: found.x + found.width,
    bottom: found.y + found.height,
  };
};

// deviation:form-design-layer
test("the React form keeps its blocks apart and a repeat item's controls at its fields", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(FORM);
  const about = page.getByRole("group", { name: "About you" });
  await expect(about).toBeVisible(LOAD);
  await expect(page.locator(".afreact-form")).toHaveAttribute("aria-busy", "false", LOAD);

  // The name row, the birth date and the email block each stand apart, labels included.
  const lastName = await box(about.getByRole("textbox", { name: "Last Name" }));
  const birth = await box(about.locator("af-field").filter({ hasText: "Birth Date" }));
  const email = await box(about.locator("af-field").filter({ hasText: "Email" }).first());
  expect(birth.y - lastName.bottom).toBeGreaterThanOrEqual(12);
  expect(email.y - birth.bottom).toBeGreaterThanOrEqual(12);

  // Add and Copy stand apart; the next block keeps its gap below them.
  const add = await box(about.getByRole("button", { name: "Add" }).first());
  const copy = await box(about.getByRole("button", { name: "Copy" }).first());
  expect(copy.x - add.right).toBeGreaterThanOrEqual(3);
  const phone = await box(about.locator("af-field").filter({ hasText: "Phone" }).first());
  expect(phone.y - add.bottom).toBeGreaterThanOrEqual(12);

  // A phone item's remove button follows its last field, not the far edge of the form.
  const phoneItem = about
    .locator("[af-repeat-item]")
    .filter({ has: page.getByLabel("Phone Type") });
  const phoneType = await box(phoneItem.locator("af-field").last());
  const remove = await box(phoneItem.getByRole("button", { name: "Remove" }));
  expect(remove.x).toBeGreaterThanOrEqual(phoneType.right);
  expect(remove.x - phoneType.right).toBeLessThanOrEqual(48);

  // The legend takes its own width, so the theme's top border shows beside it.
  // deviation:legend-own-width
  const widths = await about.evaluate((fieldset) => ({
    fieldset: fieldset.getBoundingClientRect().width,
    legend: fieldset.querySelector("legend")!.getBoundingClientRect().width,
  }));
  expect(widths.legend).toBeLessThan(widths.fieldset / 2);
});

// deviation:form-design-layer
test("the React form layout keeps to stacking blocks and the back office", async ({ page }) => {
  await page.goto(FORM);
  await expect(page.getByRole("group", { name: "About you" })).toBeVisible(LOAD);
  // Layouts the demo form lacks, in core's markup beside it, in the same theme.
  await page
    .locator(".afreact-form")
    .first()
    .evaluate((form) => {
      /** Markup as [tag, class, children or text]. */
      type Spec = [string, string, (Spec | string)[] | string];
      const field = (label: string, type = "text"): Spec => [
        "af-field",
        `af-field-type-${type}`,
        [
          ["label", "crm-af-field-label", label],
          ["div", "crm-af-field", [["input", `form-control ${type}`, []]]],
        ],
      ];
      const specs: Spec[] = [
        [
          "fieldset",
          "af-container af-layout-inline",
          [["legend", "af-title", "Row"], field("Row A"), field("Row B"), field("Row C")],
        ],
        [
          "fieldset",
          "af-container",
          [
            field("Hidden ID", "hidden"),
            field("After hidden"),
            ["p", "af-text", "Text after a field"],
          ],
        ],
        [
          "details",
          "af-container",
          [["summary", "af-title", "More"], field("Inside A"), field("Inside B")],
        ],
        [
          "af-search-param-sets",
          "",
          [
            [
              "dl",
              "",
              [
                [
                  "div",
                  "",
                  [
                    ["dt", "", "Term"],
                    ["dd", "", "Detail"],
                  ],
                ],
              ],
            ],
          ],
        ],
      ];
      const front: Spec = [
        "div",
        "crm-public",
        [
          [
            "div",
            "afreact-form",
            [["fieldset", "af-container", [field("Public A"), field("Public B")]]],
          ],
        ],
      ];
      const build = ([tag, className, content]: Spec): HTMLElement => {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (element instanceof HTMLInputElement && className.endsWith(" hidden"))
          element.type = "hidden";
        if (typeof content === "string") element.textContent = content;
        else
          element.append(
            ...content.map((child) => (typeof child === "string" ? child : build(child))),
          );
        return element;
      };
      const fixture = build(["div", "", [["div", "afreact-form", specs], front]]);
      fixture.id = "layout-fixture";
      form.after(fixture);
      fixture.querySelector("details")!.open = true;
    });
  const fixture = page.locator("#layout-fixture");
  const top = (locator: Locator) =>
    locator.evaluate((element) => element.getBoundingClientRect().y);
  const tops = await fixture
    .locator(".af-layout-inline af-field")
    .evaluateAll((fields) =>
      fields.map((element) => Math.round(element.getBoundingClientRect().y)),
    );
  expect(new Set(tops).size).toBe(1);
  await expect(fixture.getByText("Hidden ID")).toBeHidden();
  const afterHidden = fixture.locator("af-field").filter({ hasText: "After hidden" });
  await expect(afterHidden).toHaveCSS("margin-top", "0px");
  // The theme's paragraph margin gives way to the gap; open details stack like fieldsets.
  await expect(fixture.locator("p.af-text")).toHaveCSS("margin-top", "16px");
  await expect(fixture.locator("af-field").filter({ hasText: "Inside B" })).toHaveCSS(
    "margin-top",
    "16px",
  );
  // React's own rows and the theme's front-end pages keep their layout.
  expect(await top(fixture.locator("dd"))).toBe(await top(fixture.locator("dt")));
  await expect(fixture.locator("af-field").filter({ hasText: "Public B" })).toHaveCSS(
    "margin-top",
    "0px",
  );
});

// deviation:form-design-layer
test("a repeat item's remove button and block menu sit apart", async ({ page }) => {
  await page.goto(FORM);
  const about = page.getByRole("group", { name: "About you" });
  await expect(about).toBeVisible(LOAD);
  await expect(page.locator(".afreact-form")).toHaveAttribute("aria-busy", "false", LOAD);
  await about.getByRole("button", { name: "Add" }).first().click();
  const item = about
    .locator("[af-repeat-item]")
    .filter({ has: page.getByLabel("Email Location Type") })
    .first();
  const remove = await box(item.getByRole("button", { name: "Remove" }));
  const menu = await box(item.locator(".crm-admin-block-context-dropdown"));
  const apart =
    remove.right <= menu.x ||
    menu.right <= remove.x ||
    remove.bottom <= menu.y ||
    menu.bottom <= remove.y;
  expect(apart).toBe(true);
});
