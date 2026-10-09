/**
 * A pie chart (chart_kit) of contacts per type: both renderers hand core's chart element the
 * same display and filters, so it must draw the same title, legend and slices.
 */
import { expect, test, type Page } from "@playwright/test";
import { AUTH, isRecord, quietApi, type Renderer } from "./harness";

const RUN = Date.now().toString(36);
const LOAD = { timeout: 30_000 };
const FORM = "afsearchAfreactChart";
const SEARCH = "Afreact_Chart";
const DISPLAY = "Afreact_Chart_Pie";
const SOURCE = `Chart ${RUN}`;
const render = (renderer: Renderer, hash = "") =>
  `/civicrm/afreact/render?name=${FORM}&renderer=${renderer}${hash}`;

let contacts: number[] = [];

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  // Saved by name, so a run cut short before its cleanup does not block the next.
  await quietApi(page, "SavedSearch", "save", {
    match: ["name"],
    records: [
      {
        name: SEARCH,
        label: SEARCH,
        api_entity: "Contact",
        api_params: {
          version: 4,
          select: ["contact_type:label", "COUNT(id) AS COUNT_id"],
          where: [["source", "=", SOURCE]],
          groupBy: ["contact_type"],
        },
      },
    ],
  });
  await quietApi(page, "SearchDisplay", "save", {
    match: ["name"],
    records: [
      {
        name: DISPLAY,
        label: DISPLAY,
        "saved_search_id.name": SEARCH,
        type: "chart-kit",
        settings: {
          chartType: "pie",
          showLegend: "left",
          maxSegments: 8,
          format: { title: "Contacts per type", height: 300, width: 500 },
          columns: [
            {
              axis: "x",
              key: "contact_type:label",
              scaleType: "categorical",
              reduceType: "list",
            },
            {
              axis: "y",
              key: "COUNT_id",
              scaleType: "numeric",
              reduceType: "sum",
              dataLabelType: "title",
            },
            {
              axis: "w",
              key: "contact_type:label",
              reduceType: "list",
              dataLabelType: "label",
            },
          ],
        },
      },
    ],
  });
  await quietApi(page, "Afform", "create", {
    values: {
      name: FORM,
      title: FORM,
      type: "search",
      layout:
        '<div af-fieldset=""><af-field name="contact_type"></af-field>' +
        `<crm-search-display-chart-kit search-name="${SEARCH}" display-name="${DISPLAY}">` +
        "</crm-search-display-chart-kit></div>",
    },
  });
  // The Angular module list is cached, so the page would not know the new form.
  await quietApi(page, "System", "flush", {});
  // Two individuals, one organization, one household: three slices of 2, 1 and 1.
  const created = await quietApi<{ id: number }>(page, "Contact", "save", {
    records: [
      {
        contact_type: "Individual",
        first_name: "Aa",
        last_name: RUN,
        source: SOURCE,
      },
      {
        contact_type: "Individual",
        first_name: "Bb",
        last_name: RUN,
        source: SOURCE,
      },
      {
        contact_type: "Organization",
        organization_name: `Org ${RUN}`,
        source: SOURCE,
      },
      {
        contact_type: "Household",
        household_name: `House ${RUN}`,
        source: SOURCE,
      },
    ],
  });
  contacts = created.map((contact) => contact.id);
  await context.close();
});

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: AUTH });
  const page = await context.newPage();
  try {
    if (contacts.length)
      await quietApi(page, "Contact", "delete", {
        where: [["id", "IN", contacts]],
        useTrash: false,
      });
  } finally {
    await quietApi(page, "Afform", "revert", { where: [["name", "=", FORM]] });
    await quietApi(page, "SavedSearch", "delete", {
      where: [["name", "=", SEARCH]],
    });
    await quietApi(page, "System", "flush", {});
    await context.close();
  }
});

/** What the chart drew: its title, legend entries and slice tooltips, each sorted. */
async function drawn(page: Page, slices: number) {
  const chart = page.locator(".afreact-render civi-search-display-chart-kit");
  await expect(chart.locator("svg g.pie-slice")).toHaveCount(slices, LOAD);
  const texts = async (selector: string) =>
    (await chart.locator(selector).allTextContents()).map((text) => text.trim()).sort();
  return {
    title: (await chart.locator(".crm-chart-kit-chart-title").textContent())?.trim(),
    legend: await texts(".dc-legend-item text"),
    slices: await texts("svg g.pie-slice title"),
  };
}

const isList = (value: unknown): value is unknown[] => Array.isArray(value);

/** The form each of the chart's searches named, so the server applies the form's filters. */
function formsAsked(page: Page): Set<unknown> {
  const forms = new Set<unknown>();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!url.pathname.includes("/civicrm/ajax/api4")) return;
    const query = new URLSearchParams(request.postData() ?? url.search);
    // A single call carries its params, a batch its calls by name.
    const single = url.pathname.endsWith("/SearchDisplay/run") ? [query.get("params")] : [];
    const batch: unknown = JSON.parse(query.get("calls") ?? "{}");
    const calls = isRecord(batch) ? Object.values(batch) : [];
    const params = [
      ...single.map((json): unknown => JSON.parse(json ?? "{}")),
      ...calls.flatMap((call) =>
        isList(call) && call[0] === "SearchDisplay" && call[1] === "run" ? [call[2]] : [],
      ),
    ];
    for (const param of params) forms.add(isRecord(param) ? param.afform : undefined);
  });
  return forms;
}

test("both renderers draw the same pie chart, with and without a filter", async ({ page }) => {
  const seen: Partial<Record<Renderer, unknown[]>> = {};
  const forms = formsAsked(page);
  for (const renderer of ["react", "angular"] as const) {
    forms.clear();
    await page.goto(render(renderer));
    const all = await drawn(page, 3);
    // Only the hash changes, so the open page takes the new filter as a live change.
    await page.goto(render(renderer, "#?contact_type=Individual"));
    const individuals = await drawn(page, 1);
    seen[renderer] = [all, individuals, [...forms]];
  }
  expect(seen.react).toEqual(seen.angular);
  expect(seen.react).toEqual([
    {
      title: "Contacts per type",
      legend: ["Household", "Individual", "Organization"],
      slices: ["1", "1", "2"],
    },
    { title: "Contacts per type", legend: ["Individual"], slices: ["2"] },
    [FORM],
  ]);
});
