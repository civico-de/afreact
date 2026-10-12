/**
 * Attribute values in the notation of core's `CRM_Utils_JS`: the editor parses an attribute's
 * text into a value and writes an edited value back. Parts no literal can hold (`ts()` calls,
 * expressions) are kept as their text.
 */

/** Text of a part that is not a literal, written back unchanged. */
export class RawJs {
  constructor(readonly raw: string) {}
}

/** A `ts('…')` call: the text it translates, and the call as written. */
export class TsCall extends RawJs {
  constructor(
    raw: string,
    readonly text: string,
  ) {
    super(raw);
  }
}

export type Literal =
  | string
  | number
  | boolean
  | null
  | RawJs
  | Literal[]
  | { [key: string]: Literal };

export const isLiteralObject = (value: unknown): value is Record<string, Literal> =>
  typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof RawJs);

/** A JSON value, as metadata or a control holds it, as a literal; parts kept as text stay. */
export function toLiteral(value: unknown): Literal {
  if (
    value === null ||
    value instanceof RawJs ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return value;
  if (Array.isArray(value)) return value.map(toLiteral);
  if (typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, item]) =>
        item === undefined ? [] : [[key, toLiteral(item)]],
      ),
    );
  throw new Error(`Cannot write ${typeof value} as JS.`);
}

/** What core's afGui service evaluates: `{…}`, `[…]` and `ts(…)`. */
export function looksLikeJs(text: string): boolean {
  const trimmed = text.trim();
  return (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    trimmed.startsWith("ts(")
  );
}

class Reader {
  at = 0;
  constructor(readonly text: string) {}

  space(): void {
    while (/\s/.test(this.text.charAt(this.at))) this.at++;
  }

  peek(): string {
    this.space();
    return this.text.charAt(this.at);
  }

  expect(char: string): void {
    if (this.peek() !== char) throw new SyntaxError(`Expected ${char} at ${String(this.at)}`);
    this.at++;
  }

  // deviation:display-filter-escapes
  /** A quoted string in JS notation, the quote char at the reading position. */
  quoted(): string {
    const quote = this.text.charAt(this.at);
    let out = "";
    this.at++;
    for (;;) {
      const char = this.text.charAt(this.at);
      if (char === "") throw new SyntaxError("Unterminated string");
      this.at++;
      if (char === quote) return out;
      if (char !== "\\") {
        out += char;
        continue;
      }
      const next = this.text.charAt(this.at);
      this.at++;
      const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" };
      if (next === "u") {
        out += String.fromCharCode(parseInt(this.text.slice(this.at, this.at + 4), 16));
        this.at += 4;
      } else out += escapes[next] ?? next;
    }
  }

  /** The end of the expression starting here: the next `,`, `}` or `]` outside brackets and quotes. */
  expressionEnd(): number {
    let depth = 0;
    let at = this.at;
    while (at < this.text.length) {
      const char = this.text.charAt(at);
      if (char === "'" || char === '"') {
        const reader = new Reader(this.text);
        reader.at = at;
        reader.quoted();
        at = reader.at;
        continue;
      }
      if ("([{".includes(char)) depth++;
      else if (")]}".includes(char)) {
        if (depth === 0) return at;
        depth--;
      } else if (char === "," && depth === 0) return at;
      at++;
    }
    return at;
  }

  value(): Literal {
    const char = this.peek();
    if (char === "{") return this.object();
    if (char === "[") return this.array();
    if (char === "'" || char === '"') {
      const start = this.at;
      const text = this.quoted();
      // A string followed by more, as in 'a' + b, is an expression.
      if (!this.atValueEnd()) return this.rawFrom(start);
      return text;
    }
    const start = this.at;
    const end = this.expressionEnd();
    const raw = this.text.slice(start, end).trim();
    this.at = end;
    if (raw === "") throw new SyntaxError(`Missing value at ${String(start)}`);
    if (raw === "true") return true;
    if (raw === "false") return false;
    if (raw === "null") return null;
    if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(raw)) return Number(raw);
    const ts = /^ts\(\s*(['"])/.exec(raw);
    if (ts) {
      const call = new Reader(raw);
      call.at = raw.indexOf(ts[1] ?? "'");
      const text = call.quoted();
      call.space();
      // ts('…') alone; a call with parameters stays an expression.
      if (raw.slice(call.at) === ")") return new TsCall(raw, text);
    }
    return new RawJs(raw);
  }

  atValueEnd(): boolean {
    const char = this.peek();
    return char === "" || char === "," || char === "}" || char === "]";
  }

  rawFrom(start: number): RawJs {
    this.at = start;
    const end = this.expressionEnd();
    const raw = this.text.slice(start, end).trim();
    this.at = end;
    return new RawJs(raw);
  }

  key(): string {
    const char = this.peek();
    if (char === "'" || char === '"') return this.quoted();
    const match = /^[\w$-]+/.exec(this.text.slice(this.at));
    if (!match) throw new SyntaxError(`Expected a key at ${String(this.at)}`);
    this.at += match[0].length;
    return match[0];
  }

  object(): Record<string, Literal> {
    const out: Record<string, Literal> = {};
    this.expect("{");
    while (this.peek() !== "}") {
      const key = this.key();
      this.expect(":");
      out[key] = this.value();
      if (this.peek() === ",") this.at++;
      else break;
    }
    this.expect("}");
    return out;
  }

  array(): Literal[] {
    const out: Literal[] = [];
    this.expect("[");
    while (this.peek() !== "]") {
      out.push(this.value());
      if (this.peek() === ",") this.at++;
      else break;
    }
    this.expect("]");
    return out;
  }
}

/**
 * The value of an attribute's text, where core's builder evaluates it; plain text otherwise.
 * Undefined when the text looks like JS but cannot be read.
 */
export function parseAttribute(text: string): Literal | undefined {
  if (!looksLikeJs(text)) return text;
  try {
    const reader = new Reader(text);
    const value = reader.value();
    if (reader.peek() !== "") return undefined;
    return value;
  } catch {
    return undefined;
  }
}

/** A string in `CRM_Utils_JS::encode`'s notation: single quotes where possible. */
function encodeString(value: string): string {
  const json = JSON.stringify(value);
  return `'${json.slice(1, -1).replaceAll('\\"', '"').replaceAll("'", "\\'")}'`;
}

/** A key as `CRM_Utils_JS::writeObject` writes it: bare unless it has a non-word character. */
const encodeKey = (key: string) => (/\W/.test(key) ? encodeString(key) : key);

/** `value` in `CRM_Utils_JS::encode`'s notation, its raw parts as written. */
export function encodeLiteral(value: Literal): string {
  if (value instanceof RawJs) return value.raw;
  if (typeof value === "string") return encodeString(value);
  if (Array.isArray(value)) return `[${value.map(encodeLiteral).join(", ")}]`;
  if (isLiteralObject(value))
    return `{${Object.entries(value)
      .map(([key, item]) => `${encodeKey(key)}: ${encodeLiteral(item)}`)
      .join(", ")}}`;
  return JSON.stringify(value);
}

/** What the editor shows for a value: a `ts()` call's text, translated as core's builder does. */
export function displayValue(value: Literal | undefined): Literal | undefined {
  if (value instanceof TsCall) return ts(value.text);
  return value;
}
