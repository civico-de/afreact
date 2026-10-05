import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { Suspense, use, useState, type ComponentType, type ReactNode } from "react";
import { dragField, moveRow, withWeights } from "./dragOrder";
import type * as SortableModule from "./Sortable";
import { rowName } from "./Tasks";
import type { DisplaySettings, Row, RunPage } from "./types";

/** What Body needs to render draggable rows. */
export interface RowDrag {
  Row: ComponentType<{ rowKey: Row["key"]; children: ReactNode }>;
  handle: (row: Row) => ReactNode;
}

interface ReorderOptions {
  settings: DisplaySettings | undefined;
  /** The query of the page on screen. */
  runKey: QueryKey;
  /** SearchDisplay.run parameters without `return`, as getApiParams() builds them. */
  runParams: Record<string, unknown>;
}

export interface Reorder {
  weightField: string | null;
  saving: boolean;
  error: unknown;
  move: (active: Row["key"], over: Row["key"]) => void;
}

/**
 * Drag to reorder (crmSearchDisplayTable's draggableOptions): the row moves at once, its new
 * weight is saved, and the page takes the weights the server returns, or its old order back.
 */
export function useReorder({ settings, runKey, runParams }: ReorderOptions): Reorder {
  const client = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const weightField = settings ? dragField(settings) : null;

  const save = async (page: RunPage, active: Row["key"], over: Row["key"], field: string) => {
    const moved = moveRow(page.rows, active, over, field);
    client.setQueryData<RunPage>(runKey, { ...page, rows: moved.rows });
    const weights = await window.CRM.api4("SearchDisplay", "inlineEdit", {
      ...runParams,
      return: "draggableWeight",
      rowKey: active,
      values: { [field]: moved.weight },
    });
    if (typeof weights !== "object" || weights === null)
      throw new Error("SearchDisplay.inlineEdit answered without weights.");
    client.setQueryData<RunPage>(
      runKey,
      (current) =>
        current && {
          ...current,
          rows: withWeights(current.rows, { ...weights }, field, settings?.columns ?? []),
        },
    );
    window.CRM.status(ts("Saved"));
  };

  const move = (active: Row["key"], over: Row["key"]) => {
    const page = client.getQueryData<RunPage>(runKey);
    if (!page || !weightField) return;
    setError(null);
    setSaving(true);
    save(page, active, over, weightField)
      .catch((failure: unknown) => {
        client.setQueryData<RunPage>(runKey, page);
        setError(failure);
      })
      .finally(() => {
        setSaving(false);
      });
  };

  return { weightField, saving, error, move };
}

let sortable: Promise<typeof SortableModule> | undefined;
/** dnd-kit loads with the first draggable table on a page. */
const loadSortable = () => (sortable ??= import("./Sortable"));

interface ReorderRowsProps {
  reorder: Reorder;
  rows: Row[];
  children: (drag: RowDrag | undefined) => ReactNode;
}

/** The table's rows, draggable when the display has a weight field. */
export function ReorderRows({ reorder, rows, children }: ReorderRowsProps) {
  if (!reorder.weightField) return children(undefined);
  return (
    <Suspense fallback={children(undefined)}>
      <Draggable reorder={reorder} rows={rows}>
        {children}
      </Draggable>
    </Suspense>
  );
}

function Draggable({ reorder, rows, children }: ReorderRowsProps) {
  const { SortableRows, SortableRow, DragHandle } = use(loadSortable());
  const names = new Map(rows.map((row) => [row.key, rowName(row)]));
  return (
    <SortableRows
      keys={rows.map((row) => row.key)}
      nameOf={(key) => names.get(key) ?? String(key)}
      disabled={reorder.saving}
      onMove={reorder.move}
    >
      {children({
        Row: SortableRow,
        handle: (row) => <DragHandle label={ts("Move %1", { 1: rowName(row) })} />,
      })}
    </SortableRows>
  );
}
