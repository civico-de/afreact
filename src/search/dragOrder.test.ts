import { dragField, moveRow, withWeights } from "./dragOrder";
import type { Column, Row } from "./types";

const row = (key: number, weight?: number): Row => ({
  key,
  columns: [{ val: `Name ${String(key)}` }, { val: weight }],
  data: weight === undefined ? {} : { weight },
});
const keys = (rows: Row[]) => rows.map((each) => each.key);

describe("dragField", () => {
  it("names the weight field of a draggable table", () => {
    expect(dragField({ columns: [], draggable: "weight" })).toBe("weight");
    expect(dragField({ columns: [], draggable: "" })).toBeNull();
    expect(dragField({ columns: [], draggable: false })).toBeNull();
    expect(dragField({ columns: [] })).toBeNull();
    expect(dragField({ columns: [], draggable: "weight", hierarchical: true })).toBe("weight");
  });
});

describe("moveRow", () => {
  const rows = [row(1, 10), row(2, 20), row(3, 30), row(4, 40)];

  it("moves a row down to the place of the row it displaces and takes that row's weight", () => {
    const moved = moveRow(rows, 1, 3, "weight");
    expect(keys(moved?.rows ?? [])).toEqual([2, 3, 1, 4]);
    expect(moved?.weight).toBe(30);
  });

  it("moves a row up the same way", () => {
    const moved = moveRow(rows, 4, 2, "weight");
    expect(keys(moved?.rows ?? [])).toEqual([1, 4, 2, 3]);
    expect(moved?.weight).toBe(20);
    expect(keys(rows)).toEqual([1, 2, 3, 4]);
  });

  describe("in a hierarchical table", () => {
    const nested = (key: number, weight: number, _depth: number, _descendents = 0): Row => ({
      key,
      columns: [{ val: `Name ${String(key)}` }, { val: weight }],
      data: { weight, _depth, _descendents },
    });
    // 1 (10) > 2 (10), 3 (20) > 4 (10); 5 (20); 6 (30) > 7 (10)
    const tree = [
      nested(1, 10, 0, 3),
      nested(2, 10, 1),
      nested(3, 20, 1, 1),
      nested(4, 10, 2),
      nested(5, 20, 0),
      nested(6, 30, 0, 1),
      nested(7, 10, 1),
    ];

    // deviation:tree-table-drag-with-subrows
    it("moves a row with its sub-rows down past a sibling's, taking the sibling's weight", () => {
      const moved = moveRow(tree, 1, 6, "weight", true);
      expect(keys(moved?.rows ?? [])).toEqual([5, 6, 7, 1, 2, 3, 4]);
      expect(moved?.weight).toBe(30);
    });

    it("moves a row with its sub-rows up before a sibling's", () => {
      const moved = moveRow(tree, 6, 1, "weight", true);
      expect(keys(moved?.rows ?? [])).toEqual([6, 7, 1, 2, 3, 4, 5]);
      expect(moved?.weight).toBe(10);
    });

    it("moves sub-rows among their own siblings, up and down", () => {
      const up = moveRow(tree, 3, 2, "weight", true);
      expect(keys(up?.rows ?? [])).toEqual([1, 3, 4, 2, 5, 6, 7]);
      expect(up?.weight).toBe(10);
      const down = moveRow(tree, 2, 3, "weight", true);
      expect(keys(down?.rows ?? [])).toEqual([1, 3, 4, 2, 5, 6, 7]);
      expect(down?.weight).toBe(20);
    });

    it("takes a drop on a sibling's sub-row for the sibling", () => {
      const moved = moveRow(tree, 1, 7, "weight", true);
      expect(keys(moved?.rows ?? [])).toEqual([5, 6, 7, 1, 2, 3, 4]);
      expect(moved?.weight).toBe(30);
      const before = moveRow(tree, 5, 4, "weight", true);
      expect(keys(before?.rows ?? [])).toEqual([5, 1, 2, 3, 4, 6, 7]);
      expect(before?.weight).toBe(10);
    });

    it("changes nothing on a drop on the row itself or its own sub-row", () => {
      expect(moveRow(tree, 1, 1, "weight", true)?.rows).toBe(tree);
      expect(moveRow(tree, 1, 4, "weight", true)?.rows).toBe(tree);
      expect(moveRow(rows, 2, 2, "weight")?.rows).toBe(rows);
    });

    it("refuses a move under another parent or to another depth", () => {
      expect(moveRow(tree, 2, 7, "weight", true)).toBeNull();
      expect(moveRow(tree, 4, 2, "weight", true)).toBeNull();
      expect(moveRow(tree, 4, 5, "weight", true)).toBeNull();
      expect(keys(tree)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it("moves a block the page cuts off", () => {
      const cut = [nested(21, 10, 0), nested(22, 20, 0, 5), nested(23, 10, 1)];
      expect(keys(moveRow(cut, 22, 21, "weight", true)?.rows ?? [])).toEqual([22, 23, 21]);
    });
  });

  it("refuses a row that is not on the page or a displaced row without a weight", () => {
    expect(() => moveRow(rows, 9, 1, "weight")).toThrow("Row 9 or 1 is not on this page.");
    expect(() => moveRow([row(1, 1), row(2)], 1, 2, "weight")).toThrow("Row 2 has no weight.");
  });
});

describe("withWeights", () => {
  const columns: Column[] = [
    { type: "field", key: "label" },
    { type: "field", key: "weight" },
  ];

  // deviation:drag-weights-shown
  it("writes the returned weights into the data and the weight column of each row", () => {
    const rows = withWeights([row(1, 1), row(2, 2), row(3, 3)], { 1: 2, 2: 1 }, "weight", columns);
    expect(rows.map((each) => each.data?.weight)).toEqual([2, 1, 3]);
    expect(rows.map((each) => each.columns[1]?.val)).toEqual([2, 1, 3]);
    expect(rows[0]?.columns[0]).toEqual({ val: "Name 1" });
  });

  it("leaves the cells alone when no column shows the weight", () => {
    const [moved] = withWeights([row(1, 1)], { 1: 5 }, "weight", columns.slice(0, 1));
    expect(moved?.data?.weight).toBe(5);
    expect(moved?.columns[1]?.val).toBe(1);
  });
});
