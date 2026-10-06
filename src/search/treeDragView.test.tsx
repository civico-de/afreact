import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, type MockInstance } from "vitest";
import { apiError, mockApi, renderWithQuery } from "../test/render";
import { AfreactSearch } from "./AfreactSearch";
import type { Column, DisplaySettings, Row } from "./types";

const columns: Column[] = [
  { type: "field", key: "label", label: "Label" },
  { type: "field", key: "weight", label: "Order" },
];
const settings: DisplaySettings = { columns, draggable: "weight", parent_field: "parent_id" };

const item = (key: number, weight: number, parent_id: number | null = null): Row => ({
  key,
  columns: [{ val: `Item ${String(key)}` }, { val: weight }],
  data: { id: key, weight, parent_id },
});
// 1 (10) > 2 (10); 3 (20); 4 (30) > 5 (10)
const tree = [item(1, 10), item(2, 10, 1), item(3, 20), item(4, 30), item(5, 10, 4)];

type Handler = (params: Record<string, unknown>) => unknown;

function serve(inlineEdit: Handler, rows = tree) {
  return mockApi({
    "SearchDisplay.run": () => rows,
    "SearchDisplay.inlineEdit": inlineEdit,
  });
}

const handle = (name: string) => screen.getByRole("button", { name: `Move ${name}` });
/** Each item with the item it hangs under. */
const shown = () =>
  [...document.querySelectorAll("li[data-entity-id]")].map((li) => [
    li.getAttribute("data-entity-id"),
    li.parentElement?.closest("li")?.getAttribute("data-entity-id") ?? null,
  ]);
const announced = () => document.querySelector('[id^="DndLiveRegion"]')?.textContent ?? "";

async function keyboardMove(name: string, steps: number) {
  handle(name).focus();
  await userEvent.keyboard("[Space]");
  for (let step = 0; step < Math.abs(steps); step++)
    await userEvent.keyboard(steps > 0 ? "[ArrowDown]" : "[ArrowUp]");
  await userEvent.keyboard("[Space]");
}

let rects: MockInstance;
beforeEach(() => {
  // jsdom lays nothing out; every list item, slots included, gets a 40 px row in document order.
  rects = vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: HTMLElement) {
      const li = this.closest("li");
      const all = [...document.querySelectorAll("li")];
      const top = li ? all.indexOf(li) * 40 : 0;
      return new DOMRect(0, top, 600, 40);
    });
});
afterEach(() => {
  rects.mockRestore();
});

