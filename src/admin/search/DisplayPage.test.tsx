import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mockApi, renderWithQuery } from "../../test/render";
import { memoryStore } from "../../url/hash";
import { DisplayPage } from "./DisplayPage";

const columns = [{ type: "field", key: "label", label: "Tag" }];

function api(access: boolean) {
  return mockApi({
    "SavedSearch.get": () => [{ id: 7, name: "S", checkAccess: { access } }],
    "SearchDisplay.get": () => [{ label: "Named", type: "table", settings: { columns } }],
    "SearchDisplay.getDefault": () => [{ label: "Default", type: "table", settings: { columns } }],
    "SearchDisplay.run": (params) =>
      params.return === "row_count"
        ? Object.assign([], { count: 1 })
        : [{ key: 1, columns: [{ val: "One" }] }],
  });
}

describe("DisplayPage", () => {
  it("runs the default display with no name and passes the hash as filters", async () => {
    const calls = api(true);
    renderWithQuery(
      <DisplayPage search="S" display={null} />,
      memoryStore("#/display/S?label=One&_page=1"),
    );
    expect(await screen.findByRole("cell", { name: "One" })).toBeInTheDocument();
    expect(calls.find((c) => c.call === "SearchDisplay.getDefault")?.params).toEqual({
      savedSearch: "S",
      select: ["label", "type", "settings"],
    });
    const run = calls.find((c) => c.call === "SearchDisplay.run");
    expect(run?.params.display).toBeNull();
    expect(run?.params.filters).toEqual({ label: "One" });
    expect(screen.getByRole("button", { name: "Configure" })).toBeInTheDocument();
  });

  it("offers no edit link to users who may not edit the search", async () => {
    api(false);
    renderWithQuery(<DisplayPage search="S" display="D" />);
    expect(await screen.findByRole("cell", { name: "One" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Configure" })).not.toBeInTheDocument();
  });
});
