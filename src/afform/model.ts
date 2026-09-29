import type { ElementNode, EntityItem, FormData, LayoutNode, Scope, Values } from "./types";
import { isElement } from "./types";

export function findElements(nodes: LayoutNode[], tag: string): ElementNode[] {
  return nodes
    .filter(isElement)
    .flatMap((node) => [
      ...(node["#tag"] === tag ? [node] : []),
      ...findElements(node["#children"] ?? [], tag),
    ]);
}

/** What the client uses of an af-entity: preset values and the allowed actions. */
export interface EntityDeclaration {
  data: Values;
  actions: Record<string, unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The form's af-entity declarations by name; afEntity defaults the actions to create and update. */
export function entityDeclarations(layout: LayoutNode[]): Record<string, EntityDeclaration> {
  return Object.fromEntries(
    findElements(layout, "af-entity").map((entity) => [
      String(entity.name),
      {
        data: isRecord(entity.data) ? entity.data : {},
        actions: isRecord(entity.actions) ? entity.actions : { create: true, update: true },
      },
    ]),
  );
}

export function emptyData(names: string[]): FormData {
  return Object.fromEntries(names.map((name) => [name, []]));
}

/**
 * Route arguments as the Angular runtime builds them: every query parameter,
 * with comma-separated IDs split for entity names. Angular-style hash
 * parameters ("#?Individual1=5") count too, so existing Afform links work.
 */
export function routeArgs(
  location: { search: string; hash: string },
  names: string[],
): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  const hashQuery = location.hash.replace(/^#\/?\??/, "");
  new URLSearchParams(`${location.search.replace(/^\?/, "")}&${hashQuery}`).forEach(
    (value, key) => {
      args[key] = names.includes(key) ? value.split(",") : value;
    },
  );
  return args;
}

export interface PrefillItem {
  name: string;
  values: EntityItem[] | Record<string, EntityItem>;
}

/**
 * Merges an Afform.prefill result; `values` may arrive as an object when indexes are sparse.
 * The entity's preset `data` wins over prefilled fields, as in afForm.
 */
export function applyPrefill(
  data: FormData,
  prefill: PrefillItem[],
  entities: Record<string, EntityDeclaration>,
): FormData {
  const next = structuredClone(data);
  for (const { name, values } of prefill) {
    const items = (next[name] ??= []);
    for (const [index, item] of Object.entries(values)) {
      const current = items[Number(index)];
      items[Number(index)] = {
        fields: { ...current?.fields, ...item.fields, ...entities[name]?.data },
        joins: { ...current?.joins, ...item.joins },
      };
    }
  }
  return next;
}

function entityItemAt(data: FormData, scope: Scope): EntityItem | undefined {
  return data[scope.entity]?.[scope.index];
}

function recordAt(data: FormData, scope: Scope): Values | undefined {
  const entityItem = entityItemAt(data, scope);
  return scope.join === undefined
    ? entityItem?.fields
    : entityItem?.joins?.[scope.join]?.[scope.joinIndex ?? 0];
}

export function getValue(data: FormData, scope: Scope, field: string): unknown {
  return recordAt(data, scope)?.[field];
}

/** Immutable write; creates the entity item and join record on first use, as afFieldset/afJoin do. */
export function setValue(data: FormData, scope: Scope, field: string, value: unknown): FormData {
  const next = structuredClone(data);
  const items = (next[scope.entity] ??= []);
  const entityItem = (items[scope.index] ??= { fields: {}, joins: {} });
  if (scope.join === undefined) {
    entityItem.fields[field] = value;
    return next;
  }
  const joins = (entityItem.joins ??= {});
  const records = (joins[scope.join] ??= []);
  records[scope.joinIndex ?? 0] = { ...records[scope.joinIndex ?? 0], [field]: value };
  return next;
}

/** afField on afIfDestroy: the field's key leaves the record. */
export function deleteValue(data: FormData, scope: Scope, field: string): FormData {
  const next = structuredClone(data);
  const entityItem = next[scope.entity]?.[scope.index];
  const record =
    scope.join === undefined
      ? entityItem?.fields
      : entityItem?.joins?.[scope.join]?.[scope.joinIndex ?? 0];
  if (record) delete record[field];
  return next;
}

/** afField's validateValue(): a value, or list items, the visible options no longer offer leave the record. */
export function keepOffered(
  data: FormData,
  scope: Scope,
  field: string,
  offered: unknown[],
): FormData {
  const current = getValue(data, scope, field);
  if (Array.isArray(current)) {
    const valid = current.filter((item) => offered.includes(item));
    return valid.length < current.length ? setValue(data, scope, field, valid) : data;
  }
  return current === undefined || offered.includes(current)
    ? data
    : deleteValue(data, scope, field);
}

/** Items a repeat iterates: entity items for a fieldset, join records for a join. */
export function repeatCount(data: FormData, scope: Scope): number {
  return scope.join === undefined
    ? (data[scope.entity]?.length ?? 0)
    : (entityItemAt(data, scope)?.joins?.[scope.join]?.length ?? 0);
}

export function addRepeatItem(data: FormData, scope: Scope): FormData {
  const next = structuredClone(data);
  const items = (next[scope.entity] ??= []);
  if (scope.join === undefined) {
    items.push({ fields: {}, joins: {} });
    return next;
  }
  const entityItem = (items[scope.index] ??= { fields: {}, joins: {} });
  ((entityItem.joins ??= {})[scope.join] ??= []).push({});
  return next;
}

/** afRepeat's copyItem(): appends a copy of the last item; an entity's copy leaves its joins out. */
export function copyRepeatItem(data: FormData, scope: Scope): FormData {
  const next = structuredClone(data);
  if (scope.join === undefined) {
    const items = next[scope.entity] ?? [];
    const last = items.at(-1);
    if (last) items.push({ fields: structuredClone(last.fields), joins: {} });
    return next;
  }
  const records = entityItemAt(next, scope)?.joins?.[scope.join] ?? [];
  const last = records.at(-1);
  if (last) records.push(structuredClone(last));
  return next;
}

export function removeRepeatItem(data: FormData, scope: Scope, position: number): FormData {
  const next = structuredClone(data);
  if (scope.join === undefined) {
    next[scope.entity]?.splice(position, 1);
  } else {
    entityItemAt(next, scope)?.joins?.[scope.join]?.splice(position, 1);
  }
  return next;
}

/** Pads a repeat to its minimum item count (afRepeat: af-repeat-default, at least `min`, else 1). */
export function ensureRepeatItems(data: FormData, scope: Scope, count: number): FormData {
  let next = data;
  while (repeatCount(next, scope) < count) {
    next = addRepeatItem(next, scope);
  }
  return next;
}

/**
 * is_primary within a repeat of join records, as afField enforces it: exactly
 * one record is primary, and choosing one clears the others.
 */
export function setPrimary(data: FormData, scope: Scope): FormData {
  const next = structuredClone(data);
  const records =
    scope.join === undefined ? undefined : next[scope.entity]?.[scope.index]?.joins?.[scope.join];
  records?.forEach((record, position) => {
    record.is_primary = position === (scope.joinIndex ?? 0);
  });
  return next;
}

/** First record becomes primary when none is (afField's watcher on the repeat). */
export function ensurePrimary(data: FormData, scope: Scope): FormData {
  const records =
    scope.join === undefined ? undefined : data[scope.entity]?.[scope.index]?.joins?.[scope.join];
  return records?.length && !records.some((record) => record.is_primary)
    ? setPrimary(data, { ...scope, joinIndex: 0 })
    : data;
}
