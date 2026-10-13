import { useEffect, useLayoutEffect, useRef } from "react";

/** The header cells of a table's first header row. */
const headers = (table: HTMLTableElement) => Array.from(table.tHead?.rows[0]?.cells ?? []);

const release = (table: HTMLTableElement) => {
  for (const cell of headers(table)) cell.style.minWidth = "";
};

/** The width a cell's min-width counts: its box less padding and border unless it sizes the border box. */
const shownWidth = (cell: HTMLTableCellElement) => {
  const style = getComputedStyle(cell);
  const edges =
    style.boxSizing === "border-box"
      ? 0
      : [style.paddingLeft, style.paddingRight, style.borderLeftWidth, style.borderRightWidth]
          .map(parseFloat)
          .reduce((sum, edge) => sum + edge, 0);
  return cell.getBoundingClientRect().width - edges;
};

// All widths are read before any is set; each includes the minimum set before, so it only grows.
const hold = (table: HTMLTableElement) => {
  const cells = headers(table);
  const widths = cells.map(shownWidth);
  for (const [index, cell] of cells.entries()) cell.style.minWidth = `${widths[index] ?? 0}px`;
  return table.getBoundingClientRect().width;
};

/** Columns keep the widest width a page gave them; other filters or columns (`reset`), other room
 *  or kept widths that push the table past its room let them fit anew. deviation:steady-column-widths */
export function useSteadyColumns(table: HTMLTableElement | null, reset: string, rows: unknown) {
  const last = useRef(reset);
  const shown = useRef(false);
  const held = useRef(0);
  useLayoutEffect(() => {
    shown.current = rows !== undefined;
    if (!table || rows === undefined) return;
    const room = table.parentElement?.clientWidth ?? 0;
    if (
      last.current !== reset ||
      table.getBoundingClientRect().width > Math.max(room, held.current)
    ) {
      last.current = reset;
      release(table);
    }
    held.current = hold(table);
  }, [table, reset, rows]);
  useEffect(() => {
    const room = table?.parentElement;
    let width = room?.clientWidth;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (!table || !room || room.clientWidth === width) return;
      width = room.clientWidth;
      // Widths set inside the callback would resize the room again before the frame is painted.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        release(table);
        if (shown.current) held.current = hold(table);
      });
    });
    if (room) observer.observe(room);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [table]);
}
