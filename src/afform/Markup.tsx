import { createContext, createElement, Fragment, useContext, useMemo, type ReactNode } from "react";
import { asText } from "./conditions";
import { TOKEN } from "./structure";
import type { FormData } from "./types";

/** The data tokens show; set inside af-form only, where afMarkup replaces tokens. */
export const TokenContext = createContext<FormData | null>(null);

/** afForm's getTokenValues(): the field's stored value as text, "" while unset or emptied. */
export function tokenText(token: string, data: FormData): string {
  const [entity = "", index = "", ...field] = token.slice(1, -1).split(".");
  const value = data[entity]?.[Number(index)]?.fields[field.join(".")];
  return value === undefined || value === null ? "" : asText(value);
}

/** af-token: a [Entity.index.field] reference showing the field's current value. */
function Token({ token }: { token: string }) {
  const data = useContext(TokenContext);
  return data ? tokenText(token, data) : token;
}

/** Text with each token as a live af-token, as afMarkup's replaceTokensWithElements(). */
export function withTokens(text: string): ReactNode {
  const tokens = text.match(TOKEN);
  if (!tokens) return text;
  const parts = text.split(TOKEN);
  return parts.flatMap((part, index) => {
    const token = tokens[index];
    return token === undefined ? [part] : [part, <Token key={index} token={token} />];
  });
}

interface MarkupProps {
  html: string;
  tokens?: boolean;
  record?: boolean;
}

/** Elements markup keeps; their content cannot run script. */
const TAGS = new Set(
  (
    "a abbr b bdi bdo blockquote br caption cite code dd del dfn div dl dt em h1 h2 h3 h4 h5 h6 " +
    "hr i img ins kbd li mark ol p pre q s samp small span strong sub sup table tbody td tfoot " +
    "th thead time tr u ul var"
  ).split(" "),
);
const VOID = new Set(["br", "hr", "img"]);
/** Elements whose content is code or not shown; markup drops them with their content. */
const DROPPED = new Set(["script", "style", "template", "noscript", "iframe", "object", "title"]);
const ATTRIBUTES: Record<string, string> = {
  class: "className",
  colspan: "colSpan",
  rowspan: "rowSpan",
  datetime: "dateTime",
  ...Object.fromEntries(
    ["id", "href", "title", "target", "role", "lang", "dir", "src", "alt", "width", "height"].map(
      (name) => [name, name],
    ),
  ),
};

const LINKS = ["http:", "https:", "ftp:", "sftp:", "mailto:", "tel:", "file:"];
const IMAGES = ["http:", "https:", "ftp:", "file:", "blob:"];

/** $sanitize's URL rule: a link or image address of a plain scheme; relative ones count. */
export function plainUrl(url: string, image = false): boolean {
  if (!URL.canParse(url, document.baseURI)) return false;
  const { protocol, href } = new URL(url, document.baseURI);
  if (!image) return LINKS.includes(protocol);
  return IMAGES.includes(protocol) || href.startsWith("data:image/");
}

/** What a record's HTML may not carry: names and roles other parts of the page rely on. */
function kept(name: string, value: string, record: boolean): boolean {
  if (!record) return true;
  if (name === "id" || name === "role" || name.startsWith("aria-")) return false;
  return (name !== "href" && name !== "src") || plainUrl(value, name === "src");
}

function convert(nodes: NodeListOf<ChildNode>, tokens: boolean, record: boolean): ReactNode[] {
  return [...nodes].map((node, index): ReactNode => {
    const text = node.textContent ?? "";
    if (node.nodeType === Node.TEXT_NODE) return tokens ? withTokens(text) : text;
    if (!(node instanceof Element) || DROPPED.has(node.localName)) return null;
    const children = convert(node.childNodes, tokens, record);
    // Formatting outside the list falls away; its text stays.
    if (!TAGS.has(node.localName)) return createElement(Fragment, { key: index }, ...children);
    const props: Record<string, string> = { key: String(index) };
    for (const { name, value } of Array.from(node.attributes)) {
      const prop = name.startsWith("aria-") ? name : ATTRIBUTES[name];
      if (prop && kept(name, value, record)) props[prop] = value;
    }
    return VOID.has(node.localName)
      ? createElement(node.localName, props)
      : createElement(node.localName, props, ...children);
  });
}

/**
 * afMarkup: admin HTML from a label, help text or content block, rebuilt from a list of plain
 * elements and attributes so it cannot run script; React also blocks javascript: URLs.
 * `record` is for a stored value anyone may have submitted, filtered as ng-bind-html does.
 */
export function Markup({ html, tokens = true, record = false }: MarkupProps) {
  return useMemo(() => {
    // A template's content is inert: nothing in it loads or runs while it is read.
    const template = document.createElement("template");
    template.innerHTML = html;
    return convert(template.content.childNodes, tokens, record);
  }, [html, tokens, record]);
}
