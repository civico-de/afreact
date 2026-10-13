import {
  cellClass,
  columnNote,
  hasControlColumn,
  headerClass,
  hiddenRows,
  isSortable,
  rowClass,
  runPage,
  startsCollapsed,
  unlabelledHeader,
  unsupportedFeatures,
  buildTree,
  fieldClass,
  sectionStarts,
  settingsOf,
  type TreeItem,
} from "./rows";
import { editInfo } from "../test/editInfo";
import type { Column, DisplaySettings, Row } from "./types";

const field: Column = { type: "field", key: "name" };
const base: DisplaySettings = { columns: [field] };

const row = (key: number, depth = 0, descendents = 0): Row => ({
  key,
  columns: [],
  data: { _depth: depth, _descendents: descendents },
});

describe("isSortable", () => {
  it("sorts fields and markup unless the column or a drag order says otherwise", () => {
    expect(isSortable(field, base)).toBe(true);
    expect(isSortable({ type: "html", key: "x" }, base)).toBe(true);
    expect(isSortable({ ...field, sortable: false }, base)).toBe(false);
    expect(isSortable({ type: "links" }, base)).toBe(false);
    expect(isSortable(field, { ...base, draggable: "weight" })).toBe(false);
  });
});

describe("headerClass", () => {
  it("adds sorting, alignment and unconditional css rules in core's order", () => {
    const column: Column = {
      ...field,
      alignment: "text-right",
      cssRules: [["font-bold"], ["text-danger", "x", "=", "y"]],
    };
    expect(headerClass(column, true)).toBe("crm-sortable-col text-right font-bold");
    expect(headerClass(field, false)).toBeUndefined();
  });
});

describe("unlabelledHeader", () => {
  // deviation:table-header-names
  it("names headers core leaves empty, and no others", () => {
    expect(unlabelledHeader({ type: "links", label: "" }, 3)).toBe("Actions");
    expect(unlabelledHeader({ type: "menu" }, 3)).toBe("Actions");
    expect(unlabelledHeader({ type: "field", key: "id" }, 3)).toBe("Column 4");
    expect(unlabelledHeader({ ...field, label: "Name" }, 0)).toBeNull();
  });
});

describe("row classes", () => {
  it("marks hierarchy depth, children and parents only in hierarchical displays", () => {
    const hierarchical = { ...base, hierarchical: true };
    expect(rowClass(row(1, 0, 2), hierarchical)).toBe(
      "crm-hierarchical-row crm-hierarchical-depth-0 crm-hierarchical-parent",
    );
    expect(rowClass(row(2, 1), hierarchical)).toBe(
      "crm-hierarchical-row crm-hierarchical-depth-1 crm-hierarchical-child",
    );
    expect(rowClass(row(1, 0, 2), base)).toBe("");
  });

  it("orders a cell's classes as crmSearchDisplayTableBody.html", () => {
    const styled: Row = { ...row(1, 1), cssClass: "bg-warning" };
    expect(cellClass(field, styled, { ...base, hierarchical: true }, "text-right")).toBe(
      "crm-search-col-type-field crm-hierarchical-row crm-hierarchical-depth-1 crm-hierarchical-child text-right bg-warning",
    );
    expect(cellClass(field, row(1), base, undefined)).toBe("crm-search-col-type-field");
  });
});

describe("collapsible rows", () => {
  it("adds a control column for collapsing or a tally label", () => {
    expect(hasControlColumn(base)).toBe(false);
    expect(hasControlColumn({ ...base, collapsible: "open" })).toBe(true);
    expect(hasControlColumn({ ...base, tally: { label: "Total" } })).toBe(true);
    expect(hasControlColumn({ ...base, tally: {} })).toBe(false);
    expect(hasControlColumn({ ...base, actions: true })).toBe(true);
    expect(hasControlColumn({ ...base, draggable: "weight" })).toBe(true);
    expect(hasControlColumn({ ...base, draggable: "" })).toBe(false);
  });

  it("starts rows with sub-rows closed only on collapsible: closed", () => {
    expect(startsCollapsed(row(1, 0, 2), { ...base, collapsible: "closed" })).toBe(true);
    expect(startsCollapsed(row(1, 0, 2), { ...base, collapsible: "open" })).toBe(false);
    expect(startsCollapsed(row(1), { ...base, collapsible: "closed" })).toBe(false);
  });

  it("hides the descendents of collapsed rows, skipping nested states", () => {
    const rows = [row(1, 0, 3), row(2, 1, 1), row(3, 2), row(4, 1), row(5, 0, 1), row(6, 1)];
    expect([...hiddenRows(rows, (r) => r.key === 1 || r.key === 2)]).toEqual([2, 3, 4]);
    expect([...hiddenRows(rows, (r) => r.key === 2 || r.key === 5)]).toEqual([3, 6]);
    expect(hiddenRows(rows, () => false).size).toBe(0);
  });
});

