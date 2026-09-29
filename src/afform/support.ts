import { parseFiltersAttribute, readsOptions, type DisplayFilters } from "../search/displayFilters";
import { columnNote, unsupportedFeatures } from "../search/rows";
import { isDisplaySettings, type DisplaySettings } from "../search/types";
import { parseConditions } from "./conditions";
import { interpolate } from "./expressions";
import { INPUT_TYPES, inputTypeNote } from "./Field";
import type { ElementNode, LayoutNode } from "./types";
import { isElement, isFieldDefn } from "./types";

/**
 * What the React renderer can show of a layout. The renderer (Layout.tsx) dispatches on
 * nodeKind() and words its "Not supported" notes with the functions here; layoutProblems()
 * walks a layout the same way and returns those notes without rendering, for the support report.
 */

/** Plain HTML the layout may contain; anything else with a dash is an unknown directive. */
const HTML_TAGS = new Set([
  "div",
  "span",
  "p",
  "fieldset",
  "section",
  "article",
  "header",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "small",
  "br",
  "hr",
  "ul",
  "ol",
  "li",
  "a",
  "label",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
]);
/** Attributes the renderer interprets itself; other ng-*, af-* and crm-* attributes are reported. */
const HANDLED = new Set([
  "af-if",
  "api-entities",
  "af-fieldset",
  "af-join",
  "af-repeat",
  "af-repeat-default",
  "af-title",
  "af-copy",
  "add-icon",
  "copy-icon",
  "min",
  "max",
  "actions",
  "data",
  "crm-icon",
  "ng-click",
  "ctrl",
  "ng-form",
  "ng-href",
]);
/** af-field attributes the renderer uses; `class` goes onto the field wrapper. */
const FIELD_ATTRIBUTES = new Set([
  "#tag",
  "#children",
  "name",
  "defn",
  "class",
  "af-required",
  "af-disabled",
  "af-if",
]);
/** Attributes of an af-field inside a search fieldset; `class` goes onto the field element. */
const FILTER_ATTRIBUTES = new Set(["#tag", "#children", "name", "defn", "class", "af-if"]);
/**
 * Attributes of a search display element: the display's names and settings, and what Afform's
 * metadata injector adds for Angular's bindings (the same names again, the entity).
 */
const SEARCH_ATTRIBUTES = new Set([
  "#tag",
  "#children",
  "search-name",
  "display-name",
  "settings",
  "af-if",
  "filters",
  "total-count",
  "api-entity",
  "search",
  "display",
]);
const PASSTHROUGH = new Set(["id", "href", "title", "role", "target", "type"]);

export type NodeKind =
  | "conditional"
  | "submitCondition"
  | "entity"
  | "field"
  | "block"
  | "form"
  | "submit"
  | "search"
  | "unknown"
  | "searchFieldset"
  | "fieldset"
  | "join"
  | "element";

export const SUBMIT_BUTTON_CONDITION = "afform.showSubmitButton";

/** How the renderer treats an element, in the order Layout's Node() checks. */
export function nodeKind(node: ElementNode): NodeKind {
  if (typeof node["af-if"] === "string") return "conditional";
  if (node["ng-if"] === SUBMIT_BUTTON_CONDITION) return "submitCondition";
  return renderedKind(node);
}

/** How an element renders once its af-if or submit-button condition holds. */
export function renderedKind(
  node: ElementNode,
): Exclude<NodeKind, "conditional" | "submitCondition"> {
  const tag = node["#tag"];
  if (tag === "af-entity") return "entity";
  if (tag === "af-field") return "field";
  // Blocks arrive with their compiled layout as children.
  if (tag.startsWith("afblock-")) return "block";
  if (tag === "af-form") return "form";
  if (tag === "button" && node["ng-click"] === "afform.submit()") return "submit";
  if (tag === "crm-search-display-table") return "search";
  if (unsupportedElement(node) !== null) return "unknown";
  // An empty af-fieldset wraps a search page's filters rather than an entity.
  if (node["af-fieldset"] === "") return "searchFieldset";
  if (node["af-fieldset"]) return "fieldset";
  if (typeof node["af-join"] === "string") return "join";
  return "element";
}

