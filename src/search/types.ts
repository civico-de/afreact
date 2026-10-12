import type { ReactNode } from "react";
/** A link as SearchDisplay.run formats it: `url` for a path, `task` for a bulk action. */
export interface Link {
  url?: string;
  task?: string;
  text?: string;
  /** Shown in place of `text` where it carries markup, as a title in `<em>`. */
  content?: ReactNode;
  title?: string;
  target?: string;
  icon?: string;
  style?: string;
  /** Toolbar only: open the form when the first run finds nothing. */
  autoOpen?: boolean;
  /** Menus only: a divider in place of a link. */
  separator?: boolean;
}

/** A toolbar entry; one with `children` is a dropdown of several links (formatMultiLink). */
export interface ToolbarLink extends Link {
  children?: Link[];
}

export interface Column {
  type: string;
  key?: string;
  label?: string;
  sortable?: boolean;
  /** Bootstrap size class of menu and button columns, e.g. "btn-xs". */
  size?: string;
  style?: string;
  icon?: string;
  alignment?: string;
  /** Unconditional rules (one element) style the header; the server resolves the others. */
  cssRules?: string[][];
  editable?: boolean;
  /** Template of an include column, e.g. "~/afAdmin/afListPlacementColumn.html". */
  path?: string;
  /** Batch: `target` asks for a SUM's expected total when a batch starts. */
  tally?: { fn?: string; label?: string; rewrite?: string; target?: boolean };
  /** Batch: the import column the column writes to (BatchDisplaySubscriber). */
  spec?: { name: string };
  /** Batch: the input must be filled before the import runs. */
  required?: boolean;
  /** List, grid and tree: the column starts a new line instead of following inline. */
  break?: boolean;
}

/** One formatted cell of a row (AbstractRunAction::formatColumn). */
export interface CellData {
  val?: unknown;
  links?: Link[];
  /** Button text of a menu column. */
  text?: string;
  /** List, grid and tree: the column label, with tokens filled in. */
  label?: string;
  title?: string;
  cssClass?: string;
  edit?: unknown;
  icons?: { left?: (string | null)[]; right?: (string | null)[] };
  colors?: (string | null)[];
  img?: { src: string; height?: number | string; width?: number | string };
  subsearch?: Subsearch;
}

export interface Subsearch {
  search: string;
  display: string;
  search_and_display: string;
  filters: Record<string, unknown> | unknown[];
  subsearch_mode: "dropdown" | "collapsed" | "inline";
}

/** A row's id, by which selection, editing and dragging find it. */
export type RowKey = string | number;

export interface Row {
  /** Absent on grouped rows (AbstractRunAction::formatResult). */
  key?: RowKey;
  /** Null for a column the run left out (toggled off). */
  columns: (CellData | null)[];
  cssClass?: string;
  /** Raw values; `_depth` and `_descendents` in hierarchical displays. */
  data?: Record<string, unknown>;
}

/** Settings of a subsearch column's display, sent along with the run (addSubsearchDisplaySettings). */
export interface SubsearchDisplay {
  type: string;
  api_entity: string;
  settings: unknown;
}

export interface EditOption {
  id: number | string;
  label: string;
  name?: string;
  color?: string;
  description?: string;
  icon?: string;
}

/** What an editable column edits (AbstractRunAction::getEditableInfo), by column key. */
export interface EditableInfo {
  entity: string;
  input_type: string | null;
  input_attrs: unknown;
  data_type: string;
  /** true: options depend on the row and load with getFields (control_field). */
  options: boolean | EditOption[];
  serialize: boolean;
  nullable: boolean;
  fk_entity: string | null;
  value_key: string;
  value_path: string;
  id_key: string;
  id_path: string;
  explicit_join: string | null;
  control_field: string | null;
  grouping_fields: unknown;
  /** Batch: set from the column's `required` (RunBatch). */
  required?: boolean;
  /** Batch: the expected total of a SUM column, as given when the batch started. */
  target?: unknown;
}

/** A page of SearchDisplay.run with the extras the result object carries. */
export interface RunPage {
  rows: Row[];
  toolbar: ToolbarLink[];
  subsearch: Record<string, SubsearchDisplay>;
  editable: Record<string, EditableInfo>;
  /** Labels of the values the display's own filters select, for the page title (addFilterLabel). */
  labels: string[];
  /** The run's debug output (SQL, timing) when it was asked for and the user may see it. */
  debug?: RunDebug;
}

export interface RunDebug {
  sql?: string[];
  timeIndex?: number;
}

export interface DisplaySettings {
  columns: Column[];
  limit?: number;
  sort?: [string, "ASC" | "DESC"][];
  pager?: false | { show_count?: boolean; hide_single?: boolean; expose_limit?: boolean };
  classes?: string[];
  /** false hides the row SearchKit shows when nothing is found. */
  noResultsText?: string | false;
  /** Placeholder rows while a page loads; SearchKit shows 5 unless set. */
  placeholder?: number;
  description?: string;
  headerCount?: boolean;
  hideThead?: boolean;
  hierarchical?: boolean;
  /** "open" or "closed": the initial state of rows with sub-rows. */
  collapsible?: string | false;
  tally?: false | { label?: string; header?: boolean; footer?: boolean };
  toolbar?: unknown[];
  actions?: boolean | string[];
  actions_display_mode?: string;
  draggable?: string | false;
  editableRow?:
    | false
    | { create?: boolean; createLabel?: string; full?: boolean; disable?: boolean };
  button?: string | false;
  toggleColumns?: boolean;
  /** List: "ol" for a numbered list, and the CSS list-style of its markers. */
  style?: string;
  symbol?: string;
  /** Grid: the number of columns, 2 to 5. */
  colno?: string | number;
  /** List and grid: a heading before each run of rows with the same value of this field. */
  section_group_by?: string;
  header_tag?: string;
  /** Tree: the field that holds a row's parent key. */
  parent_field?: string;
}

/** The SearchKit display types the renderer shows, by the suffix of their element. */
export const DISPLAY_TYPES = ["table", "list", "grid", "tree", "batch", "chart-kit"] as const;
export type DisplayType = (typeof DISPLAY_TYPES)[number];

export function isDisplayType(value: unknown): value is DisplayType {
  return DISPLAY_TYPES.some((type) => type === value);
}

/** The display type of a `crm-search-display-<type>` element, or null for another tag. */
export function displayTypeOf(tag: string): DisplayType | null {
  const type = tag.replace(/^crm-search-display-/, "");
  return type !== tag && isDisplayType(type) ? type : null;
}

/** SearchDisplay.settings as stored; the table needs at least its column list. */
export function isDisplaySettings(value: unknown): value is DisplaySettings {
  return (
    typeof value === "object" &&
    value !== null &&
    "columns" in value &&
    Array.isArray(value.columns)
  );
}
