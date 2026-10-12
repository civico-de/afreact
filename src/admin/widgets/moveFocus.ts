import { useEffect, useRef } from "react";
import type { MoveDirection } from "./clauseTree";

/** The item a move button just moved; consumed by the first item of that key to render. */
let moved: { key: string; direction: MoveDirection } | null = null;

/** Marks the item `key` as moved, so its buttons take the focus once the list shows it moved. */
export const focusMovedItem = (key: string, direction: MoveDirection) => {
  moved = { key, direction };
};

/**
 * Refs for an item's up and down buttons: after its move the button of that direction keeps the
 * focus, or the other one where the item reached the end.
 */
export function useMoveFocus(key: string) {
  const up = useRef<HTMLButtonElement>(null);
  const down = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (moved?.key !== key) return;
    const [same, other] = moved.direction === "up" ? [up, down] : [down, up];
    moved = null;
    (same.current?.disabled ? other : same).current?.focus();
  });
  return { up, down };
}
