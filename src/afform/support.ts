import { isListMenuTab, LIST_MENU_SETTINGS_NOTE, listMenuTabNote } from "./AdminListMenu";
import { adminMenuLinks, isAdminMenu } from "./adminMenu";
import { chartKitMissing } from "../search/ElementDisplay";
import { parseFiltersAttribute, readsOptions, type DisplayFilters } from "../search/displayFilters";
import { columnNote, settingsOf, unsupportedFeatures } from "../search/rows";
import { referencedTasks } from "../search/searchTasks";
import { displayTypeOf, isDisplaySettings, type DisplaySettings } from "../search/types";
import { parseConditions } from "./conditions";
import { interpolate, routeTest, type RouteTest } from "./expressions";
import { INPUT_TYPES, inputTypeNote, templateNote } from "./Field";
import { entityRefProblem } from "./fields/autocomplete";
import { isTabOf, TAB_COUNT, tabOutsideNote, tabsetProblems, tabsOf } from "./tabsets";
import { fileOutsideFormNote } from "./fields/File";
import { RANGE_TYPES } from "./fields/SearchRange";
import type { ElementNode, FieldDefn, LayoutNode } from "./types";
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
  "details",
  "summary",
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
  // FormBuilder's text element (legend) and what CKEditor 4's default toolbar, formats and styles write.
  "legend",
  "pre",
  "code",
  "blockquote",
  "address",
  "caption",
  "s",
  "sub",
  "sup",
  "big",
  "tt",
  "kbd",
  "samp",
  "var",
  "del",
  "ins",
  "cite",
  "q",
]);
/** Directive attributes the renderer interprets itself; attributes it neither reads nor carries are reported. */
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
  "crm-ui-tab-set",
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
const FILTER_ATTRIBUTES = new Set([
  "#tag",
  "#children",
  "name",
  "defn",
  "class",
  "af-required",
  "af-disabled",
  "af-if",
]);
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
/** HTML attributes an element carries over under their own name, e.g. from CKEditor's dialogs. */
const PASSTHROUGH = new Set(
  (
    "id href title role target type style lang dir name rel scope headers abbr span border " +
    "summary align width height start value cite"
  ).split(" "),
);
/** HTML attributes React names differently. */
const RENAMED: Record<string, string> = {
  class: "className",
  "ng-href": "href",
  for: "htmlFor",
  colspan: "colSpan",
  rowspan: "rowSpan",
  cellpadding: "cellPadding",
  cellspacing: "cellSpacing",
  datetime: "dateTime",
  accesskey: "accessKey",
  tabindex: "tabIndex",
};

function carried(attr: string): boolean {
  return attr in RENAMED || attr === "open" || PASSTHROUGH.has(attr) || /^(aria|data)-/.test(attr);
}
/** What the renderer reads from an element besides HTML; other attributes are reported. */
const OWN = new Set(["#tag", "#children", "store-values", "field-data"]);

export type NodeKind =
  | "conditional"
  | "submitCondition"
  | "routeCondition"
  | "entity"
  | "field"
  | "block"
  | "form"
  | "submit"
  | "draft"
  | "reset"
  | "search"
  | "unknown"
  | "searchFieldset"
  | "fieldset"
  | "join"
  | "tabset"
  | "tab"
  | "adminMenu"
  | "adminListMenu"
  | "paramSets"
  | "recaptcha"
  | "turnstile"
  | "element";

export const PARAM_SETS_OUTSIDE_NOTE = "af-search-param-sets outside a search fieldset";

export interface CaptchaNotes {
  outside: string;
  keyless: string;
}

/** A captcha's notes; each extension that provides one writes its site key into the markup. */
export const CAPTCHA_NOTES: Record<"recaptcha" | "turnstile", CaptchaNotes> = {
  recaptcha: {
    outside: "crm-recaptcha2 outside af-form",
    keyless: "ReCaptcha without a site key, which the recaptcha or formprotection extension adds",
  },
  turnstile: {
    outside: "crm-turnstile outside af-form",
    keyless: "Turnstile without a site key, which the formprotection extension adds",
  },
};

