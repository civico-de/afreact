/**
 * React's form layout over the theme (css/afreact-form.css), on the large demo form: blocks keep
 * a gap, a repeat item's controls sit at its fields, a legend heads its fieldset; the undo for a
 * removed item, the list of a blocked submit's invalid fields and their own error texts have no
 * axe finding. Each test runs in every Riverlea stream, whose sizes and colours differ.
 */
import { expect, type Locator } from "@playwright/test";
import { axeFindings, STREAMS, streamTest as test } from "./harness";

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

/** The dash of a range, not its separator's box, which spans the gap between the bounds. */
const dashBox = (range: Locator) =>
  range.locator(".af-field-range-sep").evaluate((separator) => {
    const dash = separator.firstChild;
    if (!dash) throw new Error("The range separator has no dash.");
    const text = document.createRange();
    text.selectNodeContents(dash);
    const { x, width } = text.getBoundingClientRect();
    return { x, right: x + width };
  });

for (const stream of STREAMS)
  test.describe(stream, () => {
    test.use({ stream });

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

      // A phone item's remove button follows its last field at the theme's gap, however wide the
      // stream makes the button, not the far edge of the form.
      const phoneItem = about
        .locator("[af-repeat-item]")
        .filter({ has: page.getByLabel("Phone Type") });
      const phoneType = await box(phoneItem.locator("af-field").last());
      const remove = await box(phoneItem.getByRole("button", { name: "Remove" }));
      const gap = await phoneItem.evaluate((item) => {
        const probe = item.appendChild(document.createElement("div"));
        probe.style.width = "var(--crm-flex-gap)";
        const width = probe.getBoundingClientRect().width;
        probe.remove();
        return width;
      });
      expect(gap).toBeGreaterThan(0);
      expect(remove.x - phoneType.right).toBeCloseTo(gap, 0);

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
    test("a repeat item's remove button and block menu sit apart on its row of inputs", async ({
      page,
    }) => {
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
      // They end with the item's last row of fields and are as tall as its inputs, in streams
      // whose buttons are taller or spaced apart; a taller field (Walbrook's radios) sets the end.
      const input = await box(item.getByLabel("Email Location Type"));
      const fields = await item.locator("> .af-layout-inline").last().locator("af-field").all();
      const rowEnd = Math.max(...(await Promise.all(fields.map(box))).map((field) => field.bottom));
      for (const control of [remove, menu]) {
        expect(control.height).toBeCloseTo(input.height, 0);
        expect(control.bottom).toBeCloseTo(rowEnd, 0);
        expect(control.y).toBeGreaterThanOrEqual(input.y);
      }
      // The remove button's icon sits midway down the button.
      const icon = await box(item.locator("> .af-repeat-remove-btn .crm-i"));
      expect(
        Math.abs(icon.y + icon.height / 2 - (remove.y + remove.height / 2)),
      ).toBeLessThanOrEqual(2);
    });

    // deviation:form-design-layer
    test("a repeat item of several rows keeps its controls narrow and its last row on one line", async ({
      page,
    }) => {
      await page.goto(FORM);
      const about = page.getByRole("group", { name: "About you" });
      await expect(about).toBeVisible(LOAD);
      await expect(page.locator(".afreact-form")).toHaveAttribute("aria-busy", "false", LOAD);
      await about.getByRole("button", { name: "Add" }).first().click();
      await about.getByRole("button", { name: "Add" }).last().click();
      const items = about.locator("[af-repeat-item]");
      const email = items.filter({ has: page.getByLabel("Email Location Type") }).first();
      const address = items.filter({ has: page.getByLabel("City") }).first();
      await expect(address.locator("> .af-layout-inline")).toHaveCount(2);
      // As wide as on a one-row item, not stretched by the rows above the last.
      for (const control of [".af-repeat-remove-btn", ".crm-admin-block-context-dropdown"]) {
        const [own, oneRow] = await Promise.all([
          box(address.locator(`> ${control}`)),
          box(email.locator(`> ${control}`)),
        ]);
        expect(own.width).toBeCloseTo(oneRow.width, 0);
      }
      const last = address.locator("> .af-layout-inline").last().locator("af-field");
      const tops = (await Promise.all((await last.all()).map(box))).map((field) => field.y);
      expect(tops.length).toBeGreaterThan(1);
      expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
    });

    for (const colorScheme of ["light", "dark"] as const)
      // deviation:repeat-remove-undo
      test(`the undo for a removed item has no axe finding (${colorScheme})`, async ({ page }) => {
        test.setTimeout(120_000);
        await page.emulateMedia({ colorScheme });
        await page.goto(FORM);
        const about = page.getByRole("group", { name: "About you" });
        await expect(about).toBeVisible(LOAD);
        await expect(page.locator(".afreact-form")).toHaveAttribute("aria-busy", "false", LOAD);
        await about.getByRole("button", { name: "Add phone" }).click();
        await about.getByRole("button", { name: "Remove" }).first().click();
        await expect(about.getByRole("button", { name: "Undo" })).toBeFocused();
        expect(await axeFindings(page, ".afreact-repeat-undo")).toEqual([]);
      });

    for (const colorScheme of ["light", "dark"] as const)
      // deviation:invalid-fields-listed
      test(`a blocked submit marks only the fields it lists, keeps the focus border and has no axe finding (${colorScheme})`, async ({
        page,
      }) => {
        test.setTimeout(120_000);
        await page.emulateMedia({ colorScheme });
        await page.goto(FORM);
        await expect(page.locator(".afreact-form")).toHaveAttribute("aria-busy", "false", LOAD);
        // The theme fades border colours; the comparison below wants them settled.
        await page.addStyleTag({ content: "* { transition: none !important; }" });
        await page.getByRole("button", { name: "Become a member" }).click();
        const summary = page.locator(".afreact-form > .alert");
        await expect(summary.getByRole("button", { name: "Membership Type" })).toBeVisible();
        await expect(page.getByRole("textbox", { name: "First Name" })).toBeFocused();
        const border = (name: string) =>
          page
            .getByRole("textbox", { name })
            .evaluate((input) => getComputedStyle(input).borderColor);
        // The focused field keeps the focus border over the error ink.
        expect(await border("Last Name")).not.toBe(await border("Birth Date"));
        expect(await border("First Name")).not.toBe(await border("Last Name"));
        // An email added after the blocked submit is not marked, though empty and required.
        const label = (index: number) =>
          page
            .locator("af-field")
            .filter({ has: page.getByRole("textbox", { name: "Email" }) })
            .nth(index)
            .locator(".crm-af-field-label")
            .evaluate((element) => [
              getComputedStyle(element).color,
              getComputedStyle(element, "::before").content,
            ]);
        await page
          .getByRole("group", { name: "About you" })
          .getByRole("button", { name: "Add" })
          .first()
          .click();
        const healthy = await page
          .locator("af-field")
          .filter({ hasText: "Birth Date" })
          .locator(".crm-af-field-label")
          .evaluate((element) => getComputedStyle(element).color);
        expect(await label(1)).toEqual([healthy, "none"]);
        expect(await label(0)).not.toEqual([healthy, "none"]);
        // deviation:field-error-text
        await expect(page.getByRole("textbox", { name: "First Name" })).toHaveAccessibleDescription(
          "This field is required.",
        );
        expect(
          await axeFindings(
            page,
            ".afreact-form > .alert, .afreact-checked .crm-af-field-label, .afreact-field-error",
          ),
        ).toEqual([]);
      });

    // deviation:range-dash-centred
    test("a date range's bounds stand on two filter slots, its dash centred between them", async ({
      page,
    }) => {
      await page.goto("/civicrm/afreact/demo");
      const search = page.locator("afreact-form[name=afsearchAfreactDemoContacts]");
      const range = search.getByRole("group", { name: "Born" });
      const from = range.getByLabel("Born from");
      const bounds = range.locator(".crm-form-date-wrapper");
      const fits = async () => {
        const [start, dash, end, first, second] = await Promise.all([
          box(bounds.first()),
          dashBox(range),
          box(bounds.last()),
          box(search.locator('af-field[name="last_name"] input')),
          box(search.locator('af-field[name="first_name"] input')),
        ]);
        const before = dash.x - start.right;
        expect(before).toBeGreaterThanOrEqual(3);
        expect(Math.abs(before - (end.x - dash.right))).toBeLessThanOrEqual(1);
        for (const [bound, slot] of [
          [start, first],
          [end, second],
        ] as const) {
          expect(Math.abs(bound.x - slot.x)).toBeLessThanOrEqual(1);
          expect(Math.abs(bound.right - slot.right)).toBeLessThanOrEqual(1);
        }
      };
      await expect(from).toBeVisible(LOAD);
      await fits();
      await from.fill("2000-01-01");
      const clear = range.getByRole("button", { name: "Clear" }).first();
      await expect(clear).toBeVisible();
      await fits();
      // The clear link keeps the theme's size, a target of at least 24 pixels.
      expect((await box(clear)).width).toBeGreaterThanOrEqual(24);
    });

    test("a number range keeps a space on both sides of its dash and fits a phone", async ({
      page,
    }) => {
      await page.goto("/civicrm/afreact/render?name=afsearchAfreactDemoRanges&renderer=react");
      const range = page.getByRole("group", { name: "Contact ID" });
      await expect(range).toBeVisible(LOAD);
      const [start, dash, end] = await Promise.all([
        box(range.getByLabel("Contact ID from")),
        dashBox(range),
        box(range.getByLabel("Contact ID to")),
      ]);
      expect(dash.x - start.right).toBeGreaterThanOrEqual(3);
      expect(Math.abs(dash.x - start.right - (end.x - dash.right))).toBeLessThanOrEqual(1);
      // On a phone both bounds shrink into the range's width.
      await page.setViewportSize({ width: 320, height: 800 });
      await expect
        .poll(async () => (await box(range.getByLabel("Contact ID to"))).right)
        .toBeLessThanOrEqual((await box(range)).right + 0.5);
    });

    // deviation:form-inputs-one-width
    test("a form's single-line inputs and selects share one width, a date range two and the gap", async ({
      page,
    }) => {
      await page.goto("/civicrm/afreact/demo");
      const form = page.locator("afreact-form[name=afformAfreactDemoContact]");
      await expect(form.locator("af-field").first()).toBeVisible(LOAD);
      const controls = await Promise.all(
        ["first_name", "last_name", "gender_id", "birth_date"].map((name) =>
          box(form.locator(`af-field[name="${name}"] :is(input:not([type=hidden]), select)`)),
        ),
      );
      const widths = controls.map(({ width }) => Math.round(width));
      expect(new Set(widths).size).toBe(1);
      // Stacked fields start on one line; the inline pair keeps its row.
      expect(controls[2]?.x).toBe(controls[0]?.x);
      expect(controls[3]?.x).toBe(controls[0]?.x);
      const search = page.locator("afreact-form[name=afsearchAfreactDemoContacts]");
      const range = await box(search.locator(".afreact-range"));
      const filter = await box(search.locator('af-field[name="last_name"] input'));
      const gap = await box(search.locator('af-field[name="first_name"] input'));
      expect(
        Math.abs(range.width - (2 * filter.width + (gap.x - filter.right))),
      ).toBeLessThanOrEqual(1);
      expect(Math.round(filter.width)).toBe(widths[0]);
    });

    // deviation:filter-fields-row
    test("filter fields beside a search display stand side by side at one width, one per row when narrow", async ({
      page,
    }) => {
      const search = page.locator("afreact-form[name=afsearchAfreactDemoContacts]");
      const fields = ["last_name", "first_name", "email_primary.email", "gender_id"].map((name) =>
        search.locator(`af-field[name="${name}"] :is(input, select)`),
      );
      await page.goto("/civicrm/afreact/demo");
      await expect(search.locator("af-field").first()).toBeVisible(LOAD);
      const boxes = await Promise.all(fields.map(box));
      expect(new Set(boxes.map(({ y }) => Math.round(y))).size).toBe(1);
      expect(new Set(boxes.map(({ width }) => Math.round(width))).size).toBe(1);
      const display = await box(search.locator(".crm-search-display"));
      expect(display.width).toBeGreaterThan(boxes.reduce((sum, { width }) => sum + width, 0));

      await page.setViewportSize({ width: 375, height: 800 });
      const narrow = await Promise.all(fields.map(box));
      expect(new Set(narrow.map(({ x }) => Math.round(x))).size).toBe(1);
      for (const field of narrow) expect(field.right).toBeLessThanOrEqual(375);
    });
  });