describe("unsupportedFeatures", () => {
  it("names nothing for a plain table", () => {
    expect(unsupportedFeatures(base)).toEqual([]);
  });

  it("names each feature the React table leaves out, with its setting", () => {
    const settings: DisplaySettings = {
      columns: [
        { ...field, editable: true },
        { type: "field", key: "email", editable: true },
      ],
      actions: true,
      editableRow: { create: true },
      draggable: "weight",
      hierarchical: true,
      button: "Search",
      toggleColumns: true,
    };
    const page = runPage(
      Object.assign([{ key: 1, columns: [{ links: [{ task: "delete" }, { url: "/x" }] }, null] }], {
        toolbar: [{ task: "enable" }],
        editable: {
          name: editInfo({ value_key: "name" }),
          "address_primary.geo_code_1": editInfo({ value_key: "geo", input_type: "Location" }),
        },
      }),
    );
    expect(unsupportedFeatures(settings, page)).toEqual([
      "in-place editing of address_primary.geo_code_1 (Location)",
      "new row: address_primary.geo_code_1 (Location)",
    ]);
  });

  it("names neither bulk actions nor their display mode; the tasks they offer are checked on load", () => {
    expect(
      unsupportedFeatures({ ...base, actions: ["delete"], actions_display_mode: "buttons" }),
    ).toEqual([]);
  });

  it("names nothing for a table as core's own displays store it", () => {
    const untyped = {
      nested: true,
      cssRules: [],
      columnMode: "fixed",
      addButton: { path: "civicrm/group/add", text: "Add Group" },
    };
    const settings: DisplaySettings = {
      columns: [{ ...field, label: "Name" }],
      limit: 25,
      sort: [["name", "ASC"]],
      pager: { show_count: true, hide_single: true, expose_limit: true },
      classes: ["table", "table-striped"],
      placeholder: 5,
      actions: false,
      actions_display_mode: "menu",
      draggable: "",
      editableRow: {},
      toolbar: [],
      headerCount: true,
      noResultsText: "",
      ...untyped,
    };
    expect(unsupportedFeatures(settings)).toEqual([]);
  });

  it("names any other setting with a value, and pager options alike", () => {
    const settings = {
      columns: [field],
      seeMore: true,
      futureFeature: "",
      pager: { show_count: true, jump: true, compact: false },
    };
    expect(unsupportedFeatures(settings)).toEqual(["setting seeMore", "setting pager.jump"]);
  });

  it("names the editors a full-row display lacks like a cell-by-cell one", () => {
    const page = runPage(
      Object.assign([], { editable: { e: editInfo({ value_key: "e", input_type: "Location" }) } }),
    );
    const settings = { columns: [field], editableRow: { full: true } };
    expect(unsupportedFeatures(settings, page)).toEqual(["in-place editing of e (Location)"]);
  });

  it("drops in-place editing when row editing switches it off", () => {
    const settings = { columns: [{ ...field, editable: true }], editableRow: { disable: true } };
    expect(unsupportedFeatures(settings)).toEqual([]);
  });
});

describe("columnNote", () => {
  it("names only the columns the table cannot render", () => {
    for (const type of ["field", "html", "image", "links", "buttons", "menu", "subsearch"])
      expect(columnNote({ type })).toBeNull();
    expect(columnNote({ type: "include", path: "~/x.html" })).toBe("include column ~/x.html");
    expect(
      columnNote({ type: "include", path: "~/afAdmin/afListPlacementColumn.html" }),
    ).toBeNull();
    expect(columnNote({ type: "chart" })).toBe("column type chart");
    expect(columnNote(undefined)).toBe("column type (none)");
  });
});

