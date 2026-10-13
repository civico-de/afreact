/**
 * The React demo page must look like the Angular one: both renderers emit core's markup, so
 * elements pair up by selector. Each pair must match in position, size and the styles below;
 * differences that follow from design choices are listed in BY_DESIGN with their reason.
 */
import { expect, test, type Page } from "@playwright/test";
import { isReady } from "../../src/compare/metrics";
import { api } from "./harness";

const PAGES = { react: "/civicrm/afreact/demo", angular: "/civicrm/afreact/angular" };
const TOLERANCE_PX = 2;
const STYLES = [
  "font-size",
  "font-weight",
  "color",
  "background-color",
  "border-top-width",
  "border-top-color",
  "padding-top",
  "padding-left",
] as const;

/** Parts of the page, in document order per selector; `text` is read only from UI chrome. */
const PARTS: { name: string; selector: string; text?: boolean }[] = [
  { name: "heading", selector: ".afreact-demo h2", text: true },
  { name: "title", selector: ".af-title", text: true },
  { name: "field", selector: "af-field" },
  { name: "label", selector: "label.crm-af-field-label", text: true },
  {
    name: "control",
    selector:
      ".crm-af-field :is(input.form-control:not(.crm-form-date), select, .select2-choice, textarea, input[type=radio], input[type=checkbox])",
  },
  { name: "date", selector: "input.crm-form-date" },
  { name: "clear", selector: ".crm-hover-button" },
  { name: "add button", selector: ".af-repeat-add-btn", text: true },
  { name: "submit", selector: ".af-button", text: true },
  { name: "table", selector: ".crm-search-display-table table" },
  { name: "column", selector: "thead th", text: true },
  { name: "sort icon", selector: "thead th .crm-i" },
  { name: "row", selector: "tbody tr" },
  { name: "pager", selector: ".crm-search-display-pager" },
  { name: "result count", selector: ".crm-search-display-pager label", text: true },
  { name: "page link", selector: ".pagination > li > *", text: true },
];

/** Differences the renderers keep on purpose: part name or key => aspects to skip, and why. */
const BY_DESIGN: Record<string, { skip: string[]; reason: string }> = {
  date: {
    skip: ["width"],
    reason: "the native date field shows its format and calendar icon, wider than the datepicker's",
  },
  "clear 1": { skip: ["x"], reason: "the date's clear link follows the wider date field" },
  // Core's date range links its datepickers before afField fills their options, so Angular adds
  // a time input to each bound of a date-only range (see docs/upstream-bugs.md).
  "control 12": { skip: ["presence"], reason: "Angular's time input on the range's lower bound" },
  "control 13": { skip: ["presence"], reason: "Angular's time input on the range's upper bound" },
  "date 3": {
    skip: ["x", "width"],
    reason:
      "the range's upper bound follows Angular's time input or stands on React's second slot, and is the wider native date field",
  },
  "clear 3": { skip: ["x"], reason: "the lower bound's clear link follows Angular's time input" },
  "clear 4": {
    skip: ["x"],
    reason:
      "the upper bound's clear link follows Angular's time input or stands on React's second slot",
  },
};

/** Up to 6.19 the theme warns on an untouched required select; from 6.20 only on a changed one, as React does. */
const BEFORE_6_20: typeof BY_DESIGN = {
  "control 5": {
    skip: ["border-top-color"],
    reason: "the untouched required select has no warning border in React",
  },
};

interface Measured {
  key: string;
  text: string;
  box: { x: number; y: number; width: number; height: number };
  style: Record<string, string>;
}

