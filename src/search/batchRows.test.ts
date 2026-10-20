import { describe, expect, it } from "vitest";
import { editInfo } from "../test/editInfo";
import {
  missingMessages,
  missingValues,
  newRow,
  parseFormula,
  tallyMismatches,
  tallyOf,
  targetOf,
  unreadFormulas,
  withFormulas,
  type BatchRow,
} from "./batchRows";
import type { Column } from "./types";

const field = (key: string, extra: Partial<Column> = {}): Column => ({
  type: "field",
  key,
  label: key,
  spec: { name: key.replace(/[.:]/g, "_") },
  ...extra,
});

const amount = field("total_amount", { tally: { fn: "SUM", target: true } });
const fee = field("fee_amount", { tally: { fn: "SUM" } });
const net = field("net_amount");
const columns = [amount, fee, net];
const editable = {
  total_amount: editInfo({
    value_key: "total_amount",
    data_type: "Money",
    required: true,
    target: 30.3,
  }),
  fee_amount: editInfo({ value_key: "fee_amount", data_type: "Money" }),
  net_amount: editInfo({
    value_key: "net_amount",
    data_type: "Money",
    input_type: "DisplayOnly",
    input_attrs: { formula: "[total_amount] - [fee_amount]" },
  }),
};

describe("parseFormula", () => {
  const values: Record<string, unknown> = { a: "10.5", b: 2, c: null, d: "x" };
  const run = (formula: string) => parseFormula(formula)?.((name) => values[name]);

  it("computes fields and numbers with the usual precedence", () => {
    expect(run("[a] - [b]")).toBe(8.5);
    expect(run("1 + 2 * [b]")).toBe(5);
    expect(run("(1 + 2) * [b]")).toBe(6);
    expect(run("-[b] + 3")).toBe(1);
    expect(run("[a] / [b]")).toBe(5.25);
  });

  // deviation:batch-formula-numbers
  it("adds text values as numbers, not as joined strings", () => {
    expect(run("[a] + [a]")).toBe(21);
  });

  it("counts an empty or non-numeric value as 0, as core's `|| 0`", () => {
    expect(run("[c] + [d] + [missing] + 1")).toBe(1);
  });

  it("reads nothing but fields, numbers and arithmetic", () => {
    for (const formula of ["foo()", "[a] +", "[a] [b]", "(1", "", "alert(1)", "[a]; [b]"])
      expect(parseFormula(formula), formula).toBeNull();
  });
});

describe("withFormulas", () => {
  it("computes a formula column from the columns of its row, without float noise", () => {
    const rows: BatchRow[] = [
      { _id: 1, total_amount: "30.3", fee_amount: "0.1", net_amount: null },
    ];
    expect(withFormulas(rows, columns, editable)).toEqual([
      { _id: 1, total_amount: "30.3", fee_amount: "0.1", net_amount: 30.2 },
    ]);
  });

  it("keeps a row whose result is unchanged", () => {
    const row: BatchRow = { _id: 1, total_amount: 5, fee_amount: 1, net_amount: 4 };
    expect(withFormulas([row], columns, editable)[0]).toBe(row);
  });

  // deviation:batch-formula-joined-columns
  it("reads a joined entity's fields from the columns showing them", () => {
    const joined = [
      field("Soft.amount"),
      field("Soft.fee"),
      field("Soft.net", { spec: { name: "Soft_net_hash" } }),
    ];
    const info = {
      "Soft.amount": editInfo({ value_key: "amount", explicit_join: "Soft" }),
      "Soft.fee": editInfo({ value_key: "fee", explicit_join: "Soft" }),
      "Soft.net": editInfo({
        value_key: "net",
        explicit_join: "Soft",
        input_type: "DisplayOnly",
        input_attrs: { formula: "[amount] - [fee]" },
      }),
    };
    const rows: BatchRow[] = [{ _id: 1, Soft_amount: 7, Soft_fee: 2, Soft_net_hash: null }];
    expect(withFormulas(rows, joined, info)[0]?.Soft_net_hash).toBe(5);
  });

  it("notes a formula it cannot read and leaves its column alone", () => {
    const info = {
      ...editable,
      net_amount: { ...editable.net_amount, input_attrs: { formula: "max([a])" } },
    };
    const row: BatchRow = { _id: 1, total_amount: 5, net_amount: null };
    expect(withFormulas([row], columns, info)[0]).toBe(row);
    expect(unreadFormulas(columns, info)).toEqual(["formula max([a])"]);
    expect(unreadFormulas(columns, editable)).toEqual([]);
  });
});

