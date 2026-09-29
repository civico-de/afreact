import {
  cellClass,
  hasControlColumn,
  headerClass,
  hiddenRows,
  isSortable,
  rowClass,
  runPage,
  startsCollapsed,
  unsupportedFeatures,
} from "./rows";
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
      button: "Search",
      toggleColumns: true,
    };
    const page = runPage(
      Object.assign([{ key: 1, columns: [{ links: [{ task: "delete" }, { url: "/x" }] }, null] }], {
        toolbar: [{ task: "enable" }],
      }),
    );
    expect(unsupportedFeatures(settings, page)).toEqual([
      "bulk actions (actions)",
      "in-place editing (editable: name, email)",
      "row editing (editableRow)",
      "drag to reorder (draggable)",
      "search button (button)",
      "column picker (toggleColumns)",
      "task links (enable, delete)",
    ]);
  });

  it("drops in-place editing when row editing switches it off", () => {
    const settings = { columns: [{ ...field, editable: true }], editableRow: { disable: true } };
    expect(unsupportedFeatures(settings)).toEqual([]);
  });
});

describe("runPage", () => {
  it("reads the toolbar and subsearch settings CRM.api4 copies onto the rows", () => {
    const rows: Row[] = [row(1)];
    const subsearch = { "S.D": { type: "table", api_entity: "Email", settings: { columns: [] } } };
    const page = runPage(
      Object.assign(rows, { toolbar: [{ url: "/add", text: "Add" }], subsearch }),
    );
    expect(page).toEqual({ rows: [row(1)], toolbar: [{ url: "/add", text: "Add" }], subsearch });
  });

  it("treats missing or malformed extras as none", () => {
    expect(runPage(Object.assign([], { toolbar: "x", subsearch: { a: 1 } }))).toEqual({
      rows: [],
      toolbar: [],
      subsearch: {},
    });
    expect(runPage([])).toEqual({ rows: [], toolbar: [], subsearch: {} });
  });
});
