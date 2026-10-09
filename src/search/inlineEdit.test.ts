import { editInfo } from "../test/editInfo";
import {
  editorFor,
  initialValue,
  isChanged,
  isNullable,
  mergeRow,
  unsupportedEditors,
} from "./inlineEdit";
import { runPage } from "./rows";

describe("editorFor", () => {
  it("picks the input crmSearchInputVal picks, in its order", () => {
    const kind = (info: Parameters<typeof editInfo>[0]) => editorFor(editInfo(info));
    expect(kind({ value_key: "d", data_type: "Date", options: [] })).toEqual({
      kind: "date",
      multiple: false,
    });
    expect(kind({ value_key: "t", data_type: "Timestamp" })).toMatchObject({ kind: "datetime" });
    expect(kind({ value_key: "b", data_type: "Boolean", options: [] })).toMatchObject({
      kind: "boolean",
    });
    expect(kind({ value_key: "c", input_type: "Color" })).toMatchObject({ kind: "color" });
    expect(kind({ value_key: "g", data_type: "Integer", options: [], fk_entity: "X" })).toEqual({
      kind: "select",
      multiple: false,
    });
    expect(kind({ value_key: "g", options: true })).toMatchObject({ kind: "select" });
    expect(kind({ value_key: "s", options: [], serialize: true })).toEqual({
      kind: "select",
      multiple: true,
    });
    expect(kind({ value_key: "i", data_type: "Integer" })).toMatchObject({ kind: "integer" });
    expect(kind({ value_key: "f", data_type: "Float" })).toMatchObject({ kind: "float" });
    expect(kind({ value_key: "e", input_type: "Email" })).toMatchObject({ kind: "email" });
    expect(kind({ value_key: "n", input_type: "TextArea" })).toMatchObject({ kind: "textarea" });
    expect(kind({ value_key: "x", input_type: null })).toMatchObject({ kind: "text" });
    expect(kind({ value_key: "e", fk_entity: "Contact" })).toEqual({
      kind: "entityref",
      multiple: false,
    });
    expect(kind({ value_key: "id", data_type: "Integer" })).toMatchObject({ kind: "entityref" });
    expect(kind({ value_key: "e", fk_entity: "Tag", serialize: true })).toEqual({
      kind: "entityref",
      multiple: true,
    });
  });

  it("lists multi-value fields in one input, dates day by day, Yes and No as checkboxes", () => {
    const multi = (info: Parameters<typeof editInfo>[0]) => editorFor(editInfo(info));
    expect(multi({ value_key: "t", data_type: "Array" })).toEqual({ kind: "text", multiple: true });
    expect(multi({ value_key: "e", input_type: "Email", serialize: true })).toEqual({
      kind: "text",
      multiple: true,
    });
    expect(multi({ value_key: "n", data_type: "Integer", serialize: true })).toEqual({
      kind: "integer",
      multiple: true,
    });
    expect(multi({ value_key: "d", data_type: "Timestamp", serialize: true })).toEqual({
      kind: "date",
      multiple: true,
    });
    expect(multi({ value_key: "b", data_type: "Boolean", serialize: true })).toEqual({
      kind: "boolean",
      multiple: true,
    });
  });

  it("names the inputs the table cannot show", () => {
    const reason = (info: Parameters<typeof editInfo>[0]) => editorFor(editInfo(info));
    expect(reason({ value_key: "l", input_type: "Location" })).toEqual({ unsupported: "Location" });
    expect(reason({ value_key: "c", input_type: "Color", serialize: true })).toEqual({
      unsupported: "multi-value colour",
    });
  });
});

describe("unsupportedEditors", () => {
  it("lists the editable columns of a page without an input", () => {
    const page = runPage(
      Object.assign([], {
        editable: {
          job_title: editInfo({ value_key: "job_title" }),
          "address_primary.geo_code_1": editInfo({ value_key: "geo", input_type: "Location" }),
        },
      }),
    );
    expect(unsupportedEditors(page.editable)).toEqual([
      "in-place editing of address_primary.geo_code_1 (Location)",
    ]);
    expect(unsupportedEditors({})).toEqual([]);
  });
});

describe("values", () => {
  const info = editInfo({ value_key: "gender_id", value_path: "gender_id", id_path: "id" });

  it("edits the raw value, not the label the column shows", () => {
    expect(initialValue({ key: 1, columns: [], data: { gender_id: 2 } }, info)).toBe(2);
    expect(initialValue({ key: 1, columns: [] }, info)).toBeNull();
  });

  it("clears a value only on an existing record of a nullable field", () => {
    expect(isNullable({ key: 1, columns: [], data: { id: 1 } }, info)).toBe(true);
    expect(isNullable({ key: 1, columns: [], data: {} }, info)).toBe(false);
    expect(isNullable({ key: 1, columns: [], data: { id: 1 } }, { ...info, nullable: false })).toBe(
      false,
    );
  });

  it("compares by value, so unchanged lists do not save", () => {
    expect(isChanged([1, 2], [1, 2])).toBe(false);
    expect(isChanged(undefined, null)).toBe(false);
    expect(isChanged("", null)).toBe(true);
    expect(isChanged(2, "2")).toBe(true);
  });

  it("keeps what the refreshed row leaves out, except the css class", () => {
    const old = {
      key: 1,
      cssClass: "old",
      collapsed: true,
      columns: [{ val: "a" }],
      data: { _depth: 1, name: "a" },
    };
    expect(mergeRow(old, { key: 1, columns: [{ val: "b" }], data: { name: "b" } })).toEqual({
      key: 1,
      collapsed: true,
      columns: [{ val: "b" }],
      data: { _depth: 1, name: "b" },
    });
  });
});
