import { descendents, rowDepth } from "./rows";
import type { Column, DisplaySettings, Row, RowKey } from "./types";

/** The weight field rows are dragged by, or null. */
export function dragField(settings: DisplaySettings): string | null {
  if (!settings.draggable) return null;
  return settings.draggable;
}

/** The row at `index` with its sub-rows, which move with it. */
const block = (rows: Row[], index: number) =>
  rows.slice(index, index + 1 + descendents(rows[index] ?? { key: 0, columns: [] }));

/** The index of the row's parent, or -1 at the top. */
function parentOf(rows: Row[], index: number): number {
  const level = rowDepth(rows[index] ?? { key: 0, columns: [] });
  for (let at = index - 1; at >= 0; at--) if (rowDepth(rows[at]!) < level) return at;
  return -1;
}

/**
 * `active` moved to the place of `over`, and the weight it takes: the weight of the row it
 * displaces, as updateDraggableWeights() in crmSearchDisplayTable sends it. In a hierarchical
 * table the row brings its sub-rows and moves among its siblings only, since the weight orders
 * those; a drop on a sibling's sub-row counts for that sibling, one on its own sub-row changes
 * nothing, and one under another parent or at another depth gives null.
 */
export function moveRow(
  rows: Row[],
  active: RowKey,
  over: RowKey,
  weightField: string,
  hierarchical = false,
): { rows: Row[]; weight: unknown } | null {
  const from = rows.findIndex((row) => row.key === active);
  let to = rows.findIndex((row) => row.key === over);
  const moved = rows[from];
  if (!moved || to < 0)
    throw new Error(`Row ${String(active)} or ${String(over)} is not on this page.`);
  // deviation:tree-table-drag-with-subrows
  if (hierarchical) {
    const depth = rowDepth(moved);
    while (to >= 0 && rowDepth(rows[to]!) > depth) to = parentOf(rows, to);
    if (to < 0 || rowDepth(rows[to]!) !== depth || parentOf(rows, from) !== parentOf(rows, to))
      return null;
  }
  const displaced = rows[to]!;
  const weight = displaced.data?.[weightField];
  if (weight === undefined) throw new Error(`Row ${String(over)} has no ${weightField}.`);
  if (to === from) return { rows, weight };
  if (!hierarchical) {
    const next = rows.filter((row) => row !== moved);
    next.splice(to, 0, moved);
    return { rows: next, weight };
  }
  const moving = block(rows, from);
  const target = block(rows, to);
  const rest = rows.filter((row) => !moving.includes(row));
  // Down: after the displaced row's block; up: before it, as a flat move lands.
  const at = rest.indexOf(displaced) + (to > from ? target.length : 0);
  rest.splice(at, 0, ...moving);
  return { rows: rest, weight };
}

// deviation:drag-weights-shown
/** The weights SearchDisplay.inlineEdit returns by row key, in the data and the weight column. */
export function withWeights(
  rows: Row[],
  weights: Record<string, unknown>,
  weightField: string,
  columns: Column[],
): Row[] {
  const column = columns.findIndex((candidate) => candidate.key === weightField);
  return rows.map((row) => {
    const key = String(row.key);
    if (!Object.hasOwn(weights, key)) return row;
    const weight = weights[key];
    return {
      ...row,
      data: { ...row.data, [weightField]: weight },
      columns: row.columns.map((cell, index) =>
        index === column && cell ? { ...cell, val: weight } : cell,
      ),
    };
  });
}
