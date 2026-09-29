/**
 * The React pages must be as accessible as the Angular ones, in light and in dark mode. The
 * only axe findings allowed on it are contrast failures the Angular page has with the same colours
 * and font, i.e. the theme's. Findings are reported without element content.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { isReady } from "../../src/compare/metrics";
import { setReactForms } from "./harness";

const render = (name: string) => (renderer: string) =>
  `/civicrm/afreact/render?name=${name}&renderer=${renderer}`;
const rules = render("afformAfreactDemoRules");
const features = render("afsearchAfreactDemoFeatures");
const types = render("afsearchAfreactDemoContactTypes");
const groups = (renderer: string) => `${render("afsearchManageGroups")(renderer)}#?title=a`;
// Rows, count and totals are in.
const tableReady = `!!document.querySelector(".afreact-render tbody tr[data-entity-id]") && !document.querySelector(".afreact-render .crm-search-loading-placeholder")`;
interface Pair {
  name: string;
  react: string;
  angular: string;
  scope: string;
  /** A page expression that holds once the content is there. */
  ready: string;
  /** Opened with Enter before the check; the keyboard leaves no hover colours behind. */
  open?: string;
}

const PAIRS: Pair[] = [
  {
    name: "demo",
    react: "/civicrm/afreact/demo",
    angular: "/civicrm/afreact/angular",
    scope: ".afreact-demo",
    // Both demo forms and the first table row are there.
    ready: `(${isReady.toString()})(document)`,
  },
  {
    name: "rules form",
    react: rules("react"),
    angular: rules("angular"),
    scope: ".afreact-render",
    ready: `!!document.querySelector(".afreact-render af-field input")`,
  },
  {
    name: "table features",
    react: features("react"),
    angular: features("angular"),
    scope: ".afreact-render",
    ready: tableReady,
  },
  {
    name: "table row menu",
    react: features("react"),
    angular: features("angular"),
    scope: ".afreact-render",
    ready: tableReady,
    // The first row's menu covers rows without theme contrast failures: axe does not see
    // top-layer popovers covering text and would report the covered text on React only.
    open: ".afreact-render tbody tr:nth-child(1) .crm-search-col-type-menu button",
  },
  {
    name: "table subsearch",
    react: features("react"),
    angular: features("angular"),
    scope: ".afreact-render",
    ready: tableReady,
    open: ".afreact-render tbody tr:nth-child(2) .crm-search-col-type-subsearch summary",
  },
  {
    name: "collapsible table",
    react: types("react"),
    angular: types("angular"),
    scope: ".afreact-render",
    ready: tableReady,
  },
  {
    name: "filtered search",
    react: groups("react"),
    angular: groups("angular"),
    scope: ".afreact-render",
    // Filter fields and the rows of the first search, placeholders gone.
    ready: `!!document.querySelector(".afreact-render af-field input") && !!document.querySelector(".afreact-render tbody td") && !document.querySelector(".afreact-render .crm-search-loading-placeholder")`,
  },
];

/** The Afform page of a form in the afreact_forms setting, against the same route left to Angular. */
const TAKEOVER = {
  name: "form page taken over",
  form: "afformAfreactDemoContact",
  url: "/civicrm/afreact/demo-angular",
  scope: "#bootstrap-theme",
  ready: `!!document.querySelector("#bootstrap-theme af-field input")`,
};

type ContrastData = Record<"fgColor" | "bgColor" | "fontSize" | "fontWeight", string>;

/** axe's color-contrast check data; its types leave it untyped. */
function isContrastData(data: unknown): data is ContrastData {
  if (typeof data !== "object" || data === null) return false;
  const values: Record<string, unknown> = Object.fromEntries(Object.entries(data));
  return ["fgColor", "bgColor", "fontSize", "fontWeight"].every(
    (key) => typeof values[key] === "string",
  );
}

/**
 * Axe findings on the demo, one per element: contrast failures by colours and font, which the
 * theme decides, anything else by element selector. Admin gear menus are Angular-only.
 */
async function findings(
  page: Page,
  url: string,
  pair: Pick<Pair, "scope" | "ready" | "open">,
): Promise<string[]> {
  await page.goto(url);
  await page.waitForFunction(pair.ready);
  await page.waitForLoadState("networkidle");
  if (pair.open) {
    await page.locator(pair.open).focus();
    await page.keyboard.press("Enter");
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(pair.ready);
  }
  const { violations } = await new AxeBuilder({ page })
    .include(pair.scope)
    .exclude(".crm-admin-block-context-dropdown")
    .analyze();
  return violations.flatMap((violation) =>
    violation.nodes.map((node) => {
      const data: unknown = node.any[0]?.data;
      return violation.id === "color-contrast" && isContrastData(data)
        ? `color-contrast: ${data.fgColor} on ${data.bgColor}, ${data.fontSize} ${data.fontWeight}`
        : `${violation.id}: ${node.target.join(" ")}`;
    }),
  );
}

/** React's findings that Angular does not share as theme contrast. */
function ownFindings(react: string[], angular: string[]): string[] {
  const unmatched = [...angular];
  return react.filter((finding) => {
    const index = unmatched.indexOf(finding);
    if (index === -1 || !finding.startsWith("color-contrast:")) return true;
    unmatched.splice(index, 1);
    return false;
  });
}

async function attach(testInfo: TestInfo, react: string[], angular: string[]) {
  await testInfo.attach("findings.txt", {
    body: `React\n${react.join("\n")}\n\nAngular\n${angular.join("\n")}`,
    contentType: "text/plain",
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  for (const pair of PAIRS)
    test(`axe finds nothing on the React ${pair.name} beyond the theme contrast Angular shares (${colorScheme})`, async ({
      page,
    }, testInfo) => {
      await page.emulateMedia({ colorScheme });
      const react = await findings(page, pair.react, pair);
      const angular = await findings(page, pair.angular, pair);
      await attach(testInfo, react, angular);
      expect(ownFindings(react, angular), "React findings the Angular page does not share").toEqual(
        [],
      );
    });

  test(`axe finds nothing on a React ${TAKEOVER.name} beyond the theme contrast Angular shares (${colorScheme})`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme });
    try {
      await setReactForms(page, [TAKEOVER.form]);
      const react = await findings(page, TAKEOVER.url, TAKEOVER);
      await expect(page.locator(`afreact-form[name="${TAKEOVER.form}"]`)).toBeAttached();
      await setReactForms(page, []);
      const angular = await findings(page, TAKEOVER.url, TAKEOVER);
      await attach(testInfo, react, angular);
      expect(ownFindings(react, angular), "React findings the Angular page does not share").toEqual(
        [],
      );
    } finally {
      await setReactForms(page, []);
    }
  });

  test(`axe finds nothing on the support report (${colorScheme})`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await page.emulateMedia({ colorScheme });
    const report = await findings(page, "/civicrm/admin/afreact", {
      scope: ".afreact-support-page",
      ready: `/^Checked \\d+ forms/.test(document.querySelector(".afreact-support [role=status]")?.textContent ?? "")`,
    });
    await testInfo.attach("findings.txt", { body: report.join("\n"), contentType: "text/plain" });
    expect(report).toEqual([]);
  });
}
