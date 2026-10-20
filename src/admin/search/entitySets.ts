import { getDefaultLabel, parseExpr, type ApiParams, type SearchInfo } from "./expr";
import type { SchemaField, SearchAdminMetadata } from "./meta";

/** A set's params; a column the set's entity lacks is null, so rows line up across sets. */
export interface SetParams {
  select: (string | null)[];
  where?: unknown[][];
  join?: unknown[][];
  groupBy?: string[];
  having?: unknown[][];
  [key: string]: unknown;
}

/** One set of an EntitySet search: operation, entity, action and the inner search's params. */
export type EntitySet = [string, string, string, SetParams];

const isParams = (value: unknown): value is SetParams =>
  typeof value === "object" &&
  value !== null &&
  "select" in value &&
  Array.isArray(value.select) &&
  value.select.every((col: unknown) => col === null || typeof col === "string");

const columns = (select: (string | null)[]) => select.filter((col) => col !== null);

/** The sets of an EntitySet search, checked; a malformed set is an error, not skipped. */
export function setsOf(params: ApiParams): EntitySet[] {
  return (params.sets ?? []).map((set, index) => {
    const [op, entity, action, inner] = set;
    if (
      typeof op !== "string" ||
      typeof entity !== "string" ||
      typeof action !== "string" ||
      !isParams(inner)
    )
      throw new Error(ts("Search set %1 is malformed.", { 1: index + 1 }));
    return [op, entity, action, inner];
  });
}

const infoOf = (set: EntitySet): SearchInfo => ({
  api_entity: set[1],
  api_params: { ...set[3], select: columns(set[3].select) },
});

/** A column of the first set kept for another entity only when that entity has the field. */
function ifExists(
  meta: SearchAdminMetadata,
  entity: string,
  params: SetParams,
  expr: string | null,
) {
  if (!expr) return null;
  return parseExpr(meta, expr, {
    api_entity: entity,
    api_params: { ...params, select: columns(params.select) },
  }).args.some((arg) => arg.type === "field")
    ? expr
    : null;
}

/** addEntitySet: a new set with the first set's operation and the columns its entity has. */
export function addEntitySet(
  meta: SearchAdminMetadata,
  params: ApiParams,
  entity: string,
): ApiParams {
  const sets = setsOf(params);
  const first = sets[0];
  const select = (first?.[3].select ?? []).map((expr) =>
    ifExists(meta, entity, { select: [] }, expr),
  );
  const set = [first?.[0] ?? "UNION ALL", entity, "get", { select, where: [] }];
  return { ...params, sets: [...sets, set] };
}

/** addEntitySetRow: a column in the outer search and in every set that has the field. */
export function addEntitySetRow(
  meta: SearchAdminMetadata,
  params: ApiParams,
  field: string,
): ApiParams {
  const sets = setsOf(params).map(([op, entity, action, inner]) => [
    op,
    entity,
    action,
    { ...inner, select: [...inner.select, ifExists(meta, entity, inner, field)] },
  ]);
  return { ...params, select: [...params.select, field], sets };
}

/** removeEntitySetRow: the row from every set, and the outer columns built on its field. */
export function removeEntitySetRow(
  meta: SearchAdminMetadata,
  params: ApiParams,
  index: number,
): ApiParams {
  const sets = setsOf(params);
  const first = sets[0];
  const firstExpr = first?.[3].select[index];
  const target =
    first && firstExpr ? parseExpr(meta, firstExpr, infoOf(first)).alias.split(":")[0] : undefined;
  const outer: SearchInfo = { api_entity: "EntitySet", api_params: params };
  const outerMeta = withEntitySetFields(meta, params);
  const select = target
    ? params.select.filter(
        (col) =>
          !parseExpr(outerMeta, col, outer).args.some(
            (arg) => arg.type === "field" && (arg.path === target || arg.field?.name === target),
          ),
      )
    : params.select;
  return {
    ...params,
    select,
    sets: sets.map(([op, entity, action, inner]) => [
      op,
      entity,
      action,
      { ...inner, select: inner.select.filter((_, i) => i !== index) },
    ]),
  };
}