async function measure(page: Page, url: string): Promise<Measured[]> {
  await page.goto(url);
  await page.waitForFunction(`(${isReady.toString()})(document)`);
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    // React's form layout moves blocks on purpose and design.spec.ts pins it; this compares the rest.
    for (const link of document.querySelectorAll<HTMLLinkElement>(
      'link[href*="/css/afreact-form.css"]',
    ))
      link.disabled = true;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    await document.fonts.ready;
  });
  return page.evaluate(
    ({ parts, styles }) => {
      const origin = document.querySelector(".afreact-demo")!.getBoundingClientRect();
      // Screen-reader-only labels differ between the renderers without being seen, and a closed
      // popover menu is in React's markup but not in Angular's.
      const visibleText = (element: HTMLElement) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const texts: string[] = [];
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const parent = node.parentElement;
          if (!parent || parent.closest(".sr-only") || !parent.getClientRects().length) continue;
          texts.push(node.textContent ?? "");
        }
        return texts.join("").replace(/\s+/g, " ").trim();
      };
      return parts.flatMap(({ name, selector, text }) =>
        [...document.querySelectorAll<HTMLElement>(selector)]
          // Hidden inputs behind select2 and the datepicker have no box.
          .filter((element) => element.getClientRects().length > 0)
          .map((element, index) => {
            const rect = element.getBoundingClientRect();
            const computed = getComputedStyle(element);
            return {
              key: `${name} ${index + 1}`,
              text: text ? visibleText(element) : "",
              box: {
                x: Math.round(rect.x - origin.x),
                y: Math.round(rect.y - origin.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
              },
              style: Object.fromEntries(
                styles.map((style) => [style, computed.getPropertyValue(style)]),
              ),
            };
          }),
      );
    },
    { parts: PARTS, styles: [...STYLES] },
  );
}

/** Differences per pair; those BY_DESIGN excuses are left out and their entry noted as used. */
function differences(
  react: Measured[],
  angular: Measured[],
  byDesign: typeof BY_DESIGN,
  used: Set<string>,
): string[] {
  const found: string[] = [];
  const byKey = new Map(angular.map((part) => [part.key, part]));
  for (const key of new Set([...react.map((part) => part.key), ...byKey.keys()])) {
    const r = react.find((part) => part.key === key);
    const a = byKey.get(key);
    const entry = key in byDesign ? key : key.replace(/ \d+$/, "");
    const label = a?.text ? `${key} "${a.text}"` : key;
    const report = (aspect: string, message: string) => {
      if (byDesign[entry]?.skip.includes(aspect)) used.add(entry);
      else found.push(`${label}: ${message}`);
    };
    if (!r || !a) {
      report("presence", `only in ${r ? "React" : "Angular"}`);
      continue;
    }
    if (r.text !== a.text) report("text", `text "${r.text}" vs "${a.text}"`);
    for (const side of ["x", "y", "width", "height"] as const) {
      if (Math.abs(r.box[side] - a.box[side]) > TOLERANCE_PX)
        report(side, `${side} ${r.box[side]} vs ${a.box[side]}`);
    }
    for (const style of STYLES) {
      if (r.style[style] !== a.style[style])
        report(style, `${style} ${r.style[style]} vs ${a.style[style]}`);
    }
  }
  return found;
}

test("the React page looks like the Angular page", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const measured = { react: await measure(page, PAGES.react), angular: [] as Measured[] };
  await testInfo.attach("react.png", { body: await shot(page), contentType: "image/png" });
  measured.angular = await measure(page, PAGES.angular);
  await testInfo.attach("angular.png", { body: await shot(page), contentType: "image/png" });

  const used = new Set<string>();
  // Core's own extensions carry core's version.
  const [afform] = await api<{ version: string }>(page, "Extension", "get", {
    select: ["version"],
    where: [["key", "=", "org.civicrm.afform"]],
  });
  const [major = 0, minor = 0] = afform!.version.split(".").map(Number);
  const byDesign = major === 6 && minor < 20 ? { ...BY_DESIGN, ...BEFORE_6_20 } : BY_DESIGN;
  const found = differences(measured.react, measured.angular, byDesign, used);
  await testInfo.attach("differences.txt", { body: found.join("\n"), contentType: "text/plain" });
  expect(measured.react.length).toBeGreaterThan(30);
  expect(found, "React vs Angular (React first)").toEqual([]);
  // An exception that excuses nothing would hide the next regression of that part.
  expect(Object.keys(byDesign).filter((entry) => !used.has(entry))).toEqual([]);
});

/** Contact rows stay out of the report. */
function shot(page: Page): Promise<Buffer> {
  const demo = page.locator(".afreact-demo");
  return demo.screenshot({ mask: [demo.locator("tbody")], animations: "disabled" });
}
