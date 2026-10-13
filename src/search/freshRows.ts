import { useEffect, useRef } from "react";

/** The element holding a display's rows; a nested display's comes later in document order. */
const ROWS = [
  "tbody",
  ".crm-search-display-list-container",
  ".crm-search-display-grid-container",
  ".crm-search-display-tree-branch",
].join(", ");

/** Rows of another page, sort or page size fade in, also when fetched ahead and shown at once. `shown`
 *  is null while kept rows wait; after other `filters` placeholders show the change. deviation:page-rows-fade-in */
export function useFreshRows(root: HTMLElement | null, shown: string | null, filters: string) {
  const last = useRef<{ shown: string; filters: string } | null>(null);
  useEffect(() => {
    if (shown === null) return;
    const previous = last.current;
    last.current = { shown, filters };
    if (previous === null || previous.shown === shown || previous.filters !== filters) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    root
      ?.querySelector(ROWS)
      ?.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 250, easing: "ease-out" });
  }, [root, shown, filters]);
}
