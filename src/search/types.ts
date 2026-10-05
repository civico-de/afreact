/** A link as SearchDisplay.run formats it: `url` for a path, `task` for a bulk action. */
export interface Link {
  url?: string;
  task?: string;
  text?: string;
  title?: string;
  target?: string;
  icon?: string;
  style?: string;
  /** Toolbar only: open the form when the first run finds nothing. */
  autoOpen?: boolean;
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
  tally?: { fn?: string; label?: string; rewrite?: string };
}

/** One formatted cell of a row (AbstractRunAction::formatColumn). */
export interface CellData {
  val?: unknown;
  links?: Link[];
  /** Button text of a menu column. */
  text?: string;
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

export interface Row {
  key: string | number;
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
}

/** A page of SearchDisplay.run with the extras the result object carries. */
export interface RunPage {
  rows: Row[];
  toolbar: ToolbarLink[];
  subsearch: Record<string, SubsearchDisplay>;
  editable: Record<string, EditableInfo>;
  /** Labels of the values the display's own filters select, for the page title (addFilterLabel). */
  labels: string[];
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
  editableRow?: false | { create?: boolean; full?: boolean; disable?: boolean };
  button?: string | false;
  toggleColumns?: boolean;
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
