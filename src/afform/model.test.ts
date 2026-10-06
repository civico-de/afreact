import {
  addRepeatItem,
  applyPrefill,
  copyRepeatItem,
  deleteValue,
  emptyData,
  entityDeclarations,
  ensurePrimary,
  ensureRepeatItems,
  EXTRA_SCOPE,
  fieldPlace,
  getValue,
  keepOffered,
  placementOptions,
  removeRepeatItem,
  repeatCount,
  routeArgs,
  routeParams,
  setPrimary,
  setValue,
  submission,
  type PrefillItem,
} from "./model";
import type { FormData } from "./types";

const emails = (data: FormData) => data.Individual1?.[0]?.joins?.Email ?? [];

describe("routeArgs", () => {
  it("reads route parameters from the hash only, as afCore does", () => {
    expect(routeParams({ hash: "#?first_name=Ada&id=3" })).toEqual({ first_name: "Ada", id: "3" });
    expect(routeParams({ hash: "" })).toEqual({});
  });

  it("lets the hash win over the query string", () => {
    expect(routeArgs({ search: "?Individual1=1", hash: "#?Individual1=2" }, [])).toEqual({
      Individual1: "2",
    });
  });

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

  it("puts a placement's options over the route and splits entity IDs among them", () => {
    expect(
      routeArgs({ search: "?contact_id=1&tab=x", hash: "" }, ["Individual1"], {
        contact_id: 9,
        Individual1: "4,5",
      }),
    ).toEqual({ contact_id: 9, tab: "x", Individual1: ["4", "5"] });
  });
});

