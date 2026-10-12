import { describe, expect, it } from "vitest";
import {
  canMoveClause,
  isClauseGroup,
  moveClause,
  movedClausePath,
  type ClausePath,
} from "./clauseTree";

const a = ["a", "=", "1"];
const b = ["b", "=", "2"];
const c = ["c", "=", "3"];

describe("moveClause", () => {
  it("swaps with a neighbouring clause", () => {
    expect(moveClause([a, b, c], [1], "up")).toEqual([b, a, c]);
    expect(moveClause([a, b, c], [1], "down")).toEqual([a, c, b]);
  });

  // deviation:builder-reorder-buttons
  it("enters a neighbouring group at its near end", () => {
    expect(moveClause([a, ["OR", [b, c]]], [0], "down")).toEqual([["OR", [a, b, c]]]);
    expect(moveClause([["OR", [b, c]], a], [1], "up")).toEqual([["OR", [b, c, a]]]);
  });

  // deviation:builder-reorder-buttons
  it("leaves a group past its ends", () => {
    expect(moveClause([a, ["OR", [b, c]]], [1, 0], "up")).toEqual([a, b, ["OR", [c]]]);
    expect(moveClause([["OR", [b, c]], a], [0, 1], "down")).toEqual([["OR", [b]], c, a]);
  });

  it("moves a group as one clause", () => {
    expect(moveClause([a, ["NOT", [b]], c], [1], "down")).toEqual([a, c, ["NOT", [b]]]);
  });

  it("keeps the top level's ends and skipped entries", () => {
    expect(canMoveClause([a, b], [0], "up")).toBe(false);
    expect(canMoveClause([a, b], [1], "down")).toBe(false);
    expect(canMoveClause(["Email", "LEFT", a, b], [2], "up", 2)).toBe(false);
    expect(moveClause([a, b], [0], "up")).toEqual([a, b]);
  });
});

/** The clause at `path`, through the groups on the way. */
function at(clauses: unknown[], path: ClausePath): unknown {
  let list = clauses;
  let found: unknown;
  for (const index of path) {
    found = list[index];
    list = isClauseGroup(found) ? found[1] : [];
  }
  return found;
}

describe("movedClausePath", () => {
  it("names where moveClause put the clause, into, out of and past groups", () => {
    const cases: [unknown[], ClausePath, "up" | "down", ClausePath][] = [
      [[a, b, c], [1], "up", [0]],
      [[a, b, c], [1], "down", [2]],
      [[a, ["OR", [b, c]]], [0], "down", [0, 0]],
      [[["OR", [b, c]], a], [1], "up", [0, 2]],
      [[a, ["OR", [b, c]]], [1, 0], "up", [1]],
      [[["OR", [b, c]], a], [0, 1], "down", [1]],
    ];
    for (const [clauses, path, direction, expected] of cases) {
      const moved = at(clauses, path);
      expect(movedClausePath(clauses, path, direction)).toEqual(expected);
      expect(at(moveClause(clauses, path, direction), expected)).toBe(moved);
    }
    expect(movedClausePath([a, b], [0], "up")).toBeNull();
  });
});
