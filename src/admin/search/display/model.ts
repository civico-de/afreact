import {
  fieldToColumn,
  getColorField,
  getDefaultAggregateFn,
  getDefaultLabel,
  getEntity,
  getField,
  getFieldAndJoin,
  getJoin,
  mustAggregate,
  parseExpr,
  type ColumnDefaults,
  type ExprInfo,
  type SearchInfo,
} from "../expr";
import { formatValue } from "../condition";
import type { EntityLink, SearchAdminMetadata } from "../meta";
import { md5 } from "./md5";

/**
 * crmSearchAdminDisplay and the display type editors as functions over a copy of the display:
 * each mutates the draft as core's controllers mutate the display.
 */

export interface LinkItem {
  path?: string;
  task?: string;
  entity?: string;
  action?: string;
  join?: string;
  target?: string;
  icon?: string | null;
  text?: string;
  style?: string;
  conditions?: unknown[];
  [key: string]: unknown;
}

export interface IconItem {
  field?: string;
  icon?: string;
  side: string;
  if?: unknown[];
}

export interface AdminColumn {
  type: string;
  key?: string;
  label?: string | null;
  alignment?: string;
  sortable?: boolean;
  nowrap?: boolean;
  editable?: boolean;
  link?: LinkItem;
  title?: string | null;
  rewrite?: string;
  empty_value?: string;
  show_linebreaks?: boolean;
  image?: { alt?: string; width?: number; height?: number };
  format?: unknown;
  icons?: IconItem[];
  colors?: { field: string }[];
  cssRules?: unknown[][];
  links?: LinkItem[];
  size?: string;
  style?: string;
  icon?: string;
  text?: string;
  path?: string;
  subsearch?: { filters: unknown[]; subsearch_mode: string; [key: string]: unknown };
  tally?: { fn?: string | null; label?: string; rewrite?: string; target?: boolean };
  break?: boolean;
  forceLabel?: boolean;
  name?: string;
  index?: boolean;
  spec?: { entity_reference?: { entity?: string } };
  [key: string]: unknown;
}

export interface AdminSettings {
  columns?: AdminColumn[];
  columnMode?: string;
  sort?: [string, string][];
  limit?: number;
  pager?: false | true | { show_count?: boolean; expose_limit?: boolean; hide_single?: boolean };
  placeholder?: number;
  noResultsText?: string | false;
  classes?: string[];
  cssRules?: unknown[][];
  button?: string | null;
  headerCount?: boolean;
  actions?: boolean | string[];
  actions_display_mode?: string;
  toolbar?: LinkItem[];
  addButton?: LinkItem;
  toggleColumns?: boolean;
  tally?: { label?: string; header?: boolean; footer?: boolean };
  hideThead?: boolean;
  editableRow?: { full?: boolean; disable?: boolean; create?: boolean; createLabel?: string };
  draggable?: string | false;
  hierarchical?: boolean;
  collapsible?: string;
  description?: string;
  style?: string;
  symbol?: string;
  colno?: string;
  section_group_by?: string;
  header_tag?: string;
  parent_field?: unknown;
  searchFields?: string[];
  data_mode?: string;
  entity_permission?: string[];
  entity_permission_operator?: string;
  [key: string]: unknown;
}

/** The scheduled job that refreshes a DB entity display's table. */
export interface EntityJob {
  id?: number;
  parameters?: string;
  is_active?: boolean;
  run_frequency?: string;
  [key: string]: unknown;
}

