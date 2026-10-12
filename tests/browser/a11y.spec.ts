/**
 * The React pages must be as accessible as the Angular ones, in light and in dark mode. The
 * only axe findings allowed on it are contrast failures the Angular page (or, for the support
 * report, a core page) has with the same colours and font, i.e. the theme's. Findings are
 * reported without element content.
 */
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { isReady } from "../../src/compare/metrics";
import { axeFindings, ownFindings, setReactForms } from "./harness";

const render = (name: string) => (renderer: string) =>
  `/civicrm/afreact/render?name=${name}&renderer=${renderer}`;
const rules = render("afformAfreactDemoRules");
const features = render("afsearchAfreactDemoFeatures");
const types = render("afsearchAfreactDemoContactTypes");
const editable = render("afsearchAfreactDemoEditable");
const editableRow = render("afsearchAfreactDemoEditableRow");
const navTree = render("afsearchAfreactDemoNavTree");
const treeDrag = render("afsearchAfreactDemoTreeDrag");
const treeReady = `!!document.querySelector(".afreact-render .crm-search-display-tree li .crm-draggable")`;
const groups = (renderer: string) => `${render("afsearchManageGroups")(renderer)}#?title=a`;
// Rows, count and totals are in.
const tableReady = `!!document.querySelector(".afreact-render tbody tr[data-entity-id]") && !document.querySelector(".afreact-render .crm-search-loading-placeholder")`;
// The canvas shows the form's fields.
const editorReady = `!!document.querySelector("#afGuiEditor-canvas-body .af-gui-field")`;
interface Pair {
  name: string;
  react: string;
  angular: string;
  scope: string;
  /** A page expression that holds once the content is there. */
  ready: string;
  /** Opened with Enter before the check; the keyboard leaves no hover colours behind. */
  open?: Opener;
}

interface Opener {
  target: string;
  /** A page expression that holds once what the target opens has rendered and loaded. */
  ready: string;
  /** Opened with a click instead, where core answers no key (in-place editors). */
  click?: true;
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
    open: {
      target: ".afreact-render tbody tr:nth-child(1) .crm-search-col-type-menu button",
      ready: `!!document.querySelector(".afreact-render tbody tr:nth-child(1) .crm-search-col-type-menu button[aria-expanded=true]")`,
    },
  },
  {
    name: "table subsearch",
    react: features("react"),
    angular: features("angular"),
    scope: ".afreact-render",
    ready: tableReady,
    // The nested display loads on opening; its placeholder rows cover different outer rows.
    open: {
      target: ".afreact-render tbody tr:nth-child(2) .crm-search-col-type-subsearch summary",
      ready: `!!document.querySelector(".afreact-render details[open] tbody tr[data-entity-id]") && !document.querySelector(".afreact-render .crm-search-loading-placeholder")`,
    },
  },
  {
    name: "collapsible table",
    react: types("react"),
    angular: types("angular"),
    scope: ".afreact-render",
    ready: tableReady,
  },
  {
    name: "editable table with column picker",
    react: editable("react"),
    angular: editable("angular"),
    scope: ".afreact-render",
    ready: tableReady,
  },
  {
    name: "table editing a whole row",
    react: editableRow("react"),
    angular: editableRow("angular"),
    scope: ".afreact-render",
    ready: tableReady,
    open: {
      target:
        ".afreact-render tbody tr:nth-child(1) td[data-field-name=job_title] .crm-editable-enabled",
      ready: `document.querySelectorAll(".afreact-render crm-search-display-editable").length === 2`,
      click: true,
    },
  },
  {
    name: "hierarchical draggable table",
    react: navTree("react"),
    angular: navTree("angular"),
    scope: ".afreact-render",
    ready: tableReady,
  },
  {
    name: "draggable tree",
    react: treeDrag("react"),
    angular: treeDrag("angular"),
    scope: ".afreact-render",
    ready: treeReady,
  },
  {
    name: "filtered search",
    react: groups("react"),
    angular: groups("angular"),
    scope: ".afreact-render",
    // Filter fields and the rows of the first search, placeholders gone.
    ready: `!!document.querySelector(".afreact-render af-field input") && !!document.querySelector(".afreact-render tbody td") && !document.querySelector(".afreact-render .crm-search-loading-placeholder")`,
  },
  {
    name: "FormBuilder editor",
    react: "/civicrm/admin/afreact/afform#/edit/afformQuickAddIndividual",
    angular: "/civicrm/admin/afform#/edit/afformQuickAddIndividual",
    scope: "#afGuiEditor",
    ready: editorReady,
  },
  {
    name: "FormBuilder entity tab",
    react: "/civicrm/admin/afreact/afform#/edit/afformQuickAddIndividual",
    angular: "/civicrm/admin/afform#/edit/afformQuickAddIndividual",
    scope: "#afGuiEditor",
    ready: editorReady,
    // The third palette tab is the form's first entity, with its field list.
    open: {
      target: "#afGuiEditor-palette-config .panel-heading li:nth-child(3) > :is(a, button)",
      ready: `!!document.querySelector("#afGuiEditor-palette-config .panel-body .af-gui-palette-item")`,
      click: true,
    },
  },
  {
    name: "FormBuilder tab set",
    react: "/civicrm/admin/afreact/afform#/edit/afformAfreactDemoTabs",
    angular: "/civicrm/admin/afform#/edit/afformAfreactDemoTabs",
    scope: "#afGuiEditor",
    ready: editorReady,
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

/** Axe findings on the page at `url`, once `pair.ready` holds and `pair.open` has opened. */
async function findings(
  page: Page,
  url: string,
  pair: Pick<Pair, "scope" | "ready" | "open">,
): Promise<string[]> {
  await page.goto(url);
  await page.waitForFunction(pair.ready);
  await page.waitForLoadState("networkidle");
  if (pair.open) {
    if (pair.open.click) await page.locator(pair.open.target).click();
    else {
      await page.locator(pair.open.target).focus();
      await page.keyboard.press("Enter");
    }
    await page.waitForFunction(pair.open.ready);
  }
  return axeFindings(page, pair.scope);
}

async function attach(testInfo: TestInfo, react: string[], angular: string[]) {
  await testInfo.attach("findings.txt", {
    body: `React\n${react.join("\n")}\n\nAngular\n${angular.join("\n")}`,
    contentType: "text/plain",
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  for (const pair of PAIRS)
    // deviation:editor-tab-controls-outside
    test(`axe finds nothing on the React ${pair.name} beyond the theme contrast Angular shares (${colorScheme})`, async ({
      page,
    }, testInfo) => {
      // axe over the draggable tree takes about 20 s; a loaded runner needs room for a few times that.
      test.setTimeout(120_000);
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

  test(`axe finds nothing on the support report beyond the theme contrast core shares (${colorScheme})`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    await page.emulateMedia({ colorScheme });
    const report = await findings(page, "/civicrm/admin/afreact", {
      scope: ".afreact-support-page",
      ready: `/^Checked \\d+ forms/.test(document.querySelector(".afreact-support > p[role=status]")?.textContent ?? "")`,
    });
    // Core's settings form in the same theme: its Save button is the apply button's twin.
    const settings = await findings(page, "/civicrm/admin/setting/afreact", {
      scope: ".crm-container form",
      ready: `!!document.querySelector(".crm-container form .crm-button")`,
    });
    await attach(testInfo, report, settings);
    expect(ownFindings(report, settings), "findings the core settings form does not share").toEqual(
      [],
    );
  });
}
