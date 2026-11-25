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

  // deviation:function-string-escapes
  it("reads a string argument as the server does and writes it back unchanged", () => {
    const expr = String.raw`GROUP_CONCAT(display_name SEPARATOR "a\"b \\ \n")`;
    const state = fnState(meta, expr, search());
    expect(state.args.map((arg) => arg.value)).toContain(String.raw`a"b \\ \n`);
    expect(writeExpr(state, "groupBy")).toBe(expr);
    const typed = setArg(state, 1, { value: "ends in \\" });
    expect(writeExpr(typed, "groupBy")).toBe(
      String.raw`GROUP_CONCAT(display_name SEPARATOR "ends in \\")`,
    );
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

  // deviation:alias-names-flags
  it("names a flag-only argument in the alias, so two units of the same field differ", () => {
    const extract = selectFunction(meta, fnState(meta, "birth_date", search()), "EXTRACT");
    expect(writeExpr(setArg(extract, 0, { flag_before: "YEAR" }), "select")).toBe(
      "EXTRACT(YEAR FROM birth_date) AS EXTRACT_YEAR_birth_date",
    );
    expect(writeExpr(setArg(extract, 0, { flag_before: "MONTH" }), "select")).toBe(
      "EXTRACT(MONTH FROM birth_date) AS EXTRACT_MONTH_birth_date",
    );
    const state = selectFunction(meta, fnState(meta, "display_name", search()), "GROUP_CONCAT");
    expect(writeExpr(setArg(state, 0, { flag_before: "DISTINCT" }), "select")).toBe(
      "GROUP_CONCAT(DISTINCT display_name) AS GROUP_CONCAT_display_name",
    );
  });

  // deviation:alias-names-flags
  it("keeps an edited column's alias where core keeps it, so its references stay valid", () => {
    const core = fnState(meta, "EXTRACT(YEAR FROM birth_date) AS EXTRACT_birth_date", search());
    const previous = { state: core, alias: "EXTRACT_birth_date" };
    expect(writeExpr(setArg(core, 0, { flag_before: "MONTH" }), "select", previous)).toBe(
      "EXTRACT(MONTH FROM birth_date) AS EXTRACT_birth_date",
    );
    const otherField = setArg(core, 1, { value: "created_date" });
    expect(writeExpr(otherField, "select", previous)).toBe(
      "EXTRACT(YEAR FROM created_date) AS EXTRACT_YEAR_created_date",
    );
    // A name carrying the unit follows it, so a new column with the old unit cannot collide.
    const named = { state: core, alias: "EXTRACT_YEAR_birth_date" };
    expect(writeExpr(setArg(core, 0, { flag_before: "MONTH" }), "select", named)).toBe(
      "EXTRACT(MONTH FROM birth_date) AS EXTRACT_MONTH_birth_date",
    );
  });

  it("keeps the flag of an argument that takes a value out of the alias, also for zero", () => {
    const dateAdd = {
      name: "DATE_ADD",
      title: "Add to date",
      category: "date",
      options: false,
      data_type: "Date",
      params: [
        { max_expr: 1, min_expr: 1, must_be: ["SqlField"], label: "Date" },
        {
          max_expr: 1,
          min_expr: 1,
          must_be: ["SqlNumber"],
          label: "Interval to add",
          flag_before: { INTERVAL: "Add" },
          flag_after: { DAY: "Days" },
        },
      ],
    };
    const withDateAdd = { ...meta, functions: [...meta.functions, dateAdd] };
    const write = (expr: string) => writeExpr(fnState(withDateAdd, expr, search()), "select");
    expect(write("DATE_ADD(birth_date, INTERVAL 0 DAY)")).toBe(
      "DATE_ADD(birth_date, INTERVAL 0 DAY) AS DATE_ADD_birth_date",
    );
    expect(write("DATE_ADD(birth_date, INTERVAL 2 DAY)")).toBe(
      "DATE_ADD(birth_date, INTERVAL 2 DAY) AS DATE_ADD_birth_date_2",
    );
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
