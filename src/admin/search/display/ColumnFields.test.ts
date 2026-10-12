import { changeFilterField } from "./ColumnFields";

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
