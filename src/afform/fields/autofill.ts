import { api4 } from "../../api/civi";
import { firstPrefilled, type EntityDeclaration, type PrefillItem } from "../model";
import type { FormData, Scope, Values } from "../types";

type Join = Record<string, Values>;

/** A join record of a prefill result; `joins` lists may arrive as objects keyed by index. */
function joinRecord(item: PrefillItem, scope: Scope): Values | undefined {
  const entityItem = firstPrefilled(item);
  const join: unknown = scope.join === undefined ? undefined : entityItem?.joins?.[scope.join];
  if (join === null || typeof join !== "object") return undefined;
  const records: Join = { ...join };
  return records[String(scope.joinIndex ?? 0)];
}

/**
 * afForm's loadData() for one record: the record the autofill field selects fills its entity
 * or join record; clearing it resets the entity to its preset data, or empties the join record.
 */
export async function loadSelected(
  formName: string,
  scope: Scope,
  field: string,
  id: unknown,
  entities: Record<string, EntityDeclaration>,
): Promise<(data: FormData) => FormData> {
  const { entity, index, join } = scope;
  const joinIndex = scope.joinIndex ?? 0;
  const empty = id === null || id === undefined || id === "" || (Array.isArray(id) && !id.length);
  if (empty)
    return (data) =>
      replaceRecord(data, scope, join === undefined ? { ...entities[entity]?.data } : {}, true);
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
    return (data) =>
      replaceRecord(data, scope, { ...currentRecord(data, scope), ...record }, false);
  }
  const loaded = firstPrefilled(item);
  return (data) =>
    replaceRecord(
      data,
      scope,
      { ...currentRecord(data, scope), ...loaded?.fields, ...entities[entity]?.data },
      false,
      loaded?.joins,
    );
}

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
