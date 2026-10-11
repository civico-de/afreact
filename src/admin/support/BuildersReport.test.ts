import { describe, expect, it } from "vitest";
import { displayTypeSupport, parseFindings } from "./BuildersReport";

describe("builders report", () => {
  it("reads the findings, an empty map of display types encoded as a list included", () => {
    expect(parseFindings('{"displayTypes":[],"modules":["x"],"partials":[]}')).toEqual({
      displayTypes: {},
      modules: ["x"],
      partials: [],
    });
    expect(() => parseFindings('{"displayTypes":{"table":1},"modules":[],"partials":[]}')).toThrow(
      /display types/,
    );
    expect(() => parseFindings('{"displayTypes":{},"modules":"x","partials":[]}')).toThrow(
      /modules/,
    );
  });

  it("leaves to the classic builder only types without a React or Angular editor", () => {
    customElements.define(
      "afreact-search-admin-display-report-plugin",
      class extends HTMLElement {},
    );
    const { islands, classic } = displayTypeSupport({
      table: "Table",
      "chart-kit": "Chart",
      "report-plugin": "Plugin",
      "report-unknown": "Unknown",
    });
    expect(islands).toEqual([]);
    expect(classic).toEqual([["report-unknown", "Unknown"]]);
  });
});
