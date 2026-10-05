import { dragField, moveRow, withWeights } from "./dragOrder";
import type { Column, Row } from "./types";

const row = (key: number, weight?: number): Row => ({
  key,
  columns: [{ val: `Name ${String(key)}` }, { val: weight }],
  data: weight === undefined ? {} : { weight },
});
const keys = (rows: Row[]) => rows.map((each) => each.key);

describe("dragField", () => {
  it("names the weight field of a flat draggable table only", () => {
    expect(dragField({ columns: [], draggable: "weight" })).toBe("weight");
    expect(dragField({ columns: [], draggable: "" })).toBeNull();
    expect(dragField({ columns: [], draggable: false })).toBeNull();
    expect(dragField({ columns: [] })).toBeNull();
    expect(dragField({ columns: [], draggable: "weight", hierarchical: true })).toBeNull();
  });
});

describe("moveRow", () => {
  const rows = [row(1, 10), row(2, 20), row(3, 30), row(4, 40)];

  it("moves a row down to the place of the row it displaces and takes that row's weight", () => {
    const moved = moveRow(rows, 1, 3, "weight");
    expect(keys(moved.rows)).toEqual([2, 3, 1, 4]);
    expect(moved.weight).toBe(30);
  });

  it("moves a row up the same way", () => {
    const moved = moveRow(rows, 4, 2, "weight");
    expect(keys(moved.rows)).toEqual([1, 4, 2, 3]);
    expect(moved.weight).toBe(20);
    expect(keys(rows)).toEqual([1, 2, 3, 4]);
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
