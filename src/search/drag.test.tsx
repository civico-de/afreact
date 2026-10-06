import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, type MockInstance } from "vitest";
import { editInfo } from "../test/editInfo";
import { apiError, mockApi, renderWithQuery } from "../test/render";
import { AfreactSearch } from "./AfreactSearch";
import type { Column, DisplaySettings, Row } from "./types";

const columns: Column[] = [
  { type: "field", key: "label", label: "Label" },
  { type: "field", key: "weight", label: "Order" },
];
const settings: DisplaySettings = { columns, draggable: "weight" };

const row = (key: number, weight = key): Row => ({
  key,
  columns: [{ val: `Name ${String(key)}` }, { val: weight }],
  data: { id: key, weight },
});

type Handler = (params: Record<string, unknown>) => unknown;

function serve(inlineEdit: Handler, rows = [row(1), row(2), row(3)]) {
  return mockApi({
    "SearchDisplay.run": () => rows,
    "SearchDisplay.inlineEdit": inlineEdit,
  });
}

const handle = (name: string) => screen.getByRole("button", { name: `Move ${name}` });
const shownOrder = () =>
  within(screen.getByRole("table"))
    .getAllByRole("row")
    .slice(1)
    .map((tr) => tr.getAttribute("data-entity-id"));
const orderColumn = () =>
  within(screen.getByRole("table"))
    .getAllByRole("row")
    .slice(1)
    .map((tr) => tr.querySelector('[data-field-name="weight"]')?.textContent?.trim());
// dnd-kit's live region, which it places in the document body.
const announced = () => document.querySelector('[id^="DndLiveRegion"]')?.textContent ?? "";

/** Moves a row with the keyboard sensor: pick up, `steps` arrow presses, drop. */
async function keyboardMove(name: string, steps: number) {
  handle(name).focus();
  await userEvent.keyboard("[Space]");
  for (let step = 0; step < Math.abs(steps); step++)
    await userEvent.keyboard(steps > 0 ? "[ArrowDown]" : "[ArrowUp]");
  await userEvent.keyboard("[Space]");
}

let rects: MockInstance;
beforeEach(() => {
  // jsdom lays nothing out; each table row gets a 40 px slot by its place in the body.
  rects = vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: HTMLElement) {
      const tr = this.closest("tr");
      const top = tr?.parentElement ? [...tr.parentElement.children].indexOf(tr) * 40 : 0;
      return new DOMRect(0, top, 600, 40);
    });
});
afterEach(() => {
  rects.mockRestore();
});

