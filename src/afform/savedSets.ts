import type { FilterField, FilterValues } from "../search/filters";
import type { FieldDefn } from "./types";

/** A saved filter set as afSearchParamSets lists it. */
export interface SavedSet {
  id: number;
  label: string;
  filters: FilterValues | null;
  columns: unknown;
  "created_by.display_name": string | null;
  created_date: string | null;
}

/** What a set saves: getCurrentParams(). */
export interface CurrentParams {
  filters: FilterValues;
  columns: Record<string, Record<string, string>>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Core's loose `o.id == v`, for the ids and values options and filters hold. */
function sameId(id: unknown, value: unknown): boolean {
  if (typeof id === "boolean" || typeof value === "boolean") return Number(id) === Number(value);
  return String(id) === String(value);
}

function formatValue(value: unknown, defn: FieldDefn | undefined): string {
  if (Array.isArray(value)) return value.map((item) => formatValue(item, defn)).join(" OR ");
  const options = defn?.options;
  const option = (Array.isArray(options) ? options : []).find((each) => sameId(each.id, value));
  if (option) return option.label;
  // Core's details read the field's options from its attribute, which a Yes/No field lacks.
  if (typeof value === "boolean") return value ? ts("Yes") : ts("No");
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (!isRecord(value)) return "";
  return Object.entries(value)
    .filter(([, inner]) => inner)
    .map(([key, inner]) => `${key} ${String(inner)}`)
    .join(" AND ");
}

/** A set's columns per display key, or none. */
function columnsOf(columns: unknown): [string, Record<string, unknown>][] {
  return isRecord(columns)
    ? Object.entries(columns).flatMap(([key, value]) => (isRecord(value) ? [[key, value]] : []))
    : [];
}

/**
 * renderSearchParamSetDetails(): each filter by its field's label, then the columns. A filter
 * of a field the form no longer has shows under its name, where core fails.
 * deviation:param-set-details-robust
 */
export function setDetails(
  set: { filters?: FilterValues | null; columns?: unknown },
  fields: FilterField[],
): Record<string, string> {
  const rendered: Record<string, string> = {};
  for (const [name, value] of Object.entries(set.filters ?? {})) {
    const defn = fields.find((field) => field.name === name)?.defn;
    const label = defn?.label === false ? name : (defn?.label ?? name);
    rendered[label] = formatValue(value, defn);
  }
  const displays = columnsOf(set.columns);
  const shown = (columns: Record<string, unknown>) => Object.values(columns).map(String).join(", ");
  if (displays.length > 1)
    for (const [key, columns] of displays) rendered[ts("%1 columns", { 1: key })] = shown(columns);
  else if (displays[0]) rendered[ts("Columns")] = shown(displays[0][1]);
  return rendered;
}

/** updateDialog.getValueComparison(): per detail the old value, and the new one if it changed. */
export function compareDetails(
  before: Record<string, string>,
  after: Record<string, string>,
): [string, string[]][] {
  const none = ts("[none]");
  return [
    ...Object.entries(before).map(([key, old]): [string, string[]] => {
      const now = after[key];
      if (now === undefined) return [key, [old, none]];
      return [key, now === old ? [old] : [old, now]];
    }),
    ...Object.entries(after)
      .filter(([key]) => !(key in before))
      .map(([key, now]): [string, string[]] => [key, [none, now]]),
  ];
}

// deviation:param-set-unchanged-compare
/** JSON with sorted keys and empty lists as empty objects, as the server returns `{}` as `[]`. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.length ? value.map(canonical) : {};
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

/** updateDialog.canOpen(): the current filters or columns differ from the set's. */
export function differsFromSet(set: SavedSet, current: CurrentParams): boolean {
  const same = (a: unknown, b: unknown) =>
    JSON.stringify(canonical(a ?? {})) === JSON.stringify(canonical(b));
  return !same(set.filters, current.filters) || !same(set.columns, current.columns);
}

/** renderSearchParamSetDescription(), with the date or, for today, the time. */
export function setDescription(set: SavedSet, now = new Date()): string {
  const created = new Date(set.created_date ?? "");
  const date = created.toLocaleDateString();
  const when =
    date === now.toLocaleDateString() ? ts("%1 today", { 1: created.toLocaleTimeString() }) : date;
  return ts("Created %1 by %2", {
    1: when,
    2:
      set["created_by.display_name"] === null || set["created_by.display_name"] === ""
        ? "UNKNOWN"
        : set["created_by.display_name"],
  });
}
