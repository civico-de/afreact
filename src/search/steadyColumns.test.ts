import { renderHook } from "@testing-library/react";
import { resized } from "../test/resize";
import { useSteadyColumns } from "./steadyColumns";

// jsdom lays nothing out: a cell is as wide as its rows make it, or its min-width if that is more.
// Its 5px padding counts towards the min-width unless it sizes the border box.
const natural = new Map<Element, number>();
let boxSizing = "border-box";
let room: HTMLDivElement;
let table: HTMLTableElement;
let cells: HTMLTableCellElement[];
const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;
/** Paints the next frame: runs the callbacks requested so far. */
const paint = () => {
  const requested = [...frames.values()];
  frames.clear();
  for (const callback of requested) callback(0);
};

/** The room the table has, as wide as `width`. */
const widen = (width: number) => {
  Object.defineProperty(room, "clientWidth", { configurable: true, value: width });
};

const box = (width: number): DOMRect => ({
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  bottom: 0,
  right: width,
  height: 0,
  width,
  toJSON: () => ({}),
});

beforeEach(() => {
  boxSizing = "border-box";
  room = document.createElement("div");
  widen(500);
  table = room.appendChild(document.createElement("table"));
  const row = table.createTHead().insertRow();
  cells = [row.insertCell(), row.insertCell()];
  for (const cell of cells) {
    cell.getBoundingClientRect = () => {
      const min = parseFloat(cell.style.minWidth);
      const edges = boxSizing === "border-box" ? 0 : 10;
      return box(Math.max(natural.get(cell) ?? 0, Number.isNaN(min) ? 0 : min + edges));
    };
  }
  table.getBoundingClientRect = () =>
    box(cells.reduce((sum, cell) => sum + cell.getBoundingClientRect().width, 0));
  frames.clear();
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    nextFrame += 1;
    frames.set(nextFrame, callback);
    return nextFrame;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((frame) => {
    frames.delete(frame);
  });
  vi.spyOn(window, "getComputedStyle").mockImplementation(() => {
    const style = document.createElement("div").style;
    style.boxSizing = boxSizing;
    style.padding = "0 5px";
    style.borderWidth = "0";
    return style;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  natural.clear();
});

const show = (...widths: number[]) => {
  for (const [index, cell] of cells.entries()) natural.set(cell, widths[index] ?? 0);
};
const minWidths = () => cells.map((cell) => cell.style.minWidth);

// deviation:steady-column-widths
it("keeps each column at the widest width a page gave it, until other filters or other room", () => {
  show(100, 50);
  const initialProps: { reset: string; rows: unknown } = { reset: "a", rows: [1] };
  const { rerender, unmount } = renderHook(
    ({ reset, rows }: { reset: string; rows: unknown }) => {
      useSteadyColumns(table, reset, rows);
    },
    { initialProps },
  );
  expect(minWidths()).toEqual(["100px", "50px"]);

  show(60, 80);
  rerender({ reset: "a", rows: [2] });
  expect(minWidths()).toEqual(["100px", "80px"]);

  // While a page loads, placeholders stand in for rows and are not measured.
  show(200, 200);
  rerender({ reset: "a", rows: undefined });
  expect(minWidths()).toEqual(["100px", "80px"]);

  show(60, 40);
  rerender({ reset: "b", rows: [3] });
  expect(minWidths()).toEqual(["60px", "40px"]);

  // The room grows taller with the rows, which leaves the columns alone.
  show(10, 10);
  resized(room);
  expect(minWidths()).toEqual(["60px", "40px"]);

  // Other room while a page loads lets go of the columns, in the next frame; the rows that come set them again.
  show(200, 200);
  rerender({ reset: "b", rows: undefined });
  widen(450);
  resized(room);
  expect(minWidths()).toEqual(["60px", "40px"]);
  paint();
  expect(minWidths()).toEqual(["", ""]);
  show(30, 30);
  rerender({ reset: "b", rows: [4] });
  expect(minWidths()).toEqual(["30px", "30px"]);

  // Other room lets the columns fit the rows on show.
  show(20, 20);
  widen(400);
  resized(room);
  paint();
  expect(minWidths()).toEqual(["20px", "20px"]);

  // A frame requested before unmounting does not run after it.
  show(10, 10);
  widen(350);
  resized(room);
  unmount();
  widen(300);
  resized(room);
  paint();
  expect(minWidths()).toEqual(["20px", "20px"]);
});

it("lets the columns fit anew when kept widths would push the table past its room", () => {
  show(300, 200);
  const initialProps: { rows: unknown } = { rows: [1] };
  const { rerender } = renderHook(
    ({ rows }: { rows: unknown }) => {
      useSteadyColumns(table, "a", rows);
    },
    { initialProps },
  );
  expect(minWidths()).toEqual(["300px", "200px"]);

  // Within its room the table grows with a column that needs more.
  show(250, 180);
  rerender({ rows: [2] });
  expect(minWidths()).toEqual(["300px", "200px"]);

  // Past its room of 500 pixels, the columns fit the page's rows instead.
  show(320, 150);
  rerender({ rows: [3] });
  expect(minWidths()).toEqual(["320px", "150px"]);
});

it("holds a column whose padding is outside its width at the width it shows", () => {
  boxSizing = "content-box";
  show(100, 50);
  renderHook(() => {
    useSteadyColumns(table, "a", [1]);
  });
  expect(minWidths()).toEqual(["90px", "40px"]);
  expect(cells.map((cell) => cell.getBoundingClientRect().width)).toEqual([100, 50]);
});