/** The site key the providing extension writes into the markup, even where none is set. */
export function captchaSiteKey(node: ElementNode): string {
  return typeof node.recaptchakey === "string" ? node.recaptchakey : "";
}

export const SUBMIT_BUTTON_CONDITION = "afform.showSubmitButton";

/** How the renderer treats an element, in the order Layout's Node() checks. */
export function nodeKind(node: ElementNode): NodeKind {
  if (typeof node["af-if"] === "string") return "conditional";
  return ngIfKind(node);
}

/** Inside a holding af-if, as afIf outranks ngIf: the ng-if the renderer reads, else the element. */
export function ngIfKind(node: ElementNode): Exclude<NodeKind, "conditional"> {
  if (node["ng-if"] === SUBMIT_BUTTON_CONDITION) return "submitCondition";
  if (routeCondition(node) !== null) return "routeCondition";
  return renderedKind(node);
}

/** Elements that put data into the form as they render, which a false ng-if would keep out. */
function holdsData(node: ElementNode): boolean {
  const tag = node["#tag"];
  if (tag === "af-field" || tag === "af-entity" || tag.startsWith("afblock-")) return true;
  if (["af-fieldset", "af-join", "af-repeat"].some((attr) => node[attr] !== undefined)) return true;
  return (node["#children"] ?? []).some((child) => isElement(child) && holdsData(child));
}

/**
 * ngIf on afCore's routeParams on a plain HTML element; null for any other ng-if, and around
 * fields, which the form initialises at load, shown or not.
 */
export function routeCondition(node: ElementNode): RouteTest | null {
  const condition = node["ng-if"];
  if (typeof condition !== "string" || !HTML_TAGS.has(node["#tag"]) || holdsData(node)) return null;
  return routeTest(condition);
}

/** An ng-if the renderer does not read, as its note names it. A route test around fields is a
 * gap in React, not Angular code. */
function ngIfNotes(node: ElementNode): string[] {
  const condition = node["ng-if"];
  if (condition === SUBMIT_BUTTON_CONDITION || routeCondition(node) !== null) return [];
  return typeof condition === "string" && routeTest(condition)
    ? [`route condition (ng-if=${JSON.stringify(condition)}) around fields`]
    : ["ng-if"];
}

/** How an element renders once its af-if and ng-if conditions hold. */
export function renderedKind(
  node: ElementNode,
): Exclude<NodeKind, "conditional" | "submitCondition" | "routeCondition"> {
  const tag = node["#tag"];
  if (isAdminMenu(node)) return "adminMenu";
  if (tag === "af-admin-list-menu") return "adminListMenu";
  if (tag === "af-search-param-sets") return "paramSets";
  if (tag === "crm-recaptcha2") return "recaptcha";
  if (tag === "crm-turnstile") return "turnstile";
  if (tag === "af-entity") return "entity";
  if (tag === "af-field") return "field";
  // Blocks arrive with their compiled layout as children.
  if (tag.startsWith("afblock-")) return "block";
  if (tag === "af-form") return "form";
  if (tag === "button" && node["ng-click"] === "afform.submit()") return "submit";
  if (tag === "button" && node["ng-click"] === "afform.submitDraft()") return "draft";
  if (tag === "button" && isResetButton(node)) return "reset";
  if (displayTypeOf(tag) !== null) return "search";
  if (tag === "af-tabset") return "tabset";
  // A tab set renders its own tabs; anywhere else a tab has no set.
  if (tag === "af-tab") return "tab";
  if (unsupportedElement(node) !== null) return "unknown";
  if (node["crm-ui-tab-set"] !== undefined) return "tabset";
  // An empty af-fieldset wraps a search page's filters rather than an entity.
  if (node["af-fieldset"] === "") return "searchFieldset";
  if (node["af-fieldset"]) return "fieldset";
  if (typeof node["af-join"] === "string") return "join";
  return "element";
}

/** afButton takes over a reset button by its class. */
function isResetButton(node: ElementNode): boolean {
  return node.type === "reset" && String(node.class).split(/\s+/).includes("af-button");
}

