import type { FieldDefn } from "../afform/types";
import {
  assignValue,
  defaultValues,
  fieldsetReducer,
  filterValues,
  initialState,
  isMultiple,
  relativeDate,
  urlText,
  type FieldsetReducerState,
  type FilterField,
} from "./filters";

const field = (name: string, defn: Partial<FieldDefn>): FilterField => ({
  name,
  defn: { name, input_type: "Text", data_type: "String", ...defn },
});

// The filters of core's afsearchManageGroups.
const title = field("title", {});
const groupType = field("group_type", { input_type: "Select", input_attrs: { multiple: true } });
const isActive = field("is_active", {
  input_type: "Radio",
  data_type: "Boolean",
  afform_default: "1",
});
const fields = [title, groupType, isActive];
const name = "Manage_groups";

const params = (text: string) => new URLSearchParams(text);
const empty = { values: {}, operators: {} };

describe("initialState", () => {
  it("starts from the field defaults", () => {
    expect(initialState({ fields, fieldsetName: name, params: params("") }).values).toEqual({
      is_active: true,
    });
  });

  it("takes stored values over the defaults", () => {
    const stored = { is_active: false, title: "News", group_type: ["2"] };
    expect(initialState({ fields, fieldsetName: name, params: params(""), stored }).values).toEqual(
      stored,
    );
  });

  it("takes the URL over stored values, the fieldset's key over the plain one", () => {
    const state = initialState({
      fields,
      fieldsetName: name,
      params: params("title=Plain&Manage_groups.title=Named&is_active=0"),
      stored: { title: "Stored", group_type: ["2"] },
    });
    expect(state.values).toEqual({ title: "Named", group_type: ["2"], is_active: false });
  });

  it("reads lists comma-separated and an empty value as no value", () => {
    const state = initialState({
      fields,
      fieldsetName: name,
      params: params("group_type=1,3&is_active="),
    });
    expect(state.values).toEqual({ group_type: ["1", "3"], is_active: null });
  });

  it("fills fields the URL leaves out from a saved filter set", () => {
    const paramSet = { filters: { title: "Saved", is_active: false } };
    const state = initialState({
      fields,
      fieldsetName: name,
      params: params("_s=4&title=Link"),
      stored: { group_type: ["2"] },
      paramSet,
    });
    expect(state.values).toEqual({ title: "Link", group_type: null, is_active: false });
  });

  it("empties the fields a saved filter set has not given yet", () => {
    const state = initialState({ fields, fieldsetName: name, params: params("_s=4") });
    expect(state.values).toEqual({ title: null, group_type: null, is_active: null });
  });

  it("reads an operator field's value bare or as JSON with another operator", () => {
    const contains = field("label", { search_operator: "CONTAINS" });
    const type = field("type", {
      input_type: "Select",
      input_attrs: { multiple: true },
      search_operator: "IN",
      expose_operator: true,
      operators: { IN: "Is one of", "NOT IN": "Not one of" },
    });
    const state = initialState({
      fields: [contains, type],
      fieldsetName: name,
      params: params(`label=imp&type=${encodeURIComponent('{"NOT IN":["1","2"]}')}`),
    });
    expect(state.values).toEqual({ label: { CONTAINS: "imp" }, type: { "NOT IN": ["1", "2"] } });
    expect(state.operators).toEqual({ type: "NOT IN" });
  });
});

describe("assignValue", () => {
  it("turns user_contact_id into the user's contact on contact references", () => {
    const owner = field("created_id", {
      input_type: "EntityRef",
      fk_entity: "Contact",
      data_type: "Integer",
    });
    expect(assignValue(empty, owner, "user_contact_id", { userContactId: 7 }).values).toEqual({
      created_id: 7,
    });
  });

  it("works out relative dates from now", () => {
    const now = new Date(2026, 0, 30, 9, 5, 7);
    const date = field("start", { input_type: "Date", data_type: "Date" });
    expect(assignValue(empty, date, "now +3 day", { now }).values).toEqual({ start: "2026-02-02" });
    expect(relativeDate("now -1 week", true, now)).toBe("2026-01-23 09:05:07");
  });

  it("reads a range as its bounds", () => {
    const count = field("count", {
      input_type: "Number",
      data_type: "Integer",
      search_range: true,
    });
    const read = (text: string) => assignValue(empty, count, text).values.count;
    expect(read("5-10")).toEqual({ ">=": 5, "<=": 10 });
    expect(read("-5-10")).toEqual({ ">=": -5, "<=": 10 });
    expect(read("-10--5")).toEqual({ ">=": -10, "<=": -5 });
    expect(read("2.5-7.5")).toEqual({ ">=": 2.5, "<=": 7.5 });
    expect(read("5-")).toEqual({ ">=": 5 });
    expect(read("5")).toEqual({ ">=": 5 });
    expect(read("5-x")).toEqual({ ">=": 5 });
    expect(read("-")).toEqual({});
    const bounds = { ">=": 2, "<=": 9 };
    expect(assignValue(empty, count, bounds).values).toEqual({ count: bounds });
    const date = field("created", {
      input_type: "Select",
      data_type: "Date",
      search_range: true,
      is_date: true,
    });
    expect(assignValue(empty, date, "2026-01-01-2026-02-01").values.created).toEqual({
      ">=": "2026",
      "<=": "01",
    });
  });

  it("converts numbers and keeps display-only values as they are", () => {
    expect(assignValue(empty, field("n", { input_type: "Number" }), "4").values).toEqual({ n: 4 });
    const shown = field("s", { input_type: "DisplayOnly", data_type: "Boolean" });
    expect(assignValue(empty, shown, "1").values).toEqual({ s: "1" });
  });
});

