import type { Column, EditableInfo } from "./types";

/**
 * Batch data entry (crmSearchDisplayBatch): rows of an `Import_<userJobId>` table, keyed by the
 * import column names SearchKit stores in each column's `spec`.
 */

export type BatchRow = Record<string, unknown> & { _id: number };

/** The import column a display column writes to; columns without a spec hold nothing. */
export function columnName(column: Column): string | null {
  return column.spec?.name ?? null;
}

/** Whether the column takes input, as opposed to a value shown or computed. */
export function isInput(info: EditableInfo | undefined): info is EditableInfo {
  return !!info && info.input_type !== "DisplayOnly";
}

const isEmpty = (value: unknown) =>
  value === null ||
  value === undefined ||
  value === "" ||
  (Array.isArray(value) && value.length === 0);

/** A formula from the field's input_attrs, e.g. Contribution.net_amount's. */
export function formulaOf(info: EditableInfo | undefined): string | null {
  const attrs = info?.input_attrs;
  if (typeof attrs !== "object" || attrs === null || !("formula" in attrs)) return null;
  return typeof attrs.formula === "string" ? attrs.formula : null;
}

type Token = { number: number } | { field: string } | { op: string };

function tokenize(formula: string): Token[] | null {
  const tokens: Token[] = [];
  const pattern = /\s*(?:(\d+(?:\.\d+)?)|\[([\w.:]+)\]|([-+*/()]))/y;
  let rest = formula.trim();
  while (rest) {
    pattern.lastIndex = 0;
    const match = pattern.exec(rest);
    if (!match) return null;
    const [whole, number, field, op] = match;
    if (number !== undefined) tokens.push({ number: Number(number) });
    else if (field !== undefined) tokens.push({ field });
    else if (op !== undefined) tokens.push({ op });
    rest = rest.slice(whole.length).trim();
  }
  return tokens;
}

/**
 * The fields, numbers and arithmetic of a formula as a function of the fields' values; null for
 * anything else. An empty or non-numeric value counts as 0, as `|| 0` in core.
 */
export function parseFormula(
  formula: string,
): ((value: (field: string) => unknown) => number) | null {
  const tokens = tokenize(formula);
  if (!tokens?.length) return null;
  type Node = (value: (field: string) => unknown) => number;
  let at = 0;
  /** The next token if it is one of `ops`, consumed. */
  const takeOp = (...ops: string[]): string | null => {
    const token = tokens[at];
    if (!token || !("op" in token) || !ops.includes(token.op)) return null;
    at++;
    return token.op;
  };
  const expression = (): Node | null => {
    let left = term();
    while (left) {
      const op = takeOp("+", "-");
      if (!op) break;
      const right = term();
      if (!right) return null;
      const before = left;
      left = op === "+" ? (v) => before(v) + right(v) : (v) => before(v) - right(v);
    }
    return left;
  };
  const term = (): Node | null => {
    let left = factor();
    while (left) {
      const op = takeOp("*", "/");
      if (!op) break;
      const right = factor();
      if (!right) return null;
      const before = left;
      left = op === "*" ? (v) => before(v) * right(v) : (v) => before(v) / right(v);
    }
    return left;
  };
  const factor = (): Node | null => {
    const token = tokens[at++];
    if (!token) return null;
    if ("number" in token) return () => token.number;
    if ("field" in token)
      return (value) => {
        // deviation:batch-formula-numbers
        const number = Number(value(token.field));
        return Number.isFinite(number) ? number : 0;
      };
    if (token.op === "-") {
      const inner = factor();
      return inner && ((v) => -inner(v));
    }
    if (token.op !== "(") return null;
    const inner = expression();
    if (!inner || !takeOp(")")) return null;
    return inner;
  };
  const root = expression();
  return root && at === tokens.length ? root : null;
}

// deviation:batch-tally-exact
/** Drops binary floating point noise: 10.1 + 20.2 gives 30.3, not 30.299999999999997. */
const exact = (value: number) => Number(value.toPrecision(15));

/**
 * The rows with each formula column computed from the other columns of its row. A formula names
 * fields of its own entity; the column showing such a field holds its value.
 */
