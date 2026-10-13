import { changeFilterField, filterMode } from "./ColumnFields";

describe("changeFilterField", () => {
  const filters = [
    { subsearch_field: "contact_id", parent_field: "id" },
    { subsearch_field: "status_id", value: 1 },
  ];

  // deviation:subsearch-filter-change
  it("keeps a filter whose field changes and removes one whose field is cleared", () => {
    expect(changeFilterField(filters, 1, "activity_type_id")).toEqual([
      { subsearch_field: "contact_id", parent_field: "id" },
      { subsearch_field: "activity_type_id", value: 1 },
    ]);
    expect(changeFilterField(filters, 0, null)).toEqual([
      { subsearch_field: "status_id", value: 1 },
    ]);
  });
});

describe("filterMode", () => {
  it("reads a filter with a value and a null parent field as a value, as $onInit does", () => {
    expect(filterMode({ subsearch_field: "s", value: "Completed", parent_field: null })).toBe(
      "value",
    );
    expect(filterMode({ subsearch_field: "s", value: null, parent_field: null })).toBe("field");
    expect(filterMode({ subsearch_field: "s", value: 1, parent_field: "id" })).toBe("field");
    expect(filterMode({ subsearch_field: "s", value: 1 })).toBe("value");
  });
});
