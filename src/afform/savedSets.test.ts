import type { FilterField } from "../search/filters";
import {
  compareDetails,
  differsFromSet,
  setDescription,
  setDetails,
  type SavedSet,
} from "./savedSets";

const fields: FilterField[] = [
  {
    name: "title",
    defn: { name: "title", label: "Title", input_type: "Text", data_type: "String" },
  },
  {
    name: "is_active",
    defn: {
      name: "is_active",
      label: "Enabled",
      input_type: "Radio",
      data_type: "Boolean",
      options: [
        { id: true, label: "Yes" },
        { id: false, label: "No" },
      ],
    },
  },
  {
    name: "group_type",
    defn: {
      name: "group_type",
      label: "Type",
      input_type: "Select",
      data_type: "String",
      options: [
        { id: "1", label: "Access Control" },
        { id: "2", label: "Mailing List" },
      ],
    },
  },
];

const set = (extra: Partial<SavedSet> = {}): SavedSet => ({
  id: 3,
  label: "Mine",
  filters: { title: { CONTAINS: "News" } },
  columns: [],
  "created_by.display_name": null,
  created_date: "2026-01-02 10:00:00",
  ...extra,
});

describe("savedSets", () => {
  // deviation:param-set-details-robust
  it("names each filter by its field and its options, and the columns", () => {
    expect(
      setDetails(
        {
          filters: {
            title: { CONTAINS: "News", "=": "" },
            is_active: false,
            group_type: [1, "2"],
            gone: "x",
          },
          columns: { "S.D": { title: "Title", description: "Description" } },
        },
        fields,
      ),
    ).toEqual({
      Title: "CONTAINS News",
      Enabled: "No",
      Type: "Access Control OR Mailing List",
      // A field the form no longer has, where core fails.
      gone: "x",
      Columns: "Title, Description",
    });
    expect(setDetails({ columns: { "S.A": { a: "A" }, "S.B": { b: "B" } } }, fields)).toEqual({
      "S.A columns": "A",
      "S.B columns": "B",
    });
  });

  // deviation:param-set-details-robust
  it("names a Yes/No value without options, where core shows nothing", () => {
    const flag: FilterField = {
      name: "is_active",
      defn: { name: "is_active", label: "Enabled", input_type: "Radio", data_type: "Boolean" },
    };
    expect(setDetails({ filters: { is_active: false } }, [flag])).toEqual({ Enabled: "No" });
    expect(setDetails({ filters: { is_active: true } }, [flag])).toEqual({ Enabled: "Yes" });
  });

  it("compares old and new details, marking what one side lacks", () => {
    expect(compareDetails({ Title: "a", Enabled: "Yes" }, { Title: "b", Type: "x" })).toEqual([
      ["Title", ["a", "b"]],
      ["Enabled", ["Yes", "[none]"]],
      ["Type", ["[none]", "x"]],
    ]);
    expect(compareDetails({ Title: "a" }, { Title: "a" })).toEqual([["Title", ["a"]]]);
  });

  // deviation:param-set-unchanged-compare
  it("finds changes regardless of key order and the server's [] for {}", () => {
    const saved = set({ filters: { b: 1, a: { CONTAINS: "x" } }, columns: [] });
    expect(differsFromSet(saved, { filters: { a: { CONTAINS: "x" }, b: 1 }, columns: {} })).toBe(
      false,
    );
    expect(differsFromSet(saved, { filters: { a: { CONTAINS: "y" }, b: 1 }, columns: {} })).toBe(
      true,
    );
    expect(
      differsFromSet(saved, { filters: { a: { CONTAINS: "x" }, b: 1 }, columns: { "S.D": {} } }),
    ).toBe(true);
    expect(differsFromSet(set({ filters: null }), { filters: {}, columns: {} })).toBe(false);
  });

  it("says when and by whom a set was made, the time alone for today", () => {
    const created = new Date(2026, 0, 2, 10, 0, 0);
    expect(setDescription(set(), new Date(2026, 5, 1))).toBe(
      `Created ${created.toLocaleDateString()} by UNKNOWN`,
    );
    expect(setDescription(set({ "created_by.display_name": "Admin" }), new Date(2026, 0, 2))).toBe(
      `Created ${created.toLocaleTimeString()} today by Admin`,
    );
  });
});
