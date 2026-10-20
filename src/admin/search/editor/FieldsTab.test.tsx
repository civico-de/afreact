import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement, useState } from "react";
import { describe, expect, it } from "vitest";
import { renderWithQuery } from "../../../test/render";
import { metadata as meta } from "../../../test/searchMetadata";
import type { ApiParams } from "../expr";
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

let latest: string[] = [];

function Harness({ select }: { select: string[] }) {
  const [params, setParams] = useState<ApiParams>({ version: 4, select });
  latest = params.select;
  return (
    <FieldsTab
      meta={meta}
      search={{ api_entity: "Contact", api_params: params }}
      firstLocked={false}
      onChange={setParams}
    />
  );
}

// deviation:column-format-once
it("offers no format that another column already selects", async () => {
  renderWithQuery(<Harness select={["gender_id", "gender_id:label"]} />);
  const [raw] = screen.getAllByRole("combobox", { name: /^Format for/ });
  if (!raw) throw new Error("The format select is missing.");
  expect(within(raw).getByRole("option", { name: "Label" })).toBeDisabled();
  await userEvent.selectOptions(raw, within(raw).getByRole("option", { name: "Machine Name" }));
  expect(latest).toEqual(["gender_id:name", "gender_id:label"]);
});
