/**
 * The React demo page must be as accessible as the Angular one, in light and in dark mode. The
 * only axe findings allowed on it are contrast failures the Angular page has with the same colours
 * and font, i.e. the theme's. Findings are reported without element content.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { isReady } from "../src/compare/metrics";

const PAGES = { react: "/civicrm/facade/demo", angular: "/civicrm/facade/angular" };

/**
 * Axe findings on the demo, one per element: contrast failures by colours and font, which the
 * theme decides, anything else by element selector. Admin gear menus are Angular-only.
 */
async function findings(page: Page, url: string): Promise<string[]> {
  await page.goto(url);
  await page.waitForFunction(`(${isReady.toString()})(document)`);
  await page.waitForLoadState("networkidle");
  const { violations } = await new AxeBuilder({ page })
    .include(".facade-demo")
    .exclude(".crm-admin-block-context-dropdown")
    .analyze();
  return violations.flatMap((violation) =>
    violation.nodes.map((node) => {
      const data = node.any[0]?.data as Record<string, string> | undefined;
      return violation.id === "color-contrast" && data
        ? `color-contrast: ${data.fgColor} on ${data.bgColor}, ${data.fontSize} ${data.fontWeight}`
        : `${violation.id}: ${node.target.join(" ")}`;
    }),
  );
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`axe finds nothing on the React page beyond the theme contrast Angular shares (${colorScheme})`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme });
    const react = await findings(page, PAGES.react);
    const angular = await findings(page, PAGES.angular);
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
