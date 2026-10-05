import {
  isSelected,
  NO_SELECTION,
  resultCount,
  selectionState,
  selectPage,
  toggleRow,
  type Selection,
} from "./selection";

const page = [1, 2, 3, 4, 5];
const some = (...keys: number[]): Selection => ({ keys, all: false });

describe("selectPage", () => {
  it("selects the page's rows, and all rows when the page holds every row", () => {
    expect(selectPage(page, 20)).toEqual(some(1, 2, 3, 4, 5));
    expect(selectPage(page, 5)).toEqual({ keys: page, all: true });
    expect(selectPage([1, 1, 2], null)).toEqual(some(1, 2));
  });
});

describe("toggleRow", () => {
  it("adds and removes a row, and an unselected row clears all", () => {
    expect(toggleRow(NO_SELECTION, page, 3, false, 20)).toEqual(some(3));
    expect(toggleRow(some(3, 4), page, 3, false, 20)).toEqual(some(4));
    expect(toggleRow({ keys: [3], all: true }, page, 3, false, 1)).toEqual(some());
  });

  it("selects all once the last row is added", () => {
    expect(toggleRow(some(1), [1, 2], 2, false, 2)).toEqual({ keys: [1, 2], all: true });
  });

  it("selects the range to the nearest selected row with Shift", () => {
    expect(toggleRow(some(1), page, 4, true, 20)).toEqual(some(1, 2, 3, 4));
    expect(toggleRow(some(5), page, 2, true, 20)).toEqual(some(5, 3, 4, 2));
    expect(toggleRow(NO_SELECTION, page, 4, true, 20)).toEqual(some(4));
    expect(toggleRow(some(1), page, 4, false, 20)).toEqual(some(1, 4));
  });

  it("chooses the side of the row selected last when selected rows are on both sides", () => {
    expect(toggleRow(some(1, 5), page, 3, true, 20)).toEqual(some(1, 5, 4, 3));
    expect(toggleRow(some(5, 1), page, 3, true, 20)).toEqual(some(5, 1, 2, 3));
  });

  it("selects only the row when the row selected last is on another page", () => {
    expect(toggleRow(some(1, 5, 9), page, 3, true, 20)).toEqual(some(1, 5, 9, 3));
  });
});

describe("selectionState and isSelected", () => {
  it("reads none, some and all", () => {
    expect(selectionState(NO_SELECTION)).toBe("none");
    expect(selectionState(some(2))).toBe("some");
    expect(selectionState({ keys: [], all: true })).toBe("all");
    expect(isSelected(some(2), 2)).toBe(true);
    expect(isSelected(some(2), 3)).toBe(false);
    expect(isSelected({ keys: [], all: true }, 3)).toBe(true);
  });
});

describe("resultCount", () => {
  it("counts results and the selected ones, as ResultCount.html", () => {
    expect(resultCount(1, 0)).toBe("1 result");
    expect(resultCount(1, 1)).toBe("1 selected of 1 result");
    expect(resultCount(7, 0)).toBe("7 results");
    expect(resultCount(7, 2)).toBe("2 selected of 7 results");
  });
});