/** An element's unknown tag or unknown directive attributes, as its note names them. */
export function unsupportedElement(node: ElementNode): string | null {
  const tag = node["#tag"];
  if (!HTML_TAGS.has(tag)) return `<${tag}>`;
  const unknown = Object.keys(node).filter(
    (attr) =>
      /^(ng|af|crm)-/.test(attr) &&
      !HANDLED.has(attr) &&
      !(attr === "ng-if" && node[attr] === SUBMIT_BUTTON_CONDITION),
  );
  if (node["ng-click"] !== undefined) unknown.push(`ng-click=${JSON.stringify(node["ng-click"])}`);
  return unknown.length ? unknown.join(", ") : null;
}

/** The attributes an HTML element carries over, by React prop name; values may hold {{ }}. */
export function elementAttributes(node: ElementNode): [string, unknown][] {
  return Object.entries(node).flatMap(([attr, value]): [string, unknown][] => {
    if (attr === "class") return [["className", value]];
    if (attr === "ng-href") return [["href", value]];
    return PASSTHROUGH.has(attr) || attr.startsWith("aria-") ? [[attr, value]] : [];
  });
}

export function expressionNote(expressions: string[]): string {
  return `Angular expression ${expressions.join(", ")}`;
}

export function conditionNote(name: string, attribute: string): string {
  return `${name}="${attribute}"`;
}

export function missingFieldNote(name: string): string {
  return `field ${name} without entity or metadata`;
}

export function joinOutsideFieldsetNote(join: string): string {
  return `af-join="${join}" outside a fieldset`;
}

/** af-field attributes the renderer does not apply. */
export function unknownFieldAttributes(node: ElementNode): string[] {
  return Object.keys(node).filter((attr) => !FIELD_ATTRIBUTES.has(attr));
}

export function fieldAttributesNote(problems: string[], name: string): string {
  return `${problems.join(", ")} on ${name}`;
}

/** af-field attributes a filter field does not apply. */
export function unknownFilterAttributes(node: ElementNode): string[] {
  return Object.keys(node).filter((attr) => !FILTER_ATTRIBUTES.has(attr));
}

export function searchRangeNote(label: string): string {
  return `search range (${label})`;
}

/** Search display attributes the renderer ignores. */
export function unknownSearchAttributes(node: ElementNode): string | null {
  const unknown = Object.keys(node).filter((attr) => !SEARCH_ATTRIBUTES.has(attr));
  return unknown.length ? `${unknown.join(", ")} on <${node["#tag"]}>` : null;
}

export type SearchDisplayCheck =
  | { notes: string[]; filters: null }
  | { notes: string[]; filters: DisplayFilters; settings: DisplaySettings | undefined };

/**
 * The notes of a search display element, and whether its table renders (filters not null).
 * `options` are a placement's arguments, undefined outside one.
 */
export function searchDisplayCheck(
  node: ElementNode,
  options: Record<string, unknown> | undefined,
): SearchDisplayCheck {
  const attributes = unknownSearchAttributes(node);
  const notes = attributes ? [attributes] : [];
  const settings = node.settings;
  if (settings !== undefined && !isDisplaySettings(settings))
    return { notes: [...notes, "search display settings without columns"], filters: null };
  // Without its own filters the display would show rows the form means to hide.
  const parsed = parseFiltersAttribute(node.filters);
  if ("error" in parsed) return { notes: [...notes, parsed.error], filters: null };
  if (options === undefined && readsOptions(parsed.filters))
    return {
      notes: [...notes, "display filters from options outside a placement"],
      filters: null,
    };
  // Core writes the row count into the page's scope; nothing reads it here.
  if (node["total-count"] !== undefined)
    notes.push(`total-count=${JSON.stringify(node["total-count"])}`);
  return { notes, filters: parsed.filters, settings };
}

const CHECK_ONLY = { translate: () => "", url: () => "" };

function expressionProblems(values: unknown[]): string[] {
  return values.flatMap((value) => {
    if (typeof value !== "string" || !value.includes("{{")) return [];
    const result = interpolate(value, CHECK_ONLY);
    return "unsupported" in result ? [result.unsupported] : [];
  });
}

function conditionProblem(node: ElementNode, attribute: string): string[] {
  const value = node[attribute];
  if (typeof value !== "string") return [];
  try {
    parseConditions(value);
    return [];
  } catch {
    return [conditionNote(attribute, value)];
  }
}

interface Scope {
  /** Inside an af-fieldset or af-join, where fields find their entity. */
  entity: boolean;
  /** Inside an af-repeat of join records, where is_primary becomes a radio. */
  repeated: boolean;
  /** Inside a search fieldset, where fields without entity are filters. */
  filters: boolean;
  /** A placement's arguments, undefined outside one. */
  options: Record<string, unknown> | undefined;
}

