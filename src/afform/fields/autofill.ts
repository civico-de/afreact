import { api4 } from "../../api/civi";
import { applyPrefill, firstPrefilled, type EntityDeclaration, type PrefillItem } from "../model";
import type { EntityItem, FormData, Scope, Values } from "../types";

type Join = Record<string, Values>;

/** A key of a JSON object or list, read without trusting its shape. */
const at = (value: unknown, key: string | number): unknown =>
  value !== null && typeof value === "object"
    ? Object.entries(value).find(([name]) => name === String(key))?.[1]
    : undefined;

/**
 * The join record of a join-mode prefill: `{joins}` at the entity's index, without `fields`;
 * lists may arrive as objects keyed by index.
 */
function joinRecord(item: PrefillItem, scope: Scope): Values | undefined {
  if (scope.join === undefined) return undefined;
  const join = at(at(at(item.values, scope.index), "joins"), scope.join);
  if (join === null || typeof join !== "object") return undefined;
  const records: Join = { ...join };
  return records[String(scope.joinIndex ?? 0)];
}

/**
 * Items other entities took from a selection, by entity and index: as they stood before and once
 * filled. A record that changed since, by the user or a calculated default, stays as it is.
 */
export type Filled = Record<string, Record<string, { before?: EntityItem; after: EntityItem }>>;

export interface Selection {
  apply: (data: FormData) => FormData;
  /** What the selection filled into other entities, e.g. through relationship autofill. */
  filled: Filled;
}

/**
 * afForm's loadData() for one record: the record the autofill field selects fills its entity
 * or join record, and the entities Afform.prefill loads with it; clearing it resets the entity
 * to its preset data, or empties the join record. `previous` is what the last selection filled.
 */
export async function loadSelected(
  formName: string,
  scope: Scope,
  field: string,
  id: unknown,
  entities: Record<string, EntityDeclaration>,
  previous: Filled = {},
): Promise<Selection> {
  const { entity, index, join } = scope;
  const joinIndex = scope.joinIndex ?? 0;
  const empty = id === null || id === undefined || id === "" || (Array.isArray(id) && !id.length);
  if (empty)
    return {
      apply: (data) =>
        replaceRecord(
          unfill(data, previous, entities),
          scope,
          join === undefined ? { ...entities[entity]?.data } : {},
          true,
        ),
      filled: {},
    };
  const args =
    join === undefined
      ? { [entity]: { [index]: { [field]: id } } }
      : { [entity]: { [index]: { joins: { [join]: { [joinIndex]: { [field]: id } } } } } };
  const result = await api4<PrefillItem>("Afform", "prefill", {
    name: formName,
    args,
    fillMode: join === undefined ? "entity" : "join",
  });
  const item = result.find((candidate) => candidate.name === entity);
  if (!item)
    throw new Error(`Afform.prefill returned no ${entity} for ${field} = ${JSON.stringify(id)}`);
  if (join !== undefined) {
    const record = joinRecord(item, scope);
    return {
      apply: (data) =>
        replaceRecord(data, scope, { ...currentRecord(data, scope), ...record }, false),
      filled: previous,
    };
  }
  const loaded = firstPrefilled(item);
  // Other entities the server filled from this record, e.g. by a relationship autofill.
  const others = result.filter((candidate) => candidate.name !== entity);
  const filled: Filled = {};
  return {
    apply: (current) => {
      const reset = unfill(current, previous, entities);
      const data = applyPrefill(reset, others, entities);
      for (const other of others)
        for (const position of Object.keys(other.values)) {
          const after = data[other.name]?.[Number(position)];
          const before = reset[other.name]?.[Number(position)];
          if (after) (filled[other.name] ??= {})[position] = structuredClone({ before, after });
        }
      return replaceRecord(
        data,
        scope,
        { ...currentRecord(data, scope), ...loaded?.fields, ...entities[entity]?.data },
        false,
        loaded?.joins,
      );
    },
    filled,
  };
}

// deviation:autofill-clear-resets-related
/** Returns each filled item the user left untouched to how it stood before, else to preset data. */
function unfill(data: FormData, filled: Filled, entities: Record<string, EntityDeclaration>) {
  const next = structuredClone(data);
  for (const [name, records] of Object.entries(filled)) {
    const items = next[name];
    if (!items) continue;
    // From the last item down, so removing an item the selection added keeps the others' places.
    const entries = Object.entries(records).sort(([a], [b]) => Number(b) - Number(a));
    for (const [index, { before, after }] of entries) {
      const position = Number(index);
      if (!same(items[position], after)) continue;
      if (before) items[position] = before;
      else if (position > 0 && position === items.length - 1) items.pop();
      else items[position] = { fields: { ...entities[name]?.data }, joins: {} };
    }
  }
  return next;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function currentRecord(data: FormData, { entity, index, join, joinIndex }: Scope): Values {
  const entityItem = data[entity]?.[index];
  return (
    (join === undefined ? entityItem?.fields : entityItem?.joins?.[join]?.[joinIndex ?? 0]) ?? {}
  );
}

/** Writes the record; `clearJoins` drops the entity's join records, `joins` merges loaded ones. */
function replaceRecord(
  data: FormData,
  { entity, index, join, joinIndex }: Scope,
  record: Values,
  clearJoins: boolean,
  joins?: Record<string, (Values | null)[]>,
): FormData {
  const next = structuredClone(data);
  const items = (next[entity] ??= []);
  const entityItem = (items[index] ??= { fields: {}, joins: {} });
  if (join === undefined) {
    entityItem.fields = record;
    entityItem.joins = clearJoins ? {} : { ...entityItem.joins, ...joins };
    return next;
  }
  const records = ((entityItem.joins ??= {})[join] ??= []);
  records[joinIndex ?? 0] = record;
  return next;
}
