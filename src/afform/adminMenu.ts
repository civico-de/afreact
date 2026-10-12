import type { ElementNode, LayoutNode } from "./types";

/** An edit link of afform_admin's menu: shown when checkLinkPerm(permission, createdId) holds. */
export interface AdminLink {
  url: string;
  icon: string;
  permission: string;
  createdId: number | null;
  /** The link text: plain text, with the form's or search's title in `<em>`. */
  label: { text: string; emphasis: boolean }[];
}

const isElement = (node: LayoutNode | undefined): node is ElementNode => !!node && "#tag" in node;
const elements = (node: ElementNode) => (node["#children"] ?? []).filter(isElement);
const classes = (node: ElementNode) =>
  typeof node.class === "string" ? node.class.split(/\s+/) : [];

/** The menu afform_admin appends to every form and block for a client-side permission check. */
export const isAdminMenu = (node: ElementNode): boolean =>
  node["#tag"] === "div" && classes(node).includes("crm-admin-block-context-dropdown");

const PERMISSION = /^checkLinkPerm\('([^']+)', (null|\d+)\)$/;

/** afCore's checkLinkPerm: "manage own" holds only for the record's creator, else "administer" is needed. */
export function checkLinkPerm(permission: string, createdId: number | null): boolean {
  const name =
    permission.startsWith("manage own") && window.CRM.config?.cid !== createdId
      ? permission.replace("manage own", "administer")
      : permission;
  return window.CRM.checkPerm(name);
}

// deviation:admin-menu-title-text
function textOf(nodes: LayoutNode[]): { text: string; emphasis: boolean }[] | null {
  const parts: { text: string; emphasis: boolean }[] = [];
  for (const node of nodes) {
    if (!isElement(node)) {
      if ("#text" in node) parts.push({ text: node["#text"], emphasis: false });
    } else if (node["#tag"] === "em") {
      const inner = textOf(node["#children"] ?? []);
      if (!inner || inner.some((part) => part.emphasis)) return null;
      parts.push({ text: inner.map((part) => part.text).join(""), emphasis: true });
    } else if (node["#tag"] !== "i") return null;
  }
  return parts;
}

function link(item: ElementNode): AdminLink | null {
  const check = typeof item["ng-if"] === "string" ? PERMISSION.exec(item["ng-if"]) : null;
  const anchor = elements(item).find((node) => node["#tag"] === "a");
  const icon = anchor && elements(anchor).find((node) => node["#tag"] === "i");
  const label = anchor && textOf(anchor["#children"] ?? []);
  if (!check?.[1] || !check[2] || !anchor || typeof anchor.href !== "string" || !label) return null;
  const parts: { text: string; emphasis: boolean }[] = [];
  for (const part of label) {
    const previous = parts.at(-1);
    const text = part.text.replace(/\s+/g, " ");
    if (previous && !previous.emphasis && !part.emphasis) previous.text += text;
    else parts.push({ ...part, text });
  }
  const first = parts[0];
  if (first) first.text = first.text.trimStart();
  const last = parts.at(-1);
  if (last) last.text = last.text.trimEnd();
  return {
    url: anchor.href,
    icon: icon
      ? classes(icon)
          .filter((name) => name !== "crm-i")
          .join(" ")
      : "",
    permission: check[1],
    createdId: check[2] === "null" ? null : Number(check[2]),
    label: parts.filter((part) => part.text !== ""),
  };
}

/** The menu's links in core's order, or null when its markup is not afform_admin's. */
export function adminMenuLinks(menu: ElementNode): AdminLink[] | null {
  const list = elements(menu).find((node) => node["#tag"] === "ul");
  if (!list) return null;
  const links = elements(list).map(link);
  return links.length && links.every((found) => found !== null) ? links : null;
}