/** An element's unknown tag or the attributes it neither handles nor carries, as its note names them. */
export function unsupportedElement(node: ElementNode): string | null {
  const tag = node["#tag"];
  if (!HTML_TAGS.has(tag)) return `<${tag}>`;
  const unknown = Object.keys(node).flatMap((attr) => {
    if (attr === "ng-if") return ngIfNotes(node);
    return HANDLED.has(attr) || OWN.has(attr) || carried(attr) ? [] : [attr];
  });
  if (node["ng-click"] !== undefined) unknown.push(`ng-click=${JSON.stringify(node["ng-click"])}`);
  // afFieldset's bindings: React remembers values in a search fieldset only, and field-data is a
  // scope expression.
  if (node["af-fieldset"] !== undefined) {
    if (node["af-fieldset"] !== "" && node["store-values"] !== undefined)
      unknown.push("store-values");
    if (node["field-data"] !== undefined)
      unknown.push(`field-data=${JSON.stringify(node["field-data"])}`);
  }
  return unknown.length ? unknown.join(", ") : null;
}

/** The attributes an HTML element carries over, by React prop name; values may hold {{ }}. */
export function elementAttributes(node: ElementNode): [string, unknown][] {
  return Object.entries(node).flatMap(([attr, value]): [string, unknown][] => {
    const renamed = RENAMED[attr];
    if (renamed !== undefined) return [[renamed, value]];
    // A boolean attribute: present, even as open="", means open.
    if (attr === "open") return [["open", true]];
    return carried(attr) ? [[attr, value]] : [];
  });
}

export function expressionNote(expressions: string[]): string {
  return `Angular expression ${expressions.join(", ")}`;
}

export const ADMIN_MENU_NOTE = "afform_admin's edit menu in a shape React does not know";

// deviation:display-filters-outside-placement
export const PLACEMENT_NOTE = "display filters from options outside a placement";

export type NoteKind = "react" | "angular" | "placement";

/** A directive's element or attribute anywhere in a note: on its own, in a list or after "<". */
const DIRECTIVE = /(^|[<, ])(ng|af|crm)-[\w-]+/;
/** An attribute whose value is an expression React cannot read, e.g. `filters="…"`. */
const EXPRESSION_ATTRIBUTE = /^[\w-]+=/;

/**
 * What a note names: Angular code (a directive, an expression, a template or a dialog only the
 * Angular application runs), a placement a form shown nowhere lacks, or vocabulary not yet in
 * React (plain HTML, display types, column types, settings).
 */
