import { evaluateExpression, interpolate, literal, type ExpressionContext } from "./expressions";
import type { ElementNode, LayoutNode } from "./types";
import { isElement } from "./types";

/**
 * Tab sets of Afform layouts: afTabset with its af-tab children (afTabset.component.js), and
 * crmUiTabSet with children carrying crm-ui-tab (crmUi.js). Shared by the renderer and the report.
 */

/** A display's `total-count` that puts its row count into the badge of the tab around it. */
export const TAB_COUNT = "$parent.count";

const TABSET_ATTRIBUTES = new Set([
  "#tag",
  "#children",
  "class",
  "id",
  "url-arg",
  "remember-selection",
  "selected-tab",
  "page-nav-buttons",
  "page-nav-submit-text",
]);
const TAB_ATTRIBUTES = new Set(["#tag", "#children", "name", "title", "icon", "count"]);
/** What crmUiTab reads off its element; the element renders without them. */
const UI_TAB_ATTRIBUTES = ["crm-ui-tab", "crm-title", "crm-icon", "count", "id"];

export interface Tab {
  /** afTab's name, or crmUiTab's id: the value of url-arg and of the remembered selection. */
  name: string;
  title: string;
  icon: string;
  count: string;
  /** crmUiTab's id, which its link points to; afTab panels get a generated one. */
  panelId?: string;
  /** Rendered inside the tab's panel. */
  content: LayoutNode[];
  problems: string[];
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");

function unknownAttributes(node: ElementNode, known: Set<string>): string[] {
  const unknown = Object.keys(node).filter((attr) => !known.has(attr));
  return unknown.length ? [`${unknown.join(", ")} on <${node["#tag"]}>`] : [];
}

/** An afTabset flag is an expression; the literals FormBuilder writes are read, else null. */
function flag(node: ElementNode, attr: string): boolean | null {
  const value = node[attr];
  if (value === undefined) return false;
  const written = text(value).trim();
  if (["true", "1"].includes(written)) return true;
  return ["false", "0", ""].includes(written) ? false : null;
}

export const remembersSelection = (node: ElementNode) => flag(node, "remember-selection");

/** page-nav-buttons (6.20): Back, Next and Submit buttons under the panels. */
export const hasPageNav = (node: ElementNode) => flag(node, "page-nav-buttons");

const STRING_LITERAL = /^\s*(?:::)?\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*$/;

/**
 * selected-tab (6.20) names the tab to start on as an expression; a string literal is read.
 * Undefined without the attribute, null for any other expression.
 */
export function selectedTabOf(node: ElementNode): string | null | undefined {
  const value = node["selected-tab"];
  if (value === undefined) return undefined;
  const match = STRING_LITERAL.exec(text(value));
  return match ? literal(match[1] ?? "''") : null;
}

export function tabsetProblems(node: ElementNode): string[] {
  const problems = unknownAttributes(node, TABSET_ATTRIBUTES);
  for (const attr of ["remember-selection", "page-nav-buttons"])
    if (flag(node, attr) === null) problems.push(`${attr}=${JSON.stringify(node[attr])}`);
  if (selectedTabOf(node) === null)
    problems.push(`selected-tab=${JSON.stringify(node["selected-tab"])}`);
  return problems;
}

export const tabOutsideNote = (tag: string) => `<${tag}> outside its tab set`;

const isAfTab = (node: LayoutNode): node is ElementNode =>
  isElement(node) && node["#tag"] === "af-tab";
const isUiTab = (node: LayoutNode): node is ElementNode =>
  isElement(node) && node["crm-ui-tab"] !== undefined;

/** Whether a child of the tab set is one of its tabs. */
export function isTabOf(tabset: ElementNode, child: LayoutNode): child is ElementNode {
  return tabset["#tag"] === "af-tabset" ? isAfTab(child) : isUiTab(child);
}

function interpolated(value: unknown, context: ExpressionContext, problems: string[]): string {
  const result = interpolate(text(value), context);
  if ("text" in result) return result.text;
  problems.push(`Angular expression ${result.unsupported}`);
  return "";
}

function afTab(node: ElementNode, index: number, context: ExpressionContext): Tab {
  const problems = unknownAttributes(node, TAB_ATTRIBUTES);
  return {
    // afTab numbers unnamed tabs with one counter for the whole page; this counts per tab set.
    name: text(node.name) || `tab${index}`,
    title: interpolated(node.title, context, problems),
    icon: interpolated(node.icon, context, problems),
    count: interpolated(node.count, context, problems),
    content: node["#children"] ?? [],
    problems,
  };
}

/** crmUiTab: crm-title is an expression, the attributes after it are interpolated. */
function uiTab(node: ElementNode, index: number, context: ExpressionContext): Tab {
  const problems: string[] = [];
  const titleExpression = text(node["crm-title"]);
  const title = titleExpression ? evaluateExpression(titleExpression, context) : "";
  if (title === null) problems.push(`crm-title=${JSON.stringify(titleExpression)}`);
  const content: ElementNode = { ...node };
  for (const attr of UI_TAB_ATTRIBUTES) delete content[attr];
  const id = text(node.id);
  return {
    name: id || `tab${index}`,
    panelId: id || undefined,
    title: title ?? "",
    icon: interpolated(node["crm-icon"], context, problems),
    count: interpolated(node.count, context, problems),
    content: [content],
    problems,
  };
}

/** The tabs of a tab set, in layout order. */
export function tabsOf(tabset: ElementNode, context: ExpressionContext): Tab[] {
  const make = tabset["#tag"] === "af-tabset" ? afTab : uiTab;
  return (tabset["#children"] ?? [])
    .filter((child) => isTabOf(tabset, child))
    .map((child, index) => make(child, index, context));
}

/** afTabset's first tab: the first candidate naming a tab (URL, selected-tab, remembered), else the first tab. */
export function initialTab(
  names: string[],
  candidates: (string | null | undefined)[],
): string | null {
  return candidates.find((name) => !!name && names.includes(name)) ?? names[0] ?? null;
}

/** The tab a key moves to in a tab list (APG tabs pattern), or null for other keys. */
export function tabForKey(key: string, index: number, count: number): number | null {
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (index + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
