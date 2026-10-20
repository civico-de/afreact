import { filledAfterRemoval, placeAfterRemoval } from "./autofill";

describe("places after a repeat item is removed", () => {
  it("move up the later items of the same repeat only", () => {
    const people = { entity: "Individual1", index: 0 };
    expect(placeAfterRemoval({ entity: "Individual1", index: 2 }, people, 1)).toEqual({
      entity: "Individual1",
      index: 1,
    });
    expect(placeAfterRemoval({ entity: "Individual1", index: 0 }, people, 1).index).toBe(0);
    expect(placeAfterRemoval({ entity: "Individual2", index: 2 }, people, 1).index).toBe(2);
    const emails = { entity: "Individual1", index: 1, join: "Email" };
    const later = { entity: "Individual1", index: 1, join: "Email", joinIndex: 2 };
    expect(placeAfterRemoval(later, emails, 0).joinIndex).toBe(1);
    expect(placeAfterRemoval({ ...later, index: 0 }, emails, 0).joinIndex).toBe(2);
    expect(placeAfterRemoval({ ...later, join: "Phone" }, emails, 0).joinIndex).toBe(2);
  });

  it("drop the removed item from what a selection filled and renumber the rest", () => {
    const item = (id: number) => ({ after: { fields: { id }, joins: {} } });
    const filled = { Individual2: { 0: item(5), 1: item(6), 2: item(7) }, Individual3: {} };
    expect(filledAfterRemoval(filled, { entity: "Individual2", index: 0 }, 1)).toEqual({
      Individual2: { 0: item(5), 1: item(7) },
      Individual3: {},
    });
    const join = { entity: "Individual2", index: 0, join: "Email" };
    expect(filledAfterRemoval(filled, join, 1)).toBe(filled);
  });
});