describe("tree display drag to reorder", () => {
  it("renders core's handle on each item and a drop slot at the top of each branch", async () => {
    serve(() => ({}));
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} type="tree" />);
    const first = await screen.findByRole("button", { name: "Move Item 1" });
    expect(first).toHaveClass("crm-draggable", "crm-inline-block");
    expect(first.querySelector("i")).toHaveClass("crm-i", "fa-arrows");
    expect(first.closest("li")).toHaveAttribute("data-entity-id", "1");
    expect(screen.queryByRole("note")).toBeNull();
    // One slot per branch, each leaf's empty branch included.
    expect(document.querySelectorAll("li.afreact-tree-slot")).toHaveLength(6);
  });

  it("steps up by keyboard to the first place and saves weight and parent", async () => {
    const calls = serve(() => ({ 3: 10, 1: 20 }));
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} type="tree" />);
    await screen.findByRole("button", { name: "Move Item 3" });
    handle("Item 3").focus();
    await userEvent.keyboard("[Space]");
    expect(announced()).toBe("Picked up Item 3.");
    // Up: over Item 2's empty slot, over Item 2, over Item 1's slot, over Item 1, the top slot.
    await userEvent.keyboard("[ArrowUp]");
    expect(announced()).toBe("Item 3 moved first under Item 2.");
    await userEvent.keyboard("[ArrowUp]");
    expect(announced()).toBe("Item 3 moved after Item 2.");
    await userEvent.keyboard("[ArrowUp]");
    expect(announced()).toBe("Item 3 moved first under Item 1.");
    await userEvent.keyboard("[ArrowUp]");
    expect(announced()).toBe("Item 3 moved after Item 1.");
    await userEvent.keyboard("[ArrowUp]");
    expect(announced()).toBe("Item 3 moved to the first place.");
    await userEvent.keyboard("[Space]");
    expect(announced()).toBe("Item 3 dropped to the first place.");
    await waitFor(() => {
      expect(shown()).toEqual([
        ["3", null],
        ["1", null],
        ["2", "1"],
        ["4", null],
        ["5", "4"],
      ]);
    });
    const edits = calls.filter(({ call }) => call === "SearchDisplay.inlineEdit");
    expect(edits.map(({ params }) => [params.return, params.rowKey, params.values])).toEqual([
      ["draggableWeight", 3, { weight: 10, parent_id: null }],
    ]);
    await waitFor(() => {
      const cells = screen.getByText("Item 3").closest("li")?.querySelectorAll(":scope > div");
      expect(cells?.[1]?.textContent?.trim()).toBe("10");
    });
  });

  it("hangs an item under another by dropping it on that item's first place", async () => {
    const calls = serve(() => ({ 3: 1 }));
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} type="tree" />);
    await screen.findByRole("button", { name: "Move Item 3" });
    // Item 3's own slot is not rendered while it drags: Down goes to Item 4, then to its slot.
    await keyboardMove("Item 3", 2);
    await waitFor(() => {
      expect(shown()).toEqual([
        ["1", null],
        ["2", "1"],
        ["4", null],
        ["3", "4"],
        ["5", "4"],
      ]);
    });
    expect(announced()).toBe("Item 3 dropped first under Item 4.");
    const edits = calls.filter(({ call }) => call === "SearchDisplay.inlineEdit");
    expect(edits.map(({ params }) => [params.rowKey, params.values])).toEqual([
      [3, { weight: 10, parent_id: 4 }],
    ]);
  });

  it("leaves the branch under a dragged item out and does not save a drop in place", async () => {
    const calls = serve(() => ({}));
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} type="tree" />);
    await screen.findByRole("button", { name: "Move Item 1" });
    handle("Item 1").focus();
    await userEvent.keyboard("[Space]");
    expect(screen.queryByText("Item 2")).toBeNull();
    // Down over Item 3, up past its own line to the top slot: its place already.
    await userEvent.keyboard("[ArrowDown]");
    expect(announced()).toBe("Item 1 moved after Item 3.");
    await userEvent.keyboard("[ArrowUp]");
    expect(announced()).toBe("Item 1 moved to the first place.");
    await userEvent.keyboard("[Space]");
    expect(screen.getByText("Item 2")).toBeInTheDocument();
    expect(shown()[0]).toEqual(["1", null]);
    expect(calls.filter(({ call }) => call === "SearchDisplay.inlineEdit")).toHaveLength(0);
  });

  it("refuses, without failing, a target whose line cannot be computed", async () => {
    const calls = serve(() => ({}), [...tree, { key: 9, columns: [{ val: "Item 9" }], data: { id: 9 } }]);
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} type="tree" />);
    await screen.findByRole("button", { name: "Move Item 9" });
    // Down from Item 5 over Item 9, which has no weight: refused, the drop names the defect.
    await keyboardMove("Item 5", 1);
    expect(announced()).toBe("Item 5 cannot move there.");
    expect(screen.getByRole("alert")).toHaveTextContent("Row 9 has no weight.");
    expect(shown().map(([key]) => key)).toEqual(["1", "2", "3", "4", "5", "9"]);
    expect(calls.filter(({ call }) => call === "SearchDisplay.inlineEdit")).toHaveLength(0);
  });

  it("drops an item after one whose parent is not on the page, both at the top", async () => {
    const calls = serve(() => ({ 3: 5 }), [...tree, item(8, 5, 42)]);
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} type="tree" />);
    await screen.findByRole("button", { name: "Move Item 8" });
    // Down from Item 3: over Item 4, its slot, Item 5, its slot, Item 8.
    await keyboardMove("Item 3", 5);
    expect(announced()).toBe("Item 3 dropped after Item 8.");
    await waitFor(() => {
      expect(shown().map(([key]) => key)).toEqual(["1", "2", "4", "5", "8", "3"]);
    });
    const edits = calls.filter(({ call }) => call === "SearchDisplay.inlineEdit");
    expect(edits.map(({ params }) => [params.rowKey, params.values])).toEqual([
      [3, { weight: 5, parent_id: null }],
    ]);
  });

  it("puts the item and its parent back when the save fails", async () => {
    serve(() => {
      throw apiError("Nope");
    });
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} type="tree" />);
    await screen.findByRole("button", { name: "Move Item 3" });
    await keyboardMove("Item 3", 2);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Nope");
    });
    expect(shown()).toEqual([
      ["1", null],
      ["2", "1"],
      ["3", null],
      ["4", null],
      ["5", "4"],
    ]);
  });
});