describe("runPage", () => {
  it("reads the toolbar, subsearch settings and filter labels CRM.api4 copies onto the rows", () => {
    const rows: Row[] = [row(1)];
    const subsearch = { "S.D": { type: "table", api_entity: "Email", settings: { columns: [] } } };
    const page = runPage(
      Object.assign(rows, { toolbar: [{ url: "/add", text: "Add" }], subsearch, labels: ["Ada"] }),
    );
    expect(page).toEqual({
      rows: [row(1)],
      toolbar: [{ url: "/add", text: "Add" }],
      subsearch,
      editable: {},
      labels: ["Ada"],
    });
  });

  it("reads the editable columns and drops those the server cannot edit", () => {
    const name = editInfo({ value_key: "name" });
    const page = runPage(Object.assign([], { editable: { name, email: null } }));
    expect(page.editable).toEqual({ name });
  });

  it("treats missing or malformed extras as none", () => {
    const malformed = { toolbar: "x", subsearch: { a: 1 }, editable: [], labels: [1, "Ada"] };
    expect(runPage(Object.assign([], malformed))).toEqual({
      rows: [],
      toolbar: [],
      subsearch: {},
      editable: {},
      labels: ["Ada"],
    });
    expect(runPage([])).toEqual({
      rows: [],
      toolbar: [],
      subsearch: {},
      editable: {},
      labels: [],
    });
  });
});

describe("display types", () => {
  it("drops the settings a type does not read, keeping the columns", () => {
    const settings: DisplaySettings = {
      columns: [field],
      limit: 5,
      actions: true,
      tally: { footer: true },
      pager: {},
      parent_field: "parent_id",
    };
    expect(settingsOf(settings, "table")).toBe(settings);
    expect(settingsOf(settings, "list")).toEqual({ columns: [field], limit: 5, pager: {} });
    expect(settingsOf(settings, "tree")).toEqual({
      columns: [field],
      limit: 5,
      parent_field: "parent_id",
    });
  });

  it("notes unknown settings for any type", () => {
    const settings = { ...base, draggable: "weight", seeMore: 1 };
    expect(unsupportedFeatures(settings, undefined, "list")).toEqual(["setting seeMore"]);
    expect(unsupportedFeatures(settings, undefined, "tree")).toEqual(["setting seeMore"]);
    expect(unsupportedFeatures({ ...base, colno: "3", style: "ol" })).toEqual([]);
  });

  it("classes a column inline unless it breaks the line", () => {
    expect(fieldClass(field, "nowrap")).toBe("nowrap crm-search-col-type-field crm-inline-block");
    expect(fieldClass({ ...field, break: true }, undefined)).toBe("crm-search-col-type-field");
  });

  it("builds a tree in result order, with rows of a missing or own parent at the top", () => {
    const at = (key: number, parent?: unknown): Row => ({
      key,
      columns: [],
      data: { parent_id: parent },
    });
    const keys = (items: TreeItem[]): unknown[] =>
      items.map((item) =>
        item.children.length ? [item.row.key, keys(item.children)] : item.row.key,
      );
    const rows = [at(1), at(2, 1), at(3, "1"), at(4, 2), at(5, 5), at(6, 42), at(7, { id: 1 })];
    expect(keys(buildTree(rows, "parent_id"))).toEqual([[1, [[2, [4]], 3]], 5, 6, 7]);
    expect(keys(buildTree(rows, undefined))).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("keeps every grouped row of a tree at the top, in result order", () => {
    const grouped = (kind: string): Row => ({ columns: [], data: { kind, parent_id: null } });
    const rows = [grouped("a"), grouped("b"), grouped("c")];
    const kinds = buildTree(rows, "parent_id").map((item) => item.row.data?.kind);
    expect(kinds).toEqual(["a", "b", "c"]);
  });

  // deviation:section-lists-by-content
  it("starts a section wherever the value changes, comparing lists by content", () => {
    const at = (key: number, kind: unknown): Row => ({ key, columns: [], data: { kind } });
    const rows = [at(1, ["a"]), at(2, ["a"]), at(3, null), at(4, undefined), at(5, "b")];
    expect([...sectionStarts(rows, "kind")].map(([start, value]) => [start.key, value])).toEqual([
      [1, ["a"]],
      [3, null],
      [5, "b"],
    ]);
    expect(sectionStarts(rows, undefined).size).toBe(0);
  });
});