describe("AfreactSearch drag to reorder", () => {
  it("renders core's handle and header icon, with header sorting off", async () => {
    serve(() => ({}));
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
    const first = await screen.findByRole("button", { name: "Move Name 1" });
    expect(first).toHaveClass("crm-draggable");
    expect(first).toHaveAttribute("title", "Drag to reposition");
    expect(first).toHaveAttribute("tabindex", "0");
    expect(first.querySelector("i")).toHaveClass("crm-i", "fa-arrows-v");
    expect(first.closest("td")).toHaveClass("crm-search-ctrl-column");
    expect(screen.getAllByTitle("Drag to reposition")).toHaveLength(3);
    const header = screen.getAllByRole("columnheader")[0];
    expect(header?.querySelector(".fa-sort-amount-asc")).toHaveAttribute(
      "title",
      "Drag columns to reposition",
    );
    expect(screen.queryAllByTitle(/Click to sort/)).toHaveLength(0);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("renders no handle without a weight field", async () => {
    serve(() => ({}));
    renderWithQuery(<AfreactSearch search="S" display="D" settings={{ columns, draggable: "" }} />);
    await screen.findByText("Name 1");
    expect(screen.queryByTitle("Drag to reposition")).not.toBeInTheDocument();
    expect(screen.getAllByTitle(/Click to sort/)).toHaveLength(2);
    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
  });

  it("moves a row by keyboard, saves the displaced row's weight, takes the answer", async () => {
    let answer: (weights: unknown) => void = () => undefined;
    const calls = serve(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    renderWithQuery(
      <AfreactSearch search="S" display="D" afform="afsearchTest" settings={settings} />,
    );
    await screen.findByRole("button", { name: "Move Name 1" });
    await keyboardMove("Name 1", 1);

    await waitFor(() => {
      expect(shownOrder()).toEqual(["2", "1", "3"]);
    });
    expect(announced()).toBe("Name 1 dropped at position 2 of 3.");
    const edits = calls.filter(({ call }) => call === "SearchDisplay.inlineEdit");
    expect(edits).toHaveLength(1);
    expect(edits[0]?.params).toEqual({
      savedSearch: "S",
      display: "D",
      afform: "afsearchTest",
      filters: {},
      seed: expect.any(Number) as number,
      sort: [],
      limit: 0,
      return: "draggableWeight",
      rowKey: 1,
      values: { weight: 2 },
    });
    // No second move while the weights on the page are not final.
    expect(handle("Name 3")).toHaveAttribute("aria-disabled", "true");

    answer({ 1: 2, 2: 1 });
    await waitFor(() => {
      expect(orderColumn()).toEqual(["1", "2", "3"]);
    });
    expect(window.CRM.status).toHaveBeenCalledWith("Saved");
    expect(handle("Name 3")).toHaveAttribute("aria-disabled", "false");
    expect(handle("Name 1")).toHaveFocus();
    // Core takes the weights from the answer and runs no new search.
    expect(calls.filter(({ call }) => call === "SearchDisplay.run")).toHaveLength(1);
  });

  it("moves a row up by keyboard", async () => {
    const calls = serve(() => ({ 3: 1, 1: 2, 2: 3 }));
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
    await screen.findByRole("button", { name: "Move Name 3" });
    await keyboardMove("Name 3", -2);
    await waitFor(() => {
      expect(orderColumn()).toEqual(["1", "2", "3"]);
    });
    expect(shownOrder()).toEqual(["3", "1", "2"]);
    expect(calls.at(-1)?.params).toMatchObject({ rowKey: 3, values: { weight: 1 } });
  });

  it("puts the rows back and shows the error when saving fails", async () => {
    serve(() => {
      throw apiError("Cannot drag-sort 'Contact'.");
    });
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
    await screen.findByRole("button", { name: "Move Name 1" });
    await keyboardMove("Name 1", 2);
    expect(await screen.findByRole("alert")).toHaveTextContent("Cannot drag-sort 'Contact'.");
    expect(shownOrder()).toEqual(["1", "2", "3"]);
    expect(orderColumn()).toEqual(["1", "2", "3"]);
    expect(window.CRM.status).not.toHaveBeenCalled();
    expect(handle("Name 1")).toHaveAttribute("aria-disabled", "false");
  });

  it("keeps a cell saved during the move when the move fails", async () => {
    let fail: (error: unknown) => void = () => undefined;
    const editable = (key: number): Row => ({
      ...row(key),
      columns: [{ val: `Name ${String(key)}`, edit: true }, { val: key }],
      data: { id: key, weight: key, label: `Name ${String(key)}` },
    });
    mockApi({
      "SearchDisplay.run": () =>
        Object.assign([editable(1), editable(2), editable(3)], {
          editable: { label: editInfo({ value_key: "label" }) },
        }),
      "SearchDisplay.inlineEdit": (params) =>
        params.return === "draggableWeight"
          ? new Promise((_, reject) => {
              fail = reject;
            })
          : [{ ...editable(2), columns: [{ val: "Renamed", edit: true }, { val: 2 }] }],
    });
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
    await screen.findByRole("button", { name: "Move Name 1" });
    await keyboardMove("Name 1", 2);
    await waitFor(() => {
      expect(shownOrder()).toEqual(["2", "3", "1"]);
    });
    await userEvent.click(screen.getByRole("button", { name: "Edit Label Name 2" }));
    await userEvent.type(screen.getByRole("textbox"), "x{Enter}");
    await screen.findByRole("button", { name: "Edit Label Renamed" });
    fail(apiError("Cannot drag-sort 'Contact'."));
    expect(await screen.findByRole("alert")).toHaveTextContent("Cannot drag-sort 'Contact'.");
    expect(shownOrder()).toEqual(["1", "2", "3"]);
    expect(screen.getByRole("button", { name: "Edit Label Renamed" })).toBeInTheDocument();
  });

  it("puts the rows back when the server answers without weights", async () => {
    serve(() => null);
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
    await screen.findByRole("button", { name: "Move Name 1" });
    await keyboardMove("Name 1", 1);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "SearchDisplay.inlineEdit answered without weights.",
    );
    expect(shownOrder()).toEqual(["1", "2", "3"]);
  });

  it("saves nothing when the move is cancelled or ends where it started", async () => {
    const calls = serve(() => ({}));
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
    await screen.findByRole("button", { name: "Move Name 2" });
    handle("Name 2").focus();
    await userEvent.keyboard("[Space]");
    expect(announced()).toBe("Picked up Name 2, position 2 of 3.");
    await userEvent.keyboard("[ArrowDown]");
    expect(announced()).toBe("Name 2 moved to position 3 of 3.");
    await userEvent.keyboard("{Escape}");
    expect(announced()).toBe("Moving Name 2 was cancelled; it stays at position 2 of 3.");
    await keyboardMove("Name 2", 0);
    expect(shownOrder()).toEqual(["1", "2", "3"]);
    expect(calls.filter(({ call }) => call === "SearchDisplay.inlineEdit")).toHaveLength(0);
  });

  describe("in a hierarchical table", () => {
    const nested = (key: number, weight: number, _depth: number, _descendents = 0): Row => ({
      key,
      columns: [{ val: `Name ${String(key)}` }, { val: weight }],
      data: { id: key, weight, _depth, _descendents },
    });
    // 1 (10) > 2 (10); 3 (20); 4 (30) > 5 (10)
    const tree = [
      nested(1, 10, 0, 1),
      nested(2, 10, 1),
      nested(3, 20, 0),
      nested(4, 30, 0, 1),
      nested(5, 10, 1),
    ];
    const hierarchical: DisplaySettings = { ...settings, hierarchical: true };

    it("moves a row with its sub-rows past a sibling, taking the sibling's weight", async () => {
      const calls = serve(() => ({ 1: 20, 3: 10 }), tree);
      renderWithQuery(<AfreactSearch search="S" display="D" settings={hierarchical} />);
      await screen.findByRole("button", { name: "Move Name 1" });
      // Two steps down: over its own sub-row first, then over the sibling.
      await keyboardMove("Name 1", 2);
      await waitFor(() => {
        expect(shownOrder()).toEqual(["3", "1", "2", "4", "5"]);
      });
      const edits = calls.filter(({ call }) => call === "SearchDisplay.inlineEdit");
      expect(edits.map(({ params }) => [params.rowKey, params.values])).toEqual([
        [1, { weight: 20 }],
      ]);
      await waitFor(() => {
        expect(orderColumn()).toEqual(["10", "20", "10", "30", "10"]);
      });
    });

    it("leaves a row dropped under another parent where it is, and says so", async () => {
      const calls = serve(() => ({}), tree);
      renderWithQuery(<AfreactSearch search="S" display="D" settings={hierarchical} />);
      await screen.findByRole("button", { name: "Move Name 2" });
      await keyboardMove("Name 2", 3);
      await waitFor(() => {
        expect(window.CRM.alert).toHaveBeenCalledWith(
          "Name 2 stays where it is: a row moves among its siblings only.",
          "Not moved",
          "info",
        );
      });
      expect(shownOrder()).toEqual(["1", "2", "3", "4", "5"]);
      expect(calls.filter(({ call }) => call === "SearchDisplay.inlineEdit")).toHaveLength(0);
    });
  });

  it("keeps the selection column and the selection when rows move", async () => {
    serve(() => ({ 1: 2, 2: 1 }));
    renderWithQuery(
      <AfreactSearch search="S" display="D" settings={{ ...settings, actions: true }} />,
    );
    await screen.findByRole("button", { name: "Move Name 1" });
    const box = screen.getByRole("checkbox", { name: "Select Name 2" });
    expect(box.closest("td")).toBe(handle("Name 2").closest("td"));
    await userEvent.click(box);
    await keyboardMove("Name 1", 1);
    await waitFor(() => {
      expect(shownOrder()).toEqual(["2", "1", "3"]);
    });
    expect(screen.getByRole("checkbox", { name: "Select Name 2" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select Name 1" })).not.toBeChecked();
    expect(screen.getAllByRole("columnheader")[0]).toHaveClass("crm-search-result-select");
  });
});
