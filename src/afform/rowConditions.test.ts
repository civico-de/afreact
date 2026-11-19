import {
  checkRowConditions,
  parseRowConditions,
  parseToken,
  rowConditionTokens,
  tokenValue,
} from "./rowConditions";
import type { FormData } from "./types";

const data: FormData = {
  Individual1: [
    {
      fields: { first_name: "Ada", last_name: "Ada", "Extra.colour": "red" },
      joins: {
        Phone: [
          { phone_type_id: 1, phone: "111" },
          { phone_type_id: 2, phone: "222" },
        ],
      },
    },
    { fields: { first_name: "Bob", last_name: "Smith" } },
  ],
};
const second = { entity: "Individual1", index: 0, join: "Phone", joinIndex: 1 };

describe("parseToken", () => {
  it("reads entity, row, join and field, and custom field names with dots", () => {
    expect(parseToken("[Individual1.@.first_name]")).toEqual({
      entity: "Individual1",
      index: "@",
      field: "first_name",
    });
    expect(parseToken("[Individual1.0.Phone.@.phone_type_id]")).toEqual({
      entity: "Individual1",
      index: 0,
      join: { name: "Phone", index: "@" },
      field: "phone_type_id",
    });
    expect(parseToken("[Individual1.0.Extra.colour]")?.field).toBe("Extra.colour");
    expect(parseToken("Individual1[0][fields][first_name]")).toBeNull();
    expect(parseToken(3)).toBeNull();
  });
});

describe("tokenValue", () => {
  it("resolves @ to the row the element is drawn in", () => {
    const token = parseToken("[Individual1.0.Phone.@.phone]")!;
    expect(tokenValue(token, data, second)).toBe("222");
    expect(
      tokenValue(parseToken("[Individual1.@.first_name]")!, data, {
        entity: "Individual1",
        index: 1,
      }),
    ).toBe("Bob");
  });

  it("answers an empty string for a value the form does not hold, as core does", () => {
    expect(tokenValue(parseToken("[Individual1.5.first_name]")!, data, null)).toBe("");
    expect(tokenValue(parseToken("[Individual1.0.Phone.7.phone]")!, data, null)).toBe("");
  });

  it("refuses @ outside a row of that entity or join", () => {
    expect(() =>
      tokenValue(parseToken("[Individual1.0.Phone.@.phone]")!, data, {
        entity: "Individual1",
        index: 0,
      }),
    ).toThrow(/Phone\.@/);
    expect(() => tokenValue(parseToken("[Organization1.@.name]")!, data, second)).toThrow(
      /Organization1\.@/,
    );
  });
});

describe("checkRowConditions", () => {
  const check = (conditions: string) =>
    checkRowConditions(parseRowConditions(conditions), data, second);

  it("compares a field of the element's own row", () => {
    expect(check('([["[Individual1.0.Phone.@.phone_type_id]", "=", 2]])')).toBe(true);
    expect(check('([["[Individual1.0.Phone.@.phone_type_id]", "=", 1]])')).toBe(false);
  });

  it("reads a token as the compared value, so two fields compare", () => {
    expect(check('[["[Individual1.0.first_name]", "=", "[Individual1.0.last_name]"]]')).toBe(true);
    expect(check('[["[Individual1.1.first_name]", "=", "[Individual1.1.last_name]"]]')).toBe(false);
  });

  it("joins clauses with AND and nests OR and NOT groups, as master's afForm", () => {
    expect(
      check(
        '[["OR", [["[Individual1.0.first_name]", "=", "x"], ["[Individual1.0.Phone.@.phone]", "=", "222"]]]]',
      ),
    ).toBe(true);
    expect(check('["NOT", [["[Individual1.0.first_name]", "=", "ada"]]]')).toBe(false);
    expect(
      check(
        '[["[Individual1.0.first_name]", "=", "ada"], ["[Individual1.0.Phone.@.phone]", "=", "111"]]',
      ),
    ).toBe(false);
  });

  it("refuses an operator it does not know, and a list that is no condition", () => {
    expect(() => check('[["[Individual1.0.first_name]", "~", "ada"]]')).toThrow(/Unknown operator/);
    expect(() =>
      parseRowConditions('[["Individual1[0][fields][first_name]", "=", "ada"]]'),
    ).toThrow(/token/);
    expect(() => parseRowConditions('{"a": 1}')).toThrow(/list/);
    expect(() => parseRowConditions('[["OR", "x"]]')).toThrow(/OR/);
  });
});

describe("rowConditionTokens", () => {
  it("lists the tokens on both sides of every clause", () => {
    const tokens = rowConditionTokens(
      parseRowConditions('[["OR", [["[A1.@.x]", "=", "[A1.0.y]"], ["[A1.0.J.@.z]", "IS EMPTY"]]]]'),
    );
    expect(tokens.map((token) => token.field)).toEqual(["x", "y", "z"]);
  });
});
