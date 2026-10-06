import { describe, expect, it } from "vitest";
import { firstUnder, treeMove } from "./treeDrag";
import type { Row } from "./types";

const item = (key: number, weight: number, parent_id: number | null = null): Row => ({
  key,
  columns: [{ val: `Item ${String(key)}` }],
  data: { id: key, weight, parent_id },
});
// 1 (10) > 2 (10), 3 (20) > 4 (10); 5 (20); 6 (30) > 7 (10)
const tree = [
  item(1, 10),
  item(2, 10, 1),
  item(3, 20, 1),
  item(4, 10, 3),
  item(5, 20),
  item(6, 30),
  item(7, 10, 6),
];
const keys = (rows: Row[]) => rows.map((row) => row.key);
const move = (active: number, over: string | number) =>
  treeMove(tree, active, over, "weight", "parent_id");

describe("treeMove", () => {
  it("places an item after the one it is dropped on, among that one's siblings", () => {
    const down = move(1, 5);
    expect(keys(down?.rows ?? [])).toEqual([2, 3, 4, 5, 1, 6, 7]);
    expect(down?.values).toEqual({ weight: 20, parent_id: null });
    const up = move(6, 1);
    expect(keys(up?.rows ?? [])).toEqual([1, 6, 2, 3, 4, 5, 7]);
    expect(up?.values).toEqual({ weight: 11, parent_id: null });
    expect(keys(tree)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("moves an item under another parent, after the item dropped on", () => {
    const moved = move(5, 2);
    expect(keys(moved?.rows ?? [])).toEqual([1, 2, 5, 3, 4, 6, 7]);
    expect(moved?.values).toEqual({ weight: 11, parent_id: 1 });
    expect(moved?.rows[2]?.data?.parent_id).toBe(1);
    const out = move(4, 5);
    expect(keys(out?.rows ?? [])).toEqual([1, 2, 3, 5, 4, 6, 7]);
    expect(out?.values).toEqual({ weight: 21, parent_id: null });
  });

  it("puts an item first under a parent, taking the first child's weight, or 1 under a leaf", () => {
    const first = move(5, firstUnder(1));
    expect(keys(first?.rows ?? [])).toEqual([1, 5, 2, 3, 4, 6, 7]);
    expect(first?.values).toEqual({ weight: 10, parent_id: 1 });
    const leaf = move(5, firstUnder(2));
    expect(keys(leaf?.rows ?? [])).toEqual([1, 2, 5, 3, 4, 6, 7]);
    expect(leaf?.values).toEqual({ weight: 1, parent_id: 2 });
    const top = move(7, firstUnder(null));
    expect(keys(top?.rows ?? [])).toEqual([7, 1, 2, 3, 4, 5, 6]);
    expect(top?.values).toEqual({ weight: 10, parent_id: null });
  });

  it("changes nothing for a drop that keeps the place", () => {
    expect(move(1, 1)?.rows).toBe(tree);
    expect(move(3, 2)?.rows).toBe(tree);
    expect(move(2, firstUnder(1))?.rows).toBe(tree);
    expect(move(1, firstUnder(null))?.rows).toBe(tree);
  });

  it("refuses a drop under the item itself or its descendants", () => {
    expect(move(1, 2)).toBeNull();
    expect(move(1, firstUnder(4))).toBeNull();
    expect(move(1, firstUnder(1))).toBeNull();
  });

  it("names a row that is not on the page", () => {
    expect(() => move(9, 1)).toThrow("Row 9 is not on this page.");
    expect(() => move(1, 9)).toThrow("Row 9 is not on this page.");
    expect(() => move(1, firstUnder(9))).toThrow("Row first:9 is not on this page.");
    const bare = [item(1, 1), { key: 2, columns: [] }];
    expect(() => treeMove(bare, 1, 2, "weight", "parent_id")).toThrow("Row 2 has no weight.");
  });
});
