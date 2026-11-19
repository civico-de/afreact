import { compare } from "./conditions";
import type { FormData, Scope } from "./types";

/**
 * afreact-if, afreact-required and afreact-disabled (ADR 0012): core's condition list over
 * tokens such as `[Individual1.0.Email.@.location_type_id]`, where `@` is the row of the
 * af-repeat the element is drawn in and a token may stand on either side of a clause.
 */

export const ROW_CONDITIONS = {
  "af-if": "afreact-if",
  "af-required": "afreact-required",
  "af-disabled": "afreact-disabled",
} as const;

export type RowCondition = (typeof ROW_CONDITIONS)[keyof typeof ROW_CONDITIONS];

const TOKEN = /^\[([A-Za-z0-9_]+)\.(\d+|@)\.([^\]]+)\]$/;
/** A join inside a token: `Email.@.location_type_id`; custom field names hold dots but no index. */
const JOIN = /^([A-Za-z0-9_]+)\.(\d+|@)\.(.+)$/;
const GROUPS = new Set(["AND", "OR", "NOT"]);

export interface Token {
  entity: string;
  index: number | "@";
  join?: { name: string; index: number | "@" };
  field: string;
}

const position = (text: string): number | "@" => (text === "@" ? "@" : Number(text));

export function parseToken(value: unknown): Token | null {
  if (typeof value !== "string") return null;
  const match = TOKEN.exec(value);
  if (!match) return null;
  const [, entity = "", index = "", rest = ""] = match;
  const join = JOIN.exec(rest);
  if (!join) return { entity, index: position(index), field: rest };
  const [, name = "", joinIndex = "", field = ""] = join;
  return {
    entity,
    index: position(index),
    join: { name, index: position(joinIndex) },
    field,
  };
}

/** The attribute's condition list; throws on anything that is not one, so the element shows its note. */
export function parseRowConditions(attribute: string): unknown[] {
  const json = attribute.trim().replace(/^\(([\s\S]*)\)$/, "$1");
  const conditions: unknown = JSON.parse(json);
  if (!Array.isArray(conditions)) throw new Error(`Conditions must be a list: ${attribute}`);
  checkShape(conditions);
  return conditions;
}

function checkShape(expression: unknown[]): void {
  if (expression.every(Array.isArray)) {
    for (const clause of expression) if (Array.isArray(clause)) checkShape(clause);
    return;
  }
  const [head, second] = expression;
  if (typeof head === "string" && GROUPS.has(head)) {
    if (!Array.isArray(second)) throw new Error(`${head} needs a list of conditions.`);
    second.forEach((clause) => {
      if (!Array.isArray(clause)) throw new Error(`${head} holds a value that is no condition.`);
      checkShape(clause);
    });
    return;
  }
  if (parseToken(head) === null)
    throw new Error(`A clause must start with a token: ${JSON.stringify(head)}`);
  if (typeof second !== "string")
    throw new Error(`A clause needs an operator: ${JSON.stringify(expression)}`);
}

/** The index a token's `@` stands for in this scope; a row the element is not in is an error. */
function rowIndex(token: Token, scope: Scope | null): { index: number; joinIndex?: number } {
  let index = token.index;
  if (index === "@") {
    if (scope?.entity !== token.entity)
      throw new Error(`${token.entity}.@ outside a row of ${token.entity}.`);
    index = scope.index;
  }
  if (!token.join) return { index };
  let joinIndex = token.join.index;
  if (joinIndex === "@") {
    if (
      scope?.entity !== token.entity ||
      scope.join !== token.join.name ||
      scope.joinIndex === undefined
    )
      throw new Error(`${token.join.name}.@ outside a row of ${token.join.name}.`);
    joinIndex = scope.joinIndex;
  }
  return { index, joinIndex };
}

/** A token's value, "" when the form holds none, as core's getTokenValue() answers. */
export function tokenValue(token: Token, data: FormData, scope: Scope | null): unknown {
  const { index, joinIndex } = rowIndex(token, scope);
  const item = data[token.entity]?.[index];
  if (!item) return "";
  const values = token.join ? item.joins?.[token.join.name]?.[joinIndex ?? 0] : item.fields;
  const value = values?.[token.field];
  return value === undefined ? "" : value;
}

const resolve = (value: unknown, data: FormData, scope: Scope | null) => {
  const token = parseToken(value);
  return token ? tokenValue(token, data, scope) : value;
};

/** Evaluated as master's afForm.evaluateBooleanExpression(); an operator it does not know is an error. */
export function checkRowConditions(
  expression: unknown[],
  data: FormData,
  scope: Scope | null,
): boolean {
  if (expression.every(Array.isArray)) return checkRowConditions(["AND", expression], data, scope);
  const [head, second, third] = expression;
  if (head === "AND" || head === "OR" || head === "NOT") {
    const clauses = Array.isArray(second)
      ? second.filter((clause): clause is unknown[] => Array.isArray(clause))
      : [];
    if (head === "OR") return clauses.some((clause) => checkRowConditions(clause, data, scope));
    if (head === "NOT") return clauses.every((clause) => !checkRowConditions(clause, data, scope));
    return clauses.every((clause) => checkRowConditions(clause, data, scope));
  }
  const operator = String(second);
  const result = compare(resolve(head, data, scope), operator, resolve(third, data, scope));
  if (result === undefined) throw new Error(`Unknown operator ${operator}.`);
  return result;
}

/** Every token of a condition list, for the checks that run without form data. */
export function rowConditionTokens(expression: unknown[]): Token[] {
  return expression.flatMap((item) => {
    if (Array.isArray(item)) return rowConditionTokens(item);
    const token = parseToken(item);
    return token ? [token] : [];
  });
}
