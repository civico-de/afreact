import type { Row } from "./types";

/** The id of the drop target at the first place under an item (its key) or at the top (""). */
export const FIRST = "first:";
export const firstUnder = (parent: Row["key"] | null) =>
  `${FIRST}${parent === null ? "" : String(parent)}`;
export const isSlot = (id: string | number): id is string =>
  typeof id === "string" && id.startsWith(FIRST);
