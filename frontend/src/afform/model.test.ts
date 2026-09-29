import {
  addRepeatItem,
  applyPrefill,
  emptyData,
  entityDeclarations,
  ensurePrimary,
  ensureRepeatItems,
  getValue,
  removeRepeatItem,
  repeatCount,
  routeArgs,
  setPrimary,
  setValue,
} from "./model";
import type { FormData } from "./types";

const emails = (data: FormData) => data.Individual1?.[0]?.joins?.Email ?? [];

describe("routeArgs", () => {
  it("merges query and Angular hash parameters and splits only entity IDs", () => {
    expect(
      routeArgs({ search: "?Individual1=5,6&tag=a,b", hash: "#?Email1=7" }, [
        "Individual1",
        "Email1",
      ]),
    ).toEqual({
      Individual1: ["5", "6"],
      tag: "a,b",
      Email1: ["7"],
    });
  });

  it("reads a hash route with a leading slash", () => {
    expect(routeArgs({ search: "", hash: "#/?Individual1=3" }, ["Individual1"])).toEqual({
      Individual1: ["3"],
    });
  });
});

describe("applyPrefill", () => {
  it("merges items by index, including sparse object answers", () => {
    const data = applyPrefill(
      emptyData(["Individual1"]),
      [{ name: "Individual1", values: { 1: { fields: { id: 9 } } } }],
      {},
    );
    expect(data.Individual1?.[1]).toEqual({ fields: { id: 9 }, joins: {} });
    expect(data.Individual1?.[0]).toBeUndefined();
  });

  it("keeps existing fields and joins of an item", () => {
    const start = setValue(
      emptyData(["Individual1"]),
      { entity: "Individual1", index: 0 },
      "source",
      "x",
    );
    const data = applyPrefill(
      start,
      [
        {
          name: "Individual1",
          values: [{ fields: { id: 1 }, joins: { Email: [{ email: "a@example.org" }] } }],
        },
      ],
      {},
    );
    expect(data.Individual1?.[0]?.fields).toEqual({ source: "x", id: 1 });
    expect(emails(data)).toEqual([{ email: "a@example.org" }]);
  });
  it("lets the entity's preset data win over prefilled fields", () => {
    const data = applyPrefill(
      emptyData(["Individual1"]),
      [{ name: "Individual1", values: [{ fields: { id: 1, source: "old", first_name: "A" } }] }],
      { Individual1: { data: { source: "Web" }, actions: {} } },
    );
    expect(data.Individual1?.[0]?.fields).toEqual({ id: 1, source: "Web", first_name: "A" });
  });
});

describe("entityDeclarations", () => {
  it("reads data and actions, defaulting to create and update", () => {
    expect(
      entityDeclarations([
        { "#tag": "af-entity", name: "A", data: { source: "Web" }, actions: { update: false } },
        { "#tag": "div", "#children": [{ "#tag": "af-entity", name: "B" }] },
      ]),
    ).toEqual({
      A: { data: { source: "Web" }, actions: { update: false } },
      B: { data: {}, actions: { create: true, update: true } },
    });
  });
});

describe("setValue", () => {
  it("creates the item and join record on first write without touching the input", () => {
    const start = emptyData(["Individual1"]);
    const scope = { entity: "Individual1", index: 0, join: "Email", joinIndex: 1 };
    const data = setValue(start, scope, "email", "b@example.org");
    expect(start).toEqual({ Individual1: [] });
    expect(getValue(data, scope, "email")).toBe("b@example.org");
    expect(repeatCount(data, { entity: "Individual1", index: 0, join: "Email" })).toBe(2);
  });
});

describe("repeats", () => {
  const joinScope = { entity: "Individual1", index: 0, join: "Email" };

  it("pads to a minimum and removes by position", () => {
    let data = ensureRepeatItems(emptyData(["Individual1"]), joinScope, 2);
    expect(repeatCount(data, joinScope)).toBe(2);
    data = setValue(data, { ...joinScope, joinIndex: 1 }, "email", "second");
    data = removeRepeatItem(data, joinScope, 0);
    expect(emails(data)).toEqual([{ email: "second" }]);
  });

  it("adds and removes entity items of a repeating fieldset", () => {
    const scope = { entity: "Individual1", index: 0 };
    const data = addRepeatItem(addRepeatItem(emptyData(["Individual1"]), scope), scope);
    expect(repeatCount(data, scope)).toBe(2);
    expect(repeatCount(removeRepeatItem(data, scope, 1), scope)).toBe(1);
  });
});

describe("primary records", () => {
  const joinScope = { entity: "Individual1", index: 0, join: "Email" };

  it("keeps exactly one primary record", () => {
    const data = setPrimary(ensureRepeatItems(emptyData(["Individual1"]), joinScope, 3), {
      ...joinScope,
      joinIndex: 2,
    });
    expect(emails(data).map((email) => email.is_primary)).toEqual([false, false, true]);
  });

  it("makes the first record primary only when none is", () => {
    const padded = ensureRepeatItems(emptyData(["Individual1"]), joinScope, 2);
    expect(emails(ensurePrimary(padded, joinScope)).map((email) => email.is_primary)).toEqual([
      true,
      false,
    ]);
    const chosen = setPrimary(padded, { ...joinScope, joinIndex: 1 });
    expect(ensurePrimary(chosen, joinScope)).toBe(chosen);
  });
});
