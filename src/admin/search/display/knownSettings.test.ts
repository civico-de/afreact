import { describe, expect, it } from "vitest";
import { unknownSettings } from "./knownSettings";

describe("unknownSettings", () => {
  it("passes what core's packaged records carry without an editor offering it", () => {
    expect(
      unknownSettings("table", {
        columns: [
          { type: "field", key: "id", label_hidden: true, dataType: "Integer" },
          { type: "links", links: [{ path: "x", csrf: true, condition: [] }] },
        ],
        toolbar: [{ path: "y", autoOpen: true }],
        pager: { show_count: true },
        nested: { search: "s", display: "d", filters: [{ field: "a", data: "b" }] },
      }),
    ).toEqual([]);
  });

  it("names unknown keys by their path, at every level it checks", () => {
    expect(
      unknownSettings("table", {
        mystery: 1,
        columns: [{ type: "field" }, { type: "links", links: [{ path: "x", ribbon: "red" }] }],
        pager: { infinite: true },
      }),
    ).toEqual(["mystery", "columns[1].links[0].ribbon", "pager.infinite"]);
  });

  it("checks chart_kit displays against chart_kit's keys", () => {
    expect(
      unknownSettings("chart-kit", {
        chartType: "bar",
        columns: [{ key: "id", axis: "x", color: "#000" }],
        format: { padding: { top: 1, sideways: 2 } },
        pager: {},
      }),
    ).toEqual(["format.padding.sideways", "pager"]);
  });
});
