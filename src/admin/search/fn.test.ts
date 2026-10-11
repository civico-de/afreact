import { describe, expect, it } from "vitest";
import { metadata as meta } from "../../test/searchMetadata";
import type { SearchInfo } from "./expr";
import {
  addArg,
  availableFunctions,
  canAddArg,
  canRemoveArg,
  fnState,
  selectFunction,
  setArg,
  writeExpr,
} from "./fn";

const search = (params: Partial<SearchInfo["api_params"]> = {}): SearchInfo => ({
  api_entity: "Contact",
  api_params: { version: 4, select: ["id", "display_name"], ...params },
});

describe("function editor", () => {
  it("wraps a field in a function and writes it with an alias", () => {
    const state = selectFunction(meta, fnState(meta, "display_name", search()), "GROUP_CONCAT");
    expect(writeExpr(state, "select")).toBe(
      "GROUP_CONCAT(display_name) AS GROUP_CONCAT_display_name",
    );
    const distinct = setArg(state, 0, { flag_before: "DISTINCT" });
    expect(writeExpr(distinct, "groupBy")).toBe("GROUP_CONCAT(DISTINCT display_name)");
  });

  it("puts a leading flag before the field and offers labels for option results", () => {
    const extract = selectFunction(meta, fnState(meta, "birth_date", search()), "EXTRACT");
    expect(extract.fieldIndex).toBe(1);
    expect(writeExpr(setArg(extract, 0, { flag_before: "YEAR" }), "clause")).toBe(
      "EXTRACT(YEAR FROM birth_date)",
    );
    const month = selectFunction(meta, fnState(meta, "birth_date", search()), "MONTH");
    expect(writeExpr(month, "select")).toBe("MONTH(birth_date):label AS MONTH_birth_date");
  });

  it("adds arguments up to the maximum and removes only optional ones", () => {
    const concat = selectFunction(meta, fnState(meta, "display_name", search()), "CONCAT");
    expect(canAddArg(concat)).toBe(true);
    const more = setArg(addArg(concat, "SqlString"), 1, { value: " - " });
    expect(writeExpr(more, "clause")).toBe('CONCAT(display_name, " - ")');
    expect(canRemoveArg(more, 1)).toBe(true);
    expect(canRemoveArg(more, 0)).toBe(false);
    expect(canAddArg(selectFunction(meta, fnState(meta, "id", search()), "COUNT"))).toBe(false);
  });

  it("round-trips a parsed expression", () => {
    const expr = "GROUP_CONCAT(DISTINCT display_name ORDER BY id DESC)";
    expect(writeExpr(fnState(meta, expr, search()), "clause")).toBe(expr);
  });

  it("clears the function back to the bare field", () => {
    const state = selectFunction(meta, fnState(meta, "COUNT(id)", search()), "");
    expect(writeExpr(state, "select")).toBe("id");
  });

  it("offers aggregates only when grouping allows them, and date functions for dates", () => {
    const names = (expr: string, info: SearchInfo, mode: "select" | "groupBy" = "select") =>
      availableFunctions(meta, fnState(meta, expr, info), expr, mode, info).map((o) => o.id);
    expect(names("display_name", search())).toEqual(["GROUP_CONCAT", "COUNT", "SUM", "CONCAT"]);
    expect(names("display_name", search({ groupBy: ["id"] }))).toEqual(["CONCAT"]);
    expect(names("display_name", search({ groupBy: ["gender_id"] }))).toEqual([
      "GROUP_CONCAT",
      "COUNT",
      "SUM",
    ]);
    expect(names("birth_date", search(), "groupBy")).toEqual(["CONCAT", "EXTRACT", "MONTH"]);
  });
});
