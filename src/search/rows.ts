import type { Column, DisplaySettings, Row, RunPage, SubsearchDisplay, ToolbarLink } from "./types";

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
 * The control column before the data columns. Core also shows it for bulk actions, drag
 * handles and row editing, which the React renderer reports as unsupported instead.
 */
export function hasControlColumn(settings: DisplaySettings): boolean {
  return !!settings.collapsible || !!(settings.tally && settings.tally.label);
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

/**
 * Display features the React table cannot show yet, each named with its setting. Task links
 * are known only from a loaded page.
 */
export function unsupportedFeatures(settings: DisplaySettings, page?: RunPage): string[] {
  const features: string[] = [];
  if (settings.actions) features.push("bulk actions (actions)");
  const editable =
    settings.editableRow && settings.editableRow.disable
      ? []
      : settings.columns.filter((column) => column.editable).map((column) => column.key ?? "");
  if (editable.length) features.push(`in-place editing (editable: ${editable.join(", ")})`);
  if (settings.editableRow && (settings.editableRow.create || settings.editableRow.full))
    features.push("row editing (editableRow)");
  if (settings.draggable) features.push("drag to reorder (draggable)");
  if (settings.button) features.push("search button (button)");
  if (settings.toggleColumns) features.push("column picker (toggleColumns)");
  const links = [
    ...(page?.toolbar ?? []),
    ...(page?.rows ?? []).flatMap((row) => row.columns.flatMap((cell) => cell?.links ?? [])),
  ];
  const tasks = new Set(links.flatMap((link) => link.task ?? []));
  if (tasks.size) features.push(`task links (${[...tasks].join(", ")})`);
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

/** CRM.api4 copies the run result's properties (toolbar, subsearch settings) onto the row list. */
export function runPage(result: Row[]): RunPage {
  const toolbar: unknown = Object.getOwnPropertyDescriptor(result, "toolbar")?.value;
  const subsearch: unknown = Object.getOwnPropertyDescriptor(result, "subsearch")?.value;
  return {
    rows: [...result],
    toolbar: isLinks(toolbar) ? toolbar : [],
    subsearch: isSubsearchDisplays(subsearch) ? subsearch : {},
  };
}
