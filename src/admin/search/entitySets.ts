import { getDefaultLabel, parseExpr, type ApiParams, type SearchInfo } from "./expr";
import { fnState, writeExpr } from "./fn";
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
  const alias = first && firstExpr ? parseExpr(meta, firstExpr, infoOf(first)).alias : undefined;
  const target = alias?.split(":")[0];
  const outer: SearchInfo = { api_entity: "EntitySet", api_params: params };
  const outerMeta = withEntitySetFields(meta, params);
  // A field another row still selects keeps its outer columns, but for this row's own.
  // deviation:union-remove-row-keeps-shared-field
  const shared =
    first?.[3].select.some(
      (expr, row) =>
        row !== index &&
        expr &&
        parseExpr(meta, expr, infoOf(first)).alias.split(":")[0] === target,
    ) ?? false;
  const select = shared
    ? params.select.filter((col) => col !== alias)
    : target
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

/**
 * removeEntitySet: without the first set, the next one's empty rows go and it names the columns,
 * in the outer references too. deviation:union-remove-first-renames-outer
 */
export function removeEntitySet(
  meta: SearchAdminMetadata,
  params: ApiParams,
  index: number,
): ApiParams {
  const sets = setsOf(params).filter((_, i) => i !== index);
  const next = sets[0];
  if (index !== 0 || !next) return { ...params, sets };
  const empty = next[3].select.flatMap((field, i) => (field === null ? [i] : []));
  const trimmed = [...empty]
    .reverse()
    .reduce((acc, row) => removeEntitySetRow(meta, acc, row), params);
  const [first, ...rest] = setsOf(trimmed);
  if (!first || !rest[0]) return params;
  return { ...renameColumns(meta, trimmed, first, rest[0]), sets: rest };
}

const LOGIC = ["AND", "OR", "NOT"];

/** Clauses with each field passed through `rename`: groups, and a value that is a field too. */
function renameInClauses(clauses: unknown[][], rename: (key: string) => string): unknown[][] {
  return clauses.map((clause) => {
    const [head, group] = clause;
    if (typeof head === "string" && LOGIC.includes(head) && Array.isArray(group))
      return [head, renameInClauses(group.filter(Array.isArray), rename)];
    const next = [...clause];
    if (typeof head === "string") next[0] = rename(head);
    if (next[3] === true && typeof next[2] === "string") next[2] = rename(next[2]);
    return next;
  });
}