export function withFormulas(
  rows: BatchRow[],
  columns: Column[],
  editable: Record<string, EditableInfo>,
): BatchRow[] {
  const formulas = columns.flatMap((column) => {
    const info = column.key ? editable[column.key] : undefined;
    const formula = formulaOf(info);
    const name = columnName(column);
    const compute = formula && parseFormula(formula);
    if (!info || !name || !compute) return [];
    // deviation:batch-formula-joined-columns
    const prefix = info.explicit_join ? `${info.explicit_join}.` : "";
    const source = (field: string) => {
      const other = columns.find((candidate) => candidate.key?.split(":")[0] === prefix + field);
      return other ? columnName(other) : null;
    };
    return [{ name, compute, source }];
  });
  if (!formulas.length) return rows;
  return rows.map((row) => {
    let next = row;
    for (const { name, compute, source } of formulas) {
      const value = compute((field) => {
        const read = source(field);
        return read ? next[read] : undefined;
      });
      const result = Number.isFinite(value) ? exact(value) : null;
      if (next[name] !== result) next = { ...next, [name]: result };
    }
    return next;
  });
}

/** Columns whose formula the renderer cannot compute, for the display's note. */
export function unreadFormulas(
  columns: Column[],
  editable: Record<string, EditableInfo>,
): string[] {
  return columns.flatMap((column) => {
    const formula = formulaOf(column.key ? editable[column.key] : undefined);
    return formula && !parseFormula(formula) ? [`formula ${formula}`] : [];
  });
}

/** getTally(): COUNT of filled values, or SUM or AVG over every row. */
export function tallyOf(rows: BatchRow[], column: Column): number {
  const fn = column.tally?.fn;
  const name = columnName(column);
  if (!fn || !name) return 0;
  let total = 0;
  for (const row of rows) {
    const value = row[name];
    // Falsy values count for nothing, as `if (row.data[...])` in core.
    if (!value) continue;
    if (fn === "COUNT") {
      total++;
      continue;
    }
    const number = Number(value);
    if (!Number.isFinite(number)) continue;
    total += number;
  }
  if (fn === "AVG") return rows.length ? exact(total / rows.length) : 0;
  return exact(total);
}

/** The total a SUM column is expected to reach, as given when the batch started. */
export function targetOf(column: Column, editable: Record<string, EditableInfo>): number | null {
  if (column.tally?.fn !== "SUM" || !column.key) return null;
  const target = editable[column.key]?.target;
  if (target === null || target === undefined || target === "") return null;
  const number = Number(target);
  return Number.isFinite(number) && number !== 0 ? number : null;
}

/** getTallyMismatches(): each target the column's total misses. */
export function tallyMismatches(
  rows: BatchRow[],
  columns: Column[],
  editable: Record<string, EditableInfo>,
): string[] {
  return columns.flatMap((column) => {
    const target = targetOf(column, editable);
    if (target === null) return [];
    const tally = tallyOf(rows, column);
    return tally === target
      ? []
      : [
          ts("%1 value %2 does not match expected %3", {
            1: column.label ?? "",
            2: tally,
            3: target,
          }),
        ];
  });
}

/** Required inputs left empty, by row number from 1, on every page. */
export function missingValues(
  rows: BatchRow[],
  columns: Column[],
  editable: Record<string, EditableInfo>,
): { row: number; labels: string[] }[] {
  const required = columns.filter((column) => {
    const info = column.key ? editable[column.key] : undefined;
    return isInput(info) && !!info.required && !!columnName(column);
  });
  return rows.flatMap((row, index) => {
    const labels = required
      .filter((column) => isEmpty(row[columnName(column) ?? ""]))
      .map((column) => column.label ?? column.key ?? "");
    return labels.length ? [{ row: index + 1, labels }] : [];
  });
}

/** showValidationErrors(): the first three rows with missing values, and how many more. */
export function missingMessages(missing: { row: number; labels: string[] }[]): string[] {
  const shown = missing
    .slice(0, 3)
    .map(({ row, labels }) => ts("Row %1: %2", { 1: row, 2: labels.join(", ") }));
  const more = missing.length - shown.length;
  return more > 0 ? [...shown, ts("And %1 more", { 1: more })] : shown;
}

/** A row as the API sends it after `save` with `reload`, without the import's status. */
export function newRow(saved: Record<string, unknown>): BatchRow | null {
  const { _entity_id: _entity, _status: _state, _status_message: _message, ...data } = saved;
  return typeof data._id === "number" ? { ...data, _id: data._id } : null;
}

export const isBatchRow = (value: unknown): value is BatchRow =>
  typeof value === "object" && value !== null && "_id" in value && typeof value._id === "number";
