import type { SchemaField } from "./meta";

export interface Operator {
  key: string;
  value: string;
}

/** A field as the condition editor reads it; `options` true means not loaded yet. */
export type ConditionField = Pick<SchemaField, "name" | "data_type"> &
  Partial<Pick<SchemaField, "label" | "input_type" | "fk_entity" | "options" | "suffixes">> & {
    entity?: string;
    operators?: string[] | null;
    serialize?: number | boolean | null;
    nullable?: boolean;
    required?: boolean;
    category?: string;
  };

const COMPARE = [
  "=",
  "!=",
  "<",
  ">",
  "<=",
  ">=",
  "IN",
  "NOT IN",
  "BETWEEN",
  "NOT BETWEEN",
  "IS EMPTY",
  "IS NOT EMPTY",
];
const ARRAY = [
  "CONTAINS",
  "NOT CONTAINS",
  "CONTAINS ONE OF",
  "NOT CONTAINS ONE OF",
  "IS EMPTY",
  "IS NOT EMPTY",
];

/** crmSearchCondition.getOperators: the field's own list, or one by data type, from core's operators. */
export function allowedOperators(field: ConditionField | undefined, all: Operator[]): Operator[] {
  let allowed = field?.operators ?? null;
  if (!allowed && field?.data_type === "Boolean")
    allowed = ["=", "!=", "IS EMPTY", "IS NOT NULL", "IS NULL"];
  if (!allowed && (field?.data_type === "Float" || field?.data_type === "Date")) allowed = COMPARE;
  if (!allowed && (field?.data_type === "Array" || field?.serialize)) allowed = ARRAY;
  if (!allowed) return all;
  const keys = allowed;
  return all.filter((operator) => keys.includes(operator.key));
}

/** False for IS NULL, IS EMPTY and the like. */
export const takesInput = (op: string) => !op.startsWith("IS ");

const ARRAY_OPS = ["IN", "NOT IN", "BETWEEN", "NOT BETWEEN"];
const BETWEEN = ["BETWEEN", "NOT BETWEEN"];

/** changeClauseOperator: sets `op` at `offset` and fits the value to it. */
export function withOperator(clause: unknown[], offset: number, op: string): unknown[] {
  const next = [...clause];
  next[offset] = op;
  if (!takesInput(op)) return next.slice(0, offset + 1);
  if (next.length === offset + 1) next.push("");
  const value = next[offset + 1];
  if (!Array.isArray(value) && ARRAY_OPS.includes(op)) next[offset + 1] = [];
  else if (Array.isArray(value) && !ARRAY_OPS.includes(op)) next[offset + 1] = "";
  const fitted = next[offset + 1];
  if (BETWEEN.includes(op) && Array.isArray(fitted)) next[offset + 1] = [fitted[0], fitted[1]];
  return next;
}

/** updateOperators: a clause whose operator the field does not allow takes the first allowed one. */
export function fitOperator(clause: unknown[], offset: number, allowed: Operator[]): unknown[] {
  const op = clause[offset];
  const first = allowed[0];
  if (!first || (typeof op === "string" && op && allowed.some((o) => o.key === op))) return clause;
  return withOperator(clause, offset, first.key);
}

const MULTI_OPS = [
  "IN",
  "NOT IN",
  "CONTAINS",
  "NOT CONTAINS",
  "CONTAINS ONE OF",
  "NOT CONTAINS ONE OF",
];

/** crmSearchInputVal.isMulti: by operator, or without one by the field. */
export function isMulti(field: ConditionField, op: string | undefined): boolean {
  if (op) return MULTI_OPS.includes(op);
  return !!field.serialize || field.data_type === "Array";
}

export const isDateField = (field: ConditionField) =>
  field.category === "partial_date" ||
  field.data_type === "Date" ||
  field.data_type === "Timestamp";

export type InputKind =
  | "text"
  | "location"
  | "date"
  | "boolean"
  | "color"
  | "select"
  | "entityref"
  | "integer"
  | "float"
  | "email"
  | "textarea";

const TEXT_OPS = ["LIKE", "NOT LIKE", "REGEXP", "NOT REGEXP", "REGEXP BINARY", "NOT REGEXP BINARY"];

