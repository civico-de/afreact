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
  /\s*(?:([{}[\],:.])|'((?:[^'\\]|\\[\s\S])*)'|"((?:[^"\\]|\\[\s\S])*)"|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([A-Za-z_$][\w$]*))/y;

type Token = { punct: string } | { text: string } | { number: number } | { word: string };

const ESCAPES: Record<string, string> = { n: "\n", f: "\f", r: "\r", t: "\t", v: "\v" };

/** A string literal's content with its escapes read as AngularJS's lexer does. */
const unescape = (text: string) =>
  text.replace(/\\(u[\da-fA-F]{4}|[\s\S])/g, (_, code: string) =>
    code.length > 1 ? String.fromCharCode(parseInt(code.slice(1), 16)) : (ESCAPES[code] ?? code),
  );

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
      tokens.push({ text: unescape(single ?? double ?? "") });
    else if (number !== undefined) tokens.push({ number: Number(number) });
    else tokens.push({ word: word ?? "" });
  }
  return tokens;
}

/**
 * Parses the object literal; values are JSON-like literals, nested ones included, or
 * `routeParams`/`options` with `.key` or `['key']`. Anything else throws.
 */
export function parseDisplayFilters(source: string): DisplayFilters {
  const tokens = tokenize(source);
  let index = 0;
  const at = (punct: string) => {
    const token = tokens[index];
    return !!token && "punct" in token && token.punct === punct;
  };
  const expect = (punct: string) => {
    if (!at(punct)) throw new Error(`Expected "${punct}" in ${source}`);
    index++;
  };
  // Angular allows a trailing comma.
  const list = <T>(close: string, item: () => T): T[] => {
    const items: T[] = [];
    while (!at(close)) {
      items.push(item());
      if (!at(close)) expect(",");
    }
    index++;
    return items;
  };
  const key = (): string => {
    const token = tokens[index++];
    if (token && "text" in token) return token.text;
    if (token && "word" in token) return token.word;
    throw new Error(`Expected a key in ${source}`);
  };
  const entry = <T>(value: () => T): [string, T] => {
    const name = key();
    expect(":");
    return [name, value()];
  };
  const literal = (): unknown => {
    const value = term();
    if ("scope" in value) throw new Error(`${value.scope} inside a literal in ${source}`);
    return value.literal;
  };
  const term = (): Term => {
    const token = tokens[index++];
    if (!token) throw new Error(`A value is missing in ${source}`);
    if ("text" in token) return { literal: token.text };
    if ("number" in token) return { literal: token.number };
    if ("punct" in token) {
      if (token.punct === "{")
        return { literal: Object.fromEntries(list("}", () => entry(literal))) };
      if (token.punct === "[") return { literal: list("]", literal) };
      throw new Error(`Unexpected "${token.punct}" in ${source}`);
    }
    const word = token.word;
    if (word === "true" || word === "false") return { literal: word === "true" };
    if (word === "null") return { literal: null };
    if (word !== "routeParams" && word !== "options")
      throw new Error(`Unsupported value ${word} in ${source}`);
    if (at(".")) {
      index++;
      const name = tokens[index++];
      if (!name || !("word" in name))
        throw new Error(`Expected a name after ${word}. in ${source}`);
      return { scope: word, key: name.word };
    }
    expect("[");
    const name = tokens[index++];
    if (!name || !("text" in name)) throw new Error(`Expected a quoted name in ${source}`);
    expect("]");
    return { scope: word, key: name.text };
  };
  expect("{");
  const entries = list("}", () => entry(term));
  if (index !== tokens.length) throw new Error(`Unexpected text after "}" in ${source}`);
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

/** A display's `filters` attribute; the error names it as its note does. */
export function parseFiltersAttribute(
  attribute: unknown,
): { filters: DisplayFilters } | { error: string } {
  if (attribute === undefined) return { filters: [] };
  if (typeof attribute !== "string") return { error: `filters=${JSON.stringify(attribute)}` };
  try {
    return { filters: parseDisplayFilters(attribute) };
  } catch (error) {
    console.warn("[afreact] display filters", error);
    return { error: `filters="${attribute}"` };
  }
}
