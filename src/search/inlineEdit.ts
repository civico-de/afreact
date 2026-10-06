import { useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { createContext, useContext, useState } from "react";
import { api4, errorMessage } from "../api/civi";
import type { EditableInfo, Row, RunPage } from "./types";

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
  const only = (kind: EditorKind, what: string): Editor =>
    multiple ? { unsupported: `multi-value ${what}` } : { kind, multiple };
  if (info.input_type === "Location") return { unsupported: "Location" };
  if (info.data_type === "Date") return only("date", "date");
  if (info.data_type === "Timestamp") return only("datetime", "date");
  if (info.data_type === "Boolean") return only("boolean", "Yes/No");
  if (info.input_type === "Color") return only("color", "colour");
  if (info.options) return { kind: "select", multiple };
  if (info.fk_entity || info.value_key === "id") return { kind: "entityref", multiple };
  if (info.data_type === "Integer") return only("integer", "number");
  if (info.data_type === "Float") return only("float", "number");
  if (info.input_type === "Email") return only("email", "text");
  if (info.input_type === "TextArea") return only("textarea", "text");
  return only("text", "text");
}

/** Editable columns of a page whose input the React table cannot show, for the table's note. */
export function unsupportedEditors(page: RunPage | undefined): string[] {
  return Object.entries(page?.editable ?? {}).flatMap(([key, info]) => {
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

/** Changes the cached page in place of a reload; it still counts as the run it came from. */
export function writePage(client: QueryClient, key: QueryKey, change: (page: RunPage) => RunPage) {
  const old = client.getQueryData<RunPage>(key);
  if (!old) return;
  const next = client.setQueryData<RunPage>(key, change(old));
  if (next) runs.set(next, runOf(old));
}

export interface CellTarget {
  rowKey: Row["key"];
  colIndex: number;
}

interface Editing extends CellTarget {
  /** The page the editor opened on; a new run closes it, as onPostRun's cancelEditing(). */
  page: RunPage;
  /** What a failed save left in the editor, with the error. */
  value?: unknown;
  error?: string;
}

const same = (a: CellTarget | null, b: CellTarget) =>
  !!a && a.rowKey === b.rowKey && a.colIndex === b.colIndex;

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
  /** The cell whose editor is open, if any. */
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
  start: (target: CellTarget) => void;
  cancel: () => void;
  save: (row: Row, colIndex: number, colKey: string, value: unknown) => void;
  /** For the live region: the outcome of the last save. */
  announcement: string;
}

export const InlineEditContext = createContext<InlineEdit | null>(null);

export function useInlineEditContext(): InlineEdit | null {
  return useContext(InlineEditContext);
}

interface UseInlineEditOptions {
  page: RunPage | undefined;
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
  rowsKey,
  tallyKey,
  countKey,
  params,
  reloadAll,
}: UseInlineEditOptions): InlineEdit {
  const client = useQueryClient();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [newRow, setNewRow] = useState<NewRow | null>(null);
  const [saving, setSaving] = useState<readonly CellTarget[]>([]);
  const [focus, setFocus] = useState<CellTarget | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const open = editing && page && runOf(editing.page) === runOf(page) ? editing : null;
  const creating = newRow && page && runOf(newRow.page) === runOf(page) ? newRow : null;
  const close = (target: CellTarget | null) => {
    setEditing(null);
    setFocus(target);
  };

  const save = (row: Row, colIndex: number, colKey: string, value: unknown) => {
    const target = { rowKey: row.key, colIndex };
    const key = rowsKey;
    setEditing(null);
    setSaving((current) => [...current, target]);
    setAnnouncement(ts("Saving…"));
    const done = () => {
      setSaving((current) => current.filter((other) => !same(other, target)));
    };
    // getApiParams(null) plus the row and its new value, as saveEditing() sends them.
    api4<Row>("SearchDisplay", "inlineEdit", {
      ...params,
      return: null,
      rowKey: row.key,
      values: { [colKey]: value },
    }).then(
      (result) => {
        done();
        setAnnouncement(ts("Saved"));
        const fresh = result[0];
        const shown = client.getQueryData<RunPage>(key);
        if (fresh && shown?.rows.some((old) => old.key === row.key)) {
          writePage(client, key, (current) => ({
            ...current,
            rows: current.rows.map((old) => (old.key === row.key ? mergeRow(old, fresh) : old)),
          }));
          void client.invalidateQueries({ queryKey: tallyKey });
          setFocus(target);
        } else {
          // The row no longer matches the filters.
          reloadAll();
        }
      },
      (error: unknown) => {
        done();
        const message = errorMessage(error);
        setAnnouncement(ts("Not saved: %1", { 1: message }));
        // The editor opens again unless another one opened meanwhile.
        const shown = client.getQueryData<RunPage>(key);
        if (shown)
          setEditing((current) => current ?? { ...target, page: shown, value, error: message });
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
      client.setQueryData<number | null>(countKey, (count) => (count == null ? count : count + 1));
      void client.invalidateQueries({ queryKey: tallyKey });
    } catch (error) {
      const message = errorMessage(error);
      setAnnouncement(ts("Not saved: %1", { 1: message }));
      setNewRow((current) => current && { ...current, busy: false, values, error: message });
    }
  };

  return {
    editable: page?.editable ?? {},
    editing: open,
    newRow: creating,
    startCreating: () => {
      if (page && !open && !creating) setNewRow({ page, busy: false });
    },
    cancelCreating: () => {
      setNewRow(null);
    },
    saveNew,
    isEditing: (target) => same(open, target),
    isSaving: (target) => saving.some((other) => same(other, target)),
    takeFocus: (target) => {
      if (!same(focus, target)) return false;
      setFocus(null);
      return true;
    },
    // One editor at a time, as startEditing().
    start: (target) => {
      if (page && !open && !creating) setEditing({ ...target, page });
    },
    cancel: () => {
      close(open);
    },
    save,
    announcement,
  };
}