function filterFieldProblems(node: ElementNode): string[] {
  const name = String(node.name);
  const defn = node.defn;
  if (!isFieldDefn(defn)) return [`field ${name} without metadata`];
  const unknown = unknownFilterAttributes(node);
  const problems = unknown.length ? [fieldAttributesNote(unknown, name)] : [];
  const label = defn.label === false ? name : (defn.label ?? name);
  if (defn.search_range) problems.push(searchRangeNote(label));
  else if (!INPUT_TYPES.has(defn.input_type)) problems.push(inputTypeNote(defn));
  return problems;
}

function fieldProblems(node: ElementNode, scope: Scope): string[] {
  const name = String(node.name);
  const defn = node.defn;
  if (scope.filters && !scope.entity) return filterFieldProblems(node);
  if (!scope.entity || !isFieldDefn(defn)) return [missingFieldNote(name)];
  const unknown = [
    ...unknownFieldAttributes(node),
    ...conditionProblem(node, "af-required"),
    ...conditionProblem(node, "af-disabled"),
  ];
  const problems = unknown.length ? [fieldAttributesNote(unknown, name)] : [];
  const primary = name === "is_primary" && scope.repeated;
  if (!primary && !INPUT_TYPES.has(defn.input_type)) problems.push(inputTypeNote(defn));
  return problems;
}

/** The display's notes, and those its table shows whatever the rows; task links need rows. */
function searchProblems(node: ElementNode, scope: Scope): string[] {
  const check = searchDisplayCheck(node, scope.options);
  if (check.filters === null || !check.settings) return check.notes;
  const columns = check.settings.columns.flatMap((column) => columnNote(column) ?? []);
  // The table names its features in one note.
  const features = unsupportedFeatures(check.settings).join(", ");
  return [...check.notes, ...(features ? [features] : []), ...new Set(columns)];
}

function elementProblems(node: ElementNode): string[] {
  const values = [...elementAttributes(node).map(([, value]) => value), node["af-title"]];
  const expressions = expressionProblems(values);
  return expressions.length ? [expressionNote(expressions)] : [];
}

const childProblems = (node: ElementNode, scope: Scope) =>
  layoutProblemsIn(node["#children"] ?? [], scope);

/** What each kind of element contributes, walked as the renderer walks it. */
const KIND_PROBLEMS: Record<NodeKind, (node: ElementNode, scope: Scope) => string[]> = {
  // An unreadable condition shows its note instead of the element.
  conditional: (node, scope) => {
    const unreadable = conditionProblem(node, "af-if");
    return unreadable.length ? unreadable : KIND_PROBLEMS[renderedKind(node)](node, scope);
  },
  submitCondition: (node, scope) => KIND_PROBLEMS[renderedKind(node)](node, scope),
  entity: () => [],
  field: fieldProblems,
  block: childProblems,
  form: childProblems,
  submit: childProblems,
  search: searchProblems,
  unknown: (node, scope) => [
    ...[unsupportedElement(node)].filter((note) => note !== null),
    ...childProblems(node, scope),
  ],
  searchFieldset: (node, scope) => [
    ...elementProblems(node),
    ...childProblems(node, { ...scope, filters: true }),
  ],
  fieldset: (node, scope) => [
    ...elementProblems(node),
    ...childProblems(node, { ...scope, entity: true, repeated: false }),
  ],
  join: (node, scope) =>
    scope.entity
      ? [
          ...elementProblems(node),
          ...childProblems(node, {
            ...scope,
            entity: true,
            repeated: node["af-repeat"] !== undefined,
          }),
        ]
      : [joinOutsideFieldsetNote(String(node["af-join"]))],
  element: (node, scope) => [...elementProblems(node), ...childProblems(node, scope)],
};

function nodeProblems(node: LayoutNode, scope: Scope): string[] {
  if (isElement(node)) return KIND_PROBLEMS[nodeKind(node)](node, scope);
  if ("#comment" in node) return [];
  return expressionProblems([node["#text"]]).map((expression) => expressionNote([expression]));
}

function layoutProblemsIn(nodes: LayoutNode[], scope: Scope): string[] {
  return nodes.flatMap((node) => nodeProblems(node, scope));
}

/**
 * Every "Not supported" note the renderer would show for the layout, whatever the form's data;
 * `options` stand for a placement's arguments.
 */
export function layoutProblems(layout: LayoutNode[], options?: Record<string, unknown>): string[] {
  return layoutProblemsIn(layout, { entity: false, repeated: false, filters: false, options });
}
