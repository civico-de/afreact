import { describe, expect, it } from "vitest";
import { diffPaths, searchRoundTrip } from "./roundTrip";

const stored = {
  id: 5,
  name: "Members",
  label: "Members",
  description: null,
  api_entity: "Contact",
  api_params: {
    version: 4,
    select: ["id", "display_name"],
    where: [["is_deleted", "=", false]],
    orderBy: {},
  },
  form_values: [],
  is_template: false,
  expires_date: null,
  timeout: null,
  tag_id: [3, 4],
  groups: [
    { id: 2, title: "Members", description: "", visibility: "Public Pages", group_type: ["1"] },
  ],
  displays: [{ id: 9, name: "T", label: "T", type: "table", settings: { columns: [], pager: [] } }],
};

describe("diffPaths", () => {
  it("names the paths that differ, not the values", () => {
    expect(diffPaths({ a: [1, { b: "x" }], c: 1 }, { a: [1, { b: "y" }], d: 1 })).toEqual([
      "a.1.b",
      "c",
      "d",
    ]);
    expect(diffPaths([1], [1, 2])).toEqual(["."]);
  });
});

describe("searchRoundTrip", () => {
  it("finds nothing but core's own fill-ins in an unedited search", () => {
    expect(searchRoundTrip(stored)).toEqual({
      differs: [],
      expected: ["form_values", "displays.0.settings.pager"],
    });
  });

  it("refuses a malformed display rather than dropping it from the save", () => {
    const malformed = { ...stored, displays: [{ ...stored.displays[0], label: undefined }] };
    expect(() => searchRoundTrip(malformed)).toThrow("Display 1 of the saved search is malformed.");
  });
});
