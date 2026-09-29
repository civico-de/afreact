import { createContext } from "react";

/**
 * The `filters` attribute of an embedded search display: an Angular object literal such as
 * `{custom_group_id: routeParams.gid, entity_table: 'civicrm_contact'}`.
 */

type Term =
  | { literal: unknown }
  /** routeParams.x or options.x */
  | { scope: "routeParams" | "options"; key: string };

export type DisplayFilters = [string, Term][];

/** The placement options a form was opened with (afCore's `options`, e.g. contact_id). */
export const RouteOptionsContext = createContext<Record<string, unknown> | undefined>(undefined);

const TOKEN =
  /\s*(?:(\{|\}|,|:)|'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|(-?\d+(?:\.\d+)?)|([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*))/y;

type Token = { punct: string } | { text: string } | { number: number } | { word: string };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < source.length) {
    if (/^\s*$/.test(source.slice(TOKEN.lastIndex))) break;
    const start = TOKEN.lastIndex;
    const match = TOKEN.exec(source);
    if (!match) throw new Error(`Unexpected "${source.slice(start)}"`);
    const [, punct, single, double, number, word] = match;
    if (punct !== undefined) tokens.push({ punct });
    else if (single !== undefined || double !== undefined)
      tokens.push({ text: (single ?? double ?? "").replace(/\\(.)/g, "$1") });
    else if (number !== undefined) tokens.push({ number: Number(number) });
    else tokens.push({ word: word ?? "" });
  }
  return tokens;
}

function term(token: Token | undefined): Term {
  if (!token || "punct" in token) throw new Error("A value is missing");
  if ("text" in token) return { literal: token.text };
  if ("number" in token) return { literal: token.number };
  const word = token.word;
  if (word === "true" || word === "false") return { literal: word === "true" };
  if (word === "null") return { literal: null };
  const [scope, key, ...rest] = word.split(".");
  if ((scope === "routeParams" || scope === "options") && key && rest.length === 0)
    return { scope, key };
  throw new Error(`Unsupported value ${word}`);
}

/** Parses the literal; anything beyond keys, literals and routeParams./options. names throws. */
export function parseDisplayFilters(source: string): DisplayFilters {
  const tokens = tokenize(source);
  const isPunct = (index: number, expected: string) => {
    const token = tokens[index];
    return !!token && "punct" in token && token.punct === expected;
  };
  if (!isPunct(0, "{")) throw new Error(`Expected "{" in ${source}`);
  const entries: DisplayFilters = [];
  let index = 1;
  while (!isPunct(index, "}")) {
    const key = tokens[index];
    if (!key || "punct" in key || "number" in key) throw new Error(`Expected a key in ${source}`);
    if (!isPunct(index + 1, ":")) throw new Error(`Expected ":" in ${source}`);
    entries.push(["text" in key ? key.text : key.word, term(tokens[index + 2])]);
    index += 3;
    if (isPunct(index, ",")) index++;
  }
  if (index !== tokens.length - 1) throw new Error(`Unexpected text after "}" in ${source}`);
  return entries;
}

/** Whether the filters read the placement options (`options.x`). */
export function readsOptions(filters: DisplayFilters): boolean {
  return filters.some(([, value]) => "scope" in value && value.scope === "options");
}

/** The route parameters the filters read, so a caller can watch only those. */
export function routeKeys(filters: DisplayFilters): string[] {
  return filters.flatMap(([, value]) =>
    "scope" in value && value.scope === "routeParams" ? [value.key] : [],
  );
}

/** Evaluates like Angular: a missing name is undefined, which the request leaves out. */
export function evaluateDisplayFilters(
  filters: DisplayFilters,
  routeParams: URLSearchParams,
  options: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [key, value] of filters) {
    const result =
      "literal" in value
        ? value.literal
        : value.scope === "routeParams"
          ? (routeParams.get(value.key) ?? undefined)
          : options?.[value.key];
    if (result !== undefined) values[key] = result;
  }
  return values;
}
