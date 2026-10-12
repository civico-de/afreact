import type { SchemaEntity } from "./meta";
import { addItem, conditionFields, defaultField, hasDefault, moveItem, splitExpr } from "./segment";

const entity: SchemaEntity = {
  name: "Contact",
  title: "Contact",
  title_plural: "Contacts",
  primary_key: ["id"],
  fields: [
    { name: "id", label: "ID", data_type: "Integer" },
    { name: "gender_id", label: "Gender", data_type: "Integer", suffixes: ["name", "label"] },
  ],
};

describe("segment items", () => {
  it("starts conditions on the last condition's field, else the first field", () => {
    expect(defaultField([], entity)).toBe("id");
    const items = addItem([{ label: "a", when: [["gender_id:name", "="]] }], entity, true);
    expect(items[1]).toEqual({ label: "", when: [["gender_id:name", "="]] });
    expect(hasDefault(items)).toBe(false);
    expect(hasDefault(addItem(items, entity, false))).toBe(true);
  });

  it("offers fields by their :name expression where they have one", () => {
    expect(conditionFields(entity).map((f) => f.id)).toEqual(["id", "gender_id:name"]);
    expect(splitExpr("gender_id:name")).toEqual({ name: "gender_id", optionKey: "name" });
    expect(splitExpr("id")).toEqual({ name: "id", optionKey: "id" });
  });

  // deviation:segment-item-move-buttons
  it("moves an item and ignores a move past either end", () => {
    expect(moveItem([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    const list = [1, 2];
    expect(moveItem(list, 0, -1)).toBe(list);
  });
});
