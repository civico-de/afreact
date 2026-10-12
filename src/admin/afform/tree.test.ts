import {
  insertNode,
  movedPath,
  moveNode,
  nodeAt,
  removeNode,
  updateNode,
  type ShallowNode,
} from "./tree";

const el = (tag: string, children?: ShallowNode[]): ShallowNode =>
  children ? { "#tag": tag, "#children": children } : { "#tag": tag };
const tags = (nodes: ShallowNode[]): unknown =>
  nodes.map((n) =>
    "#tag" in n ? (n["#children"] ? { [n["#tag"]]: tags(n["#children"]) } : n["#tag"]) : "#",
  );

const layout = [el("A", [el("a1"), el("a2"), el("R", [el("c1"), el("c2")])]), el("E", []), el("b")];

describe("layout tree", () => {
  it("reads, updates, inserts and removes without touching the input", () => {
    const frozen = structuredClone(layout);
    expect(nodeAt(layout, [0, 2, 1])).toEqual(el("c2"));
    expect(nodeAt(layout, [5])).toBeUndefined();
    const updated = updateNode(layout, [0, 1], (n) => ({ ...n, class: "x" }));
    expect(nodeAt(updated, [0, 1])).toEqual({ "#tag": "a2", class: "x" });
    expect(updated[1]).toBe(layout[1]);
    expect(tags(insertNode(layout, [1], 0, el("n")))).toEqual([
      { A: ["a1", "a2", { R: ["c1", "c2"] }] },
      { E: ["n"] },
      "b",
    ]);
    expect(tags(removeNode(layout, [0, 2]))).toEqual([{ A: ["a1", "a2"] }, { E: [] }, "b"]);
    expect(layout).toEqual(frozen);
  });

  it("moves within a level, out of and into containers", () => {
    expect(tags(moveNode(layout, [0, 0], [0], 2) ?? [])).toEqual([
      { A: ["a2", "a1", { R: ["c1", "c2"] }] },
      { E: [] },
      "b",
    ]);
    expect(tags(moveNode(layout, [0, 2, 1], [0, 2], 0) ?? [])).toEqual([
      { A: ["a1", "a2", { R: ["c2", "c1"] }] },
      { E: [] },
      "b",
    ]);
    expect(tags(moveNode(layout, [2], [1], 0) ?? [])).toEqual([
      { A: ["a1", "a2", { R: ["c1", "c2"] }] },
      { E: ["b"] },
    ]);
    expect(tags(moveNode(layout, [0, 0], [0, 2], 2) ?? [])).toEqual([
      { A: ["a2", { R: ["c1", "c2", "a1"] }] },
      { E: [] },
      "b",
    ]);
    expect(moveNode(layout, [0], [0], 0)).toBeNull();
    expect(moveNode(layout, [0], [0, 2], 0)).toBeNull();
    expect(tags(moveNode(layout, [0, 0], [1], 0) ?? [])).toEqual([
      { A: ["a2", { R: ["c1", "c2"] }] },
      { E: ["a1"] },
      "b",
    ]);
    // A node before the target parent on its level: the parent's index shifts down.
    expect(tags(moveNode(layout, [0], [1], 0) ?? [])).toEqual([
      { E: [{ A: ["a1", "a2", { R: ["c1", "c2"] }] }] },
      "b",
    ]);
  });

  it("says where a moved node lands, as moveNode places it", () => {
    for (const [from, parent, index] of [
      [[0, 0], [0], 2],
      [[0, 2, 1], [0, 2], 0],
      [[2], [1], 0],
      [[0, 0], [0, 2], 2],
      [[0], [1], 0],
    ] as const) {
      const moved = moveNode(layout, from, parent, index) ?? [];
      expect(nodeAt(moved, movedPath(from, parent, index))).toBe(nodeAt(layout, from));
    }
    expect(movedPath([0, 0], [0], 2)).toEqual([0, 1]);
    expect(movedPath([0], [1], 0)).toEqual([0, 0]);
  });
});
