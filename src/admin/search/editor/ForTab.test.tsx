import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { metadata } from "../../../test/searchMetadata";
import type { SearchInfo } from "../expr";
import { ForTab, GroupBy } from "./ForTab";

describe("GroupBy", () => {
  // deviation:groupby-function-caption
  it("names a function grouping's row instead of labelling a missing picker", () => {
    const { container } = render(
      <GroupBy
        meta={metadata}
        search={{
          api_entity: "Contact",
          api_params: { version: 4, select: ["id"], groupBy: ["COUNT(id)"] },
        }}
        onChange={() => undefined}
      />,
    );
    const rows = screen.getAllByRole("group", { name: "Group By" });
    expect(rows.some((row) => row.classList.contains("crm-search-groupby"))).toBe(true);
    for (const label of container.querySelectorAll("label[for]"))
      expect(document.getElementById(label.getAttribute("for") ?? "")).not.toBeNull();
  });
});

describe("ForTab entity parameters", () => {
  const meta = {
    ...metadata,
    schema: metadata.schema.map((entity) =>
      entity.name === "Contact"
        ? { ...entity, ui_params: [{ name: "region", title: "Region", required: true }] }
        : entity,
    ),
  };
  let latest: SearchInfo | undefined;

  function Harness() {
    const [search, setSearch] = useState<SearchInfo>({
      api_entity: "Contact",
      api_params: { version: 4, select: ["id"] },
    });
    latest = search;
    return (
      <ForTab
        meta={meta}
        search={search}
        entityLocked
        onEntity={() => undefined}
        onChange={setSearch}
      />
    );
  }

  it("trims a text parameter as ngModel trims it", async () => {
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: /Region/ });
    await userEvent.type(input, " North ");
    expect(latest?.api_params.region).toBe("North");
    expect(input).toHaveValue(" North ");
  });
});

describe("ForTab joins", () => {
  let latest: SearchInfo | undefined;

  function Harness() {
    const [search, setSearch] = useState<SearchInfo>({
      api_entity: "Contact",
      api_params: {
        version: 4,
        select: ["id"],
        join: [["Email AS Contact_Email_contact_id_01", "LEFT"]],
      },
    });
    latest = search;
    return (
      <ForTab
        meta={metadata}
        search={search}
        entityLocked
        onEntity={() => undefined}
        onChange={setSearch}
      />
    );
  }

  it("trims a join's label once it is left, as ngModel trims it", async () => {
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: "Optional label for this join" });
    await userEvent.clear(input);
    await userEvent.type(input, " Mail ");
    await userEvent.tab();
    expect(latest?.form_values?.join).toEqual({ Contact_Email_contact_id_01: "Mail" });
    await userEvent.clear(input);
    await userEvent.type(input, "   ");
    await userEvent.tab();
    expect(latest?.form_values?.join).toEqual({});
  });
});
