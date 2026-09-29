import { isElement, type FormDefinition, type LayoutNode, type TextNode } from "./types";

/**
 * Builds a form definition from the compiled Angular module file (angular-modules.json),
 * with the same result Facade.getForm returns: CRM_Afform_ArrayHtml's array format,
 * blocks inlined and search display settings decoded as in Civi\Facade\LayoutCompiler.
 */

/** What Civi\Facade\Assets::layouts() hands the page for source="bundle". */
export interface BundleVars {
  /** Null when the user may open none of the page's forms. */
  url: string | null;
  forms: Record<string, { module: string; title: string | null; type: string }>;
  /** Block directive => Angular module name. */
  blocks: Record<string, string>;
  /** Tag ('*' for every tag) => attribute ('*' for every attribute) => 'text' or 'js'. */
  attributeTypes: Record<string, Record<string, string>>;
}

/** angular-modules.json: module name => its partials (file path => HTML). */
export type ModuleFile = Record<string, { partials: Record<string, string> }>;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const QUOTES = ['"', "'", "/"];
const BRACKETS: Record<string, string> = {
  "}": "{",
  ")": "(",
  "]": "[",
  ":": "?",
};

/** CRM_Utils_JS::decode(): JS literal notation to data; anything else decodes as JSON or null. */
export function decodeJs(text: string): Json {
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
    return JSON.parse(js) as Json;
  } catch {
    return null;
  }
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
function rawProps(js: string): [string | number, string][] {
  const chars = [...js.slice(1)];
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
      if (opener && open[opener]) open[opener]! -= 1;
    }
    item += char;
    escaped = char === "\\" && (item.length - item.replace(/\\+$/, "").length) % 2 === 1;
  });
  return result;
}

function objectKey(raw: string): string {
  const key = raw.trim();
  return QUOTES.includes(key[0] ?? "") ? String(decodeJs(key)) : key;
}

/** The shape json_encode() gives the PHP array: a list when keyed 0..n-1, an object otherwise. */
function phpArray(entries: [string | number, Json][]): Json {
  if (entries.every(([key], index) => String(key) === String(index))) {
    return entries.map(([, value]) => value);
  }
  return Object.fromEntries(entries.map(([key, value]) => [String(key), value]));
}

type AttributeTypes = BundleVars["attributeTypes"];

function attributeType(types: AttributeTypes, tag: string, attribute: string): string {
  return types[tag]?.[attribute] ?? types["*"]?.[attribute] ?? types["*"]?.["*"] ?? "text";
}

// libxml gives these HTML 4 attributes their name as value when written without one; the DOM
// cannot tell that form from an explicit "", which libxml keeps.
const BOOLEAN_ATTRIBUTES = new Set(
  "checked compact declare defer disabled ismap multiple nohref noresize noshade nowrap readonly selected".split(
    " ",
  ),
);

/** CRM_Afform_ArrayHtml::convertHtmlToArray() in the browser's HTML parser. */
export function htmlToLayout(html: string, types: AttributeTypes): LayoutNode[] {
  if (html === "") return [];
  const body = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html").body;
  return convertNodes(body.childNodes, types);
}

function convertNodes(nodes: NodeListOf<ChildNode>, types: AttributeTypes): LayoutNode[] {
  return [...nodes].flatMap((node) => {
    const converted = convertNode(node, types);
    return converted === null || ("#text" in converted && converted["#text"] === "")
      ? []
      : [converted];
  });
}

function convertNode(node: ChildNode, types: AttributeTypes): LayoutNode | null {
  if (node instanceof Element) {
    const tag = node.localName;
    const element: LayoutNode = { "#tag": tag };
    for (const { name, value } of node.attributes) {
      const text = value === "" && BOOLEAN_ATTRIBUTES.has(name) ? name : value;
      element[name] = attributeType(types, tag, name) === "js" ? decodeJs(text) : text;
    }
    if (node.childNodes.length > 0) element["#children"] = convertNodes(node.childNodes, types);
    else if (tag === "div" || tag === "fieldset") element["#children"] = [];
    return element;
  }
  // ArrayHtml writes non-breaking spaces back as the entity.
  if (node instanceof Text) return { "#text": (node.textContent ?? "").replaceAll(" ", "&nbsp;") };
  if (node instanceof Comment) return { "#comment": node.data };
  return null;
}

/** The form's layout with blocks inlined, as Civi\Facade\LayoutCompiler compiles it. */
export function compileBundle(vars: BundleVars, file: ModuleFile, name: string): FormDefinition {
  const form = vars.forms[name];
  if (!form) throw new Error(ts('Form "%1" does not exist or you may not open it.', { 1: name }));
  return {
    name,
    title: form.title,
    type: form.type,
    layout: compileModule(vars, file, form.module, []),
  };
}

function compileModule(
  vars: BundleVars,
  file: ModuleFile,
  module: string,
  trail: string[],
): LayoutNode[] {
  if (trail.includes(module)) throw new Error(`Afform block ${module} includes itself.`);
  const html = file[module]?.partials[`~/${module}/${module}.aff.html`];
  if (typeof html !== "string") throw new Error(`No layout for Afform module ${module}.`);
  return prepare(vars, file, withoutAdminMenu(htmlToLayout(html, vars.attributeTypes)), [
    ...trail,
    module,
  ]);
}

const isAdminMenu = (node: LayoutNode | undefined): boolean =>
  !!node &&
  isElement(node) &&
  typeof node.class === "string" &&
  node.class.split(" ").includes("crm-admin-block-context-dropdown");
const isText = (node: LayoutNode | undefined): node is TextNode =>
  !!node && !isElement(node) && "#text" in node;
const isBlank = (node: LayoutNode | undefined): boolean =>
  isText(node) && node["#text"].trim() === "";

/**
 * afform_admin appends an edit menu for Angular to show after a client-side permission check,
 * as "  <div …>…</div>\n"; the indentation and newline go with it.
 */
function withoutAdminMenu(nodes: LayoutNode[]): LayoutNode[] {
  const result: LayoutNode[] = [];
  nodes.forEach((node, index) => {
    if (isAdminMenu(node) || (isBlank(node) && isAdminMenu(nodes[index - 1]))) return;
    if (isText(node) && isAdminMenu(nodes[index + 1])) {
      const text = node["#text"].replace(/[ \t]+$/, "");
      if (text !== "") result.push({ "#text": text });
      return;
    }
    result.push(node);
  });
  return result;
}

function prepare(
  vars: BundleVars,
  file: ModuleFile,
  nodes: LayoutNode[],
  trail: string[],
): LayoutNode[] {
  return nodes.map((node) => {
    if (!isElement(node)) return node;
    const tag = node["#tag"];
    const element = { ...node };
    if (tag.startsWith("crm-search-display-") && typeof element.settings === "string") {
      element.settings = decodeJs(element.settings);
    }
    const block = vars.blocks[tag];
    if (block !== undefined) {
      element["#children"] = compileModule(vars, file, block, trail);
      return element;
    }
    if (element["#children"])
      element["#children"] = prepare(vars, file, element["#children"], trail);
    return element;
  });
}