export function noteKind(note: string): NoteKind {
  if (note === PLACEMENT_NOTE) return "placement";
  if (note.startsWith("<crm-search-display-")) return "react";
  return DIRECTIVE.test(note) ||
    EXPRESSION_ATTRIBUTE.test(note) ||
    /^Angular expression |^include column |^field template |\((Angular dialog|Unsupported task expression)/.test(
      note,
    )
    ? "angular"
    : "react";
}

export function conditionNote(name: string, attribute: string): string {
  return `${name}="${attribute}"`;
}

export function missingFieldNote(name: string): string {
  return name
    ? `field ${name} without entity or metadata`
    : "af-field without a name or definition";
}

/** A draft or reset button outside af-form, where afForm does not handle it. */
export function buttonOutsideFormNote(kind: "draft" | "reset"): string {
  return `${kind === "draft" ? "save draft" : "reset"} button outside af-form`;
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

/** A block element's own attributes; core's quick edit forms repeat the join's actions on it, inert. */
const BLOCK_ATTRIBUTES = new Set(["#tag", "#children", "af-if", "af-title", "class", "actions"]);

/** Attributes on a block element the renderer neither handles nor carries over. */
export function unknownBlockAttributes(node: ElementNode): string | null {
  const unknown = Object.keys(node).filter((attr) => !BLOCK_ATTRIBUTES.has(attr) && !carried(attr));
  return unknown.length ? `${unknown.join(", ")} on <${node["#tag"]}>` : null;
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
 * `options` are a placement's arguments, undefined outside one; `inTab` inside a tab set.
 */
export function searchDisplayCheck(
  node: ElementNode,
  options: Record<string, unknown> | undefined,
  inTab: boolean,
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
      notes: [...notes, PLACEMENT_NOTE],
      filters: null,
    };
  // Core writes the row count into the page's scope; only a tab's badge reads it here.
  if (node["total-count"] !== undefined && !(inTab && node["total-count"] === TAB_COUNT))
    notes.push(`total-count=${JSON.stringify(node["total-count"])}`);
  return { notes, filters: parsed.filters, settings };
}

const CHECK_ONLY = { translate: () => "", url: () => "", routeParams: {} };

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
  /** Inside a tab, whose badge a display's row count can go to. */
  tab: boolean;
  /** Inside af-form, where draft and reset buttons act on the form. */
  form: boolean;
}

function filterFieldProblems(node: ElementNode): string[] {
  const name = String(node.name);
  const defn = node.defn;
  if (!isFieldDefn(defn)) return [`field ${name} without metadata`];
  const unknown = [
    ...unknownFilterAttributes(node),
    ...conditionProblem(node, "af-required"),
    ...conditionProblem(node, "af-disabled"),
  ];
  const problems = unknown.length ? [fieldAttributesNote(unknown, name)] : [];
  const label = defn.label === false ? name : (defn.label ?? name);
  if (defn.search_range && !RANGE_TYPES.has(defn.input_type))
    return [...problems, searchRangeNote(label)];
  const input = inputProblems(defn);
  // A filter has no record to attach a file to.
  if (input.length === 0 && defn.input_type === "File") input.push(fileOutsideFormNote(defn));
  return [...problems, ...input];
}

function fieldProblems(node: ElementNode, scope: Scope): string[] {
  const defn = node.defn;
  // An af-field without a name is an "extra" field, named and typed by its definition alone.
  const own = typeof node.name === "string" ? node.name : "";
  const name = own || (isFieldDefn(defn) ? defn.name : "");
  if (scope.filters && !scope.entity) return filterFieldProblems(node);
  if (!(scope.entity || (!node.name && name)) || !isFieldDefn(defn))
    return [missingFieldNote(name)];
  const unknown = [
    ...unknownFieldAttributes(node),
    ...conditionProblem(node, "af-required"),
    ...conditionProblem(node, "af-disabled"),
  ];
  const problems = unknown.length ? [fieldAttributesNote(unknown, name)] : [];
  // A repeat's is_primary is PrimaryField's radio, whatever its input type.
  const primary = name === "is_primary" && scope.repeated;
  const template = templateNote(defn);
  if (!primary) problems.push(...inputProblems(defn));
  else if (template !== null) problems.push(template);
  return problems;
}

/** The input type, or the part of an EntityRef's setup, the renderer cannot show. */
function inputProblems(defn: FieldDefn): string[] {
  if (!INPUT_TYPES.has(defn.input_type)) return [inputTypeNote(defn)];
  const template = templateNote(defn);
  if (template !== null) return [template];
  const problem = defn.input_type === "EntityRef" ? entityRefProblem(defn) : null;
  return problem === null ? [] : [problem];
}

/** The display's notes, and those its table shows whatever the rows. */
function searchProblems(node: ElementNode, scope: Scope): string[] {
  const check = searchDisplayCheck(node, scope.options, scope.tab);
  if (check.filters === null || !check.settings) return check.notes;
  const type = displayTypeOf(node["#tag"]) ?? "table";
  // A chart's columns are read by core's own element.
  const columns =
    type === "chart-kit"
      ? []
      : check.settings.columns.flatMap((column) => columnNote(column) ?? []);
  // The display names its features in one note.
  const features = unsupportedFeatures(check.settings, undefined, type).join(", ");
  const chartKit = type === "chart-kit" && !window.CRM.vars?.afreact?.chartKit;
  return [
    ...check.notes,
    ...(features ? [features] : []),
    ...(chartKit ? [chartKitMissing()] : []),
    ...new Set(columns),
  ];
}

function elementProblems(node: ElementNode): string[] {
  const values = [...elementAttributes(node).map(([, value]) => value), node["af-title"]];
  const expressions = expressionProblems(values);
  return expressions.length ? [expressionNote(expressions)] : [];
}

// deviation:captcha-without-key-noted
const captchaProblems =
  (notes: CaptchaNotes) =>
  (node: ElementNode, scope: Scope): string[] => {
    if (!scope.form) return [notes.outside];
    return captchaSiteKey(node) ? [] : [notes.keyless];
  };

const childProblems = (node: ElementNode, scope: Scope) =>
  layoutProblemsIn(node["#children"] ?? [], scope);

/** What each kind of element contributes, walked as the renderer walks it. */
const KIND_PROBLEMS: Record<NodeKind, (node: ElementNode, scope: Scope) => string[]> = {
  // An unreadable condition shows its note instead of the element.
  conditional: (node, scope) => {
    const unreadable = conditionProblem(node, "af-if");
    return unreadable.length ? unreadable : KIND_PROBLEMS[ngIfKind(node)](node, scope);
  },
  submitCondition: (node, scope) => KIND_PROBLEMS[renderedKind(node)](node, scope),
  routeCondition: (node, scope) => KIND_PROBLEMS[renderedKind(node)](node, scope),
  entity: () => [],
  field: fieldProblems,
  block: (node, scope) => [
    ...[unknownBlockAttributes(node)].filter((note) => note !== null),
    ...elementProblems(node),
    ...childProblems(node, scope),
  ],
  form: (node, scope) => childProblems(node, { ...scope, form: true }),
  submit: childProblems,
  draft: (node, scope) => [
    ...(scope.form ? [] : [buttonOutsideFormNote("draft")]),
    ...childProblems(node, scope),
  ],
  reset: (node, scope) => [
    ...(scope.form ? [] : [buttonOutsideFormNote("reset")]),
    ...childProblems(node, scope),
  ],
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
  tabset: (node, scope) => [
    ...elementProblems(node),
    ...(node["#tag"] === "af-tabset" ? tabsetProblems(node) : []),
    ...tabsOf(node, CHECK_ONLY).flatMap((tab) => [
      ...tab.problems,
      ...layoutProblemsIn(tab.content, { ...scope, tab: true }),
    ]),
    ...layoutProblemsIn(
      (node["#children"] ?? []).filter((child) => !isTabOf(node, child)),
      scope,
    ),
  ],
  tab: (node, scope) => [tabOutsideNote(node["#tag"]), ...childProblems(node, scope)],
  adminMenu: (node) => (adminMenuLinks(node) ? [] : [ADMIN_MENU_NOTE]),
  // Only React's FormBuilder listing loads the settings the menu needs, and it is no takeover.
  adminListMenu: (node) => [
    isListMenuTab(node.tab) ? LIST_MENU_SETTINGS_NOTE : listMenuTabNote(node.tab),
  ],
  paramSets: (_node, scope) => (scope.filters ? [] : [PARAM_SETS_OUTSIDE_NOTE]),
  recaptcha: captchaProblems(CAPTCHA_NOTES.recaptcha),
  turnstile: captchaProblems(CAPTCHA_NOTES.turnstile),
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
  return layoutProblemsIn(layout, {
    entity: false,
    repeated: false,
    filters: false,
    options,
    tab: false,
    form: false,
  });
}

export interface TaskDisplay {
  search: string;
  display: string;
  referenced: Set<string> | "all";
}

/**
 * The search displays of a layout that offer or link to tasks. Which of those the renderer
 * runs only the server's task list tells, so the support report asks for it per display.
 */
export function taskDisplays(layout: LayoutNode[]): TaskDisplay[] {
  return layout.flatMap((node): TaskDisplay[] => {
    if (!isElement(node)) return [];
    const children = taskDisplays(node["#children"] ?? []);
    const { "search-name": search, "display-name": display, settings } = node;
    if (renderedKind(node) !== "search" || typeof search !== "string") return children;
    if (typeof display !== "string" || !isDisplaySettings(settings)) return children;
    const type = displayTypeOf(node["#tag"]) ?? "table";
    const referenced = referencedTasks(settingsOf(settings, type));
    return referenced === "all" || referenced.size
      ? [{ search, display, referenced }, ...children]
      : children;
  });
}
