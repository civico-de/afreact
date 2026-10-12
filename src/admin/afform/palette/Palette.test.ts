import { mockApi } from "../../../test/render";
import { searchOptions } from "./Palette";

const row = (name: string, label: string, display?: [string, string, string, string]) => ({
  name,
  label,
  "display.name": display?.[0] ?? null,
  "display.label": display?.[1] ?? null,
  "display.type:name": display?.[2] ?? null,
  "display.type:icon": display?.[3] ?? null,
});

describe("searchOptions", () => {
  it("offers each search's default table once, then each of its displays", async () => {
    const calls = mockApi({
      "SavedSearch.get": () => [
        row("alpha", "Alpha"),
        row("beta", "Beta", ["list", "List", "crm-search-display-list", "fa-list"]),
        row("beta", "Beta", ["grid", "Grid", "crm-search-display-grid", "fa-th"]),
      ],
    });
    expect(await searchOptions()).toEqual([
      {
        key: "alpha",
        label: "Alpha: Search results table",
        tag: "crm-search-display-table",
        icon: "fa-table",
      },
      {
        key: "beta",
        label: "Beta: Search results table",
        tag: "crm-search-display-table",
        icon: "fa-table",
      },
      { key: "beta.list", label: "Beta: List", tag: "crm-search-display-list", icon: "fa-list" },
      { key: "beta.grid", label: "Beta: Grid", tag: "crm-search-display-grid", icon: "fa-th" },
    ]);
    expect(calls[0]?.params.where).toEqual([
      ["api_entity", "IS NOT NULL"],
      ["api_params", "IS NOT NULL"],
      ["is_template", "=", false],
    ]);
  });
});
