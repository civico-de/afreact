import { asText, checkConditions, evaluate, parseConditions, type Condition } from "./conditions";
import type { FormData } from "./types";

const data: FormData = {
  Individual1: [
    {
      fields: { first_name: "Ada", age: 36, tags: [1, 3], is_reserved: true, empty: "" },
      joins: { Email: [{ email: "ada@example.org" }] },
    },
  ],
};
const check = (conditions: Condition[]) => checkConditions(conditions, data);

describe("parseConditions", () => {
  it("reads af-if as FormBuilder writes it", () => {
    expect(parseConditions('([["Role1[0][fields][name]","!=","\\"admin\\""]])')).toEqual([
      ["Role1[0][fields][name]", "!=", '"admin"'],
    ]);
    expect(() => parseConditions("(x)")).toThrow();
    expect(() => parseConditions('({"a": 1})')).toThrow("must be a list");
  });
});

describe("evaluate", () => {
  it("reads literals and paths into the form data", () => {
    expect(evaluate('"admin"', data)).toBe("admin");
    expect(evaluate("'it\\'s'", data)).toBe("it's");
    expect(evaluate("true", data)).toBe(true);
    expect(evaluate("5", data)).toBe(5);
    expect(evaluate('["a",2]', data)).toEqual(["a", 2]);
    expect(evaluate("Individual1[0][fields][first_name]", data)).toBe("Ada");
    expect(evaluate("Individual1[0]['fields'][\"age\"]", data)).toBe(36);
    expect(evaluate("Individual1[0].joins.Email[0].email", data)).toBe("ada@example.org");
    expect(evaluate("Individual1[1][fields][first_name]", data)).toBeUndefined();
    expect(evaluate(undefined, data)).toBeUndefined();
    expect(evaluate("", data)).toBeUndefined();
    expect(() => evaluate("a + b", data)).toThrow();
  });
});

