import type { PickerOption } from "../widgets/Picker";
import {
  getEntity,
  getField,
  getJoin,
  reconcileAggregateColumns,
  type ApiParams,
  type SearchInfo,
} from "./expr";
import type { SearchAdminMetadata } from "./meta";

export type JoinType = "LEFT" | "INNER" | "EXCLUDE";

export const joinTypes = (): { key: JoinType; label: string }[] => [
  { key: "LEFT", label: ts("With (optional)") },
  { key: "INNER", label: ts("With (required)") },
  { key: "EXCLUDE", label: ts("Without") },
];

export const isJoinType = (value: unknown): value is JoinType =>
  value === "LEFT" || value === "INNER" || value === "EXCLUDE";

const joinName = (clause: unknown[]) => (typeof clause[0] === "string" ? clause[0] : "");
const addNum = (name: string, num: number) => `${name}${num < 10 ? "_0" : "_"}${String(num)}`;

/**
 * getJoinEntities: the joins the search can add, numbered past the ones it has; a join it has
 * offers the joins from its entity, listed under its label.
 */
export function joinEntities(meta: SearchAdminMetadata, search: SearchInfo): PickerOption[] {
  const existing = new Set(
    (search.api_params.join ?? []).flatMap((clause) => {
      const alias = joinName(clause).split(" AS ")[1];
      return alias ? [alias] : [];
    }),
  );
  const forEntity = (
    entity: string,
    stack: string,
    baseEntity: string | undefined,
    group?: string,
  ): PickerOption[] =>
    (meta.joins[entity] ?? []).flatMap((join) => {
      if ((baseEntity === join.entity && !join.multi) || getEntity(meta, join.entity)?.bridge)
        return [];
      const options: PickerOption[] = [];
      let num = 0;
      let alias: string;
      do {
        num++;
        alias = addNum((stack ? `${stack}_` : "") + join.alias, num);
        const label = join.label + (num > 1 ? ` ${String(num)}` : "");
        if (existing.has(alias))
          options.push(
            ...forEntity(join.entity, alias, entity, group ? `${group} - ${label}` : label),
          );
        else
          options.push({
            id: `${join.entity} AS ${alias}`,
            label,
            description: join.description,
            icon: getEntity(meta, join.entity)?.icon,
            group,
          });
      } while (existing.has(alias));
      return options;
    });
  return forEntity(search.api_entity, "", undefined);
}

/** addJoin: the join with its fixed and default conditions, and the joined entity's search fields. */
export function addJoin(
  meta: SearchAdminMetadata,
  search: SearchInfo,
  value: string,
  joinType: JoinType,
): ApiParams {
  const join = getJoin(meta, search, value);
  if (!join) throw new Error(ts("Unknown join %1.", { 1: value }));
  const clause = [
    value,
    joinType,
    ...structuredClone(join.conditions),
    ...structuredClone(join.defaults),
  ];
  const select = [...search.api_params.select];
  const entity = getEntity(meta, join.entity);
  if (entity?.search_fields && joinType !== "EXCLUDE") {
    for (const fieldName of entity.search_fields) {
      // Skips a field whose name a column already has, as core does against duplicates.
      const simpleName = fieldName.split(".").at(-1) ?? fieldName;
      if (select.join(",").includes(simpleName)) continue;
      if (getField(meta, fieldName, { api_entity: join.entity, api_params: { select: [] } }))
        select.push(`${join.alias}.${fieldName}`);
    }
  }
  return { ...search.api_params, join: [...(search.api_params.join ?? []), clause], select };
}

const clauseUsesJoin = (clause: unknown, alias: string): boolean => {
  if (!Array.isArray(clause)) return false;
  if (typeof clause[0] === "string" && clause[0].startsWith(`${alias}.`)) return true;
  if (clause[3] === true && typeof clause[2] === "string" && clause[2].startsWith(`${alias}.`))
    return true;
  return Array.isArray(clause[1]) && clause[1].some((sub: unknown) => clauseUsesJoin(sub, alias));
};

const exprUsesJoin = (expr: string, alias: string): boolean =>
  new RegExp(`(^|[^\\w.])${alias}\\.`).test(expr.split(" AS ")[0] ?? expr);

/** removeJoinStuff: a join's columns, conditions, groupings, nested joins and label leave with it. */
// deviation:join-removal-prunes-expressions
function withoutJoinParts(
  meta: SearchAdminMetadata,
  search: SearchInfo,
  alias: string,
): SearchInfo {
  const params = search.api_params;
  const aliasOf = (clause: unknown[]) => getJoin(meta, search, joinName(clause))?.alias ?? "";
  const nested = (params.join ?? []).map(aliasOf).filter((other) => other.startsWith(`${alias}_`));
  const gone = [alias, ...nested];
  const uses = (clause: unknown) => gone.some((a) => clauseUsesJoin(clause, a));
  const joinLabels = { ...search.form_values?.join };
  for (const a of gone) delete joinLabels[a];
  const groupBy = params.groupBy?.filter((expr) => !gone.some((a) => exprUsesJoin(expr, a)));
  const next: ApiParams = {
    ...params,
    select: params.select.filter((col) => !gone.some((a) => exprUsesJoin(col, a))),
    ...(groupBy ? { groupBy } : {}),
    ...(params.where ? { where: params.where.filter((clause) => !uses(clause)) } : {}),
    ...(params.join
      ? { join: params.join.filter((clause) => !nested.includes(aliasOf(clause))) }
      : {}),
  };
  // Aggregates that a removed grouping required unwrap, as changeGroupBy does.
  const regrouped = groupBy?.length !== params.groupBy?.length;
  return {
    ...search,
    api_params: regrouped
      ? {
          ...next,
          select: [...new Set(reconcileAggregateColumns(meta, { ...search, api_params: next }))],
        }
      : next,
    ...(search.form_values ? { form_values: { ...search.form_values, join: joinLabels } } : {}),
  };
}

export function removeJoin(
  meta: SearchAdminMetadata,
  search: SearchInfo,
  index: number,
): SearchInfo {
  const clause = search.api_params.join?.[index];
  const alias = clause ? getJoin(meta, search, joinName(clause))?.alias : undefined;
  const join = (search.api_params.join ?? []).filter((_, i) => i !== index);
  const without = { ...search, api_params: { ...search.api_params, join } };
  return alias ? withoutJoinParts(meta, without, alias) : without;
}

/** changeJoinType: an excluding join keeps no columns or conditions of its own. */
export function changeJoinType(
  meta: SearchAdminMetadata,
  search: SearchInfo,
  index: number,
  joinType: JoinType,
): SearchInfo {
  const joins = (search.api_params.join ?? []).map((clause, i) =>
    i === index ? [clause[0], joinType, ...clause.slice(2)] : clause,
  );
  const changed = { ...search, api_params: { ...search.api_params, join: joins } };
  const clause = joins[index];
  const alias = clause ? getJoin(meta, changed, joinName(clause))?.alias : undefined;
  return joinType === "EXCLUDE" && alias ? withoutJoinParts(meta, changed, alias) : changed;
}

/** getSetJoinLabel's setter: the default label or nothing removes the stored one. */
export function setJoinLabel(
  meta: SearchAdminMetadata,
  search: SearchInfo,
  name: string,
  label: string,
): SearchInfo["form_values"] {
  const join = getJoin(meta, search, name);
  if (!join) return search.form_values;
  const labels = { ...search.form_values?.join };
  if (!label || label === join.defaultLabel) delete labels[join.alias];
  else labels[join.alias] = label;
  return { ...search.form_values, join: labels };
}