describe("initial values of range fields", () => {
  it("start as an empty range", () => {
    const count = field("count", { input_type: "Number", search_range: true });
    expect(defaultValues([count])).toEqual({ count: {} });
  });
});

describe("isMultiple", () => {
  it("follows afField", () => {
    expect(isMultiple(groupType.defn)).toBe(true);
    expect(isMultiple(field("c", { input_type: "CheckBox" }).defn)).toBe(true);
    expect(isMultiple(field("c", { input_type: "CheckBox", data_type: "Boolean" }).defn)).toBe(
      false,
    );
    expect(isMultiple(field("h", { input_type: "Hidden", serialize: 1 }).defn)).toBe(true);
    expect(isMultiple(title.defn)).toBe(false);
  });
});

describe("filterValues", () => {
  it("drops empty values, also inside operator and range objects", () => {
    expect(
      filterValues({
        a: null,
        b: "",
        c: [],
        d: {},
        e: { CONTAINS: "" },
        f: { ">=": 1, "<=": "" },
        g: false,
        h: 0,
        i: ["1"],
      }),
    ).toEqual({ f: { ">=": 1 }, g: false, h: 0, i: ["1"] });
  });
});

describe("urlText", () => {
  it("writes values the way afField reads them back", () => {
    expect(urlText(true, null)).toBe("1");
    expect(urlText(false, null)).toBe("0");
    expect(urlText(["1", 2], null)).toBe("1,2");
    expect(urlText({ CONTAINS: "x" }, "CONTAINS")).toBe("x");
    expect(urlText(null, null)).toBe("");
  });

  it("writes JSON for values core cannot read from the URL", () => {
    expect(urlText({ "NOT IN": ["1"] }, "IN")).toBe('{"NOT IN":["1"]}');
    expect(urlText({ ">=": 1, "<=": 5 }, null)).toBe('{">=":1,"<=":5}');
  });
});

describe("fieldsetReducer", () => {
  const start = (): FieldsetReducerState => {
    const initial = initialState({ fields, fieldsetName: name, params: params("") });
    return { ...initial, applied: initial.values, commits: 0 };
  };

  it("applies typing only on commit, and counts each commit once", () => {
    const typed = fieldsetReducer(start(), { type: "input", field: title, value: "N" });
    expect(typed.values).toEqual({ is_active: true, title: "N" });
    expect(typed.applied).toEqual({ is_active: true });
    const committed = fieldsetReducer(typed, { type: "commit" });
    expect(committed.applied).toBe(committed.values);
    expect(committed.commits).toBe(1);
    expect(fieldsetReducer(committed, { type: "commit" })).toBe(committed);
  });

  it("writes an operator field under its operator and empties it on a new operator", () => {
    const label = field("label", {
      search_operator: "CONTAINS",
      expose_operator: true,
      operators: { CONTAINS: "Contains", "=": "Is" },
    });
    let state = fieldsetReducer(start(), { type: "input", field: label, value: "x" });
    expect(state.values.label).toEqual({ CONTAINS: "x" });
    state = fieldsetReducer(state, { type: "operator", field: label, operator: "=" });
    expect(state.values.label).toEqual({});
    state = fieldsetReducer(state, { type: "input", field: label, value: "y" });
    expect(state.values.label).toEqual({ "=": "y" });
  });

  it("applies a new hash at once without counting it as the user's change", () => {
    const state = fieldsetReducer(start(), {
      type: "route",
      fields,
      fieldsetName: name,
      params: params("title=Linked"),
      paramSet: undefined,
    });
    expect(state.applied).toEqual({ is_active: true, title: "Linked" });
    expect(state.commits).toBe(0);
  });
});
