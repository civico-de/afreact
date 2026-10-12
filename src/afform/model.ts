import type { ElementNode, EntityItem, FormData, LayoutNode, Scope, Values } from "./types";
import { isElement, isFieldDefn } from "./types";

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

/** afForm keeps an af-field without a name (an "extra" field) in data.extra, outside any entity. */
export const EXTRA_SCOPE: Scope = { entity: "extra", index: 0 };

/** Where an af-field's value lives and its key there: an extra field's is its definition's name. */
export function fieldPlace(
  node: ElementNode,
  scope: Scope | null,
): { scope: Scope; name: string } | null {
  if (typeof node.name === "string" && node.name) return scope && { scope, name: node.name };
  return isFieldDefn(node.defn) ? { scope: EXTRA_SCOPE, name: node.defn.name } : null;
}

/**
 * The values afForm submits and announces: extra fields as one record, `extra: {fields}`, beside
 * the values elements add to data.extra, such as crm-recaptcha2's response.
 */
export type Submission = Record<string, EntityItem[] | ({ fields: Values } & Values)>;

export function submission(data: FormData, beside: Values = {}): Submission {
  const { extra, ...entities } = data;
  return extra || Object.keys(beside).length
    ? { ...entities, extra: { ...beside, fields: extra?.[0]?.fields ?? {} } }
    : entities;
}

/** The field a CheckoutBlock writes; card details never go into a draft. */
const CHECKOUT_PARAMS = "checkout_params";

// deviation:checkout-params-not-in-drafts
/** What autosave and the draft button send: the submission without checkout details. */
export function draftValues(data: FormData): Submission {
  const without = <T extends { fields: Values }>(item: T): T => {
    if (!(CHECKOUT_PARAMS in item.fields)) return item;
    const { [CHECKOUT_PARAMS]: _, ...fields } = item.fields;
    return { ...item, fields };
  };
  return Object.fromEntries(
    Object.entries(submission(data)).map(([entity, items]) => [
      entity,
      Array.isArray(items) ? items.map(without) : without(items),
    ]),
  );
}

export function emptyData(names: string[]): FormData {
  return Object.fromEntries(names.map((name) => [name, []]));
}

function queryParams(query: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(query));
}

/** afCore's routeParams: the hash parameters ("#?Individual1=5"), not the page's query string. */
export function routeParams(location: { hash: string }): Record<string, string> {
  return queryParams(location.hash.replace(/^#\/?\??/, ""));
}

/**
 * Route arguments as afForm sends them to the server: the query string, the route parameters
 * over it, then the placement's options (e.g. contact_id on a contact summary tab) over them, with
 * comma-separated IDs split for entity names.
 */
export function routeArgs(
  location: { search: string; hash: string },
  names: string[],
  options: Record<string, unknown> = {},
): Record<string, unknown> {
  const args: Record<string, unknown> = {
    // deviation:route-args-query-string
    ...queryParams(location.search.replace(/^\?/, "")),
    ...routeParams(location),
    ...options,
  };
  for (const name of names) {
    const value = args[name];
    if (typeof value === "string" && value) args[name] = value.split(",");
  }
  return args;
}

/** The options attribute of a placed form: a JSON object, or "null" where the page set none. */
export function placementOptions(attribute: string | null): Record<string, unknown> | undefined {
  // Placements always write the attribute; without it the form is not placed.
  if (attribute === null) return undefined;
  const value: unknown = JSON.parse(attribute);
  if (value === null) return {};
  if (!isRecord(value)) throw new Error(`options must be a JSON object, got ${attribute}`);
  return value;
}

export interface PrefillItem {
  name: string;
  /** Items by index; a stored draft's extra fields ("extra") come as one `{fields}` record. */
  values: EntityItem[] | Record<string, EntityItem> | { fields: Values };
}

const isEntityItem = (value: unknown): value is EntityItem =>
  isRecord(value) && isRecord(value.fields);

/** The first record of a prefill entry. */
export function firstPrefilled(item: PrefillItem): EntityItem | undefined {
  return Object.values(item.values).find(isEntityItem);
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
    // deviation:draft-extra-fields-restored
    // A stored draft holds extra fields as they were submitted.
    if (name === EXTRA_SCOPE.entity) {
      const fields: unknown = Array.isArray(values) ? undefined : values.fields;
      if (isRecord(fields)) next.extra = [{ fields: { ...fields }, joins: {} }];
      continue;
    }
    const items = (next[name] ??= []);
    for (const [index, item] of Object.entries(values)) {
      if (!isEntityItem(item)) throw new Error(`Prefill of ${name} holds no record at ${index}.`);
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

function recordAt(data: FormData, scope: Scope): Values | null | undefined {
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

// deviation:repeat-copy-new-record
/** A copy is a new record: it has no id and is not the primary one. */
function copied(record: Values): Values {
  const { id: _id, ...rest } = structuredClone(record);
  if ("is_primary" in rest) rest.is_primary = false;
  return rest;
}

/** afRepeat's copyItem(): appends a copy of the last item; an entity's copy leaves its joins out. */
export function copyRepeatItem(data: FormData, scope: Scope): FormData {
  const next = structuredClone(data);
  if (scope.join === undefined) {
    const items = next[scope.entity] ?? [];
    const last = items.at(-1);
    if (last) items.push({ fields: copied(last.fields), joins: {} });
    return next;
  }
  const records = entityItemAt(next, scope)?.joins?.[scope.join] ?? [];
  const last = records.at(-1);
  if (last) records.push(copied(last));
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
    records[position] = { ...record, is_primary: position === (scope.joinIndex ?? 0) };
  });
  return next;
}

/** First record becomes primary when none is (afField's watcher on the repeat). */
export function ensurePrimary(data: FormData, scope: Scope): FormData {
  const records =
    scope.join === undefined ? undefined : data[scope.entity]?.[scope.index]?.joins?.[scope.join];
  return records?.length && !records.some((record) => record?.is_primary)
    ? setPrimary(data, { ...scope, joinIndex: 0 })
    : data;
}
