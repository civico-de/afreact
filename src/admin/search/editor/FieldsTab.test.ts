import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { metadata as meta } from "../../../test/searchMetadata";
import { FieldsTab, selectableFields } from "./FieldsTab";

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

describe("FieldsTab", () => {
  // deviation:smart-group-column-kept
  it("keeps the smart group's contact column from being removed", () => {
    render(
      createElement(FieldsTab, { meta, search, firstLocked: true, onChange: () => undefined }),
    );
    expect(screen.queryByRole("button", { name: /^Remove Contact ID/ })).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Remove / })).toHaveLength(1);
  });
});
