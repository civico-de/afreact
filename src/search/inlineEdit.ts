import { hashKey, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { api4, errorMessage } from "../api/civi";
import type { Column, EditableInfo, Row, RunPage } from "./types";

/**
 * In-place editing of table cells (searchDisplayEditableTrait, crmSearchDisplayEditable): the
 * server marks editable cells with `edit` and sends what each column edits in `editable`.
 */

/** The input crmSearchInputVal.getTemplate() picks for a field without a search operator. */
export type EditorKind =
  | "date"
  | "datetime"
  | "boolean"
  | "color"
  | "select"
  | "entityref"
  | "integer"
  | "float"
  | "email"
  | "textarea"
  | "text";

export type Editor = { kind: EditorKind; multiple: boolean } | { unsupported: string };

export function editorFor(info: EditableInfo): Editor {
  const multiple = info.serialize || info.data_type === "Array";
  const one = (kind: EditorKind): Editor => ({ kind, multiple });
  if (info.input_type === "Location") return { unsupported: "Location" };
  // A list of dates is picked day by day, as crm-multi-select-date does, even for timestamps.
  if (info.data_type === "Date" || (multiple && info.data_type === "Timestamp")) return one("date");
  if (info.data_type === "Timestamp") return one("datetime");
  if (info.data_type === "Boolean") return one("boolean");
  if (info.input_type === "Color")
    return multiple ? { unsupported: "multi-value colour" } : one("color");
  if (info.options) return one("select");
  if (info.fk_entity || info.value_key === "id") return one("entityref");
  if (info.data_type === "Integer") return one("integer");
  if (info.data_type === "Float") return one("float");
  // A list of texts is typed into one input, so e-mail and textarea inputs give way to it.
  if (multiple) return one("text");
  if (info.input_type === "Email") return one("email");
  if (info.input_type === "TextArea") return one("textarea");
  return one("text");
}

/** Editable columns of a page whose input the React table cannot show, for the table's note. */
export function unsupportedEditors(editable: Record<string, EditableInfo>): string[] {
  return Object.entries(editable).flatMap(([key, info]) => {
    const editor = editorFor(info);
    return "unsupported" in editor ? [`in-place editing of ${key} (${editor.unsupported})`] : [];
  });
}

/** Editable columns a new row cannot fill, for the table's note; a required one blocks the row. */
export function unfillableColumns(page: RunPage | undefined): string[] {
  return Object.entries(page?.editable ?? {}).flatMap(([key, info]) => {
    const editor = editorFor(info);
    if (!("unsupported" in editor)) return [];
    const why = info.nullable ? editor.unsupported : `${editor.unsupported}, required`;
    return [`new row: ${key} (${why})`];
  });
}

/** The raw value under edit; the column key may carry a suffix such as ":label". */
export function initialValue(row: Row, info: EditableInfo): unknown {
  return row.data?.[info.value_path] ?? null;
}

/** crmSearchDisplayEditable: a value can be cleared only on an existing record. */
export function isNullable(row: Row, info: EditableInfo): boolean {
  return info.nullable && !!row.data?.[info.id_path];
}

// deviation:inline-edit-compare-by-value
export function isChanged(value: unknown, initial: unknown): boolean {
  return JSON.stringify(value ?? null) !== JSON.stringify(initial ?? null);
}

/**
 * refreshAfterEditing(): the returned row takes the place of the old one and keeps what the
 * reload leaves out (hierarchy data, collapsed state), except the old row's css class.
 */
export function mergeRow(old: Row, fresh: Row): Row {
  const kept = { ...old };
  delete kept.cssClass;
  return { ...kept, ...fresh, data: { ...old.data, ...fresh.data } };
}

/** The run each locally changed page came from. */
const runs = new WeakMap<RunPage, RunPage>();
const runOf = (page: RunPage) => runs.get(page) ?? page;

/**
 * Changes the cached page in place of a reload; it still counts as the run it came from. The
 * other cached pages of the run may have shifted with it, so they load afresh when shown.
 */
export function writePage(client: QueryClient, key: QueryKey, change: (page: RunPage) => RunPage) {
  const old = client.getQueryData<RunPage>(key);
  if (!old) return;
  const next = client.setQueryData<RunPage>(key, change(old));
  if (next) runs.set(next, runOf(old));
  const own = hashKey(key);
  client.removeQueries({
    queryKey: key.slice(0, 3),
    predicate: (query) => query.queryHash !== own,
  });
}

export interface CellTarget {
  rowKey: Row["key"];
  colIndex: number;
}

interface Editing extends CellTarget {
  /** The page the editor opened on; a new run closes it, as onPostRun's cancelEditing(). */
  page: RunPage;
  /** What a failed save answered; its values stay in the editors. */
  error?: string;
}

/** The cells a save keeps busy: one, or every cell of the row. */
interface SavingTarget {
  rowKey: Row["key"];
  colIndex: number | null;
}

const same = (a: CellTarget | null, b: CellTarget) =>
  !!a && a.rowKey === b.rowKey && a.colIndex === b.colIndex;

/** editValues: the values under edit by column key, with what they started from. */
interface RowValues {
  initial: Record<string, unknown>;
  values: Record<string, unknown>;
}

/** The row of inputs editableRow.create adds below the table (crmSearchDisplayTableCreateNew). */
export interface NewRow {
  page: RunPage;
  busy: boolean;
  /** What a failed save left in the inputs, with the error. */
  values?: Record<string, unknown>;
  error?: string;
}

export interface InlineEdit {
  editable: Record<string, EditableInfo>;
  /** editableRow.full: every editable cell of the row opens, and saves, together. */
  full: boolean;
  /** The id of the row's error message in full-row mode, for the inputs to point at. */
  errorId: string;
  /** The cell whose editor opened, if any; in full-row mode the rest of its row is open too. */
  editing: Editing | null;
  /** The new row under edit, if any; it and a cell editor exclude each other. */
  newRow: NewRow | null;
  startCreating: () => void;
  cancelCreating: () => void;
  /** inlineEdit without a row key creates the record; the row it answers joins the page. */
  saveNew: (values: Record<string, unknown>) => Promise<void>;
  isEditing: (target: CellTarget) => boolean;
  isSaving: (target: CellTarget) => boolean;
  /** Whether a closed editor should give focus back to this cell; true once. */
  takeFocus: (target: CellTarget) => boolean;
  start: (row: Row, colIndex: number) => void;
  cancel: () => void;
  /** The value an open editor shows for its column, and the one it changes. */
  value: (colKey: string) => unknown;
  setValue: (colKey: string, value: unknown) => void;
  /** Saves the open editors' values, or only closes them when none changed. */
  save: (row: Row) => void;
  /** For the live region: the outcome of the last save. */
  announcement: string;
}

export const InlineEditContext = createContext<InlineEdit | null>(null);

export function useInlineEditContext(): InlineEdit | null {
  return useContext(InlineEditContext);
}

interface UseInlineEditOptions {
  page: RunPage | undefined;
  columns: Column[];
  /** Columns the column picker hides; their values stay out of a full-row save. */
  hidden: ReadonlySet<number>;
  full: boolean;
  /** The query of the shown page, whose cache entry the saved row is written into. */
  rowsKey: QueryKey;
  tallyKey: QueryKey;
  countKey: QueryKey;
  /** SearchDisplay.run's parameters for the shown page, without `return`. */
  params: Record<string, unknown>;
  /** Reloads the display and the others of its form, as a popup form's success does. */
  reloadAll: () => void;
}

export function useInlineEdit({
  page,
  columns,
  hidden,
  full,
  rowsKey,
  tallyKey,
  countKey,
  params,
  reloadAll,
}: UseInlineEditOptions): InlineEdit {
  const client = useQueryClient();
  const errorId = useId();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [newRow, setNewRow] = useState<NewRow | null>(null);
  // For the failure path, which decides after the save whether a new row opened meanwhile.
  const newRowNow = useRef(newRow);
  useEffect(() => {
    newRowNow.current = newRow;
  }, [newRow]);
  const [saving, setSaving] = useState<readonly SavingTarget[]>([]);
  const [focus, setFocus] = useState<CellTarget | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // Typing changes the values without a render of the table; the editors keep their own state.
  const edited = useRef<RowValues>({ initial: {}, values: {} });
  const open = editing && page && runOf(editing.page) === runOf(page) ? editing : null;
  const creating = newRow && page && runOf(newRow.page) === runOf(page) ? newRow : null;
  const close = (target: CellTarget | null) => {
    setEditing(null);
    setFocus(target);
  };

  const save = (row: Row) => {
    if (!open) return;
    const target = { rowKey: row.key, colIndex: open.colIndex };
    const { initial, values } = edited.current;
    // deviation:full-row-changed-save
    if (!isChanged(values, initial)) {
      close(target);
      return;
    }
    const busy = { rowKey: row.key, colIndex: full ? null : open.colIndex };
    const key = rowsKey;
    setEditing(null);
    setSaving((current) => [...current, busy]);
    setAnnouncement(ts("Saving…"));
    const finish = () => {
      setSaving((current) => current.filter((other) => other !== busy));
    };
    // getApiParams(null) plus the row and its new values, as saveEditing() sends them.
    api4<Row>("SearchDisplay", "inlineEdit", {
      ...params,
      return: null,
      rowKey: row.key,
      values: { ...values },
    }).then(
      (result) => {
        finish();
        setAnnouncement(ts("Saved"));
        const fresh = result[0];
        const shown = client.getQueryData<RunPage>(key);
        if (fresh && shown?.rows.some((old) => old.key === row.key)) {
          writePage(client, key, (current) => ({
            ...current,
            rows: current.rows.map((old) => (old.key === row.key ? mergeRow(old, fresh) : old)),
          }));
          // deviation:inline-edit-refreshes-totals
          void client.invalidateQueries({ queryKey: tallyKey });
          setFocus(target);
        } else {
          // The row no longer matches the filters.
          reloadAll();
        }
      },
      (error: unknown) => {
        finish();
        const message = errorMessage(error);
        setAnnouncement(ts("Not saved: %1", { 1: message }));
        // deviation:inline-edit-failed-save-reopens
        // The editor opens again, with its values, unless another one opened meanwhile.
        const shown = client.getQueryData<RunPage>(key);
        if (shown)
          setEditing((current) => {
            if (current || newRowNow.current) return current;
            edited.current = { initial, values };
            return { ...target, page: shown, error: message };
          });
      },
    );
  };

  const saveNew = async (values: Record<string, unknown>) => {
    if (!creating) return;
    setNewRow({ ...creating, busy: true, error: undefined });
    setAnnouncement(ts("Saving…"));
    try {
      const result = await api4<Row>("SearchDisplay", "inlineEdit", {
        ...params,
        return: null,
        values,
      });
      const fresh = result[0];
      setNewRow(null);
      setAnnouncement(ts("Saved"));
      // The record exists either way; without a row it does not match the filters.
      if (!fresh) {
        reloadAll();
        return;
      }
      writePage(client, rowsKey, (current) => ({ ...current, rows: [...current.rows, fresh] }));
      client.setQueryData<number | null>(countKey, (count) =>
        typeof count === "number" ? count + 1 : count,
      );
      void client.invalidateQueries({ queryKey: tallyKey });
    } catch (error) {
      const message = errorMessage(error);
      setAnnouncement(ts("Not saved: %1", { 1: message }));
      setNewRow((current) => current && { ...current, busy: false, values, error: message });
    }
  };

  const editable = page?.editable ?? {};
  return {
    editable,
    full,
    errorId,
    editing: open,
    newRow: creating,
    startCreating: () => {
      if (page && !open && !creating) setNewRow({ page, busy: false });
    },
    cancelCreating: () => {
      setNewRow(null);
    },
    saveNew,
    isEditing: (target) => (full ? open?.rowKey === target.rowKey : same(open, target)),
    isSaving: (target) =>
      saving.some(
        (other) =>
          other.rowKey === target.rowKey &&
          (other.colIndex === null || other.colIndex === target.colIndex),
      ),
    takeFocus: (target) => {
      if (!same(focus, target)) return false;
      setFocus(null);
      return true;
    },
    // One editor at a time, as startEditing(); the values start from the row's own, without
    // the columns whose editor the table lacks.
    start: (row, colIndex) => {
      if (!page || open || creating) return;
      const initial: Record<string, unknown> = {};
      for (const [index, cell] of row.columns.entries()) {
        const key = columns[index]?.key;
        const shown = (full && !hidden.has(index)) || index === colIndex;
        const info = key && cell?.edit && shown ? editable[key] : undefined;
        if (key && info && !("unsupported" in editorFor(info)))
          initial[key] = initialValue(row, info);
      }
      edited.current = { initial, values: { ...initial } };
      setEditing({ rowKey: row.key, colIndex, page });
    },
    cancel: () => {
      close(open);
    },
    value: (colKey) => edited.current.values[colKey],
    setValue: (colKey, value) => {
      edited.current.values[colKey] = value;
    },
    save,
    announcement,
  };
}