describe("tallies", () => {
  const rows: BatchRow[] = [
    { _id: 1, total_amount: "10.1", fee_amount: null, flag: true },
    { _id: 2, total_amount: "20.2", fee_amount: "abc", flag: false },
    { _id: 3, total_amount: "", fee_amount: "0", flag: true },
  ];

  // deviation:batch-count-zero
  it("counts a typed 0 as filled, an unticked box and an empty list not", () => {
    const zero: BatchRow[] = [
      { _id: 1, total_amount: 0, flag: false },
      { _id: 2, total_amount: "0", flag: null },
      { _id: 3, total_amount: [], flag: [] },
    ];
    expect(tallyOf(zero, field("total_amount", { tally: { fn: "COUNT" } }))).toBe(2);
    expect(tallyOf(zero, field("flag", { tally: { fn: "COUNT" } }))).toBe(0);
  });

  // deviation:batch-tally-exact
  it("sums typed amounts exactly, counts filled values and averages over every row", () => {
    expect(tallyOf(rows, amount)).toBe(30.3);
    expect(tallyOf(rows, field("flag", { tally: { fn: "COUNT" } }))).toBe(2);
    expect(tallyOf(rows, field("total_amount", { tally: { fn: "AVG" } }))).toBe(10.1);
    expect(tallyOf(rows, fee)).toBe(0);
    expect(tallyOf(rows, net)).toBe(0);
  });

  it("checks a SUM against the target the batch started with", () => {
    expect(targetOf(amount, editable)).toBe(30.3);
    expect(targetOf(fee, editable)).toBeNull();
    expect(targetOf(amount, { total_amount: { ...editable.total_amount, target: 0 } })).toBeNull();
    expect(
      targetOf(amount, { total_amount: { ...editable.total_amount, target: null } }),
    ).toBeNull();
    expect(tallyMismatches(rows, columns, editable)).toEqual([]);
    expect(tallyMismatches(rows.slice(0, 1), columns, editable)).toEqual([
      "total_amount value 10.1 does not match expected 30.3",
    ]);
  });
});

describe("missing values", () => {
  it("lists the required inputs left empty on every row, by row number", () => {
    const required = {
      ...editable,
      fee_amount: { ...editable.fee_amount, required: true },
      net_amount: { ...editable.net_amount, required: true },
    };
    const rows: BatchRow[] = [
      { _id: 1, total_amount: "5", fee_amount: 0 },
      { _id: 2, total_amount: "", fee_amount: null },
      { _id: 3, total_amount: "1", fee_amount: [] },
    ];
    expect(missingValues(rows, columns, required)).toEqual([
      { row: 2, labels: ["total_amount", "fee_amount"] },
      { row: 3, labels: ["fee_amount"] },
    ]);
  });

  it("names the first three rows and how many more", () => {
    const missing = [1, 2, 3, 4, 5].map((row) => ({ row, labels: ["A", "B"] }));
    expect(missingMessages(missing)).toEqual([
      "Row 1: A, B",
      "Row 2: A, B",
      "Row 3: A, B",
      "And 2 more",
    ]);
    expect(missingMessages([])).toEqual([]);
  });
});

describe("newRow", () => {
  it("drops the import's status from a saved row", () => {
    expect(
      newRow({ _id: 4, _status: "NEW", _status_message: null, _entity_id: null, a: 1 }),
    ).toEqual({
      _id: 4,
      a: 1,
    });
    expect(newRow({ a: 1 })).toBeNull();
  });
});
