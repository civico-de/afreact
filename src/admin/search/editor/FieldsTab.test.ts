import { describe, expect, it } from "vitest";
import { metadata as meta } from "../../../test/searchMetadata";
import { selectableFields } from "./FieldsTab";

const search = {
  api_entity: "Contact",
  api_params: { version: 4, select: ["id", "gender_id:label"] },
};

describe("selectableFields", () => {
  // deviation:selected-columns-not-offered
  it("leaves the search's columns out of the list", () => {
    const ids = selectableFields(meta, search).map((option) => option.id);
    expect(ids).toContain("display_name");
    expect(ids).not.toContain("id");
    expect(ids).not.toContain("gender_id:label");
  });
});
