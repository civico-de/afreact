import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { editInfo } from "../test/editInfo";
import { apiError, mockApi, renderWithQuery } from "../test/render";
import { AfreactSearch } from "./AfreactSearch";
import type { Column, DisplaySettings, DisplayType, Row } from "./types";

const label: Column = { type: "field", key: "label", label: "Label" };
const columns: Column[] = [
  label,
  { type: "field", key: "name", label: "Name", break: true },
  { type: "links" },
];

const row = (key: number, data: Record<string, unknown> = {}, cssClass?: string): Row => ({
  key,
  cssClass,
  data: { id: key, ...data },
  columns: [
    { val: `Item ${String(key)}`, title: `About ${String(key)}`, cssClass: "nowrap" },
    { val: `name_${String(key)}`, label: "Name" },
    { links: [{ url: `/view/${String(key)}`, text: `View ${String(key)}` }] },
  ],
});

function show(
  type: DisplayType,
  settings: Partial<DisplaySettings>,
  rows: () => Row[] | Promise<Row[]>,
  extras: Record<string, unknown> = {},
) {
  const calls = mockApi({
    "SearchDisplay.run": async (params) => {
      if (params.return === "row_count") return Object.assign([], { count: 12 });
      return Object.assign(await rows(), extras);
    },
  });
  const view = renderWithQuery(
    <AfreactSearch search="S" display="D" type={type} settings={{ columns, ...settings }} />,
  );
  return { calls, ...view };
}

/** A reload, started by a popup form's success, that waits until released. */
function heldReload() {
  let started = false;
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    rows: async (rows: Row[]) => {
      if (started) await held;
      return rows;
    },
    start: (from: Element) => {
      started = true;
      from.dispatchEvent(new Event("crmPopupFormSuccess", { bubbles: true }));
    },
    release: () => {
      release();
    },
  };
}

const runs = (calls: { call: string; params: Record<string, unknown> }[]) =>
  calls.filter(({ call }) => call === "SearchDisplay.run").map(({ params }) => params.return);

