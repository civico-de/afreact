import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { mockApi, renderWithQuery } from "../test/render";
import { AfreactSearch } from "./AfreactSearch";
import type { Column, DisplaySettings, Row } from "./types";

const name: Column = { type: "field", key: "name", label: "Name" };
const others: Column[] = [
  { type: "html", key: "note", label: "Note" },
  { type: "links", label: "Links", sortable: false },
];
const columns = [name, ...others];

const row = (key: number, extra: Partial<Row> = {}): Row => ({
  key,
  columns: [
    { val: `Name ${String(key)}`, title: `About ${String(key)}`, cssClass: "text-right" },
    { val: `<em>${String(key)}</em>` },
    { links: [{ url: `/view/${String(key)}`, text: "View" }] },
  ],
  ...extra,
});

type Handler = (params: Record<string, unknown>) => unknown;

function runs(rows: () => Row[], extras: Record<string, unknown> = {}, tally: Handler = () => []) {
  return mockApi({
    "SearchDisplay.run": (params) => {
      if (params.return === "tally") return tally(params);
      if (params.return === "row_count") return Object.assign([], { count: 12 });
      return Object.assign(rows(), extras);
    },
  });
}

const kinds = (calls: { params: Record<string, unknown> }[]) =>
  calls.map(({ params }) => String(params.return));