/** The outer params with the columns of set `from` renamed to those of set `to`, row by row. */
function renameColumns(
  meta: SearchAdminMetadata,
  params: ApiParams,
  from: EntitySet,
  to: EntitySet,
): ApiParams {
  // Every rename is taken from the old names at once, so names that swap do not merge.
  const renamed = new Map<string, string>();
  const fields = new Map<string, string>();
  const suffixes = new Map<string, string[]>();
  const base = (set: EntitySet, row: number) => {
    const expr = set[3].select[row];
    return expr ? parseExpr(meta, expr, infoOf(set)).alias.split(":")[0] : undefined;
  };
  // A field that a row keeps still names that row's references.
  const kept = new Set(
    to[3].select.flatMap((_, row) => (base(from, row) === base(to, row) ? [base(to, row)] : [])),
  );
  to[3].select.forEach((expr, row) => {
    const before = from[3].select[row];
    if (!before || !expr || before === expr) return;
    const was = parseExpr(meta, before, infoOf(from)).alias;
    const now = parseExpr(meta, expr, infoOf(to)).alias;
    if (!was || !now || was === now) return;
    renamed.set(was, now);
    // Conditions, grouping and sorting name the field without its suffix, or with one of theirs.
    const [wasField = was, nowField = now] = [was.split(":")[0], now.split(":")[0]];
    if (wasField !== nowField && !kept.has(wasField) && !kept.has(nowField))
      fields.set(wasField, nowField);
    suffixes.set(nowField, parseExpr(meta, expr, infoOf(to)).args[0]?.field?.suffixes ?? []);
  });
  const rename = (key: string) => {
    const field = key.split(":")[0] ?? key;
    const now = fields.get(field);
    const suffix = key.slice(field.length);
    // A suffix the new field lacks would make the reference invalid; it stays as in core.
    if (now === undefined || (suffix && !suffixes.get(now)?.includes(suffix.slice(1)))) return key;
    return now + suffix;
  };
  // Having, grouping and sorting may name an outer column by its alias, which stays.
  const aliases = new Set(params.select.flatMap((col) => col.split(" AS ")[1] ?? []));
  const renameRef = (key: string) => (aliases.has(key) ? key : rename(key));
  const outerMeta = withEntitySetFields(meta, params);
  const renameInFunction = (col: string) => {
    const state = fnState(outerMeta, col, { api_entity: "EntitySet", api_params: params });
    const args = state.args.map((arg) =>
      arg.type === "field" ? { ...arg, value: rename(String(arg.value)) } : arg,
    );
    if (!state.fn || args.every((arg, i) => arg.value === state.args[i]?.value)) return col;
    const [written = ""] = writeExpr({ ...state, args }, "select").split(" AS ");
    const [stored = col, alias] = col.split(" AS ");
    // writeExpr adds ":label" to a function with options; a stored expression may go without.
    const expr = stored.endsWith(":label") ? written : written.replace(/:label$/, "");
    return alias === undefined ? expr : `${expr} AS ${alias}`;
  };
  const renameColumn = (col: string) => {
    if (col.includes("(")) return renameInFunction(col);
    const [expr = col, alias] = col.split(" AS ");
    return alias === undefined ? rename(expr) : `${rename(expr)} AS ${alias}`;
  };
  return !renamed.size
    ? params
    : {
        ...params,
        select: params.select.map((col) => renamed.get(col) ?? renameColumn(col)),
        ...(params.where && { where: renameInClauses(params.where, rename) }),
        ...(params.having && { having: renameInClauses(params.having, renameRef) }),
        ...(params.groupBy && { groupBy: params.groupBy.map(renameRef) }),
        ...(params.orderBy && {
          orderBy: Object.fromEntries(
            Object.entries(params.orderBy).map(([key, dir]) => [renameRef(key), dir]),
          ),
        }),
      };
}

/**
 * A set's params changed; a renamed column of the first set is renamed in the outer select,
 * conditions, grouping and sorting. deviation:union-rename-outer-references
 */
export function setEntitySet(
  meta: SearchAdminMetadata,
  params: ApiParams,
  index: number,
  inner: SetParams,
): ApiParams {
  const sets = setsOf(params);
  const old = sets[index];
  if (!old) return params;
  const outer =
    index === 0 ? renameColumns(meta, params, old, [old[0], old[1], old[2], inner]) : params;
  return {
    ...outer,
    sets: sets.map((set, i): EntitySet => (i === index ? [set[0], set[1], set[2], inner] : set)),
  };
}

/** A set's joins or grouping changed: the cells realign, and a row the first set loses leaves every set. */
// deviation:union-join-keeps-rows
export function setEntitySetQuery(
  meta: SearchAdminMetadata,
  params: ApiParams,
  index: number,
  next: ApiParams,
): ApiParams {
  const old = setsOf(params)[index]?.[3].select ?? [];
  const select = realign(old, next.select);
  // The outer columns come from the first set, so it keeps no empty cell.
  const dropped =
    index === 0
      ? select.flatMap((col, row) => (col === null && old[row] !== null ? [row] : []))
      : [];
  const pruned = [...dropped]
    .reverse()
    .reduce((acc, row) => removeEntitySetRow(meta, acc, row), params);
  return setEntitySet(meta, pruned, index, {
    ...next,
    select: select.filter((_, row) => !dropped.includes(row)),
  });
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
    // A function with a result type of its own, such as COUNT, is no longer its field; an
    // equation (core's function "e") keeps it. deviation:union-function-column-type
    const typed = info.fn?.name === "e" ? undefined : info.fn?.data_type;
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
