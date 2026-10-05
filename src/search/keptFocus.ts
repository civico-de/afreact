import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

interface Spot {
  element: Element;
  key: string;
  index: number;
}

function itemOf(root: HTMLElement, key: string): Element | undefined {
  return [...root.querySelectorAll("[data-entity-id]")].find(
    (item) => item.getAttribute("data-entity-id") === key,
  );
}

/**
 * Placeholders replace a display's rows while it reloads, which takes the focus with them.
 * Once the rows are back, the focus returns to the same control of the same row.
 */
export function useKeptFocus(root: HTMLElement | null, loading: boolean) {
  const spot = useRef<Spot | null>(null);
  useEffect(() => {
    if (!root) return;
    const onFocus = (event: FocusEvent) => {
      const element = event.target instanceof Element ? event.target : null;
      const item = element?.closest("[data-entity-id]");
      const key = item?.getAttribute("data-entity-id");
      // A cell editor stands where its cell's control will be again.
      const editor = element?.closest("crm-search-display-editable")?.querySelector(FOCUSABLE);
      spot.current =
        element && item && key
          ? {
              element,
              key,
              index: [...item.querySelectorAll(FOCUSABLE)].indexOf(editor ?? element),
            }
          : null;
    };
    root.addEventListener("focusin", onFocus);
    return () => {
      root.removeEventListener("focusin", onFocus);
    };
  }, [root]);
  useEffect(() => {
    const kept = spot.current;
    if (loading || !root || !kept || kept.element.isConnected) return;
    // The focus moved on by itself, e.g. into a dialog.
    if (document.activeElement && document.activeElement !== document.body) return;
    const controls = itemOf(root, kept.key)?.querySelectorAll<HTMLElement>(FOCUSABLE);
    controls?.[Math.max(kept.index, 0)]?.focus();
  }, [loading, root]);
}
