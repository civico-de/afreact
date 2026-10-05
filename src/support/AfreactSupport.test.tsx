import { screen, within } from "@testing-library/react";
import { apiError, mockApi, renderWithQuery } from "../test/render";
import { AfreactSupport, checkedOptions, shownAt, takenOver } from "./AfreactSupport";
import { listedForms } from "./listed";

const forms = [
  {
    name: "afformPlaced",
    title: "Placed",
    "type:label": "Submission Form",
    server_route: "civicrm/placed",
    placement: ["contact_summary_tab"],
    "placement:label": ["Contact Summary Tab"],
  },
  {
    name: "afsearchGaps",
    title: null,
    "type:label": "Search Form",
    server_route: null,
    placement: null,
    "placement:label": null,
  },
  {
    name: "afformBroken",
    title: "Broken",
    "type:label": "Submission Form",
    server_route: null,
    placement: [],
    "placement:label": [],
  },
];
const layouts: Record<string, unknown[]> = {
  afformPlaced: [{ "#tag": "div", "#children": [{ "#text": "fine" }] }],
  afsearchGaps: [{ "#tag": "crm-search-display-batch" }, { "#tag": "crm-search-display-batch" }],
};

function renderReport(listed: string[], held?: Promise<void>) {
  const calls = mockApi({
    "Afform.get": () => forms,
    "Afreact.getForm": async ({ name }) => {
      if (name === "afformPlaced") await held;
      const layout = layouts[String(name)];
      if (!layout) throw apiError("Form broke");
      return [{ name, title: null, type: "form", layout }];
    },
  });
  renderWithQuery(<AfreactSupport listed={listed} settings="/civicrm/admin/setting/afreact" />);
  return calls;
}

const row = (name: string) => screen.getByRole("row", { name: new RegExp(name) });

describe("AfreactSupport", () => {
  it("lists every form but blocks with what React cannot show, from one check per form", async () => {
    const calls = renderReport(["afformPlaced"]);
    expect(
      await screen.findByText("Checked 3 forms: 1 with parts React cannot show yet, 1 not loaded."),
    ).toHaveAttribute("role", "status");
    expect(calls[0]?.params.where).toEqual([["type", "!=", "block"]]);
    expect(calls.filter(({ call }) => call === "Afreact.getForm")).toHaveLength(3);

    const placed = within(row("afformPlaced")).getAllByRole("cell");
    expect(placed.map((cell) => cell.textContent)).toEqual([
      "Submission Form",
      "civicrm/placed, Contact Summary Tab",
      "React",
      "Nothing",
      "React · Angular",
    ]);
    expect(within(row("afformPlaced")).getByRole("link", { name: "Angular" })).toHaveAttribute(
      "href",
      "/civicrm/afreact/render",
    );
    expect(within(row("afsearchGaps")).getAllByRole("listitem")).toHaveLength(1);
    expect(within(row("afsearchGaps")).getByRole("listitem")).toHaveTextContent(
      "<crm-search-display-batch>",
    );
    expect(within(row("afformBroken")).getByText("Form broke")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Choose the forms React renders" })).toHaveAttribute(
      "href",
      "/civicrm/admin/setting/afreact",
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows progress while forms are checked", async () => {
    let release = () => {};
    renderReport(
      [],
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    expect(await screen.findByRole("table")).toHaveAttribute("aria-busy", "true");
    expect(await screen.findByRole("progressbar", { name: "Checking forms" })).toHaveAttribute(
      "value",
      "2",
    );
    expect(within(row("afformPlaced")).getByText("Checking…")).toBeInTheDocument();
    release();
    await screen.findByText(/^Checked 3 forms/);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByRole("table")).toHaveAttribute("aria-busy", "false");
  });

  it("names listed forms that no longer exist", async () => {
    renderReport(["afformPlaced", "afformGone"]);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Listed in the settings but not found: afformGone",
    );
  });

  it("names the tasks of a display that React cannot run, from the server's task list", async () => {
    const table = (display: string, settings: Record<string, unknown>) => ({
      "#tag": "crm-search-display-table",
      "search-name": "Contacts",
      "display-name": display,
      settings: { columns: [], ...settings },
    });
    const layout = [
      { "#tag": "div", "#children": [table("All", { actions: true })] },
      table("Plain", {}),
      table("Linked", { columns: [{ type: "links", links: [{ task: "enable" }] }] }),
    ];
    const tasks = [
      { name: "enable", title: "Enable", number: "> 0", apiBatch: { action: "update" } },
      {
        name: "download",
        title: "Download",
        number: ">= 0",
        uiDialog: { templateUrl: "~/x.html" },
      },
    ];
    const calls = mockApi({
      "Afform.get": () => [forms[1]],
      "Afreact.getForm": ({ name }) => [{ name, title: null, type: "search", layout }],
      "SearchDisplay.getSearchTasks": () =>
        Object.assign(tasks, {
          editable: {
            entityInfo: { name: "Contact", title: "C", title_plural: "Cs", primary_key: ["id"] },
          },
        }),
    });
    renderWithQuery(<AfreactSupport listed={[]} settings="/s" />);
    await screen.findByText(/^Checked 1 forms: 1 with parts/);
    expect(within(row("afsearchGaps")).getByRole("listitem")).toHaveTextContent(
      "task download (Angular dialog ~/x.html)",
    );
    expect(
      calls
        .filter(({ call }) => call === "SearchDisplay.getSearchTasks")
        .map(({ params }) => params),
    ).toEqual([
      { savedSearch: "Contacts", display: "All" },
      { savedSearch: "Contacts", display: "Linked" },
    ]);
  });

  it("reports a failed form list", async () => {
    mockApi({
      "Afform.get": () => {
        throw apiError("No access");
      },
    });
    renderWithQuery(<AfreactSupport listed={[]} settings="/s" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No access");
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});

describe("shownAt", () => {
  it("lists the page route before the placements", () => {
    const [placed] = forms;
    if (!placed) throw new Error("fixture");
    expect(shownAt(placed)).toEqual(["civicrm/placed", "Contact Summary Tab"]);
    expect(shownAt({ ...placed, server_route: null, "placement:label": null })).toEqual([]);
  });
});

describe("checkedOptions and takenOver", () => {
  const [placed] = forms;
  if (!placed) throw new Error("fixture");
  const dashlet = { ...placed, server_route: null, placement: ["dashboard_dashlet"] };

  it("checks a form shown only inline with options, one with a page or not inline without", () => {
    expect(checkedOptions({ ...placed, server_route: null })).toEqual({});
    expect(checkedOptions(placed)).toBeUndefined();
    expect(checkedOptions(dashlet)).toBeUndefined();
    expect(checkedOptions({ ...placed, server_route: null, placement: [] })).toBeUndefined();
  });

  it("takes over a form's page, inline placements and dashlet", () => {
    expect(takenOver(placed)).toBe(true);
    expect(takenOver({ ...placed, server_route: null })).toBe(true);
    expect(takenOver(dashlet)).toBe(true);
    expect(takenOver({ ...placed, server_route: null, placement: [] })).toBe(false);
  });
});

describe("listedForms", () => {
  it("reads the setting's JSON list and rejects anything else", () => {
    expect(listedForms('["a","b"]')).toEqual(["a", "b"]);
    expect(() => listedForms('{"a":1}')).toThrow("JSON list of form names");
    expect(() => listedForms("[1]")).toThrow("JSON list of form names");
  });
});
