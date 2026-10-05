import { evaluateExpression, interpolate, type ExpressionContext } from "./expressions";
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

/** afTabset's remember-selection is an expression; the literals FormBuilder writes are read. */
export function remembersSelection(node: ElementNode): boolean | null {
  const value = node["remember-selection"];
  if (value === undefined) return false;
  const literal = text(value).trim();
  if (["true", "1"].includes(literal)) return true;
  return ["false", "0", ""].includes(literal) ? false : null;
}

export function tabsetProblems(node: ElementNode): string[] {
  const problems = unknownAttributes(node, TABSET_ATTRIBUTES);
  if (remembersSelection(node) === null)
    problems.push(`remember-selection=${JSON.stringify(node["remember-selection"])}`);
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

/** afTabset's first tab: from the URL, else the remembered one, else the first; unknown names are skipped. */
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
