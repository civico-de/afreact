import { keyText } from "./rows";
import { FIRST, isSlot } from "./treeSlot";
import type { Row } from "./types";

export interface TreeMove {
  rows: Row[];
  /** What crmSearchDisplayTreeBranch's updateDraggableWeights() sends: the weight and the parent. */
  values: Record<string, unknown>;
}

const parentOf = (row: Row, parentField: string) => keyText(row.data?.[parentField]);

/** The keys of the row's descendants, through the parent field. */
function under(rows: Row[], key: Row["key"], parentField: string): Set<string> {
  const keys = new Set([String(key)]);
  let grown = true;
  while (grown) {
    grown = false;
    for (const row of rows) {
      const parent = parentOf(row, parentField);
      if (parent !== null && keys.has(parent) && !keys.has(String(row.key))) {
        keys.add(String(row.key));
        grown = true;
      }
    }
  }
  keys.delete(String(key));
  return keys;
}

function weightOf(row: Row, weightField: string): number {
  const weight = row.data?.[weightField];
  if (typeof weight !== "number") throw new Error(`Row ${String(row.key)} has no ${weightField}.`);
  return weight;
}

/**
 * `active` dropped on `over`: after that item among its siblings, or first under the parent a
 * FIRST target names. The weight is the one the server orders the siblings by; the result's rows
 * carry the new parent, are the same rows where nothing changes, and null for a drop under itself.
 * An item whose parent is not on the page stands at the top, as the tree shows it.
 */
export function treeMove(
  rows: Row[],
  active: Row["key"],
  over: string | number,
  weightField: string,
  parentField: string,
): TreeMove | null {
  const onPage = (key: string | null) =>
    key !== null && rows.some((row) => String(row.key) === key) ? key : null;
  const shownParent = (row: Row) => onPage(parentOf(row, parentField));
  const moved = rows.find((row) => row.key === active);
  if (!moved) throw new Error(`Row ${String(active)} is not on this page.`);
  const first = isSlot(over);
  const target = first ? undefined : rows.find((row) => row.key === over);
  const parent = target ? shownParent(target) : String(over).slice(FIRST.length) || null;
  const parentRow = parent === null ? null : rows.find((row) => String(row.key) === parent);
  if ((!first && !target) || (parent !== null && !parentRow))
    throw new Error(`Row ${String(over)} is not on this page.`);
  if (target === moved) return { rows, values: {} };
  if (
    parent !== null &&
    (parent === String(active) || under(rows, active, parentField).has(parent))
  )
    return null;
  const same = shownParent(moved) === parent;
  const siblings = rows.filter((row) => shownParent(row) === parent);
  const wasAt = same ? siblings.indexOf(moved) : -1;
  const others = siblings.filter((row) => row !== moved);
  const place = target ? others.indexOf(target) + 1 : 0;
  if (same && wasAt === place) return { rows, values: {} };
  // Among siblings the server shifts the others; a weight in use puts the row before its holder.
  const next = others[place];
  const weight = target
    ? weightOf(target, weightField) + (same && wasAt < place ? 0 : 1)
    : next
      ? weightOf(next, weightField)
      : 1;
  const rest = rows.filter((row) => row !== moved);
  // The tree orders siblings as the rows come: right after the target, or before the first child.
  const at = target
    ? rest.indexOf(target) + 1
    : next
      ? rest.indexOf(next)
      : parentRow
        ? rest.indexOf(parentRow) + 1
        : 0;
  const parentKey = parentRow?.key ?? null;
  rest.splice(at, 0, { ...moved, data: { ...moved.data, [parentField]: parentKey } });
  return { rows: rest, values: { [weightField]: weight, [parentField]: parentKey } };
}