/** crmSearchInputVal.getTemplate. */
export function inputKind(field: ConditionField, op: string | undefined): InputKind {
  if (op && TEXT_OPS.includes(op)) return "text";
  if (field.input_type === "Location") return "location";
  if (isDateField(field)) return "date";
  if (field.data_type === "Boolean") return "boolean";
  if (field.input_type === "Color") return "color";
  if (!op || ![">", "<", ">=", "<="].includes(op)) {
    if (field.options && (!field.suffixes || field.suffixes.includes("name"))) return "select";
    if (field.fk_entity || field.name === "id") return "entityref";
  }
  if (field.data_type === "Integer") return "integer";
  if (field.data_type === "Float") return "float";
  if (field.input_type === "Email") return "email";
  if (field.input_type === "TextArea") return "textarea";
  return "text";
}

/** crmSearchInput's formatDataType: numbers for number fields, except option keys, regexes and mixed FK values. */
export function formatValue(
  field: ConditionField | undefined,
  op: string | undefined,
  optionKey: string | undefined,
  value: unknown,
): unknown {
  if (value === null || value === undefined) return value;
  if (optionKey && optionKey !== "id") return value;
  if (op?.includes("REGEXP")) return value;
  if (Array.isArray(value)) return value.map((v) => formatValue(field, op, optionKey, v));
  if (
    (field?.data_type === "Integer" || field?.data_type === "Float") &&
    field.category !== "partial_date"
  ) {
    // deviation:number-default-kept
    if (value === "") return value;
    const number = Number(value);
    if ((field.name === "id" || field.fk_entity) && String(number) !== value) return value;
    return Number.isNaN(number) ? value : number;
  }
  return value;
}

/** An ON clause quotes string values as JSON; a WHERE clause holds them as they are. */
export function toClauseValue(value: unknown, format: "json" | undefined): unknown {
  return format === "json" && typeof value === "string" && value.length
    ? JSON.stringify(value)
    : value;
}

export function fromClauseValue(value: unknown, format: "json" | undefined): unknown {
  if (format !== "json" || typeof value !== "string" || !value.length) return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export type DateType = "fixed" | "range" | "now" | "now -" | "now +";

/** setDateType: which date input a stored value belongs to. */
export function dateTypeOf(value: unknown, ranges: { id: string }[]): DateType {
  if (typeof value !== "string") return "fixed";
  if (ranges.some((range) => range.id === value)) return "range";
  if (value === "now") return "now";
  if (value.includes("now -")) return "now -";
  if (value.includes("now +")) return "now +";
  return "fixed";
}

/** changeDateType: the value a newly chosen date type starts with. */
export function dateTypeValue(type: DateType, ranges: { id: string }[]): string {
  if (type === "fixed") return "";
  if (type === "range") return ranges[0]?.id ?? "";
  if (type === "now") return "now";
  return `${type} 1 day`;
}

/** "now - 3 day" as its number and unit. */
export function relativeParts(value: string): { number: number; unit: string } {
  const parts = value.split(" ");
  return { number: Number.parseInt(parts[2] ?? "1", 10), unit: parts[3] ?? "day" };
}

export function relativeValue(value: string, number: number, unit: string): string {
  const parts = value.split(" ");
  return `${parts[0] ?? "now"} ${parts[1] ?? "-"} ${String(number)} ${unit}`;
}

/** ON clauses tell a field by its unquoted name; WHERE clauses by the flag after the value. */
export function inputModeOf(
  clause: unknown[],
  offset: number,
  format: "json" | undefined,
): "value" | "field" {
  if (format !== "json") return clause[2 + offset] ? "field" : "value";
  const value = clause[1 + offset];
  return typeof value === "string" && /^[a-zA-Z]/.test(value) ? "field" : "value";
}

/** changeInputMode: an emptied value, and in WHERE clauses the field flag set or dropped. */
export function withInputMode(
  clause: unknown[],
  offset: number,
  mode: "value" | "field",
  format: "json" | undefined,
): unknown[] {
  const next = [...clause];
  next[1 + offset] = "";
  if (format === "json") return next;
  if (mode === "field") next[2 + offset] = true;
  else next.length = Math.min(next.length, 2 + offset);
  return next;
}
