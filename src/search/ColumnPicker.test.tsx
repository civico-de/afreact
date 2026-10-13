import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { listParam, mockApi, renderWithQuery } from "../test/render";
import { AfreactSearch } from "./AfreactSearch";
import {
  columnToggleLabel,
  hiddenBySavedSet,
  savedColumnsOf,
  toggleColumnsParam,
} from "./ColumnPicker";
import type { Column, DisplaySettings } from "./types";

const columns: Column[] = [
  { type: "field", key: "sort_name", label: "Name" },
  { type: "field", key: "email" },
  { type: "links" },
  { type: "html", label: "Notes" },
];

describe("column picker helpers", () => {
  // deviation:column-picker-position-label
  it("labels columns as getColumnToggleLabel(), numbering the last case", () => {
    expect(columns.map(columnToggleLabel)).toEqual(["Name", "[email]", "Links", "Notes"]);
    expect(columnToggleLabel({ type: "menu" }, 0)).toBe("Menu");
    expect(columnToggleLabel({ type: "buttons" }, 0)).toBe("Buttons");
    expect(columnToggleLabel({ type: "include" }, 4)).toBe("Column 5");
  });

  it("reads a saved set's columns of one display", () => {
    const saved = { "S.D": { email: "[email]", Notes: "Notes" }, "S.Other": { x: "X" } };
    expect(savedColumnsOf(saved, "S.D")).toEqual({ email: "[email]", Notes: "Notes" });
    expect(savedColumnsOf(saved, "S.None")).toEqual({});
    expect(savedColumnsOf([], "S.D")).toEqual({});
    expect(savedColumnsOf(null, "S.D")).toEqual({});
  });

  it("hides what a saved set leaves out, matched by key and then by label", () => {
    expect(hiddenBySavedSet(columns, { email: "[email]", Notes: "Notes" })).toEqual(
      new Set([0, 2]),
    );
    expect(hiddenBySavedSet(columns, { removed: "Gone", Links: "Links" })).toEqual(
      new Set([0, 1, 3]),
    );
    expect(hiddenBySavedSet(columns, {})).toEqual(new Set());
  });

  it("asks for the shown columns only while one is hidden", () => {
    expect(toggleColumnsParam(columns, new Set())).toEqual({});
    expect(toggleColumnsParam(columns, new Set([1, 3]))).toEqual({ toggleColumns: [0, 2] });
    expect(toggleColumnsParam(columns, new Set([0, 1, 2, 3]))).toEqual({ toggleColumns: [] });
  });
});

const settings: DisplaySettings = {
  columns: [
    { type: "field", key: "sort_name", label: "Name" },
    { type: "field", key: "email", label: "Email" },
    { type: "field", key: "phone", label: "Phone" },
  ],
  limit: 1,
  pager: {},
  toggleColumns: true,
  tally: { footer: true },
};

function setup(savedColumns?: Record<string, string>, savedSet: string | null = null) {
  const calls = mockApi({
    "SearchDisplay.run": (params) => {
      if (params.return === "row_count") return Object.assign([], { count: 2 });
      if (params.return === "tally") return [{ sort_name: "2" }];
      const shown =
        params.toggleColumns === undefined ? [0, 1, 2] : listParam(params.toggleColumns);
      const page = String(params.return);
      return [
        {
          key: page,
          columns: ["Ada", "a@example.org", "123"].map((val, index) =>
            shown.includes(index) ? { val: `${val} ${page}` } : null,
          ),
        },
      ];
    },
  });
  const view = (set: string | null) => (
    <AfreactSearch
      search="S"
      display="D"
      settings={settings}
      savedColumns={savedColumns}
      savedSet={set}
    />
  );
  const { rerender } = renderWithQuery(view(savedSet));
  const pages = () =>
    calls
      .filter(({ params }) => String(params.return).startsWith("page:"))
      .map(({ params }) => [params.return, params.toggleColumns]);
  const select = (set: string | null) => {
    rerender(view(set));
  };
  return { pages, select };
}

const headers = () =>
  screen.getAllByRole("columnheader").map((header) => header.textContent.trim());
const box = (name: string) => screen.getByRole("checkbox", { name });

describe("ColumnPicker", () => {
  it("shows core's disclosure only with toggleColumns", async () => {
    setup();
    await screen.findByText("Ada page:1");
    const picker = screen.getByText("Pick Columns").closest("details");
    if (!picker) throw new Error("no picker");
    const labels = within(picker)
      .getAllByRole("checkbox")
      .map((input) => input.closest("label")?.textContent);
    expect(labels).toEqual([" Name", " Email", " Phone"]);
    expect(within(picker).getByRole("button", { name: "All" })).toHaveAttribute(
      "title",
      "Select All",
    );
    expect(within(picker).getByRole("button", { name: "None" })).toHaveAttribute(
      "title",
      "Select None",
    );
  });

  it("hides a column without a new run, and later runs leave it out", async () => {
    const { pages } = setup();
    await screen.findByText("Ada page:1");
    await userEvent.click(box("Email"));
    expect(headers()).toEqual(["Name", "Phone"]);
    expect(screen.queryByText("a@example.org page:1")).not.toBeInTheDocument();
    expect(document.querySelectorAll("tfoot td")).toHaveLength(2);
    // Showing it again needs no run: the first one fetched it.
    await userEvent.click(box("Email"));
    expect(screen.getByText("a@example.org page:1")).toBeInTheDocument();
    await userEvent.click(box("Email"));
    await userEvent.click(screen.getByRole("link", { name: /Next/ }));
    await screen.findByText("Ada page:2");
    expect(pages()).toEqual([
      ["page:1", undefined],
      ["page:2", [0, 2]],
    ]);
    // Page 2 left Email out, so showing it runs again with all columns.
    await userEvent.click(box("Email"));
    await screen.findByText("a@example.org page:2");
    expect(pages()).toEqual([
      ["page:1", undefined],
      ["page:2", [0, 2]],
      ["page:2", undefined],
    ]);
  });

  it("hides all with None and shows all with All", async () => {
    setup();
    await screen.findByText("Ada page:1");
    await userEvent.click(screen.getByRole("button", { name: "None" }));
    expect(screen.queryAllByRole("columnheader")).toEqual([]);
    for (const name of ["Name", "Email", "Phone"]) expect(box(name)).not.toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "All" }));
    expect(headers()).toEqual(["Name", "Email", "Phone"]);
  });

  it("starts from a saved set's columns, asking only for those", async () => {
    const { pages } = setup({ phone: "Phone", Name: "Name" });
    await screen.findByText("Ada page:1");
    expect(headers()).toEqual(["Name", "Phone"]);
    expect(box("Email")).not.toBeChecked();
    await waitFor(() => {
      expect(pages()).toEqual([["page:1", [0, 2]]]);
    });
  });

  it("shows the set's columns again when another set is chosen, as onAfformReset() does", async () => {
    const { select } = setup({}, "1");
    await screen.findByText("Ada page:1");
    await userEvent.click(box("Email"));
    expect(headers()).toEqual(["Name", "Phone"]);
    select("2");
    expect(headers()).toEqual(["Name", "Email", "Phone"]);
  });
});