/** removeEntitySet: without the first set, the next one's empty rows go and it names the columns. */
export function removeEntitySet(params: ApiParams, index: number): ApiParams {
  const sets = setsOf(params).filter((_, i) => i !== index);
  const first = sets[0];
  if (index !== 0 || !first) return { ...params, sets };
  const empty = new Set(first[3].select.flatMap((field, i) => (field === null ? [i] : [])));
  const trimmed = sets.map(
    ([op, entity, action, inner]): EntitySet => [
      op,
      entity,
      action,
      { ...inner, select: inner.select.filter((_, i) => !empty.has(i)) },
    ],
  );
  const select = columns(trimmed[0]?.[3].select ?? []).map(
    (field) => field.split(" AS ").at(-1) ?? field,
  );
  return { ...params, select, sets: trimmed };
}

/** A set's params changed; a renamed column of the first set renames the outer column too. */
export function setEntitySet(
  meta: SearchAdminMetadata,
  params: ApiParams,
  index: number,
  inner: SetParams,
): ApiParams {
  const sets = setsOf(params);
  const old = sets[index];
  if (!old) return params;
  let select = params.select;
  if (index === 0)
    inner.select.forEach((expr, row) => {
      const before = old[3].select[row];
      if (!before || !expr || before === expr) return;
      const was = parseExpr(meta, before, infoOf(old)).alias;
      const now = parseExpr(meta, expr, infoOf([old[0], old[1], old[2], inner])).alias;
      if (was && now && was !== now) select = select.map((col) => (col === was ? now : col));
    });
  return {
    ...params,
    select,
    sets: sets.map((set, i): EntitySet => (i === index ? [set[0], set[1], set[2], inner] : set)),
  };
}

/** updateEntitySetFields: the outer search's fields are the first set's columns, labelled across sets. */
export function withEntitySetFields(
  meta: SearchAdminMetadata,
  params: ApiParams,
): SearchAdminMetadata {
  const index = meta.schema.findIndex((entity) => entity.name === "EntitySet");
  const entitySet = meta.schema[index];
  if (!entitySet) return meta;
  const sets = setsOf(params);
  const first = sets[0];
  if (!first) return meta;
  const fields: SchemaField[] = first[3].select.flatMap((expr, row) => {
    if (expr === null) return [];
    const info = parseExpr(meta, expr, infoOf(first));
    // A function with a result type of its own, such as COUNT, is no longer its field.
    // deviation:union-function-column-type
    const typed = info.fn?.data_type;
    const base = typed ? undefined : info.args.find((arg) => arg.type === "field")?.field;
    const name = info.alias.split(":")[0] ?? info.alias;
    const labels = sets.flatMap((set) => {
      const setExpr = set[3].select[row];
      return setExpr ? [getDefaultLabel(meta, setExpr, infoOf(set))] : [];
    });
    return [
      {
        ...(base
          ? structuredClone(base)
          : { type: "Field", data_type: typed ?? info.data_type ?? "String" }),
        name,
        fieldName: name,
        label: [...new Set(labels.filter(Boolean))].join(" / "),
        data_type: typed ?? base?.data_type ?? info.data_type ?? "String",
      },
    ];
  });
  const schema = [...meta.schema];
  schema[index] = { ...entitySet, fields };
  return { ...meta, schema };
}

/**
 * A set's columns after its joins or grouping changed them: positions stay, a removed column
 * becomes null and an added one is dropped, so every set keeps selecting as many columns.
 */
// deviation:union-join-keeps-rows
export function realign(original: (string | null)[], next: string[]): (string | null)[] {
  const filled = original.flatMap((col, i) => (col === null ? [] : [i]));
  if (next.length >= filled.length) {
    const result = [...original];
    filled.forEach((position, i) => {
      result[position] = next[i] ?? null;
    });
    return result;
  }
  return original.map((col) => (col !== null && next.includes(col) ? col : null));
}