describe("placementOptions", () => {
  it("reads a JSON object, null as a placement without options, and no attribute as none", () => {
    expect(placementOptions('{"contact_id":2,"case_id":"7"}')).toEqual({
      contact_id: 2,
      case_id: "7",
    });
    expect(placementOptions(null)).toBeUndefined();
    expect(placementOptions("null")).toEqual({});
  });

  it("rejects anything but an object", () => {
    expect(() => placementOptions("[1]")).toThrow("options must be a JSON object, got [1]");
    expect(() => placementOptions("{")).toThrow(SyntaxError);
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

  it("copies the last join record, and an entity item without its joins", () => {
    let data = ensureRepeatItems(emptyData(["Individual1"]), joinScope, 1);
    data = setValue(data, { ...joinScope, joinIndex: 0 }, "email", "a@example.org");
    data = copyRepeatItem(data, joinScope);
    expect(emails(data)).toEqual([{ email: "a@example.org" }, { email: "a@example.org" }]);

    const scope = { entity: "Individual1", index: 0 };
    data = setValue(data, scope, "first_name", "Ada");
    const copied = copyRepeatItem(data, scope).Individual1?.[1];
    expect(copied).toEqual({ fields: { first_name: "Ada" }, joins: {} });
    expect(copyRepeatItem(emptyData(["Individual1"]), scope)).toEqual({ Individual1: [] });
  });

  it("copies a record as a new one: without its id and not primary", () => {
    let data = ensureRepeatItems(emptyData(["Individual1"]), joinScope, 1);
    const first = { ...joinScope, joinIndex: 0 };
    data = setValue(setValue(data, first, "id", 12), first, "email", "a@example.org");
    data = copyRepeatItem(setPrimary(data, first), joinScope);
    expect(emails(data)).toEqual([
      { id: 12, email: "a@example.org", is_primary: true },
      { email: "a@example.org", is_primary: false },
    ]);

    const scope = { entity: "Individual1", index: 0 };
    data = setValue(setValue(data, scope, "id", 5), scope, "first_name", "Ada");
    expect(copyRepeatItem(data, scope).Individual1?.[1]?.fields).toEqual({ first_name: "Ada" });
  });
});

describe("primary records", () => {
  const joinScope = { entity: "Individual1", index: 0, join: "Email" };

  it("keeps exactly one primary record", () => {
    const data = setPrimary(ensureRepeatItems(emptyData(["Individual1"]), joinScope, 3), {
      ...joinScope,
      joinIndex: 2,
    });
    expect(emails(data).map((email) => email?.is_primary)).toEqual([false, false, true]);
  });

  it("makes the first record primary only when none is", () => {
    const padded = ensureRepeatItems(emptyData(["Individual1"]), joinScope, 2);
    expect(emails(ensurePrimary(padded, joinScope)).map((email) => email?.is_primary)).toEqual([
      true,
      false,
    ]);
    const chosen = setPrimary(padded, { ...joinScope, joinIndex: 1 });
    expect(ensurePrimary(chosen, joinScope)).toBe(chosen);
  });

  it("marks a record the prefill sent as null", () => {
    const data = { Individual1: [{ fields: {}, joins: { Email: [{ email: "x" }, null] } }] };
    expect(emails(ensurePrimary(data, joinScope))).toEqual([
      { email: "x", is_primary: true },
      { is_primary: false },
    ]);
    expect(emails(setPrimary(data, { ...joinScope, joinIndex: 1 }))).toEqual([
      { email: "x", is_primary: false },
      { is_primary: true },
    ]);
  });
});

describe("deleteValue", () => {
  it("removes the key from an entity item or a join record", () => {
    const data = {
      Individual1: [
        { fields: { a: 1, b: 2 }, joins: { Email: [{ email: "x", is_primary: true }] } },
      ],
    };
    expect(deleteValue(data, { entity: "Individual1", index: 0 }, "a")).toEqual({
      Individual1: [{ fields: { b: 2 }, joins: { Email: [{ email: "x", is_primary: true }] } }],
    });
    expect(
      deleteValue(data, { entity: "Individual1", index: 0, join: "Email", joinIndex: 0 }, "email"),
    ).toEqual({
      Individual1: [{ fields: { a: 1, b: 2 }, joins: { Email: [{ is_primary: true }] } }],
    });
    expect(deleteValue(data, { entity: "Other", index: 0 }, "a")).toEqual(data);
    expect(data.Individual1[0]?.fields).toEqual({ a: 1, b: 2 });
  });
});

describe("keepOffered", () => {
  const scope = { entity: "Individual1", index: 0 };
  const data = (value: unknown): FormData => ({
    Individual1: [{ fields: { tags: value }, joins: {} }],
  });

  it("drops list items the options no longer offer and keeps the record otherwise", () => {
    expect(getValue(keepOffered(data([1, 2, 3]), scope, "tags", [1, 3]), scope, "tags")).toEqual([
      1, 3,
    ]);
    const unchanged = data([1, 3]);
    expect(keepOffered(unchanged, scope, "tags", [1, 3])).toBe(unchanged);
  });

  it("drops a single value no longer offered", () => {
    expect(getValue(keepOffered(data(2), scope, "tags", [1]), scope, "tags")).toBeUndefined();
    const offered = data(1);
    expect(keepOffered(offered, scope, "tags", [1])).toBe(offered);
  });
});

describe("extra fields", () => {
  const defn = { name: "text1", input_type: "Text", data_type: "String" };
  const scope = { entity: "Individual1", index: 0 };

  it("are af-fields without a name, kept by their definition's name outside the entity", () => {
    expect(fieldPlace({ "#tag": "af-field", defn }, scope)).toEqual({
      scope: EXTRA_SCOPE,
      name: "text1",
    });
    expect(fieldPlace({ "#tag": "af-field", name: "", defn }, null)?.scope).toBe(EXTRA_SCOPE);
    expect(fieldPlace({ "#tag": "af-field", name: "email", defn }, scope)).toEqual({
      scope,
      name: "email",
    });
    expect(fieldPlace({ "#tag": "af-field", name: "email" }, null)).toBeNull();
  });

  it("submit as one record and come back from a stored draft", () => {
    const data = setValue(emptyData(["Individual1"]), EXTRA_SCOPE, "text1", "x");
    expect(submission(data)).toEqual({ Individual1: [], extra: { fields: { text1: "x" } } });
    expect(submission(emptyData(["Individual1"]))).toEqual({ Individual1: [] });
    // As Afform.prefill returns a draft's extra fields; PrefillItem describes entities only.
    const wire = '[{"name":"extra","values":{"fields":{"text1":"y"}}}]';
    const prefill: PrefillItem[] = JSON.parse(wire);
    expect(applyPrefill(emptyData([]), prefill, {}).extra).toEqual([
      { fields: { text1: "y" }, joins: {} },
    ]);
    expect(applyPrefill(emptyData([]), [{ name: "extra", values: [] }], {})).toEqual({});
  });
});
