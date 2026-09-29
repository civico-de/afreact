/**
 * The React pages must be as accessible as the Angular ones, in light and in dark mode. The
 * only axe findings allowed on it are contrast failures the Angular page has with the same colours
 * and font, i.e. the theme's. Findings are reported without element content.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { isReady } from "../../src/compare/metrics";

const rules = (renderer: string) =>
  `/civicrm/afreact/render?name=afformAfreactDemoRules&renderer=${renderer}`;
const PAIRS = [
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
];

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
async function findings(page: Page, url: string, pair: (typeof PAIRS)[number]): Promise<string[]> {
  await page.goto(url);
  await page.waitForFunction(pair.ready);
  await page.waitForLoadState("networkidle");
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

for (const pair of PAIRS)
  for (const colorScheme of ["light", "dark"] as const) {
    test(`axe finds nothing on the React ${pair.name} beyond the theme contrast Angular shares (${colorScheme})`, async ({
      page,
    }, testInfo) => {
      await page.emulateMedia({ colorScheme });
      const react = await findings(page, pair.react, pair);
      const angular = await findings(page, pair.angular, pair);
      await testInfo.attach("findings.txt", {
        body: `React\n${react.join("\n")}\n\nAngular\n${angular.join("\n")}`,
        contentType: "text/plain",
      });
      const unmatched = [...angular];
      const own = react.filter((finding) => {
        const index = unmatched.indexOf(finding);
        if (index === -1 || !finding.startsWith("color-contrast:")) return true;
        unmatched.splice(index, 1);
        return false;
      });
      expect(own, "React findings the Angular page does not share").toEqual([]);
    });
  }
