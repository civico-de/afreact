import { describe, expect, it } from "vitest";
import { TsCall } from "../literal";
import { textAttribute } from "../model";
import {
  canBeMultiple,
  canBeRange,
  defaultDateType,
  getProp,
  getValue,
  inputTypeCanBe,
  localDefn,
  propIsset,
  setValue,
  toggleDefaultItem,
  toggleMultiple,
  withDefn,
  withOperator,
  type BaseDefn,
  type FieldState,
} from "./fieldModel";

const base = (extra: Partial<BaseDefn> = {}): BaseDefn => ({
  name: "gender_id",
  label: "Gender",
  input_type: "Select",
  data_type: "Integer",
  options: [
    { id: 1, label: "Female" },
    { id: 2, label: "Male" },
  ],
  input_attrs: {},
  ...extra,
});

const field = (extra: Partial<FieldState> = {}): FieldState => ({
  base: base(),
  local: {},
  isSearch: false,
  fieldName: "gender_id",
  ...extra,
});

describe("getSet()", () => {
  it("keeps only values that differ from the metadata", () => {
    const state = setValue(field(), "label", "Gender", false);
    expect(state.local).toEqual({});
    expect(setValue(field(), "label", "Sex", false).local).toEqual({ label: "Sex" });
  });

  it("drops an empty value where the metadata's is empty too", () => {
    expect(setValue(field(), "input_attrs.placeholder", "", false).local).toEqual({});
  });

  it("removes objects a removed value leaves empty", () => {
    const state = setValue(field(), "input_attrs.placeholder", "Pick", false);
    expect(state.local).toEqual({ input_attrs: { placeholder: "Pick" } });
    expect(setValue(state, "input_attrs.placeholder", "", false).local).toEqual({});
  });

  it("reads the element's own value over the metadata's, translating ts() calls", () => {
    const state = field({ local: { label: new TsCall("ts('Sex')", "Sex") } });
    expect(getProp(state, "label")).toBe("Sex");
    expect(getValue(field({ local: { required: false } }), "required")).toBe("");
  });

  it("takes the element's own null over the metadata, which switches its help text off", () => {
    const state = field({ base: { ...base(), help_pre: "Meta help" } });
    expect(propIsset(state, "help_pre")).toBe(true);
    const off = setValue(state, "help_pre", null, false);
    expect(off.local).toEqual({ help_pre: null });
    expect(propIsset(off, "help_pre")).toBe(false);
  });

  // deviation:field-defn-read-only
  it("reads a nested setting without adding its levels to the element's defn", () => {
    const state = field({ local: { label: "Sex" } });
    expect(getProp(state, "input_attrs.placeholder")).toBeUndefined();
    expect(state.local).toEqual({ label: "Sex" });
  });
});

describe("input types", () => {
  it("offers what suits the field", () => {
    const state = field();
    expect(inputTypeCanBe(state, "Radio")).toBe(true);
    expect(inputTypeCanBe(state, "Text")).toBe(false);
    expect(inputTypeCanBe(state, "Range")).toBe(true);
  });

  it("drops search by range and multi-select the new type cannot do", () => {
    const state = field({
      base: base({ input_type: "Date", data_type: "Date", options: false }),
      isSearch: true,
      fieldName: "birth_date",
      local: { search_range: true },
    });
    expect(canBeRange(state)).toBe(true);
    expect(setValue(state, "input_type", "Text", false).local).toEqual({ input_type: "Text" });
  });
});

describe("search operators", () => {
  const search = field({ isSearch: true });

  it("lets the user pick, starting at the first operator, with a multi-select", () => {
    const state = withOperator(search, "_EXPOSE_", ["IN", "="], false);
    expect(state.local).toEqual({
      expose_operator: true,
      search_operator: "IN",
      input_attrs: { multiple: true },
    });
    expect(canBeMultiple(state)).toBe(true);
  });

  it("takes the multi-select away for a single-value operator", () => {
    const multi = toggleMultiple(search, false);
    expect(withOperator(multi, "=", ["IN", "="], false).local).toEqual({ search_operator: "=" });
  });
});

describe("default values", () => {
  it("adds and removes options of a multi-select's default", () => {
    const multi = field({ local: { input_type: "CheckBox" } });
    const one = toggleDefaultItem(multi, 1);
    expect(one).toMatchObject({ hasDefault: true, state: { local: { afform_default: [1] } } });
    const none = toggleDefaultItem(one.state, 1);
    expect(none.hasDefault).toBe(false);
    expect(none.state.local).toEqual({ input_type: "CheckBox" });
  });

  it("carries the default between one value and a list", () => {
    const multi = field({ local: { input_type: "CheckBox", afform_default: [2, 1] } });
    expect(setValue(multi, "input_type", "Select", true).local).toEqual({ afform_default: 2 });
    const single = field({ local: { afform_default: "1,2" } });
    expect(setValue(single, "input_type", "CheckBox", true).local).toEqual({
      input_type: "CheckBox",
      afform_default: ["1", "2"],
    });
  });

  it("tells fixed, current and relative dates apart", () => {
    const date = (value: string) =>
      field({ base: base({ input_type: "Date" }), local: { afform_default: value } });
    expect(defaultDateType(date("now"))).toBe("now");
    expect(defaultDateType(date("now -2 week"))).toBe("relative");
    expect(defaultDateType(date("2024-01-01"))).toBe("fixed");
  });
});

describe("the defn attribute", () => {
  it("reads and writes the element's literal, dropping it when empty", () => {
    const node = { "#tag": "af-field", name: "gender_id", defn: "{label: 'Sex'}" };
    expect(localDefn(node)).toEqual({ label: "Sex" });
    expect(textAttribute(withDefn(node, { required: true }), "defn")).toBe("{required: true}");
    expect(withDefn(node, {})).toEqual({ "#tag": "af-field", name: "gender_id" });
    expect(localDefn({ ...node, defn: "someScopeValue" })).toBeNull();
  });
});
