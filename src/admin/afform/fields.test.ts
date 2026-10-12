import { describe, expect, it } from "vitest";
import { fieldDefn } from "./fields";
import { META } from "./testMeta";

describe("fieldDefn", () => {
  // deviation:hidden-label-field-named
  it("names a field whose label the form hides by its metadata label", () => {
    const node = { "#tag": "af-field", name: "first_name", defn: "{label: false}" };
    expect(fieldDefn(META, "Individual", node)).toMatchObject({
      name: "first_name",
      label: "First Name",
    });
  });

  it("keeps a label the form sets", () => {
    const node = { "#tag": "af-field", name: "first_name", defn: "{label: 'Given name'}" };
    expect(fieldDefn(META, "Individual", node).label).toBe("Given name");
  });
});
