/**
 * The Angular expressions Afform layouts put into text and attributes: `ts('…')` and
 * `crmUrl('…', {…})`, optionally one-time (`::`). Anything else is reported as unsupported.
 */

export interface ExpressionContext {
  translate: (text: string) => string;
  url: (path: string, query?: Record<string, string | number>) => string;
}

const LITERAL = String.raw`'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"`;
const CALL = new RegExp(
  String.raw`^(?:::)?\s*(ts|crmUrl)\(\s*(${LITERAL})\s*(?:,\s*(\{[^}]*\})\s*)?\)$`,
);
const PAIR = new RegExp(
  String.raw`^\s*(?:([A-Za-z_$][\w$]*)|(${LITERAL}))\s*:\s*(${LITERAL}|-?\d+(?:\.\d+)?)\s*$`,
);

/** A JS string literal in single or double quotes. */
export function literal(text: string): string {
  const quote = text[0];
  const body = text.slice(1, -1);
  // A single-quoted JS literal becomes a JSON one: its double quotes need escapes, \' does not.
  const json = quote === "'" ? body.replaceAll('"', '\\"').replaceAll("\\'", "'") : body;
  const value: unknown = JSON.parse(`"${json}"`);
  if (typeof value !== "string") throw new SyntaxError(`Not a string literal: ${text}`);
  return value;
}

function objectLiteral(text: string): Record<string, string | number> {
  const inner = text.slice(1, -1).trim();
  if (inner === "") return {};
  return Object.fromEntries(
    inner.split(",").map((pair) => {
      const match = PAIR.exec(pair);
      if (!match) throw new SyntaxError(`Unsupported object literal ${text}`);
      const key = match[1] ?? literal(match[2] ?? "''");
      const value = match[3] ?? "";
      return [key, /^['"]/.test(value) ? literal(value) : Number(value)];
    }),
  );
}

/** One expression between {{ }}; null when it is not one of the supported calls. */
export function evaluateExpression(expression: string, context: ExpressionContext): string | null {
  const match = CALL.exec(expression.trim());
  if (!match) return null;
  const [, name, argument = "''", query] = match;
  let text: string;
  let params: Record<string, string | number> | undefined;
  try {
    text = literal(argument);
    params = query === undefined ? undefined : objectLiteral(query);
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
  if (name === "ts") return params === undefined ? context.translate(text) : null;
  return context.url(text, params);
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
