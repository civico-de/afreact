/**
 * The Angular expressions Afform layouts put into text and attributes: `ts('…', {…})` and
 * `crmUrl('…', {…})` or `crmUrl('…', '…')` with literal arguments, optionally one-time (`::`), and
 * afCore's `routeParams.name`. Anything else is reported as unsupported.
 */

export interface ExpressionContext {
  translate: (text: string) => string;
  /** CRM.url, which takes the query as an object or as a string. */
  url: (path: string, query?: Record<string, string | number> | string) => string;
  /** afCore's routeParams as the route stands now. */
  routeParams: Record<string, string>;
}

const LITERAL = String.raw`'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"`;
const OBJECT = String.raw`\{(?:\s*(?:(?:[A-Za-z_$][\w$]*|\d+|${LITERAL})\s*:\s*(?:${LITERAL}|-?\d+(?:\.\d+)?)\s*(?:,\s*)?)*)\}`;
const CALL = new RegExp(
  String.raw`^(?:::)?\s*(ts|crmUrl)\(\s*(${LITERAL})\s*(?:,\s*(${OBJECT}|${LITERAL})\s*)?\)$`,
);
const PARAM = String.raw`routeParams\.(?<name>[A-Za-z_$][\w$]*)`;
const EQUALS = String.raw`\s*(?<operator>[!=]==?)\s*`;
const QUOTED = `(?<quoted>${LITERAL})`;
/** One-time `::` is left out: its value would freeze at the first route that has the key. */
const ROUTE_PARAM = new RegExp(`^${PARAM}$`);
const ROUTE_TRUTH = new RegExp(String.raw`^(?<not>!?)\s*${PARAM}$`);
const ROUTE_EQUALS = new RegExp(`^${PARAM}${EQUALS}${QUOTED}$`);
const EQUALS_ROUTE = new RegExp(`^${QUOTED}${EQUALS}${PARAM}$`);
const PAIR = new RegExp(
  String.raw`\s*(?:([A-Za-z_$][\w$]*|\d+)|(${LITERAL}))\s*:\s*(${LITERAL}|-?\d+(?:\.\d+)?)\s*(?:,|$)`,
  "y",
);

/** A JS string literal in single or double quotes. */
export function literal(text: string): string {
  const quote = text[0];
  const body = text.slice(1, -1);
  // A single-quoted JS literal becomes a JSON one: escape bare double quotes and unescape \'.
  const json =
    quote === "'"
      ? body.replace(/\\(.)|(")/g, (match, escaped?: string, dbl?: string) =>
          dbl ? '\\"' : escaped === "'" ? "'" : match,
        )
      : body;
  const value: unknown = JSON.parse(`"${json}"`);
  if (typeof value !== "string") throw new SyntaxError(`Not a string literal: ${text}`);
  return value;
}

function objectLiteral(text: string): Record<string, string | number> {
  const inner = text.slice(1, -1).trim();
  if (inner === "") return {};
  const entries: [string, string | number][] = [];
  PAIR.lastIndex = 0;
  while (PAIR.lastIndex < inner.length) {
    const match = PAIR.exec(inner);
    if (!match) throw new SyntaxError(`Unsupported object literal ${text}`);
    const key = match[1] ?? literal(match[2] ?? "''");
    const value = match[3] ?? "";
    entries.push([key, /^['"]/.test(value) ? literal(value) : Number(value)]);
  }
  return Object.fromEntries(entries);
}

/** Core's ts(): the plural form past one, then %name replaced by the string and number values. */
function substitute(text: string, params: Record<string, string | number>): string {
  let result = text;
  for (const [name, value] of Object.entries(params))
    if (name !== "plural")
      result = result.replaceAll(`%${name}`, String(value).replaceAll("%", "%-crmescaped-"));
  return result.replaceAll("%-crmescaped-", "%");
}

/** The parameter a `routeParams.name` expression reads; null for any other expression. */
export function routeParamName(expression: string): string | null {
  return ROUTE_PARAM.exec(expression.trim())?.groups?.name ?? null;
}

/** A route parameter's value, undefined where the route lacks it. */
export function routeParam(params: Record<string, string>, name: string): string | undefined {
  return Object.hasOwn(params, name) ? params[name] : undefined;
}

export type RouteTest = (params: Record<string, string>) => boolean;

/**
 * An ngIf condition on a route parameter: its truth, its negation, or its (in)equality with a
 * string literal; null for any other condition. Loose and strict equality agree on these.
 */
export function routeTest(expression: string): RouteTest | null {
  const text = expression.trim();
  const truth = ROUTE_TRUTH.exec(text)?.groups;
  if (truth) {
    const { name = "", not } = truth;
    return (params) => Boolean(routeParam(params, name)) !== (not === "!");
  }
  const {
    name = "",
    operator = "",
    quoted = "",
  } = (ROUTE_EQUALS.exec(text) ?? EQUALS_ROUTE.exec(text))?.groups ?? {};
  if (!name) return null;
  let value: string;
  try {
    value = literal(quoted);
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
  const equal = operator.startsWith("=");
  return (params) => (routeParam(params, name) === value) === equal;
}

/** One expression between {{ }}; null when it is not one of the supported calls. */
export function evaluateExpression(expression: string, context: ExpressionContext): string | null {
  const param = routeParamName(expression);
  // $interpolate shows undefined as "".
  if (param !== null) return routeParam(context.routeParams, param) ?? "";
  const match = CALL.exec(expression.trim());
  if (!match) return null;
  const [, name, argument = "''", query] = match;
  let text: string;
  let params: Record<string, string | number> | string | undefined;
  try {
    text = literal(argument);
    if (query !== undefined) params = query.startsWith("{") ? objectLiteral(query) : literal(query);
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
  if (name !== "ts") return context.url(text, params);
  // ts() takes its parameters as an object only.
  if (typeof params === "string") return null;
  if (params === undefined) return context.translate(text);
  const plural = params.plural;
  const form =
    typeof plural === "string" && "count" in params && params.count !== 1 ? plural : text;
  return substitute(context.translate(form), params);
}

export type Interpolation = { text: string } | { unsupported: string };

/** Text with {{ }} interpolations resolved, or the first expression that cannot be. */
export function interpolate(text: string, context: ExpressionContext): Interpolation {
  let unsupported: string | null = null;
  const result = text.replace(/\{\{([\s\S]*?)\}\}/g, (whole, expression: string) => {
    const value = evaluateExpression(expression, context);
    if (value === null) unsupported ??= whole.trim();
    return value ?? "";
  });
  return unsupported === null ? { text: result } : { unsupported };
}
