import type { SchemaEntity } from "./meta";

export type SegmentClause = unknown[];

export interface SegmentItem {
  label: string;
  /** No conditions: the default item. */
  when?: SegmentClause[];
}

export interface Segment {
  id?: number;
  label: string;
  description: string | null;
  entity_name: string;
  items: SegmentItem[];
}

/** getDefaultField: the field of the last condition, else the entity's first field. */
export function defaultField(items: SegmentItem[], entity: SchemaEntity | undefined): string {
  for (const item of [...items].reverse()) {
    const field = item.when?.[0]?.[0];
    if (typeof field === "string" && field) return field;
  }
  return entity?.fields[0]?.name ?? "";
}

export function withCondition(item: SegmentItem, field: string): SegmentItem {
  return { ...item, when: [...(item.when ?? []), [field, "="]] };
}

/** addItem: an item with a condition, or the default item without. */
export function addItem(
  items: SegmentItem[],
  entity: SchemaEntity | undefined,
  condition: boolean,
) {
  const item: SegmentItem = { label: "" };
  return [...items, condition ? withCondition(item, defaultField(items, entity)) : item];
}

export const isDefaultItem = (item: SegmentItem) => !item.when?.length || !item.when[0]?.length;

export const hasDefault = (items: SegmentItem[]) => items.some(isDefaultItem);

/** selectFields: each field, by its `:name` expression where it has options by name. */
export function conditionFields(entity: SchemaEntity | undefined) {
  return (entity?.fields ?? []).map((field) => ({
    id: field.name + (field.suffixes?.includes("name") ? ":name" : ""),
    label: field.label,
    description: typeof field.description === "string" ? field.description : null,
  }));
}

/** A condition's field expression as its field name and option key. */
export function splitExpr(expr: unknown): { name: string; optionKey: string } {
  const [name = "", key] = typeof expr === "string" ? expr.split(":") : [];
  return { name, optionKey: key ?? "id" };
}

// deviation:segment-item-move-buttons
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  if (moved !== undefined) next.splice(to, 0, moved);
  return next;
}