describe("AfreactSearch table features", () => {
  it("renders cells with core's classes, titles and field names, sorting fields and markup", async () => {
    runs(() => [row(1, { cssClass: "bg-warning" })]);
    renderWithQuery(<AfreactSearch search="S" display="D" settings={{ columns }} />);
    const cell = (await screen.findByText("Name 1")).closest("td");
    expect(cell).toHaveClass("crm-search-col-type-field text-right bg-warning");
    expect(cell).toHaveAttribute("title", "About 1");
    expect(cell).toHaveAttribute("data-field-name", "name");
    expect(cell?.closest("tr")).toHaveAttribute("data-entity-id", "1");
    expect(
      screen
        .getAllByRole("columnheader")
        .map((header) => header.classList.contains("crm-sortable-col")),
    ).toEqual([true, true, false]);
  });

  it("spans the empty-result row across the header's cells, without hidden columns", async () => {
    runs(() => []);
    const tools = { column: () => null, end: null, endLabel: "Tools" };
    renderWithQuery(
      <AfreactSearch
        search="S"
        display="D"
        settings={{ columns, toggleColumns: true }}
        savedColumns={{ name: "Name" }}
        headerTools={tools}
      />,
    );
    const cell = (await screen.findByText(/./, { selector: ".alert-info" })).closest("td");
    const headers = screen.getAllByRole("columnheader");
    expect(headers).toHaveLength(2);
    expect(cell).toHaveAttribute("colspan", String(headers.length));
  });

  // deviation:keyless-rows
  it("renders grouped rows, which have no key, with an empty id and no selection or editing", async () => {
    const grouped = (val: string): Row => ({ columns: [{ val }, { val: "" }, { links: [] }] });
    runs(() => [grouped("Full"), grouped("Reduced")]);
    const settings = { columns, actions: true, editableRow: { full: true } };
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
    await screen.findByText("Reduced");
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((tr) => tr.getAttribute("data-entity-id"))).toEqual(["", ""]);
    expect(rows.flatMap((tr) => within(tr).queryAllByRole("checkbox"))).toEqual([]);
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("shows the description, header count and toolbar above the table", async () => {
    const toolbar = [
      { url: "/add", text: "Add", icon: "fa-plus", style: "primary", target: "crm-popup" },
      { text: "More", style: "default", children: [{ url: "/import", text: "Import" }] },
    ];
    runs(() => [row(1)], { toolbar });
    renderWithQuery(
      <AfreactSearch
        search="S"
        display="D"
        settings={{
          columns,
          description: "About these",
          headerCount: true,
          toolbar: [{}],
          limit: 1,
        }}
      />,
    );
    expect(await screen.findByText("12 results")).toBeInTheDocument();
    expect(screen.getByText("About these")).toHaveClass(
      "alert alert-info crm-search-display-description",
    );
    const add = screen.getByRole("link", { name: "Add" });
    expect(add).toHaveClass("btn btn-primary");
    expect(add).toHaveAttribute("target", "crm-popup");
    expect(add.closest(".form-group")).toHaveClass("pull-right");
    await userEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("menuitem", { name: "Import", hidden: true })).toHaveFocus();
  });

  it("loads totals after the rows and shows them in the header and footer rows", async () => {
    const calls = runs(
      () => [row(1)],
      {},
      () => [{ name: 3, note: ["a", "b"] }],
    );
    const settings: DisplaySettings = {
      columns: [{ ...name, tally: { fn: "COUNT", label: "Count:" } }, ...others],
      tally: { label: "Total", header: true },
    };
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
    await screen.findAllByText("Count: 3");
    const tallies = document.querySelectorAll("tr.crm-search-display-tally");
    expect(tallies).toHaveLength(2);
    expect(tallies[0]?.closest("thead")).not.toBeNull();
    expect(tallies[1]?.closest("tfoot")).not.toBeNull();
    expect([...(tallies[1]?.children ?? [])].map((td) => td.textContent)).toEqual([
      "Total",
      "Count: 3",
      " a, b",
      " ",
    ]);
    expect(kinds(calls)).toEqual(["page:1", "tally"]);
    expect(screen.getAllByRole("columnheader")[0]).toHaveTextContent("Total");
  });

  it("leaves out the footer totals when switched off", async () => {
    runs(
      () => [row(1)],
      {},
      () => [{}],
    );
    renderWithQuery(
      <AfreactSearch search="S" display="D" settings={{ columns, tally: { footer: false } }} />,
    );
    await screen.findByText("Name 1");
    expect(document.querySelector("tfoot")).toBeNull();
    expect(document.querySelector(".crm-search-display-tally")).toBeNull();
  });

  it("collapses sub-rows and toggles them with the row's button", async () => {
    const tree = [
      row(1, { data: { _depth: 0, _descendents: 2 } }),
      row(2, { data: { _depth: 1, _descendents: 1 } }),
      row(3, { data: { _depth: 2, _descendents: 0 } }),
      row(4, { data: { _depth: 0, _descendents: 0 } }),
    ];
    runs(() => tree);
    renderWithQuery(
      <AfreactSearch
        search="S"
        display="D"
        settings={{ columns, hierarchical: true, collapsible: "closed" }}
      />,
    );
    await screen.findByText("Name 1");
    expect(screen.queryByText("Name 2")).not.toBeInTheDocument();
    expect(screen.getAllByRole("columnheader")[0]).toHaveTextContent("Show sub-rows");
    // A row without sub-rows keeps an invisible toggle, which assistive technology skips.
    const toggles = [...document.querySelectorAll("button.crm-search-ctrl-toggle-row")];
    expect(screen.getAllByRole("button", { name: /Show sub-rows/ })).toEqual(toggles.slice(0, 1));
    expect(toggles.map((toggle) => toggle.textContent)).toEqual([
      " 2 Show sub-rows",
      "  Show sub-rows",
    ]);
    expect(toggles[1]).toHaveStyle({ visibility: "hidden" });
    expect(toggles[0]).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Name 1").closest("td")).toHaveClass(
      "crm-hierarchical-row crm-hierarchical-depth-0 crm-hierarchical-parent",
    );

    if (toggles[0]) await userEvent.click(toggles[0]);
    expect(screen.getByText("Name 2").closest("td")).toHaveClass("crm-hierarchical-child");
    expect(screen.queryByText("Name 3")).not.toBeInTheDocument();
    const nested = screen.getByText("Name 2").closest("tr")?.querySelector("button");
    if (nested) await userEvent.click(nested);
    expect(screen.getByText("Name 3")).toBeInTheDocument();
    if (toggles[0]) await userEvent.click(toggles[0]);
    expect(screen.queryByText("Name 2")).not.toBeInTheDocument();
    expect(screen.queryByText("Name 3")).not.toBeInTheDocument();
  });

  // deviation:table-rows-stay-open
  it("keeps the rows opened by hand open through a reload", async () => {
    const tree = () => [
      row(1, { data: { _depth: 0, _descendents: 1 } }),
      row(2, { data: { _depth: 1, _descendents: 0 } }),
      row(3, { data: { _depth: 0, _descendents: 1 } }),
      row(4, { data: { _depth: 1, _descendents: 0 } }),
    ];
    const calls = runs(tree);
    renderWithQuery(
      <AfreactSearch
        search="S"
        display="D"
        settings={{ columns, hierarchical: true, collapsible: "closed" }}
      />,
    );
    await screen.findByText("Name 1");
    await userEvent.click(screen.getAllByRole("button", { name: /Show sub-rows/ })[0]!);
    expect(screen.getByText("Name 2")).toBeInTheDocument();
    const before = calls.length;
    screen
      .getAllByRole("link", { name: "View" })[0]
      ?.dispatchEvent(new Event("crmPopupFormSuccess", { bubbles: true }));
    await waitFor(() => {
      expect(calls.length).toBeGreaterThan(before);
    });
    expect(await screen.findByText("Name 2")).toBeInTheDocument();
    expect(screen.queryByText("Name 4")).not.toBeInTheDocument();
  });

  it("reloads rows, count and totals when a popup form of the display succeeds", async () => {
    let version = 1;
    const calls = runs(
      () => [row(version)],
      {},
      () => [{}],
    );
    const { container } = renderWithQuery(
      <form>
        <AfreactSearch
          search="S"
          display="D"
          settings={{ columns, pager: {}, limit: 1, tally: {} }}
        />
      </form>,
    );
    await screen.findByText("Name 1");
    await waitFor(() => {
      expect(kinds(calls)).toEqual(["page:1", "row_count", "tally"]);
    });
    version = 2;
    const link = screen.getByRole("link", { name: "View" });
    link.dispatchEvent(new Event("crmPopupFormSuccess", { bubbles: true }));
    expect(await screen.findByText("Name 2")).toBeInTheDocument();
    await waitFor(() => {
      expect(kinds(calls).slice(3).sort()).toEqual(["page:1", "row_count", "tally"]);
    });
    container.querySelector("form")?.dispatchEvent(new Event("crmFormSuccess"));
    await waitFor(() => {
      expect(calls).toHaveLength(9);
    });
  });

  it("opens an autoOpen toolbar form when the first run finds nothing, and reloads after it", async () => {
    const opened = document.createElement("div");
    vi.mocked(window.CRM.loadForm).mockImplementation(() => window.CRM.$(opened));
    let found: Row[] = [];
    const calls = runs(() => found, {
      toolbar: [
        { url: "/add", text: "Add", autoOpen: true },
        { url: "/other", text: "Other" },
      ],
    });
    renderWithQuery(<AfreactSearch search="S" display="D" settings={{ columns }} />);
    expect(await screen.findByText("None found.")).toBeInTheDocument();
    expect(window.CRM.loadForm).toHaveBeenCalledExactlyOnceWith("/add");
    found = [row(1)];
    opened.dispatchEvent(new Event("crmFormSuccess"));
    expect(await screen.findByText("Name 1")).toBeInTheDocument();
    expect(window.CRM.loadForm).toHaveBeenCalledTimes(1);
    expect(kinds(calls)).toEqual(["page:1", "page:1"]);
  });

  it("names the features it leaves out in one note", async () => {
    runs(() => [row(1)]);
    const settings = { columns, actions: true, draggable: "weight", seeMore: true };
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
    await screen.findByText("Name 1");
    // Bulk actions render; their tasks load only once the menu is used.
    expect(screen.getByRole("note")).toHaveTextContent(/: setting seeMore$/);
    // A drag order switches header sorting off, as in core.
    expect(within(screen.getByRole("table")).queryAllByTitle(/Click to sort/)).toHaveLength(0);
  });

  it("shows no button for a toolbar task link, as core's toolbar.html", async () => {
    runs(() => [row(1)], { toolbar: [{ task: "enable", text: "Enable all", style: "default" }] });
    renderWithQuery(<AfreactSearch search="S" display="D" settings={{ columns, toolbar: [{}] }} />);
    await screen.findByText("Name 1");
    expect(screen.queryByText("Enable all")).not.toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("keeps the toolbar of the last run while the next page loads", async () => {
    let pages = 0;
    // The second page never answers, so the table stays busy.
    const stalled = new Promise<never>(() => {
      // Never settles.
    });
    const toolbar = [{ url: "/add", text: "Add", style: "primary", task: "enable" }];
    mockApi({
      "SearchDisplay.run": (params) => {
        if (params.return === "row_count") return Object.assign([], { count: 12 });
        pages += 1;
        if (pages > 1) return stalled;
        return Object.assign([row(1)], { toolbar });
      },
    });
    renderWithQuery(
      <AfreactSearch
        search="S"
        display="D"
        settings={{ columns, toolbar: [{}], limit: 1, pager: {} }}
      />,
    );
    await userEvent.click(await screen.findByRole("link", { name: "Next" }));
    await waitFor(() => expect(screen.getByRole("table")).toHaveAttribute("aria-busy", "true"));
    expect(screen.getByRole("link", { name: "Add" })).toBeInTheDocument();
  });

  it("hides the header row when asked", async () => {
    runs(() => [row(1)]);
    renderWithQuery(
      <AfreactSearch search="S" display="D" settings={{ columns, hideThead: true }} />,
    );
    await screen.findByText("Name 1");
    expect(document.querySelector("thead")).toHaveAttribute("hidden");
  });
});
