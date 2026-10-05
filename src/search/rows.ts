import { unsupportedEditors } from "./inlineEdit";
import type {
  Column,
  DisplaySettings,
  EditableInfo,
  Row,
  RunPage,
  SubsearchDisplay,
  ToolbarLink,
} from "./types";

/** isSortable() of searchDisplaySortableTrait: fields and markup sort unless switched off. */
export function isSortable(column: Column, settings: DisplaySettings): boolean {
  return (
    !settings.draggable &&
    (column.type === "field" || column.type === "html") &&
    column.sortable !== false
  );
}

/** getHeaderClass() of crmSearchDisplayTable: sortable, alignment and unconditional css rules. */
export function headerClass(column: Column, sortable: boolean): string | undefined {
  const classes = [
    ...(sortable ? ["crm-sortable-col"] : []),
    ...(column.alignment ? [column.alignment] : []),
    ...(column.cssRules ?? []).flatMap((rule) => (rule.length === 1 && rule[0] ? [rule[0]] : [])),
  ];
  return classes.length ? classes.join(" ") : undefined;
}

/** A name for screen readers where core leaves a header empty, as it does over link columns. */
export function unlabelledHeader(column: Column, index: number): string | null {
  if (column.label) return null;
  return ["links", "buttons", "menu"].includes(column.type)
    ? ts("Actions")
    : ts("Column %1", { 1: index + 1 });
}

function depth(row: Row, key: "_depth" | "_descendents"): number {
  const value = Number(row.data?.[key] ?? 0);
  return Number.isNaN(value) ? 0 : value;
}

/** Sub-rows of a hierarchical row on the same page. */
export function descendents(row: Row): number {
  return depth(row, "_descendents");
}

/** getRowClass() of crmSearchDisplayTable: the hierarchy classes every cell of a row carries. */
export function rowClass(row: Row, settings: DisplaySettings): string {
  if (!settings.hierarchical) return "";
  const level = depth(row, "_depth");
  return [
    "crm-hierarchical-row",
    `crm-hierarchical-depth-${String(level)}`,
    ...(level ? ["crm-hierarchical-child"] : []),
    ...(descendents(row) ? ["crm-hierarchical-parent"] : []),
  ].join(" ");
}

/** Class list of a body cell, in the order of crmSearchDisplayTableBody.html. */
export function cellClass(
  column: Column | undefined,
  row: Row,
  settings: DisplaySettings,
  cssClass: string | undefined,
): string {
  return [
    `crm-search-col-type-${column?.type ?? ""}`,
    rowClass(row, settings),
    cssClass ?? "",
    row.cssClass ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * The control column before the data columns. Core also shows it for drag handles and row
 * editing, which the React renderer reports as unsupported instead.
 */
export function hasControlColumn(settings: DisplaySettings): boolean {
  return !!settings.actions || !!settings.collapsible || !!(settings.tally && settings.tally.label);
}

/** crmSearchDisplayToggleCollapse's initial state: rows with sub-rows start closed on "closed". */
export function startsCollapsed(row: Row, settings: DisplaySettings): boolean {
  return descendents(row) > 0 && settings.collapsible === "closed";
}

/** Keys of the rows under a collapsed row; a hidden row's own state no longer matters. */
export function hiddenRows(rows: Row[], isCollapsed: (row: Row) => boolean): Set<Row["key"]> {
  const hidden = new Set<Row["key"]>();
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (!row || !isCollapsed(row)) continue;
    const count = descendents(row);
    for (const child of rows.slice(index + 1, index + 1 + count)) hidden.add(child.key);
    index += count;
  }
  return hidden;
}

/** Column types the table renders; the rest show a note in each cell. */
const COLUMN_TYPES = new Set(["field", "html", "image", "links", "buttons", "menu", "subsearch"]);

/** The note a cell of `column` shows instead of its content, or null when the table renders it. */
export function columnNote(column: Column | undefined): string | null {
  if (column && COLUMN_TYPES.has(column.type)) return null;
  if (column?.type === "include") return `include column ${column.path ?? ""}`;
  return `column type ${column?.type ?? "(none)"}`;
}

/**
 * Settings the table shows or the server applies before the rows arrive. Any other setting
 * with a value gets a note, so a new SearchKit feature never goes missing silently.
 */
const TABLE_SETTINGS = new Set([
  "columns",
  "limit",
  "sort",
  "pager",
  "classes",
  "noResultsText",
  "placeholder",
  "description",
  "headerCount",
  "hideThead",
  "hierarchical",
  "collapsible",
  "tally",
  "toolbar",
  // Older displays' toolbar button; the server turns it into a toolbar.
  "addButton",
  "button",
  "cssRules",
  "columnMode",
  "actions",
  "actions_display_mode",
  // Stored by some core displays; nothing in core reads it.
  "nested",
  // Named features below.
  "editableRow",
  "draggable",
  "toggleColumns",
]);
const PAGER_OPTIONS = new Set(["show_count", "hide_single", "expose_limit"]);

/** Unset as SearchKit's admin UI stores switched-off features: empty values. */
function isSet(value: unknown): boolean {
  if (value === undefined || value === null || value === false || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

/** Cells edit one at a time, unless full-row mode edits whole rows (not rendered yet). */
export function editsCells(settings: DisplaySettings): boolean {
  return !(settings.editableRow && settings.editableRow.full);
}

/**
 * Display features the React table cannot show yet, each named with its setting. Editors
 * are known only from a loaded page.
 */
export function unsupportedFeatures(settings: DisplaySettings, page?: RunPage): string[] {
  const features: string[] = Object.entries(settings)
    .filter(([key, value]) => !TABLE_SETTINGS.has(key) && isSet(value))
    .map(([key]) => `setting ${key}`);
  if (typeof settings.pager === "object")
    for (const [key, value] of Object.entries(settings.pager))
      if (!PAGER_OPTIONS.has(key) && isSet(value)) features.push(`setting pager.${key}`);
  if (settings.editableRow && (settings.editableRow.create || settings.editableRow.full))
    features.push("row editing (editableRow)");
  if (editsCells(settings)) features.push(...unsupportedEditors(page));
  if (settings.draggable) features.push("drag to reorder (draggable)");
  return features;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isLinks(value: unknown): value is ToolbarLink[] {
  return Array.isArray(value) && value.every(isObject);
}

function isSubsearchDisplays(value: unknown): value is Record<string, SubsearchDisplay> {
  return (
    isObject(value) &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => isObject(entry) && typeof entry.type === "string")
  );
}

/** PHP sends an empty list when no column is editable, and null for a column it cannot edit. */
function editableInfos(value: unknown): Record<string, EditableInfo> {
  if (!isObject(value) || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, EditableInfo] =>
        isObject(entry[1]) && typeof entry[1].value_key === "string",
    ),
  );
}

/** CRM.api4 copies the run result's properties (toolbar, subsearch settings) onto the row list. */
export function runPage(result: Row[]): RunPage {
  const property = (name: string): unknown =>
    Object.getOwnPropertyDescriptor(result, name)?.value;
  const toolbar = property("toolbar");
  const subsearch = property("subsearch");
  return {
    rows: [...result],
    toolbar: isLinks(toolbar) ? toolbar : [],
    subsearch: isSubsearchDisplays(subsearch) ? subsearch : {},
    editable: editableInfos(property("editable")),
  };
}
