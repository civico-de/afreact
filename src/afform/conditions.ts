import { literal } from "./expressions";
import type { FormData } from "./types";

/**
 * afForm's checkConditions(): the conditions FormBuilder writes into af-if,
 * af-required, af-disabled and option `if`, evaluated against the form data.
 */

export type Condition = [unknown, unknown, unknown?];

const isConditionList = (value: unknown): value is Condition[] =>
  Array.isArray(value) && value.every((clause) => Array.isArray(clause));

const isIndexable = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** af-if="(…)": a JSON condition list in parentheses, as FormDataModel.php decodes it. */
export function parseConditions(attribute: string): Condition[] {
  const json = attribute.trim().replace(/^\(([\s\S]*)\)$/, "$1");
  const conditions: unknown = JSON.parse(json);
  if (!isConditionList(conditions)) throw new Error(`Conditions must be a list: ${attribute}`);
  return conditions;
}

export function checkConditions(
  conditions: Condition[],
  data: FormData,
  op: unknown = "AND",
): boolean {
  const operator = op === "" || op === null || op === undefined ? "AND" : op;
  // OR and AND invert each other; NOT is OR flipped at the end.
  let result = operator === "AND";
  const flip = !result;
  for (const clause of conditions) {
    const group = clause[1];
    const matches = isConditionList(group)
      ? checkConditions(group, data, clause[0])
      : compare(evaluate(clause[0], data), String(clause[1]), evaluate(clause[2], data));
    if (matches === flip) result = flip;
  }
  return operator === "NOT" ? !result : result;
}

const PATH = /^[A-Za-z_$][\w$]*(?:\[[^\]]+\]|\.[A-Za-z_$][\w$]*)*$/;
const SEGMENT = /\[\s*(?:'([^']*)'|"([^"]*)"|([^\]]*?))\s*\]|\.?([A-Za-z_$][\w$]*)/g;

/** The two Angular expression shapes conditions use: a literal, or a path into the form data. */
export function evaluate(expression: unknown, data: FormData): unknown {
  if (typeof expression !== "string") return expression;
  const text = expression.trim();
  if (text === "") return undefined;
  if (/^'(?:[^'\\]|\\.)*'$/.test(text)) return literal(text);
  if (!PATH.test(text) || text === "true" || text === "false" || text === "null") {
    const value: unknown = JSON.parse(text);
    return value;
  }
  let value: unknown = data;
  for (const match of text.matchAll(SEGMENT)) {
    const key = match[1] ?? match[2] ?? match[3] ?? match[4] ?? "";
    value = isIndexable(value) ? value[key] : undefined;
  }
  return value;
}

/** angular.equals(): deep equality where NaN equals NaN. */
function equals(a: unknown, b: unknown): boolean {
  if (a === b || (Number.isNaN(a) && Number.isNaN(b))) return true;
  if (!isIndexable(a) || !isIndexable(b) || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => equals(a[key], b[key]));
}

function like(text: string, pattern: string): boolean {
  const source = pattern
    .replace(/([.+?^=!:${}()|[\]/\\])/g, "\\$1")
    .replace(/%/g, ".*")
    .replace(/_/g, ".");
  return new RegExp(`^${source}$`, "i").test(text);
}

const lower = (value: unknown) => (typeof value === "string" ? value.toLowerCase() : value);

/** String() over JSON form data: a list joins its items, an object reads "[object Object]". */
export function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join();
  if (isIndexable(value)) return Object.prototype.toString.call(value);
  if (value === null || value === undefined) return String(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  throw new TypeError(`Form data holds no ${typeof value} value.`);
}

/** A list or object compares as its text, as JavaScript's relational operators convert it. */
const primitive = (value: unknown) => (isIndexable(value) ? asText(value) : value);

/** JavaScript's relational comparison: two strings compare as text, anything else as numbers. */
function order(left: unknown, right: unknown): number {
  const a = primitive(left);
  const b = primitive(right);
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
  return Number(a) - Number(b);
}

/** undefined for an operator afForm does not know (IS NULL, BETWEEN): the clause decides nothing. */
function compare(left: unknown, op: string, right: unknown): boolean | undefined {
  const yes = op !== "!=" && !op.includes("NOT ");
  switch (op) {
    case "=":
    case "!=":
    case "==":
      return equals(lower(left), lower(right)) === yes;
    case ">":
      return order(left, right) > 0;
    case "<":
      return order(left, right) < 0;
    case ">=":
      return order(left, right) >= 0;
    case "<=":
      return order(left, right) <= 0;
    case "IS EMPTY":
      return !left;
    case "IS NOT EMPTY":
      return !!left;
    case "CONTAINS":
    case "NOT CONTAINS":
      if (Array.isArray(left)) return left.includes(right) === yes;
      if (typeof left === "string" && typeof right === "string") {
        return left.toLowerCase().includes(right.toLowerCase()) === yes;
      }
      return equals(left, right) === yes;
    case "IN":
    case "NOT IN":
      return (Array.isArray(right) ? right.includes(left) : equals(left, right)) === yes;
    case "LIKE":
    case "NOT LIKE":
      if (typeof left === "string" && typeof right === "string") return like(left, right) === yes;
      return equals(left, right) === yes;
    default:
      return undefined;
  }
}
