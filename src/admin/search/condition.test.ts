import {
  allowedOperators,
  dateTypeOf,
  dateTypeValue,
  fitOperator,
  formatValue,
  fromClauseValue,
  inputKind,
  inputModeOf,
  isMulti,
  relativeParts,
  relativeValue,
  toClauseValue,
  withInputMode,
  withOperator,
} from "./condition";

const ops = [
  "=",
  "!=",
  "<",
  ">",
  "IN",
  "BETWEEN",
  "LIKE",
  "CONTAINS",
  "IS NULL",
  "IS EMPTY",
  "IS NOT NULL",
].map((key) => ({ key, value: key }));
const keys = (list: { key: string }[]) => list.map((o) => o.key);

describe("allowedOperators", () => {
  it("narrows by data type, prefers the field's own list and otherwise allows all", () => {
    expect(keys(allowedOperators({ name: "b", data_type: "Boolean" }, ops))).toEqual([
      "=",
      "!=",
      "IS NULL",
      "IS EMPTY",
      "IS NOT NULL",
    ]);
    expect(keys(allowedOperators({ name: "d", data_type: "Date" }, ops))).toEqual([
      "=",
      "!=",
      "<",
      ">",
      "IN",
      "BETWEEN",
      "IS EMPTY",
    ]);
    expect(keys(allowedOperators({ name: "a", data_type: "String", serialize: 1 }, ops))).toEqual([
      "CONTAINS",
      "IS EMPTY",
    ]);
    expect(
      keys(allowedOperators({ name: "x", data_type: "String", operators: ["LIKE"] }, ops)),
    ).toEqual(["LIKE"]);
    expect(allowedOperators({ name: "s", data_type: "String" }, ops)).toBe(ops);
  });
});

describe("withOperator", () => {
  it("drops the value for IS operators and turns it into a list or pair as needed", () => {
    expect(withOperator(["f", "=", "x"], 1, "IS NULL")).toEqual(["f", "IS NULL"]);
    expect(withOperator(["f", "IS NULL"], 1, "=")).toEqual(["f", "=", ""]);
    expect(withOperator(["f", "=", "x"], 1, "IN")).toEqual(["f", "IN", []]);
    expect(withOperator(["f", "IN", [1, 2, 3]], 1, "BETWEEN")).toEqual(["f", "BETWEEN", [1, 2]]);
    expect(withOperator(["f", "IN", [1]], 1, "=")).toEqual(["f", "=", ""]);
  });

  it("keeps a clause whose operator is allowed and fits one that is not", () => {
    const clause = ["f", "="];
    expect(fitOperator(clause, 1, ops)).toBe(clause);
    expect(fitOperator(["f", "LIKE", "x"], 1, [{ key: "IN", value: "IN" }])).toEqual([
      "f",
      "IN",
      [],
    ]);
  });
});

describe("inputs", () => {
  it("picks the input core's template switch picks", () => {
    expect(inputKind({ name: "x", data_type: "Integer", options: true }, "LIKE")).toBe("text");
    expect(inputKind({ name: "x", data_type: "Integer", options: true }, "=")).toBe("select");
    expect(inputKind({ name: "x", data_type: "Integer", options: true }, ">")).toBe("integer");
    expect(
      inputKind({ name: "x", data_type: "Integer", options: true, suffixes: ["label"] }, "="),
    ).toBe("integer");
    expect(inputKind({ name: "id", data_type: "Integer" }, "=")).toBe("entityref");
    expect(inputKind({ name: "x", data_type: "Timestamp" }, "=")).toBe("date");
    expect(inputKind({ name: "x", data_type: "String", input_type: "Location" }, "=")).toBe(
      "location",
    );
    expect(inputKind({ name: "x", data_type: "String", input_type: "Email" }, "=")).toBe("email");
    expect(isMulti({ name: "x", data_type: "String" }, "IN")).toBe(true);
    expect(isMulti({ name: "x", data_type: "Array" }, undefined)).toBe(true);
  });

  it("formats numbers except option keys, regexes and mixed FK values", () => {
    const int = { name: "n", data_type: "Integer" };
    expect(formatValue(int, "=", undefined, "5")).toBe(5);
    expect(formatValue(int, "IN", undefined, ["1", "2"])).toEqual([1, 2]);
    expect(formatValue(int, "=", "name", "5")).toBe("5");
    expect(formatValue(int, "REGEXP", undefined, "5")).toBe("5");
    expect(formatValue({ ...int, fk_entity: "Contact" }, "=", undefined, "user_contact_id")).toBe(
      "user_contact_id",
    );
    expect(formatValue(int, "=", undefined, "")).toBe("");
  });

  it("quotes ON clause strings as JSON", () => {
    expect(toClauseValue("a", "json")).toBe('"a"');
    expect(fromClauseValue('"a"', "json")).toBe("a");
    expect(toClauseValue("a", undefined)).toBe("a");
  });
});

describe("dates", () => {
  const ranges = [{ id: "this.year" }];
  it("reads and starts each date type", () => {
    expect(dateTypeOf("this.year", ranges)).toBe("range");
    expect(dateTypeOf("now", ranges)).toBe("now");
    expect(dateTypeOf("now - 3 day", ranges)).toBe("now -");
    expect(dateTypeOf("2026-01-01", ranges)).toBe("fixed");
    expect(dateTypeValue("now +", ranges)).toBe("now + 1 day");
    expect(dateTypeValue("range", ranges)).toBe("this.year");
    expect(relativeParts("now - 3 week")).toEqual({ number: 3, unit: "week" });
    expect(relativeValue("now - 3 week", 5, "month")).toBe("now - 5 month");
  });
});

describe("input mode", () => {
  it("tells a field by the WHERE flag or the unquoted ON value", () => {
    expect(inputModeOf(["a", "=", "b", true], 1, undefined)).toBe("field");
    expect(inputModeOf(["a", "=", "b"], 1, undefined)).toBe("value");
    expect(inputModeOf(["a", "=", "b.c"], 1, "json")).toBe("field");
    expect(inputModeOf(["a", "=", '"b"'], 1, "json")).toBe("value");
    expect(withInputMode(["a", "=", "x"], 1, "field", undefined)).toEqual(["a", "=", "", true]);
    expect(withInputMode(["a", "=", "x", true], 1, "value", undefined)).toEqual(["a", "=", ""]);
  });
});
