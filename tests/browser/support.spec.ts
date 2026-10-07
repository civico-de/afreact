/**
 * The support report must say exactly what the React renderer shows as "Not supported" on a
 * form, since both come from the same walk; and it must check every form but blocks.
 */
import { expect, test, type Page } from "@playwright/test";
import { api, setReactForms } from "./harness";

// Forms without af-if, so every flagged part renders whatever the data, and none placed only
// inline: the preview renders without placement options.
const SAMPLE = [
  "afsearchTabActivity",
  "afsearchAdministerNavigationMenu",
  "afsearchSurveyOptionGroup",
  "afformAfreactDemoContact",
];

const status = (page: Page) => page.locator(".afreact-support p[role=status]");
const unique = (notes: string[]) => [...new Set(notes)].sort();

async function openReport(page: Page) {
  await page.goto("/civicrm/admin/afreact");
  await expect(status(page)).toHaveText(/^Checked \d+ forms/, {
    timeout: 120_000,
  });
}

test.setTimeout(240_000);

test("the report checks every form but blocks and links to both renderers", async ({ page }) => {
  await openReport(page);
  const forms = await api<{ name: string }>(page, "Afform", "get", {
    select: ["name"],
    where: [["type", "!=", "block"]],
  });
  const rows = page.locator(".afreact-support tbody tr");
  await expect(rows).toHaveCount(forms.length);
  await expect(status(page)).toHaveText(
    new RegExp(
      `^Checked ${forms.length} forms: \\d+ with parts React cannot show yet, 0 not loaded\\.$`,
    ),
  );
  const demo = rows.filter({
    has: page.locator("code", { hasText: /^afformAfreactDemoContact$/ }),
  });
  await expect(demo.getByRole("cell").nth(3)).toHaveText("Nothing");
  await expect(demo.getByRole("link", { name: "React" })).toHaveAttribute(
    "href",
    /civicrm\/afreact\/render\?name=afformAfreactDemoContact&renderer=react$/,
  );
  await expect(demo.getByRole("link", { name: "Angular" })).toHaveAttribute(
    "href",
    /renderer=angular$/,
  );
});

test("the button lists every supported form in the setting", async ({ page }) => {
  // The API helper needs a CiviCRM page loaded.
  await page.goto("/civicrm/admin/afreact");
  const [before] = await api<{ value: string[] }>(page, "Setting", "get", {
    select: ["afreact_forms"],
  });
  await setReactForms(page, ["afsearchTabActivity"]);
  try {
    await openReport(page);
    const button = page.getByRole("button", {
      name: "Render every supported form with React",
    });
    await expect(button).toBeEnabled();
    await button.click();
    await expect(page.getByText("The settings list every supported form.")).toBeVisible();
    await expect(button).toBeDisabled();
    const rendered = (name: string) =>
      page
        .locator(".afreact-support tbody tr")
        .filter({
          has: page.locator("code", { hasText: new RegExp(`^${name}$`) }),
        })
        .getByRole("cell")
        .nth(2);
    await expect(rendered("afformAfreactDemoContact")).toHaveText("React");
    await expect(rendered("afsearchTabActivity")).toHaveText("Angular");

    const [after] = await api<{ value: string[] }>(page, "Setting", "get", {
      select: ["afreact_forms"],
    });
    expect(after!.value).toContain("afformAfreactDemoContact");
    expect(after!.value).not.toContain("afsearchTabActivity");
    // The setting's post_change rebuilt the routes: the demo form's page is now React's.
    await page.goto("/civicrm/afreact/demo-angular");
    await expect(page.locator('afreact-form[name="afformAfreactDemoContact"]')).toHaveCount(1);
  } finally {
    await setReactForms(page, before!.value);
  }
});

test("the report lists what the rendered form flags", async ({ page }) => {
  await openReport(page);
  const reported: Record<string, string[]> = {};
  for (const name of SAMPLE) {
    const row = page.locator(".afreact-support tbody tr").filter({
      has: page.locator("code", { hasText: new RegExp(`^${name}$`) }),
    });
    reported[name] = unique(await row.locator(".afreact-support-problems li").allInnerTexts());
  }
  expect(reported.afsearchTabActivity?.length, "a sample with gaps").toBeGreaterThan(0);

  for (const name of SAMPLE) {
    await page.goto(`/civicrm/afreact/render?name=${name}&renderer=react`);
    await expect(page.locator(".afreact-render afreact-form > div")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    await page.waitForLoadState("networkidle");
    const shown = await page.locator(".afreact-render .afreact-unsupported").allInnerTexts();
    expect(
      unique(shown.map((note) => note.replace("Not supported by the React renderer: ", ""))),
      name,
    ).toEqual(reported[name]);
  }
});
