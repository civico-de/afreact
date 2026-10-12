import { isElement, type FormDefinition, type LayoutNode } from "./types";

/**
 * Builds a form definition from the compiled Angular module file (angular-modules.json),
 * with the same result Afreact.getForm returns: CRM_Afform_ArrayHtml's array format,
 * blocks inlined and search display settings decoded as in Civi\Afreact\LayoutCompiler.
 */

/** What Civi\Afreact\Assets::layouts() hands the page for source="bundle". */
export interface BundleVars {
  /** Null when the user may open none of the page's forms. */
  url: string | null;
  forms: Record<
    string,
    {
      module: string;
      title: string | null;
      type: string;
      autosave_draft: boolean;
      meta: Record<string, unknown>;
    }
  >;
  /** Block directive => Angular module name. */
  blocks: Record<string, string>;
  /** Tag ('*' for every tag) => attribute ('*' for every attribute) => 'text' or 'js'. */
  attributeTypes: Record<string, Record<string, string>>;
}

/** angular-modules.json: module name => its partials (file path => HTML) and translated texts. */
export type ModuleFile = Record<
  string,
  { partials: Record<string, string>; strings?: Record<string, string> | [] }
>;

export function isModuleFile(value: unknown): value is ModuleFile {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every(
      (module: unknown) =>
        typeof module === "object" &&
        module !== null &&
        "partials" in module &&
        typeof module.partials === "object" &&
        module.partials !== null &&
        Object.values(module.partials).every((html: unknown) => typeof html === "string") &&
        (!("strings" in module) ||
          (typeof module.strings === "object" &&
            module.strings !== null &&
            Object.values(module.strings).every((text: unknown) => typeof text === "string"))),
    )
  );
}

const QUOTES = ['"', "'", "/"];
const BRACKETS: Record<string, string> = {
  "}": "{",
  ")": "(",
  "]": "[",
  ":": "?",
};

/** CRM_Utils_JS::decode(): JS literal notation to data; anything else decodes as JSON or null. */
export function decodeJs(text: string): unknown {
  let js = text.trim();
  const first = js.slice(0, 1);
  const last = js.slice(-1);
  if (js.length > 1 && first === "'" && last === "'") {
    const converted = singleQuoteToJson(js);
    if (converted === null) return null;
    js = converted;
  } else if ((first === "{" && last === "}") || (first === "[" && last === "]")) {
    return phpArray(rawProps(js).map(([key, value]) => [key, decodeJs(value)]));
  }
  try {
    return JSON.parse(js);
  } catch {
    return null;
  }
}

const TS_CALL = /^ts\(\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*\)$/s;

/** Civi\Afreact\LayoutHtml: decodeJs(), with `ts('…')` translated as Angular evaluates it. */
export function decodeAttribute(text: string, translate: (text: string) => string): unknown {
  const js = text.trim();
  const call = TS_CALL.exec(js);
  if (call) {
    const literal = decodeJs(call[1] ?? "");
    return typeof literal === "string" ? translate(literal) : null;
  }
  if (/^(\{[\s\S]*\}|\[[\s\S]*\])$/.test(js))
    return phpArray(rawProps(js).map(([key, value]) => [key, decodeAttribute(value, translate)]));
  return decodeJs(js);
}

/** CRM_Utils_JS::convertSingleQuoteString(). */
function singleQuoteToJson(js: string): string | null {
  const backslash = "\u0000backslash\u0000";
  const body = js
    .slice(1, -1)
    .replaceAll("\\\\", backslash)
    .replaceAll('\\"', '"')
    .replaceAll('"', '\\"')
    .replaceAll("\\&", "&")
    .replaceAll("\\/", "/");
  if (/[^\\]'/.test(body)) return null;
  return `"${body.replaceAll("\\'", "'").replaceAll(backslash, "\\\\")}"`;
}

/** CRM_Utils_JS::getRawProps(): the top-level keys and raw value strings of a JS object or array. */
export function rawProps(js: string): [string | number, string][] {
  const chars = Array.from(js.slice(1));
  const isObject = js[0] === "{";
  const end = js.length - 2;
  const open: Record<string, number> = { "{": 0, "(": 0, "[": 0, "?": 0 };
  const result: [string | number, string][] = [];
  let key: string | number | null = isObject ? null : 0;
  let item = "";
  let quote: string | null = null;
  let escaped = false;
  chars.forEach((char, index) => {
    if (!escaped && QUOTES.includes(char)) {
      // A slash after a word or ")" divides; elsewhere it opens a regex.
      if (!quote && !(char === "/" && /[\w)]\s*$/.test(item))) quote = char;
      else if (char === quote) quote = null;
    }
    if (!quote) {
      const nested = Object.values(open).some(Boolean);
      if (char === ":" && !nested && !key) {
        key = item;
        item = "";
        return;
      }
      if ((char === "," || index === end) && !nested && key !== null && item.trim() !== "") {
        result.push([isObject ? objectKey(String(key)) : key, item.trim()]);
        key = isObject ? null : Number(key) + 1;
        item = "";
        return;
      }
      if (char in open) open[char]! += 1;
      const opener = BRACKETS[char];
      if (opener && open[opener]) open[opener] -= 1;
    }
    item += char;
    escaped = char === "\\" && (item.length - item.replace(/\\+$/, "").length) % 2 === 1;
  });
  return result;
}