describe("list display", () => {
  it("renders crmSearchDisplayList's items, labels and field classes", async () => {
    show("list", { classes: ["my-list"], symbol: "square" }, () => [row(1, {}, "bg-info")]);
    const item = (await screen.findByText("Item 1")).closest("li");
    expect(item).toHaveClass("crm-search-display-listitem bg-info");
    expect(item).toHaveAttribute("data-entity-id", "1");
    const list = screen.getByRole("list");
    expect(list.tagName).toBe("UL");
    expect(list).toHaveClass("crm-search-display-list-container");
    expect(list).toHaveStyle({ listStyle: "square" });
    expect(list.closest(".crm-search-display")).toHaveClass("crm-search-display-list my-list");
    const [first, second, links] = item ? [...item.children] : [];
    expect(first).toHaveClass("nowrap crm-search-col-type-field crm-inline-block");
    expect(first).toHaveAttribute("title", "About 1");
    expect(first?.querySelector("label")).toBeNull();
    // A column that breaks the line is not inline; the server sends the label it shows.
    expect(second).toHaveClass("crm-search-col-type-field");
    expect(second).not.toHaveClass("crm-inline-block");
    expect(second?.querySelector("label")).toHaveTextContent("Name");
    expect(within(links as HTMLElement).getByRole("link", { name: "View 1" })).toHaveAttribute(
      "href",
      "/view/1",
    );
  });

  it("numbers an ol list and shows placeholders while loading", async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    show("list", { style: "ol", placeholder: 2 }, async () => {
      await held;
      return [row(1)];
    });
    const list = screen.getByRole("list");
    expect(list.tagName).toBe("OL");
    expect(list).toHaveAttribute("aria-busy", "true");
    expect(list.querySelectorAll("li .crm-search-loading-placeholder")).toHaveLength(2);
    release();
    expect(await screen.findByText("Item 1")).toBeInTheDocument();
    expect(list).toHaveAttribute("aria-busy", "false");
  });

  it("starts a section with a heading wherever the grouped value changes", async () => {
    const kinds = ["A", "A", null, 0];
    const rows = kinds.map((kind, index) => row(index + 1, { kind }));
    show("list", { section_group_by: "kind", header_tag: "h3" }, () => rows);
    await screen.findByText("Item 4");
    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual(["A", "(none)", "0"]);
    expect(headings[0]).toHaveClass("crm-search-display-group-header");
    expect(headings[0]?.closest("li")).toHaveClass("crm-search-display-group-header-item");
    const items = [...screen.getByRole("list").children].map((child) => child.className);
    expect(items).toEqual([
      "crm-search-display-group-header-item",
      "crm-search-display-listitem",
      "crm-search-display-listitem",
      "crm-search-display-group-header-item",
      "crm-search-display-listitem",
      "crm-search-display-group-header-item",
      "crm-search-display-listitem",
    ]);
  });

  it("says when nothing is found, and leaves the text out when switched off", async () => {
    const { unmount } = show("list", { noResultsText: "Nothing here" }, () => []);
    const text = await screen.findByText("Nothing here");
    expect(text).toHaveClass("alert alert-info text-center");
    expect(text.parentElement).toHaveClass("crm-search-display-list-no-results");
    unmount();
    const { calls } = show("list", { noResultsText: false }, () => []);
    await waitFor(() => {
      expect(runs(calls)).toEqual(["page:1"]);
    });
    expect(screen.queryByText("None found.")).toBeNull();
  });

  it("shows the server's error where the rows would be", async () => {
    show("list", {}, () => {
      throw apiError("Query timed out");
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Query timed out");
    expect(screen.getByRole("alert")).toHaveClass("alert alert-warning text-center");
  });

  it("pages, with the header count and toolbar of the other types", async () => {
    const toolbar = [{ url: "/add", text: "Add", style: "primary" }];
    const { calls } = show(
      "list",
      { limit: 1, pager: {}, headerCount: true, toolbar: [{}], description: "About" },
      () => [row(1)],
      { toolbar },
    );
    expect(await screen.findByText("12 results")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add" })).toHaveClass("btn btn-primary");
    expect(screen.getByText("About")).toHaveClass("crm-search-display-description");
    await userEvent.click(screen.getByRole("link", { name: "2" }));
    await waitFor(() => {
      expect(runs(calls)).toContain("page:2");
    });
  });

  it("ignores the table's bulk actions and totals, as core's list template does", async () => {
    const { calls } = show(
      "list",
      {
        actions: true,
        tally: { footer: true },
        toggleColumns: true,
        editableRow: { create: true },
      },
      () => [row(1)],
    );
    await screen.findByText("Item 1");
    expect(calls.map(({ call }) => call)).toEqual(["SearchDisplay.run"]);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("runs an item's task link as the table does", async () => {
    const links = [{ task: "gone", text: "Gone" }];
    const entityInfo = { name: "OptionValue", title: "Option", title_plural: "Options" };
    mockApi({
      "SearchDisplay.run": () => [{ ...row(1), columns: [{ val: "Item 1" }, null, { links }] }],
      "SearchDisplay.getSearchTasks": () =>
        Object.assign([], { editable: { entityInfo: { ...entityInfo, primary_key: ["id"] } } }),
    });
    renderWithQuery(<AfreactSearch search="S" display="D" type="list" settings={{ columns }} />);
    await userEvent.click(await screen.findByRole("button", { name: "Gone" }));
    await waitFor(() => {
      expect(window.CRM.alert).toHaveBeenCalledWith(
        "Not supported by the React renderer: task gone (not offered for this display)",
        "Error",
        "error",
      );
    });
  });

  it("edits a cell in place as the table does", async () => {
    const editable = { label: editInfo({ value_key: "label" }) };
    const rows = () => [{ ...row(1), columns: [{ val: "Item 1", edit: true }] }];
    const calls = mockApi({
      "SearchDisplay.run": () => Object.assign(rows(), { editable }),
      "SearchDisplay.inlineEdit": () => [{ ...row(1), columns: [{ val: "Renamed" }] }],
    });
    renderWithQuery(
      <AfreactSearch search="S" display="D" type="list" settings={{ columns: [label] }} />,
    );
    await userEvent.click(await screen.findByRole("button", { name: /Edit Label/ }));
    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "Renamed{Enter}");
    expect(await screen.findByText("Renamed")).toBeInTheDocument();
    expect(calls.find(({ call }) => call === "SearchDisplay.inlineEdit")?.params).toMatchObject({
      rowKey: 1,
      values: { label: "Renamed" },
    });
  });
});

describe("grid display", () => {
  it("lays boxes out in colno columns and names them as a list", async () => {
    show("grid", { colno: "2", section_group_by: "kind" }, () => [row(1, { kind: "A" })]);
    const item = (await screen.findByText("Item 1")).closest("[data-entity-id]");
    expect(item).toHaveClass("crm-search-display-griditem");
    expect(item).toHaveAttribute("role", "listitem");
    const grid = screen.getByRole("list");
    expect(grid.tagName).toBe("DIV");
    expect(grid).toHaveClass("crm-search-display-grid-container crm-search-display-grid-layout-2");
    expect(screen.getByRole("heading", { level: 4, name: "A" }).parentElement).toHaveClass(
      "crm-search-display-grid-header-item",
    );
  });

  it("sizes its placeholders as crmSearchDisplayGridLoading does", () => {
    show("grid", { placeholder: 3 }, () => new Promise<Row[]>(() => {}));
    const boxes = screen.getAllByRole("listitem");
    expect(boxes).toHaveLength(3);
    expect(boxes[0]).toHaveStyle({ width: "100px", height: "50px" });
  });

  it("says when nothing is found in the grid's own class", async () => {
    show("grid", {}, () => []);
    expect((await screen.findByText("None found.")).parentElement).toHaveClass(
      "crm-search-display-grid-no-results",
    );
  });
});

describe("tree display", () => {
  const tree = () => [
    row(1),
    row(2, { parent_id: 1 }),
    row(3, { parent_id: 2 }),
    row(4),
    // Its parent is filtered out; core drops such a row.
    row(5, { parent_id: 99 }),
  ];
  const settings = { parent_field: "parent_id", collapsible: "closed" };

  const toggleOf = (key: number) =>
    screen
      .getByText(`Item ${String(key)}`)
      .closest("li")
      ?.querySelector("button");

  it("nests each row under its parent and keeps rows whose parent is missing", async () => {
    show("tree", { parent_field: "parent_id" }, tree);
    await screen.findByText("Item 1");
    const top = screen.getAllByRole("list")[0];
    expect(top).toHaveClass("crm-search-display-tree-branch");
    const items = top ? [...top.children].map((child) => child.getAttribute("data-entity-id")) : [];
    expect(items).toEqual(["1", "4", "5"]);
    const second = screen.getByText("Item 2").closest("li");
    expect(second?.parentElement?.closest("li")).toHaveAttribute("data-entity-id", "1");
    expect(screen.getByText("Item 3").closest("li")?.parentElement?.closest("li")).toBe(second);
    // Not collapsible: no toggles, every branch open.
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("opens and closes branches by button, with aria-expanded and the hidden count", async () => {
    show("tree", settings, tree);
    await screen.findByText("Item 1");
    expect(screen.queryByText("Item 2")).toBeNull();
    const toggle = toggleOf(1);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAccessibleName("1 sub-items");
    expect(toggle).toHaveClass("btn btn-xs crm-search-display-tree-collapse-toggle");
    expect(toggle?.closest("li")).toHaveClass("crm-search-display-tree-branch-collapsed");
    // A row without children keeps the button's space, hidden.
    expect(toggleOf(4)).toHaveStyle({ visibility: "hidden" });
    expect(toggleOf(4)).not.toHaveAttribute("aria-expanded");

    toggle?.focus();
    await userEvent.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle?.closest("li")).not.toHaveClass("crm-search-display-tree-branch-collapsed");
    expect(screen.getByText("Item 2")).toBeInTheDocument();
    await userEvent.keyboard(" ");
    expect(screen.queryByText("Item 2")).toBeNull();
  });

  it("starts open on collapsible open and keeps the open branches across a reload", async () => {
    const reload = heldReload();
    const { calls } = show("tree", { ...settings, collapsible: "open" }, () => reload.rows(tree()));
    await screen.findByText("Item 3");
    const toggle = toggleOf(2);
    await userEvent.click(toggle ?? document.body);
    expect(screen.queryByText("Item 3")).toBeNull();
    reload.start(screen.getByText("Item 1"));
    await waitFor(() => {
      expect(screen.queryByText("Item 1")).toBeNull();
    });
    reload.release();
    expect(await screen.findByText("Item 2")).toBeInTheDocument();
    expect(runs(calls)).toEqual(["page:1", "page:1"]);
    expect(screen.queryByText("Item 3")).toBeNull();
    // The focus goes back to the toggle it was on.
    expect(toggleOf(2)).toHaveFocus();
  });

  it("shows placeholders while loading and core's text when nothing is found", async () => {
    show("tree", { placeholder: 2 }, () => []);
    expect(document.querySelectorAll("li .crm-search-loading-placeholder")).toHaveLength(2);
    expect((await screen.findByText("None found.")).parentElement).toHaveClass(
      "crm-search-display-list-no-results",
    );
  });
});

describe("loaded display type", () => {
  it("renders the type the server names when the layout gives none", async () => {
    mockApi({
      "SearchDisplay.get": () => [{ label: "Things", type: "list", settings: { columns } }],
      "SearchDisplay.run": () => [row(1)],
    });
    renderWithQuery(<AfreactSearch search="S" display="D" />);
    expect(await screen.findByRole("list", { name: "Things" })).toHaveClass(
      "crm-search-display-list-container",
    );
  });

  it("names a type it does not render", async () => {
    mockApi({
      "SearchDisplay.get": () => [{ label: "Batch", type: "batch", settings: { columns } }],
    });
    renderWithQuery(<AfreactSearch search="S" display="D" />);
    expect(await screen.findByRole("note")).toHaveTextContent("display type batch");
  });
});

describe("focus across reloads", () => {
  it("returns the focus to the same control of the same row once the rows are back", async () => {
    let version = 1;
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    show("list", {}, async () => {
      if (version === 2) await held;
      return [row(1), { ...row(2), cssClass: `v${String(version)}` }];
    });
    const link = await screen.findByRole("link", { name: "View 2" });
    link.focus();
    version = 2;
    link.dispatchEvent(new Event("crmPopupFormSuccess", { bubbles: true }));
    await waitFor(() => {
      expect(document.querySelector(".crm-search-loading-placeholder")).not.toBeNull();
    });
    expect(link).not.toBeInTheDocument();
    release();
    await waitFor(() => {
      expect(screen.getByText("Item 2").closest("li")).toHaveClass("v2");
    });
    expect(screen.getByRole("link", { name: "View 2" })).toHaveFocus();
  });

  it("leaves a focus that moved elsewhere alone", async () => {
    const reload = heldReload();
    show("list", {}, () => reload.rows([row(1)]));
    const link = await screen.findByRole("link", { name: "View 1" });
    link.focus();
    const outside = document.createElement("button");
    document.body.append(outside);
    reload.start(link);
    await waitFor(() => {
      expect(link).not.toBeInTheDocument();
    });
    outside.focus();
    reload.release();
    const back = await screen.findByRole("link", { name: "View 1" });
    expect(back).not.toHaveFocus();
    expect(outside).toHaveFocus();
    outside.remove();
  });
});
