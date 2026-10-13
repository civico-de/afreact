import { useState } from "react";
import type { Column } from "./types";

/** getColumnToggleLabel() of crmSearchDisplayTable; core numbers the last case "undefined". */
export function columnToggleLabel(column: Column, index: number): string {
  if (column.label) return column.label;
  if (column.key) return `[${column.key}]`;
  if (column.type === "menu") return ts("Menu");
  if (column.type === "buttons") return ts("Buttons");
  if (column.type === "links") return ts("Links");
  // deviation:column-picker-position-label
  return ts("Column %1", { 1: index + 1 });
}

/** A saved filter set's columns for one display: key (or label, for keyless columns) to label. */
export function savedColumnsOf(columns: unknown, displayKey: string): Record<string, string> {
  const saved: unknown =
    typeof columns === "object" && columns !== null && !Array.isArray(columns)
      ? Object.getOwnPropertyDescriptor(columns, displayKey)?.value
      : undefined;
  return typeof saved === "object" && saved !== null && !Array.isArray(saved)
    ? Object.fromEntries(Object.entries(saved).map(([key, label]) => [key, String(label)]))
    : {};
}

/**
 * onAfformReset() of crmSearchDisplayTable: the columns a saved set left out, matched by key
 * and then by label. A set without columns for the display shows them all.
 */
export function hiddenBySavedSet(columns: Column[], saved: Record<string, string>): Set<number> {
  const names = Object.keys(saved);
  if (!names.length) return new Set();
  const shown = new Set<number>();
  for (const name of names) {
    let index = columns.findIndex((column) => column.key === name);
    if (index < 0)
      index = columns.findIndex((column, position) => columnToggleLabel(column, position) === name);
    if (index >= 0) shown.add(index);
  }
  return new Set([...columns.keys()].filter((index) => !shown.has(index)));
}

/**
 * getToggledColumns() of crmSearchDisplayTable: the shown columns, key (or label) to label;
 * empty when all or none are shown.
 */
export function toggledColumns(
  columns: Column[],
  hidden: ReadonlySet<number>,
): Record<string, string> {
  if (!hidden.size || hidden.size >= columns.length) return {};
  return Object.fromEntries(
    columns.flatMap((column, index) => {
      if (hidden.has(index)) return [];
      const label = columnToggleLabel(column, index);
      return [[column.key === undefined || column.key === "" ? label : column.key, label]];
    }),
  );
}

/** SearchDisplay.run's `toggleColumns`: the shown columns, sent only when one is hidden. */
export function toggleColumnsParam(
  columns: Column[],
  hidden: ReadonlySet<number>,
): { toggleColumns?: number[] } {
  if (!hidden.size) return {};
  return { toggleColumns: [...columns.keys()].filter((index) => !hidden.has(index)) };
}

const NONE: ReadonlySet<number> = new Set();

interface ColumnToggles {
  hidden: ReadonlySet<number>;
  /** What the last run left out (onPostRun: fetched = enabled). */
  fetchedHidden: ReadonlySet<number>;
  runKey: string;
  /** The saved set applied last; null before the columns are known. */
  savedKey: string | null;
}

/**
 * The columns the picker hides. Hiding one refetches nothing, showing one the last run left
 * out does (toggleColumns()); any other run fetches only the shown ones (`runKey` changes).
 */
export function useColumnToggles(
  columns: Column[] | undefined,
  saved: Record<string, string> | undefined,
  savedSet: string | null,
  runKey: string,
) {
  const [state, setState] = useState<ColumnToggles>({
    hidden: NONE,
    fetchedHidden: NONE,
    runKey,
    savedKey: null,
  });
  // Worked out during render, so this render's run already asks for the right columns.
  let current = state;
  if (current.runKey !== runKey) current = { ...current, runKey, fetchedHidden: current.hidden };
  // Another saved set, or one newly loaded, decides afresh (onAfformReset()).
  const savedKey = JSON.stringify([savedSet, saved ?? {}]);
  if (columns && current.savedKey !== savedKey) {
    const fromSet = hiddenBySavedSet(columns, saved ?? {});
    current = { ...current, savedKey, hidden: fromSet, fetchedHidden: fromSet };
  }
  if (current !== state) setState(current);
  const { hidden, fetchedHidden } = current;
  return {
    hidden,
    params: columns ? toggleColumnsParam(columns, fetchedHidden) : {},
    /** The columns the next run asks for. */
    nextParams: columns ? toggleColumnsParam(columns, hidden) : {},
    pick: (next: ReadonlySet<number>) => {
      const refetch = [...fetchedHidden].some((index) => !next.has(index));
      setState({ ...current, hidden: next, fetchedHidden: refetch ? next : fetchedHidden });
    },
  };
}

interface ColumnPickerProps {
  columns: Column[];
  hidden: ReadonlySet<number>;
  onChange: (hidden: ReadonlySet<number>) => void;
}

/** The "Pick Columns" disclosure of crmSearchDisplayTable.html (setting `toggleColumns`). */
export function ColumnPicker({ columns, hidden, onChange }: ColumnPickerProps) {
  return (
    <details>
      <summary>{ts("Pick Columns")}</summary>
      <div className="crm-accordion-body">
        {columns.map((column, index) => (
          <label key={index}>
            <input
              type="checkbox"
              checked={!hidden.has(index)}
              onChange={(event) => {
                const next = new Set(hidden);
                if (event.target.checked) next.delete(index);
                else next.add(index);
                onChange(next);
              }}
            />{" "}
            {columnToggleLabel(column, index)}
          </label>
        ))}{" "}
        <button
          type="button"
          title={ts("Select All")}
          className="btn btn-secondary"
          onClick={() => {
            onChange(new Set());
          }}
        >
          {ts("All")}
        </button>{" "}
        <button
          type="button"
          title={ts("Select None")}
          className="btn btn-secondary"
          onClick={() => {
            onChange(new Set(columns.keys()));
          }}
        >
          {ts("None")}
        </button>
      </div>
    </details>
  );
}