export interface Draft {
  id?: number;
  name?: string;
  label: string;
  type: string;
  acl_bypass?: boolean;
  is_autocomplete_default?: boolean;
  _job?: EntityJob;
  settings: AdminSettings;
  [key: string]: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isColumn = (value: unknown): value is AdminColumn =>
  isRecord(value) && typeof value.type === "string";

/** Stored settings as the editor reads them: a record whose columns, when present, are columns. */
export function isAdminSettings(value: unknown): value is AdminSettings {
  return (
    isRecord(value) &&
    (value.columns === undefined ||
      value.columns === null ||
      (Array.isArray(value.columns) && value.columns.every(isColumn)))
  );
}

/** What the editors read about the search being edited. */
export interface DisplayContext {
  meta: SearchAdminMetadata;
  search: SearchInfo;
  defaultPagerSize: number;
  /** DB entity columns carry a search index (core 3ede57c349). */
  entityIndex: boolean;
}

export const colTypes = (): Record<
  string,
  { label: string; icon: string; defaults: Record<string, unknown> }
> => ({
  links: { label: ts("Links"), icon: "fa-link", defaults: { links: [] } },
  buttons: { label: ts("Buttons"), icon: "fa-square-o", defaults: { size: "btn-xs", links: [] } },
  menu: {
    label: ts("Menu"),
    icon: "fa-bars",
    defaults: { text: "", style: "default", size: "btn-xs", icon: "fa-bars", links: [] },
  },
  subsearch: {
    label: ts("Embedded Subsearch"),
    icon: "fa-window-restore",
    defaults: {
      label: "",
      rewrite: "",
      alignment: "",
      subsearch: { filters: [], subsearch_mode: "dropdown" },
    },
  },
  include: { label: ts("Custom Code"), icon: "fa-code", defaults: { path: "" } },
});

export const tableClasses = () => [
  { name: "table", label: ts("Row Borders") },
  { name: "table-bordered", label: ts("Column Borders") },
  { name: "table-striped", label: ts("Even/Odd Stripes") },
  { name: "crm-sticky-header", label: ts("Sticky Header") },
];

const selectToKey = (selectExpr: string) => selectExpr.split(" AS ").at(-1) ?? selectExpr;

export const columnsOf = (settings: AdminSettings): AdminColumn[] => settings.columns ?? [];

export function addCol(draft: Draft, type: string): void {
  const defaults = colTypes()[type]?.defaults;
  if (!defaults) throw new Error(`Unknown column type ${type}`);
  const col: AdminColumn = { ...structuredClone(defaults), type };
  if (draft.type === "table" && !("alignment" in col)) col.alignment = "text-right";
  draft.settings.columns = [...columnsOf(draft.settings), col];
}

export function removeCol(settings: AdminSettings, index: number): void {
  settings.columns = columnsOf(settings).filter((_, i) => i !== index);
}

export const getColumnIndex = (settings: AdminSettings, key: string) =>
  columnsOf(settings).findIndex((col) => selectToKey(key) === col.key);

export function getExprFromSelect(search: SearchInfo, key: string): string | null {
  const fieldKey = key.split(":")[0];
  const match = search.api_params.select.find((expr) => {
    const parts = expr.split(" AS ");
    return parts[1] === fieldKey || parts[0]?.split(":")[0] === fieldKey;
  });
  return match ? (match.split(" AS ")[0] ?? null) : null;
}

const exprInfo = (ctx: DisplayContext, key: string | undefined): ExprInfo | null => {
  const expr = key ? getExprFromSelect(ctx.search, key) : null;
  return expr ? parseExpr(ctx.meta, expr, ctx.search) : null;
};

/** The columns core starts a display with, and the defaults it fills in on opening. */
export function initColumns(ctx: DisplayContext, draft: Draft, defaults: ColumnDefaults): void {
  const settings = draft.settings;
  if (!settings.columns) {
    settings.columns = ctx.search.api_params.select.map((expr) => toColumn(ctx, expr, defaults));
    return;
  }
  settings.columns = settings.columns.filter(
    (col) => !col.key || getExprFromSelect(ctx.search, col.key),
  );
  for (const col of settings.columns) {
    const typeDefaults: Record<string, unknown> = colTypes()[col.type]?.defaults ?? {};
    for (const [key, value] of Object.entries(typeDefaults)) {
      const current = col[key];
      if (current === undefined) col[key] = structuredClone(value);
      else if (isRecord(value) && isRecord(current))
        for (const [subKey, subValue] of Object.entries(value))
          if (current[subKey] === undefined) current[subKey] = structuredClone(subValue);
    }
  }
}

function toColumn(ctx: DisplayContext, expr: string, defaults: ColumnDefaults): AdminColumn {
  const column = fieldToColumn(ctx.meta, expr, defaults, ctx.search);
  if (!isColumn(column)) throw new Error(`No column for ${expr}`);
  return column;
}

export function toggleColumn(
  ctx: DisplayContext,
  draft: Draft,
  key: string,
  defaults: ColumnDefaults,
): void {
  const index = getColumnIndex(draft.settings, key);
  if (index > -1) removeCol(draft.settings, index);
  else draft.settings.columns = [...columnsOf(draft.settings), toColumn(ctx, key, defaults)];
}

export function getFieldLabel(ctx: DisplayContext, key: string): string {
  const expr = getExprFromSelect(ctx.search, selectToKey(key));
  return expr ? getDefaultLabel(ctx.meta, expr, ctx.search) : key;
}

export function colLabel(ctx: DisplayContext, col: AdminColumn): string {
  if ((col.type === "field" || col.type === "image" || col.type === "html") && col.key)
    return getFieldLabel(ctx, col.key);
  return colTypes()[col.type]?.label ?? col.type;
}

export function getDataType(ctx: DisplayContext, key: string | undefined): string | null {
  const info = exprInfo(ctx, key);
  if (!info) return null;
  const field = info.args.find((arg) => arg.type === "field")?.field;
  return info.fn?.data_type ?? field?.data_type ?? null;
}

export const isDate = (ctx: DisplayContext, key: string | undefined) =>
  ["Date", "Timestamp"].includes(getDataType(ctx, key) ?? "");

export function toggleEmptyVal(col: AdminColumn): void {
  if (col.empty_value) delete col.empty_value;
  else col.empty_value = ts("None");
}

export function toggleRewrite(col: AdminColumn): void {
  col.rewrite = col.rewrite ? "" : `[${col.key ?? ""}]`;
}

export function toggleImage(ctx: DisplayContext, col: AdminColumn): void {
  if (col.type === "image") {
    delete col.image;
    col.type = "field";
  } else {
    col.image = { alt: colLabel(ctx, col) };
    delete col.editable;
    col.type = "image";
  }
}

export function toggleHtml(col: AdminColumn): void {
  if (col.type === "html") col.type = "field";
  else {
    delete col.editable;
    delete col.link;
    delete col.icons;
    col.type = "html";
  }
}

/** getSuffixOptions: the option formats a field offers, or null. */
export function suffixOptions(
  ctx: DisplayContext,
  col: AdminColumn,
): Record<string, string> | null {
  const info = exprInfo(ctx, col.key);
  const suffixes = info && !info.fn ? info.args[0]?.field?.suffixes : null;
  if (!suffixes) return null;
  return Object.fromEntries(
    Object.entries(ctx.meta.optionAttributes).filter(([key]) => suffixes.includes(key)),
  );
}

export const suffixOf = (col: AdminColumn) => col.key?.split(":")[1] ?? "";

export function setSuffix(col: AdminColumn, value: string): void {
  col.key = (col.key?.split(":")[0] ?? "") + (value ? `:${value}` : "");
}

export function dateFormatChoice(col: AdminColumn, formats: Record<string, string>): string {
  if (col.format === undefined) return "";
  return typeof col.format === "string" && col.format in formats ? col.format : "other";
}

export function setDateFormat(col: AdminColumn, value: string, formats: Record<string, string>) {
  if (value === "") delete col.format;
  else if (value === "other")
    col.format =
      col.format !== undefined && !(typeof col.format === "string" && col.format in formats)
        ? col.format
        : "%Y-%m-%d";
  else col.format = value;
}

export function canBeImage(ctx: DisplayContext, col: AdminColumn): boolean {
  return exprInfo(ctx, col.key)?.args[0]?.field?.input_type === "File";
}

export function canBeEditable(ctx: DisplayContext, col: AdminColumn): boolean {
  const info = exprInfo(ctx, col.key);
  const field = info?.args[0]?.field;
  return !col.link && !info?.fn && !!field && (!!field.implicit_join || !field.readonly);
}

/** A real SQL column, sortable from its header unless rows are sorted by dragging. */
export function canBeSortable(
  ctx: DisplayContext,
  settings: AdminSettings,
  col: AdminColumn,
): boolean {
  if (!col.key || settings.draggable) return false;
  const field = exprInfo(ctx, col.key)?.args.find((arg) => arg.type === "field")?.field;
  return !!field && field.type !== "Pseudo";
}

/** buildLinks: the links of the main entity, its explicit and its implicit joins. */
export function buildLinks(ctx: DisplayContext, isRow: boolean): LinkItem[] {
  const { meta, search } = ctx;
  const titled = (links: EntityLink[] | undefined, join: string, name: string): LinkItem[] =>
    structuredClone(links ?? []).map((link) => ({
      ...link,
      join,
      text: link.text.replace("%1", name),
    }));
  const main = getEntity(meta, search.api_entity);
  const links = titled(main?.links, "", main?.title ?? search.api_entity);
  for (const clause of search.api_params.join ?? []) {
    const join = typeof clause[0] === "string" ? getJoin(meta, search, clause[0]) : undefined;
    if (!join) continue;
    links.push(...titled(getEntity(meta, join.entity)?.links, join.alias, join.label));
    const bridge = typeof clause[2] === "string" ? getEntity(meta, clause[2]) : undefined;
    if (bridge)
      links.push(
        ...titled(
          bridge.links,
          join.alias,
          join.label + (bridge.bridge_title ? ` ${bridge.bridge_title}` : ""),
        ),
      );
  }
  for (const fieldName of search.api_params.select) {
    if (fieldName.includes(" AS ")) continue;
    const arg = parseExpr(meta, fieldName, search).args[0];
    const field = arg?.field;
    if (
      !field ||
      arg.suffix ||
      field.type !== "Field" ||
      !(field.fk_entity || field.name !== field.fieldName)
    )
      continue;
    const idFieldName = field.fk_entity
      ? fieldName
      : fieldName.slice(0, fieldName.lastIndexOf("."));
    const idArg = parseExpr(meta, idFieldName, search).args[0];
    const idField = idArg?.field;
    if (!idField || mustAggregate(meta, idFieldName, search)) continue;
    const attrs = isRecord(idField.input_attrs) ? idField.input_attrs : {};
    const fieldLabel = typeof attrs.label === "string" && attrs.label ? attrs.label : idField.label;
    const label = (idArg.join ? `${idArg.join.label}: ` : "") + fieldLabel;
    links.push(
      ...titled(getEntity(meta, idField.fk_entity ?? undefined)?.links, idFieldName, label),
    );
  }
  return links.filter((link) => ["add", "browse"].includes(link.action ?? "") !== isRow);
}

/** A search task offered as a row link, as getLinks adds them. */
export interface TaskInfo {
  name: string;
  title: string;
  icon?: string;
  entity?: string;
  number?: string;
}

export function taskLinks(tasks: TaskInfo[]): LinkItem[] {
  return tasks
    .filter((task) => task.number === "> 0" || task.number === "=== 1")
    .map((task) => ({
      text: task.title,
      icon: task.icon,
      task: task.name,
      entity: task.entity,
      target: "crm-popup",
      join: "",
      style: task.name === "delete" ? "danger" : "default",
    }));
}

/** getJoinEntity: the explicit or implicit join a column's links belong to. */
function joinEntity(info: ExprInfo): string {
  const arg = info.args.find((a) => a.type === "field");
  const field = arg?.field;
  const prefix = arg?.prefix ?? "";
  if (field && (field.fk_entity || field.name !== field.fieldName))
    return (
      prefix + (field.fk_entity ? field.name : field.name.slice(0, field.name.lastIndexOf(".")))
    );
  return prefix.replace(".", "");
}

/** getLinks: all row links, or those of a column's entity; none for an aggregate column. */
export function linksFor(ctx: DisplayContext, all: LinkItem[], columnKey?: string): LinkItem[] {
  if (!columnKey) return all;
  const info = exprInfo(ctx, columnKey);
  if (!info) return all.filter((link) => link.join === "");
  if (info.fn?.category === "aggregate" && info.fn.name !== "GROUP_CONCAT") return [];
  const join = joinEntity(info);
  return all.filter((link) => link.join === join);
}

const LINK_PROPS = ["path", "entity", "action", "join", "target", "task"] as const;

export function onChangeLink(column: AdminColumn, all: LinkItem[], after: LinkItem): void {
  const link: LinkItem = column.link ?? {};
  column.link = link;
  const before = link.action ? all.find((l) => l.action === link.action) : undefined;
  if (!after.action && !after.path && !after.task) {
    if (before && before.text === column.title) delete column.title;
    delete column.link;
    return;
  }
  if (after.text && ((!column.title && !before) || (before && before.text === column.title)))
    column.title = after.text;
  else if (!after.text && before && before.text === column.title) delete column.title;
  for (const prop of LINK_PROPS) link[prop] = after[prop] ?? "";
}

export function toggleLink(column: AdminColumn, links: LinkItem[], all: LinkItem[]): void {
  if (column.link) onChangeLink(column, all, {});
  else {
    delete column.editable;
    onChangeLink(column, all, links[0] ?? { path: "civicrm/" });
  }
}

export function defaultSort(ctx: DisplayContext): [string, string][] {
  const orderBy = getEntity(ctx.meta, ctx.search.api_entity)?.order_by;
  return typeof orderBy === "string" && orderBy ? [[orderBy, "ASC"]] : [];
}

export function toggleDraggable(ctx: DisplayContext, settings: AdminSettings): void {
  if (settings.draggable) settings.draggable = false;
  else {
    settings.sort = [];
    const orderBy = getEntity(ctx.meta, ctx.search.api_entity)?.order_by;
    settings.draggable = typeof orderBy === "string" ? orderBy : false;
  }
}

export function toggleItem<T>(collection: T[], item: T): T[] {
  return collection.includes(item) ? collection.filter((i) => i !== item) : [...collection, item];
}

export const entityHasType = (ctx: DisplayContext, type: string) =>
  !!getEntity(ctx.meta, ctx.search.api_entity)?.type?.includes(type);

/** The settings a new display of `type` starts with, before its editor's $onInit. */
export function newSettings(ctx: DisplayContext, extra: AdminSettings): AdminSettings {
  const defaults = ctx.meta.defaultDisplay.settings;
  return { ...(isRecord(defaults) ? structuredClone(defaults) : {}), ...extra };
}

// searchAdminDisplayTable

export function initTable(ctx: DisplayContext, draft: Draft): void {
  if (!isRecord(draft.settings) || Object.keys(draft.settings).length === 0) {
    draft.settings = newSettings(ctx, { pager: {} });
    delete draft.settings.columns;
    draft.settings.sort = defaultSort(ctx);
  }
  const settings = draft.settings;
  settings.classes = settings.classes ?? [];
  setColumnMode(ctx, draft, settings.columnMode ?? (settings.columns ? "custom" : "auto"));
  if (settings.tally) {
    settings.tally.header ??= false;
    settings.tally.footer ??= true;
  }
}

export function setColumnMode(
  ctx: DisplayContext,
  draft: Draft,
  value: string,
  setTally = false,
): void {
  if (value === "auto") delete draft.settings.columns;
  else {
    initColumns(ctx, draft, { label: true, sortable: true });
    if (setTally && draft.settings.tally) setTallyDefaults(ctx, draft.settings);
  }
  draft.settings.columnMode = value;
}

export function toggleEditableRowMode(
  settings: AdminSettings,
  name: "full" | "disable" | "create",
  wanted?: boolean,
): void {
  const row = settings.editableRow ?? {};
  const value = wanted ?? !row[name];
  if (value === row[name]) return;
  if (value) row[name] = true;
  else {
    delete row[name];
    if (name === "create") {
      delete row.disable;
      delete row.createLabel;
    }
  }
  if (value && name === "create") row.createLabel = ts("Add");
  if (name === "full") delete row.disable;
  if (name === "disable") delete row.full;
  if (Object.keys(row).length) settings.editableRow = row;
  else delete settings.editableRow;
}

export function toggleTally(
  ctx: DisplayContext,
  draft: Draft,
  position: "header" | "footer",
): void {
  if (!draft.settings.tally) {
    draft.settings.tally = { label: ts("Totals"), header: false, footer: false };
    setColumnMode(ctx, draft, "custom", true);
  }
  const tally = draft.settings.tally;
  tally[position] = !tally[position];
  if (!tally.header && !tally.footer) {
    delete draft.settings.tally;
    for (const col of columnsOf(draft.settings)) delete col.tally;
  }
}

export function setTallyDefaults(ctx: DisplayContext, settings: AdminSettings): void {
  for (const col of columnsOf(settings)) {
    const info = col.type === "field" ? exprInfo(ctx, col.key) : null;
    if (info) col.tally = { fn: getDefaultAggregateFn(ctx.meta, info, ctx.search) };
  }
}

export function toggleTallyRewrite(col: AdminColumn): void {
  const tally = col.tally ?? {};
  if (tally.rewrite) delete tally.rewrite;
  else tally.rewrite = `[${col.key ?? ""}]`;
  col.tally = tally;
}

export const tallyFunctions = (meta: SearchAdminMetadata) =>
  meta.functions.filter((fn) => fn.category === "aggregate" && fn.params.length);

// searchAdminPagerConfig, searchAdminPlaceholderConfig, searchAdminTasksConfig, searchAdminToolbarConfig

export function initPager(ctx: DisplayContext, settings: AdminSettings, noPager = false): void {
  if (settings.pager === true) settings.pager = { show_count: false, expose_limit: false };
  if (noPager) settings.pager = false;
  if (settings.pager && !settings.limit) toggleLimit(ctx, settings);
}

export function togglePager(ctx: DisplayContext, settings: AdminSettings, noLimit = false): void {
  settings.pager = settings.pager ? false : { show_count: false, expose_limit: false };
  if (settings.pager && !settings.limit) toggleLimit(ctx, settings);
  else if (!settings.pager && noLimit) delete settings.limit;
}

export function toggleLimit(ctx: DisplayContext, settings: AdminSettings): void {
  settings.limit = settings.limit ? 0 : ctx.defaultPagerSize;
}

export function changeLimit(settings: AdminSettings, value: number): void {
  settings.limit = value > 0 ? value : 0;
  if (!settings.limit) settings.pager = false;
}

export function initPlaceholder(settings: AdminSettings): void {
  if (!("placeholder" in settings)) settings.placeholder = 5;
}

export function initTasks(settings: AdminSettings): void {
  if (settings.actions) settings.actions_display_mode = settings.actions_display_mode ?? "menu";
}

export function toggleActions(settings: AdminSettings): void {
  settings.actions = !settings.actions;
  if (settings.actions) settings.actions_display_mode = "menu";
  else delete settings.actions_display_mode;
}

export function toggleTask(settings: AdminSettings, name: string, all: string[]): void {
  const enabled = typeof settings.actions === "boolean" ? all : (settings.actions ?? []);
  const next = enabled.includes(name) ? enabled.filter((n) => n !== name) : [...enabled, name];
  settings.actions = next.length === all.length ? true : next;
}

export const taskEnabled = (settings: AdminSettings, name: string) =>
  typeof settings.actions === "boolean" || !!settings.actions?.includes(name);

export function initToolbar(settings: AdminSettings): void {
  const legacy = settings.addButton;
  if (!legacy) return;
  if (!settings.toolbar && legacy.path) settings.toolbar = [{ ...legacy, style: "primary" }];
  delete settings.addButton;
}

export function toggleToolbar(settings: AdminSettings, links: LinkItem[]): void {
  if (settings.toolbar) delete settings.toolbar;
  else settings.toolbar = links.filter((link) => link.action === "add" && !link.join);
}

// crmSearchAdminLinkGroup

const LINK_ITEM_PROPS = [
  "path",
  "task",
  "entity",
  "action",
  "join",
  "target",
  "icon",
  "text",
  "style",
  "conditions",
] as const;

export const defaultLinkItem = (): LinkItem => ({
  style: "default",
  text: ts("Link"),
  icon: "fa-external-link",
  conditions: [],
  path: "civicrm/",
});

export function linkItemDefaults(item: LinkItem, from: LinkItem): void {
  if (Array.isArray(from.condition) && from.condition.length && !item.conditions?.length) {
    item.conditions = [from.condition];
    delete item.condition;
  }
  for (const prop of LINK_ITEM_PROPS) {
    const value = from[prop];
    if (prop === "conditions") item.conditions = Array.isArray(value) && value.length ? value : [];
    else item[prop] = typeof value === "string" ? value : "";
  }
}

export function newLinkItem(link: LinkItem): LinkItem {
  const item: LinkItem = Object.fromEntries(
    Object.entries(link).filter(([prop]) => LINK_ITEM_PROPS.some((p) => p === prop)),
  );
  linkItemDefaults(item, item);
  return item;
}

/** $onInit: an empty group starts with the entity's own row actions. */
export function initLinkGroup(group: LinkItem[], links: LinkItem[]): LinkItem[] {
  if (group.length) {
    for (const item of group) linkItemDefaults(item, item);
    return group;
  }
  const defaults = links.filter((link) => link.action && !link.join);
  return defaults.length ? defaults.map(newLinkItem) : [newLinkItem(defaultLinkItem())];
}

/**
 * What the link groups core's editor renders do on $onInit: the columns' of type links, buttons and
 * menu, and the toolbar's; they render after the display editor's own $onInit ran.
 */
export function initLinkGroups(ctx: DisplayContext, draft: Draft): void {
  for (const col of columnsOf(draft.settings))
    if ((col.type === "links" || col.type === "buttons" || col.type === "menu") && col.links)
      col.links = initLinkGroup(col.links, buildLinks(ctx, true));
  if (draft.settings.toolbar)
    draft.settings.toolbar = initLinkGroup(draft.settings.toolbar, buildLinks(ctx, false));
}

export function changeLinkItem(item: LinkItem, next: LinkItem): void {
  linkItemDefaults(item, next.path === "civicrm/" ? defaultLinkItem() : next);
}

/** crmSearchAdminLinkSelect's getLink: the offered link an item stands for. */
export function chosenLink(links: LinkItem[], item: LinkItem): LinkItem | undefined {
  const sameTask = (link: LinkItem) =>
    !!item.task && link.task === item.task && link.entity === item.entity;
  const sameAction = (link: LinkItem) =>
    !!item.action &&
    link.action === item.action &&
    link.entity === item.entity &&
    (link.join ?? "") === (item.join ?? "");
  return links.find((link) => sameTask(link) || sameAction(link));
}

// searchAdminCssRules, searchAdminIcons, searchAdminColors

export function cssStyles(meta: SearchAdminMetadata): Record<string, string> {
  return {
    ...Object.fromEntries(
      meta.styles
        .filter((style) => style.key !== "default" && style.key !== "secondary")
        .map((style) => [`bg-${style.key}`, style.value]),
    ),
    disabled: ts("Disabled"),
    "font-bold": ts("Bold"),
    "font-italic": ts("Italic"),
    strikethrough: ts("Strikethrough"),
  };
}

export function addCssRule(
  ctx: DisplayContext,
  item: { cssRules?: unknown[][] },
  style: string,
  defaultField?: string,
): void {
  const clause: unknown[] = [style];
  if (defaultField && getFieldFor(ctx, defaultField)) clause.push(defaultField, "=");
  item.cssRules = [...(item.cssRules ?? []), clause];
}

const getFieldFor = (ctx: DisplayContext, name: string) =>
  parseExpr(ctx.meta, name, ctx.search).args[0]?.field;

/** onSelectField: a chosen field starts with "=", no field means always. */
export function withConditionField(clause: unknown[], offset: number, field: string): unknown[] {
  return field ? [...clause.slice(0, offset), field, "="] : clause.slice(0, offset);
}

export const showMoreCssRules = (item: { cssRules?: unknown[][] }) =>
  !item.cssRules?.length || !!item.cssRules.at(-1)?.[1];

export function colorFieldOf(ctx: DisplayContext, col: AdminColumn): string | null {
  return col.key && getFieldFor(ctx, col.key) ? getColorField(ctx.meta, col.key, ctx.search) : null;
}

export function toggleColor(col: AdminColumn, colorField: string): void {
  if (col.colors?.length) delete col.colors;
  else col.colors = [{ field: colorField }];
}

export function setIconField(icon: IconItem, field: string): void {
  delete icon.icon;
  delete icon.if;
  icon.field = field;
}

export function setIconClass(icon: IconItem, value: string): void {
  icon.icon = value;
  delete icon.field;
  icon.if = icon.if ?? [];
}

// searchAdminDisplayList, searchAdminDisplayGrid, searchAdminDisplayTree

const isNew = (settings: unknown) => !isRecord(settings) || Object.keys(settings).length === 0;

export function initList(ctx: DisplayContext, draft: Draft): void {
  if (isNew(draft.settings))
    draft.settings = {
      style: "ul",
      limit: ctx.defaultPagerSize,
      sort: defaultSort(ctx),
      pager: {},
    };
  if (draft.settings.section_group_by) draft.settings.header_tag ??= "h4";
  initColumns(ctx, draft, {});
}

export function initGrid(ctx: DisplayContext, draft: Draft): void {
  if (isNew(draft.settings))
    draft.settings = { colno: "3", limit: ctx.defaultPagerSize, sort: defaultSort(ctx), pager: {} };
  if (draft.settings.section_group_by) draft.settings.header_tag ??= "h4";
  initColumns(ctx, draft, {});
}

export function initTree(ctx: DisplayContext, draft: Draft): void {
  if (isNew(draft.settings)) {
    draft.settings = {
      parent_field: getEntity(ctx.meta, ctx.search.api_entity)?.parent_field,
      collapsible: "closed",
      sort: defaultSort(ctx),
    };
    if (entityHasType(ctx, "SortableEntity")) toggleDraggable(ctx, draft.settings);
  }
  initColumns(ctx, draft, { break: false });
}

/** Grouping runs over sorted rows on one page, so the field leads the sort and the pager goes. */
export function setSectionGroupBy(settings: AdminSettings, field: string): void {
  settings.section_group_by = field;
  settings.sort = (settings.sort ?? []).filter(([key]) => key !== field);
  if (field) {
    settings.sort.unshift([field, "ASC"]);
    settings.pager = false;
    settings.header_tag ??= "h4";
  }
}

export const listSymbols = (): Record<string, { char: string; label: string }[]> => ({
  ul: [
    { char: "", label: ts("Default") },
    { char: "circle", label: ts("Circles") },
    { char: "square", label: ts("Squares") },
    { char: "none", label: ts("None") },
  ],
  ol: [
    { char: "", label: ts("Default (1. 2. 3.)") },
    { char: "upper-latin", label: ts("Uppercase (A. B. C.)") },
    { char: "lower-latin", label: ts("Lowercase (a. b. c.)") },
    { char: "upper-roman", label: ts("Roman (I. II. III.)") },
  ],
});

// searchAdminDisplayAutocomplete

export function initAutocomplete(ctx: DisplayContext, draft: Draft): void {
  const entity = getEntity(ctx.meta, ctx.search.api_entity);
  if (isNew(draft.settings)) {
    const shown = [...(entity?.search_fields ?? []), "description"];
    draft.settings = {
      sort: defaultSort(ctx),
      columns: shown
        .filter((field) => ctx.search.api_params.select.includes(field))
        .map((field) => toColumn(ctx, field, {})),
    };
  }
  initColumns(ctx, draft, {});
  const fields = [...(draft.settings.searchFields ?? [])];
  if (!fields.length) {
    // deviation:autocomplete-search-fields
    if (getField(ctx.meta, "id", ctx.search)) fields.push("id");
    fields.push(...(entity?.search_fields ?? []));
  }
  draft.settings.searchFields = [...new Set(fields)];
}

// searchAdminDisplayEntity

/** Core's preview of the SQL column name the server derives from a column key. */
export function createSqlName(key: string): string {
  const name = key.split(":")[0] ?? "";
  return name.length <= 58
    ? window.CRM.utils.munge(name, "_")
    : window.CRM.utils.munge(name, "_", 42) + md5(name).substring(0, 16);
}

// Latin-1 letters that fold to more than one ASCII letter, as in core's js/Common.js.
const DEBURRED: Record<string, string> = {
  "\u00c6": "Ae",
  "\u00e6": "ae",
  "\u00d0": "D",
  "\u00f0": "d",
  "\u00d8": "O",
  "\u00f8": "o",
  "\u00de": "Th",
  "\u00fe": "th",
  "\u00df": "ss",
};

/** CRM.utils.pascalCase: 'my members' or 'my_members' => 'MyMembers'. */
// deviation:db-entity-pascal-case
export function pascalCase(text: string): string {
  const words =
    text
      .replace(
        /[\u00c0-\u00ff]/g,
        (chr) => DEBURRED[chr] ?? chr.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
      )
      .match(/[A-Z]{2,}(?=[A-Z][a-z]+)|[A-Z]?[a-z]+|[A-Z]+|[0-9]+/g) ?? [];
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join("");
}

export const defaultJob = (): EntityJob => ({
  parameters: "version=4",
  is_active: false,
  run_frequency: "Hourly",
});

/** Pseudo fields cannot be stored as columns. */
export const isEntityColumnAllowed = (ctx: DisplayContext, key: string | undefined) =>
  !!key && !ctx.meta.pseudoFields.some((field) => field.name === key);

/** Foreign key and primary key columns are always indexed. */
export function isFkColumn(ctx: DisplayContext, col: AdminColumn): boolean {
  if (col.spec?.entity_reference?.entity) return true;
  const { field, baseEntity } = getFieldAndJoin(ctx.meta, col.key ?? "", ctx.search);
  if (!field) return false;
  if (field.fk_entity) return true;
  return !!getEntity(ctx.meta, baseEntity)?.primary_key.includes(field.name);
}

export function initEntity(ctx: DisplayContext, draft: Draft): void {
  if (isNew(draft.settings)) draft.settings = { sort: defaultSort(ctx) };
  draft.acl_bypass = true;
  if (!draft.id && !draft._job) draft._job = defaultJob();
  if ((draft.name ?? "") === "") draft.name = pascalCase(draft.label);
  initColumns(ctx, draft, ctx.entityIndex ? { label: true, index: true } : { label: true });
  draft.settings.columns = columnsOf(draft.settings).filter((col) =>
    isEntityColumnAllowed(ctx, col.key),
  );
  if (!ctx.entityIndex) return;
  for (const col of draft.settings.columns)
    if (!("index" in col) || isFkColumn(ctx, col)) col.index = true;
}

export function setEntityPermission(settings: AdminSettings, permissions: string[]): void {
  settings.entity_permission = permissions;
  if (permissions.length > 1) settings.entity_permission_operator ??= "AND";
  else delete settings.entity_permission_operator;
}

// searchAdminDisplayBatch

export function initBatch(ctx: DisplayContext, draft: Draft): void {
  const fresh = isNew(draft.settings);
  if (fresh)
    draft.settings = {
      classes: ["table", "table-striped", "table-bordered", "crm-sticky-header"],
      limit: ctx.defaultPagerSize,
      pager: { hide_single: true },
    };
  initColumns(ctx, draft, { label: true });
  if (fresh) toggleBatchTally(ctx, draft.settings);
  // Each default's crm-search-input stores it as its field's data type once it renders.
  for (const col of columnsOf(draft.settings))
    if ("default" in col && col.key)
      col.default = formatValue(
        getField(ctx.meta, col.key, ctx.search),
        undefined,
        undefined,
        col.default,
      );
}

/** Totals in the footer: sums for numbers, counts for booleans, nothing for options or links. */
export function toggleBatchTally(ctx: DisplayContext, settings: AdminSettings): void {
  if (settings.tally) {
    delete settings.tally;
    for (const col of columnsOf(settings)) delete col.tally;
    return;
  }
  settings.tally = {};
  for (const col of columnsOf(settings)) {
    const field = col.key ? parseExpr(ctx.meta, col.key, ctx.search).args[0]?.field : undefined;
    if (!field || field.fk_entity || field.options) continue;
    if (["Integer", "Float", "Money"].includes(field.data_type)) col.tally = { fn: "SUM" };
    if (field.data_type === "Boolean") col.tally = { fn: "COUNT" };
  }
}

export function toggleDefault(col: AdminColumn): void {
  if ("default" in col) delete col.default;
  else col.default = null;
}

export function setBatchTallyFn(col: AdminColumn, fn: string): void {
  const tally = { ...col.tally, fn };
  if (fn !== "SUM") delete tally.target;
  col.tally = tally;
}
