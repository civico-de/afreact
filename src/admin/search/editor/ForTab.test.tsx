import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { metadata } from "../../../test/searchMetadata";
import { GroupBy } from "./ForTab";

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
