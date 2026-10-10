import { historyReducer, initialHistory, isDirty, UNDO_LIMIT, type History } from "./history";

const change = <T>(h: History<T>, value: T) =>
  historyReducer(h, { type: "change", update: () => value });

describe("historyReducer", () => {
  it("undoes and redoes changes, and a change drops the redo stack", () => {
    let h = change(change(initialHistory(0), 1), 2);
    h = historyReducer(h, { type: "undo" });
    expect(h.present).toBe(1);
    h = historyReducer(h, { type: "redo" });
    expect(h.present).toBe(2);
    h = historyReducer(historyReducer(h, { type: "undo" }), { type: "change", update: () => 5 });
    expect(h.future).toEqual([]);
    expect(historyReducer(h, { type: "redo" })).toBe(h);
  });

  it("ignores a change that returns the same state and keeps a bounded past", () => {
    const h = initialHistory(0);
    expect(historyReducer(h, { type: "change", update: (s) => s })).toBe(h);
    let long = h;
    for (let i = 1; i <= UNDO_LIMIT + 5; i++) long = change(long, i);
    expect(long.past).toHaveLength(UNDO_LIMIT);
    expect(historyReducer(initialHistory(0), { type: "undo" }).present).toBe(0);
  });

  it("is dirty until saved, and clean again when undone to the saved state", () => {
    let h = change(initialHistory<unknown>({ a: 1 }), { a: 2 });
    expect(isDirty(h)).toBe(true);
    h = historyReducer(h, { type: "undo" });
    expect(isDirty(h)).toBe(false);
    h = historyReducer(change(h, 3), { type: "saved" });
    expect(isDirty(h)).toBe(false);
    expect(historyReducer(h, { type: "reset", state: 9 })).toEqual(initialHistory(9));
  });
});