function objectKey(raw: string): string {
  const key = raw.trim();
  if (!QUOTES.includes(key[0] ?? "")) return key;
  // PHP uses the decoded key as array key, so one that fails to decode becomes "".
  const decoded = decodeJs(key);
  return typeof decoded === "string" ? decoded : "";
}

/** The shape json_encode() gives the PHP array: a list when keyed 0..n-1, an object otherwise. */
function phpArray(entries: [string | number, unknown][]): unknown {
  if (entries.every(([key], index) => String(key) === String(index))) {
    return entries.map(([, value]) => value);
  }
  return Object.fromEntries(entries.map(([key, value]) => [String(key), value]));
}

export type AttributeTypes = BundleVars["attributeTypes"];

/** CRM_Afform_ArrayHtml::pickAttrType(): 'js' or 'text'. */
export function attributeType(types: AttributeTypes, tag: string, attribute: string): string {
  return types[tag]?.[attribute] ?? types["*"]?.[attribute] ?? types["*"]?.["*"] ?? "text";
}

// libxml gives these HTML 4 attributes their name as value when written without one; the DOM
// cannot tell that form from an explicit "", which libxml keeps.
const BOOLEAN_ATTRIBUTES = new Set(
  "checked compact declare defer disabled ismap multiple nohref noresize noshade nowrap readonly selected".split(
    " ",
  ),
);

/** How a partial's attributes decode: their types, and ts() for JS attributes. */
interface Decoding {
  types: AttributeTypes;
  translate: (text: string) => string;
}

/** CRM_Afform_ArrayHtml::convertHtmlToArray() in the browser's HTML parser. */
export function htmlToLayout(html: string, decoding: Decoding): LayoutNode[] {
  if (html === "") return [];
  const body = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html").body;
  return convertNodes(body.childNodes, decoding);
}

function convertNodes(nodes: NodeListOf<ChildNode>, decoding: Decoding): LayoutNode[] {
  return [...nodes].flatMap((node) => {
    const converted = convertNode(node, decoding);
    return converted === null || ("#text" in converted && converted["#text"] === "")
      ? []
      : [converted];
  });
}

function convertNode(node: ChildNode, decoding: Decoding): LayoutNode | null {
  if (node instanceof Element) {
    const tag = node.localName;
    const element: LayoutNode = { "#tag": tag };
    for (const { name, value } of node.attributes) {
      const text = value === "" && BOOLEAN_ATTRIBUTES.has(name) ? name : value;
      element[name] =
        attributeType(decoding.types, tag, name) === "js"
          ? decodeAttribute(text, decoding.translate)
          : text;
    }
    if (node.childNodes.length > 0) element["#children"] = convertNodes(node.childNodes, decoding);
    else if (tag === "div" || tag === "fieldset") element["#children"] = [];
    return element;
  }
  // ArrayHtml writes non-breaking spaces back as the entity.
  if (node instanceof Text) return { "#text": (node.textContent ?? "").replaceAll(" ", "&nbsp;") };
  if (node instanceof Comment) return { "#comment": node.data };
  return null;
}

/** The form's layout with blocks inlined, as Civi\Afreact\LayoutCompiler compiles it. */
export function compileBundle(vars: BundleVars, file: ModuleFile, name: string): FormDefinition {
  const form = vars.forms[name];
  if (!form) throw new Error(ts('Form "%1" does not exist or you may not open it.', { 1: name }));
  const compiled: string[] = [];
  const layout = compileModule({ vars, file, compiled }, form.module, []);
  return {
    name,
    title: form.title,
    type: form.type,
    autosave_draft: form.autosave_draft,
    meta: form.meta,
    layout,
    strings: Object.fromEntries(
      compiled.flatMap((module) => Object.entries(file[module]?.strings ?? {})),
    ),
  };
}

/** What a compilation reads, and the modules it inlined so far. */
interface Compilation {
  vars: BundleVars;
  file: ModuleFile;
  compiled: string[];
}

function compileModule(compilation: Compilation, module: string, trail: string[]): LayoutNode[] {
  if (trail.includes(module)) throw new Error(`Afform block ${module} includes itself.`);
  const html = compilation.file[module]?.partials[`~/${module}/${module}.aff.html`];
  if (typeof html !== "string") throw new Error(`No layout for Afform module ${module}.`);
  compilation.compiled.push(module);
  const strings = compilation.file[module]?.strings;
  const own = new Map(strings && !Array.isArray(strings) ? Object.entries(strings) : []);
  const nodes = htmlToLayout(html, {
    types: compilation.vars.attributeTypes,
    translate: (text) => own.get(text) ?? ts(text),
  });
  return prepare(compilation, nodes, [...trail, module]);
}

function prepare(compilation: Compilation, nodes: LayoutNode[], trail: string[]): LayoutNode[] {
  return nodes.map((node) => {
    if (!isElement(node)) return node;
    const tag = node["#tag"];
    const element = { ...node };
    if (tag.startsWith("crm-search-display-") && typeof element.settings === "string") {
      element.settings = decodeJs(element.settings);
    }
    const block = compilation.vars.blocks[tag];
    if (block !== undefined) {
      element["#children"] = compileModule(compilation, block, trail);
      return element;
    }
    if (element["#children"])
      element["#children"] = prepare(compilation, element["#children"], trail);
    return element;
  });
}
