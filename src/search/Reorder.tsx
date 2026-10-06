import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { Suspense, use, useState, type ComponentType, type ReactNode } from "react";
import { dragField, moveRow, withWeights } from "./dragOrder";
import { asHtml } from "../html";
import type * as SortableModule from "./Sortable";
import { rowName } from "./Tasks";
import { writePage } from "./inlineEdit";
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
  /** The position `active` would take among the rows shown after a drop on `over`, or null. */
  landing: (rows: Row[], shown: Row[], active: Row["key"], over: Row["key"]) => number | null;
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
    const moved = moveRow(page.rows, active, over, field, !!settings?.hierarchical);
    if (!moved) {
      const row = page.rows.find((each) => each.key === active) ?? { key: active, columns: [] };
      const text = ts("%1 stays where it is: a row moves among its siblings only.", {
        1: rowName(row),
      });
      window.CRM.alert(asHtml(text), ts("Not moved"), "info");
      return;
    }
    if (moved.rows === page.rows) return;
    writePage(client, runKey, (current) => ({ ...current, rows: moved.rows }));
    const weights = await window.CRM.api4("SearchDisplay", "inlineEdit", {
      ...runParams,
      return: "draggableWeight",
      rowKey: active,
      values: { [field]: moved.weight },
    });
    if (typeof weights !== "object" || weights === null)
      throw new Error("SearchDisplay.inlineEdit answered without weights.");
    writePage(client, runKey, (current) => ({
      ...current,
      rows: withWeights(current.rows, { ...weights }, field, settings?.columns ?? []),
    }));
    window.CRM.status(ts("Saved"));
  };

  const move = (active: Row["key"], over: Row["key"]) => {
    const page = client.getQueryData<RunPage>(runKey);
    if (!page || !weightField) return;
    if (active === over) return;
    setError(null);
    setSaving(true);
    save(page, active, over, weightField)
      .catch((failure: unknown) => {
        // Only the order goes back; what the rows took meanwhile stays.
        const place = new Map(page.rows.map((row, index) => [row.key, index]));
        const at = (row: Row) => place.get(row.key) ?? page.rows.length;
        writePage(client, runKey, (current) => ({
          ...current,
          rows: [...current.rows].sort((a, b) => at(a) - at(b)),
        }));
        setError(failure);
      })
      .finally(() => {
        setSaving(false);
      });
  };

  const landing = (rows: Row[], shown: Row[], active: Row["key"], over: Row["key"]) => {
    if (!weightField) return null;
    const moved = moveRow(rows, active, over, weightField, !!settings?.hierarchical);
    if (!moved) return null;
    const visible = new Set(shown.map((row) => row.key));
    const order = moved.rows.filter((row) => visible.has(row.key));
    return order.findIndex((row) => row.key === active) + 1;
  };

  return { weightField, saving, error, move, landing };
}

let sortable: Promise<typeof SortableModule> | undefined;
/** dnd-kit loads with the first draggable table on a page. */
const loadSortable = () => (sortable ??= import("./Sortable"));

interface ReorderRowsProps {
  reorder: Reorder;
  /** The page's rows, sub-rows under a collapsed parent included. */
  rows: Row[];
  /** The rows on screen, which the keyboard steps through. */
  shown: Row[];
  children: (drag: RowDrag | undefined) => ReactNode;
}

/** The table's rows, draggable when the display has a weight field. */
export function ReorderRows({ reorder, rows, shown, children }: ReorderRowsProps) {
  if (!reorder.weightField) return children(undefined);
  return (
    <Suspense fallback={children(undefined)}>
      <Draggable reorder={reorder} rows={rows} shown={shown}>
        {children}
      </Draggable>
    </Suspense>
  );
}

function Draggable({ reorder, rows, shown, children }: ReorderRowsProps) {
  const { SortableRows, SortableRow, DragHandle } = use(loadSortable());
  const names = new Map(rows.map((row) => [row.key, rowName(row)]));
  return (
    <SortableRows
      keys={shown.map((row) => row.key)}
      nameOf={(key) => names.get(key) ?? String(key)}
      landing={(active, over) => reorder.landing(rows, shown, active, over)}
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
