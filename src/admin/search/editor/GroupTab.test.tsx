import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { mockApi, renderWithQuery } from "../../../test/render";
import { metadata } from "../../../test/searchMetadata";
import type { EditorSearch } from "../editor";
import { GroupTab } from "./GroupTab";

let latest: string[] = [];

function Harness({ select }: { select: string[] }) {
  const [search, setSearch] = useState<EditorSearch>({
    api_entity: "Contact",
    api_params: { version: 4, select },
    label: "S",
    is_template: false,
    form_values: { join: {} },
    tag_id: [],
    groups: [
      { title: "", description: "", visibility: "User and User Admin Only", group_type: [] },
    ],
    displays: [],
    timeout: 30,
  });
  latest = search.api_params.select;
  return (
    <GroupTab
      meta={metadata}
      search={search}
      onGroup={(group) => {
        setSearch((s) => ({ ...s, groups: [group] }));
      }}
      onSelect={(next) => {
        setSearch((s) => ({ ...s, api_params: { ...s.api_params, select: next } }));
      }}
    />
  );
}

beforeEach(() => {
  latest = [];
  mockApi({ "Group.getFields": () => [] });
});

// deviation:group-contact-column-once
describe("GroupTab contact column", () => {
  it("leads the select with the contact ID once, moving it from where it stood", () => {
    renderWithQuery(<Harness select={["display_name", "id"]} />);
    expect(latest).toEqual(["id", "display_name"]);
  });

  it("adds the contact ID in front of a search without one", () => {
    renderWithQuery(<Harness select={["display_name"]} />);
    expect(latest).toEqual(["id", "display_name"]);
  });

  it("replaces the contact column with a picked column without listing it twice", async () => {
    renderWithQuery(<Harness select={["id", "display_name", "employer_id"]} />);
    await userEvent.click(await screen.findByRole("combobox", { name: "Contact Column" }));
    await userEvent.click(await screen.findByRole("option", { name: "Current Employer" }));
    expect(latest).toEqual(["employer_id", "display_name"]);
  });
});
