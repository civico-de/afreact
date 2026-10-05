import type { Column, DisplaySettings, Row } from "./types";

/**
 * The weight field rows are dragged by, or null. Hierarchical tables are left out: a row would
 * have to move with its sub-rows and stay under its parent.
 */
export function dragField(settings: DisplaySettings): string | null {
  return settings.draggable && !settings.hierarchical ? settings.draggable : null;
}

/**
 * `active` moved to the place of `over`, and the weight it takes: the weight of the row it
 * displaces, as updateDraggableWeights() in crmSearchDisplayTable sends it.
 */
export function moveRow(
  rows: Row[],
  active: Row["key"],
  over: Row["key"],
  weightField: string,
): { rows: Row[]; weight: unknown } {
  const from = rows.findIndex((row) => row.key === active);
  const to = rows.findIndex((row) => row.key === over);
  const moved = rows[from];
  const displaced = rows[to];
  if (!moved || !displaced)
    throw new Error(`Row ${String(active)} or ${String(over)} is not on this page.`);
  const weight = displaced.data?.[weightField];
  if (weight === undefined) throw new Error(`Row ${String(over)} has no ${weightField}.`);
  const next = rows.filter((row) => row !== moved);
  next.splice(to, 0, moved);
  return { rows: next, weight };
}

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