describe("checkConditions", () => {
  const name = "Individual1[0][fields][first_name]";
  it("compares like afForm, strings case-insensitively", () => {
    expect(check([[name, "=", '"ada"']])).toBe(true);
    expect(check([[name, "==", '"ADA"']])).toBe(true);
    expect(check([[name, "!=", '"ada"']])).toBe(false);
    expect(check([["Individual1[0][fields][age]", ">", "30"]])).toBe(true);
    expect(check([["Individual1[0][fields][age]", "<", "30"]])).toBe(false);
    expect(check([["Individual1[0][fields][age]", ">=", "36"]])).toBe(true);
    expect(check([["Individual1[0][fields][age]", "<=", "35"]])).toBe(false);
    expect(check([["Individual1[0][fields][empty]", "IS EMPTY"]])).toBe(true);
    expect(check([[name, "IS NOT EMPTY"]])).toBe(true);
    expect(check([["Individual1[0][fields][tags]", "CONTAINS", "3"]])).toBe(true);
    expect(check([["Individual1[0][fields][tags]", "NOT CONTAINS", "3"]])).toBe(false);
    expect(check([[name, "CONTAINS", '"D"']])).toBe(true);
    expect(check([["Individual1[0][fields][age]", "IN", "[35,36]"]])).toBe(true);
    expect(check([["Individual1[0][fields][age]", "NOT IN", "[35,36]"]])).toBe(false);
    expect(check([["Individual1[0][fields][age]", "IN", "36"]])).toBe(true);
    expect(check([[name, "LIKE", '"a_%"']])).toBe(true);
    expect(check([[name, "NOT LIKE", '"b%"']])).toBe(true);
    expect(check([["Individual1[0][fields][is_reserved]", "==", "true"]])).toBe(true);
    expect(check([["Individual1[0][fields][tags]", "=", "[1,3]"]])).toBe(true);
  });

  it("joins clauses with AND, and nests OR and NOT groups", () => {
    const yes: Condition = [name, "=", '"Ada"'];
    const no: Condition = [name, "=", '"Bob"'];
    expect(check([yes, no])).toBe(false);
    expect(check([yes, ["OR", [no, yes]]])).toBe(true);
    expect(check([["OR", [no, no]]])).toBe(false);
    expect(check([["NOT", [no]]])).toBe(true);
    expect(check([["NOT", [yes, no]]])).toBe(false);
    expect(check([])).toBe(true);
  });

  it("lets a clause with an operator afForm does not know decide nothing", () => {
    const no: Condition = [name, "=", '"Bob"'];
    for (const op of ["IS NULL", "IS NOT NULL"]) {
      const unknown: Condition = [name, op, "[1,2]"];
      expect(check([unknown])).toBe(true);
      expect(check([unknown, no])).toBe(false);
      expect(check([["OR", [unknown, no]]])).toBe(false);
      expect(check([["NOT", [unknown]]])).toBe(true);
    }
  });

  it("takes an emptied list or range as empty, and false or 0 as an answer", () => {
    const answers = (value: unknown): FormData => ({ Individual1: [{ fields: { answer: value } }] });
    const answer = "Individual1[0][fields][answer]";
    for (const empty of [undefined, null, "", [], {}]) {
      expect(checkConditions([[answer, "IS EMPTY"]], answers(empty))).toBe(true);
      expect(checkConditions([[answer, "IS NOT EMPTY"]], answers(empty))).toBe(false);
    }
    for (const given of [false, 0, "0", [1], { min: 1 }]) {
      expect(checkConditions([[answer, "IS EMPTY"]], answers(given))).toBe(false);
      expect(checkConditions([[answer, "IS NOT EMPTY"]], answers(given))).toBe(true);
    }
  });

  it("checks BETWEEN and NOT BETWEEN against both bounds, inclusive", () => {
    const age = "Individual1[0][fields][age]";
    expect(check([[age, "BETWEEN", "[30,40]"]])).toBe(true);
    expect(check([[age, "BETWEEN", "[36,36]"]])).toBe(true);
    expect(check([[age, "BETWEEN", "[37,40]"]])).toBe(false);
    expect(check([[age, "NOT BETWEEN", "[37,40]"]])).toBe(true);
    expect(check([[age, "NOT BETWEEN", "[30,40]"]])).toBe(false);
    expect(check([[name, "BETWEEN", '["A","B"]']])).toBe(true);
    // Dates compare as text, as afForm compares the strings.
    const dates: FormData = { Activity1: [{ fields: { date: "2026-05-01" } }] };
    const date = "Activity1[0][fields][date]";
    expect(checkConditions([[date, "BETWEEN", '["2026-01-01","2026-12-31"]']], dates)).toBe(true);
    expect(checkConditions([[date, "BETWEEN", '["2026-06-01","2026-12-31"]']], dates)).toBe(false);
    // An empty value is outside any range of numbers.
    expect(check([["Individual1[0][fields][missing]", "BETWEEN", "[0,10]"]])).toBe(false);
    expect(check([["Individual1[0][fields][missing]", "NOT BETWEEN", "[0,10]"]])).toBe(true);
  });

  it("makes BETWEEN and NOT BETWEEN false without a pair of bounds", () => {
    const age = "Individual1[0][fields][age]";
    for (const bounds of ["36", "[30]", "[30,40,50]"]) {
      expect(check([[age, "BETWEEN", bounds]])).toBe(false);
      expect(check([[age, "NOT BETWEEN", bounds]])).toBe(false);
    }
  });

  it("treats an empty group operator as AND", () => {
    const yes: Condition = [name, "=", '"Ada"'];
    const no: Condition = [name, "=", '"Bob"'];
    expect(check([["", [yes, no]]])).toBe(false);
    expect(check([[null, [yes, yes]]])).toBe(true);
  });

  it("orders lists by their text, as JavaScript's relational operators do", () => {
    const tags = "Individual1[0][fields][tags]";
    expect(check([[tags, ">", '"1,2"']])).toBe(true);
    expect(check([[tags, "<", '"1,4"']])).toBe(true);
    expect(check([[tags, ">=", '"1,3"']])).toBe(true);
    expect(check([[tags, ">", "0"]])).toBe(false);
  });
});

describe("asText", () => {
  it("writes form data as String() does", () => {
    const cases: [unknown, string][] = [
      ["a", "a"],
      [1.5, "1.5"],
      [false, "false"],
      [null, "null"],
      [undefined, "undefined"],
      [[1, [2, null], "x"], "1,2,,x"],
      [{ a: 1 }, "[object Object]"],
      [[], ""],
    ];
    for (const [value, text] of cases) expect(asText(value)).toBe(text);
  });

  it("rejects a value JSON form data cannot hold", () => {
    expect(() => asText(() => 1)).toThrow("Form data holds no function value.");
  });
});
