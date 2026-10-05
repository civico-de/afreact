import type { Key } from "./searchTasks";

/**
 * Row selection of searchDisplayTasksTrait: keys of selected rows on any page, and whether all
 * matching rows are selected. Paging and sorting keep it; new filters and a finished task reset it.
 */
export interface Selection {
  keys: Key[];
  all: boolean;
}

export const NO_SELECTION: Selection = { keys: [], all: false };

export function isSelected(selection: Selection, key: Key): boolean {
  return selection.all || selection.keys.includes(key);
}

/** selectPage(): this page's rows, all of them when the page holds every row. */
export function selectPage(pageKeys: Key[], rowCount: number | null): Selection {
  return { keys: [...new Set(pageKeys)], all: rowCount !== null && rowCount <= pageKeys.length };
}

/** The nearest selected row from `position` in direction `step`, as checkRange(). */
function nearest(pageKeys: Key[], keys: Key[], position: number, step: number): number | undefined {
  for (let index = position; index >= 0 && index <= pageKeys.length; index += step) {
    const key = pageKeys[index];
    if (key !== undefined && keys.includes(key)) return index;
  }
  return undefined;
}

/**
 * toggleRow(): Shift selects the rows between the clicked row and the nearest selected one,
 * towards the row selected last when there are selected rows on both sides.
 */
export function toggleRow(
  selection: Selection,
  pageKeys: Key[],
  key: Key,
  shift: boolean,
  rowCount: number | null,
): Selection {
  const { keys } = selection;
  if (keys.includes(key)) return { keys: keys.filter((selected) => selected !== key), all: false };
  const added = [...keys];
  if (shift && keys.length) {
    const position = pageKeys.indexOf(key);
    const before = nearest(pageKeys, keys, position, -1);
    const after = nearest(pageKeys, keys, position, 1);
    const last = pageKeys.indexOf(keys.at(-1) ?? "");
    if (after !== undefined && (before === undefined || after === last))
      added.push(...pageKeys.slice(position + 1, after));
    else if (before !== undefined && (after === undefined || before === last))
      added.push(...pageKeys.slice(before + 1, position));
  }
  const next = [...new Set([...added, key])];
  return { keys: next, all: rowCount === next.length };
}

/** The select-all control's state: crmSearchDisplayTaskHeader's three icons. */
export function selectionState(selection: Selection): "none" | "some" | "all" {
  if (selection.all) return "all";
  return selection.keys.length ? "some" : "none";
}

/** crmSearchDisplay/ResultCount.html. */
export function resultCount(rowCount: number, selected: number): string {
  if (rowCount === 1)
    return selected ? ts("%1 selected of 1 result", { 1: selected }) : ts("1 result");
  return selected
    ? ts("%1 selected of %2 results", { 1: selected, 2: rowCount })
    : ts("%1 results", { 1: rowCount });
}
