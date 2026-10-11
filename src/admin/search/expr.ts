import { md5 } from "../md5";
import type { PickerOption } from "../widgets/Picker";
import type {
  FunctionParam,
  JoinDefinition,
  SchemaEntity,
  SchemaField,
  SearchAdminMetadata,
  SqlFunction,
} from "./meta";

/** A saved search's `api_params`; keys core does not name here pass through untouched. */
export interface ApiParams {
  version?: number;
  select: string[];
  where?: unknown[][];
  having?: unknown[][];
  join?: unknown[][];
  groupBy?: string[];
  orderBy?: Record<string, string>;
  sets?: unknown[][];
  [key: string]: unknown;
}

/** What searchMeta calls a saved search: the entity, its parameters and the join labels. */
export interface SearchInfo {
  api_entity: string;
  api_params: ApiParams;
  form_values?: { join?: Record<string, string>; [key: string]: unknown };
}

export interface JoinInfo extends JoinDefinition {
  defaultLabel: string;
  baseEntity: string;
  icon?: string | null;
}

export type ArgType = "field" | "string" | "number";

export interface ExprArg {
  type: ArgType | null;
  value: string | number;
  data_type?: string | null;
  path?: string;
  field?: SchemaField;
  join?: JoinInfo;
  prefix?: string;
  suffix?: string;
  param?: string | number;
  flag_before?: string;
  flag_after?: string;
  name?: string;
  optional?: boolean;
}

export interface ExprInfo {
  fn: SqlFunction | null;
  args: ExprArg[];
  alias: string;
  data_type: string | null;
  suffix?: string;
}

export const getEntity = (meta: SearchAdminMetadata, name: string | undefined) =>
  name ? meta.schema.find((entity) => entity.name === name) : undefined;

/** getJoin: the join an alias such as `Contact_Email_contact_id_01` names, with its label. */
export function getJoin(
  meta: SearchAdminMetadata,
  search: SearchInfo,
  fullNameOrAlias: string,
): JoinInfo | undefined {
  const alias = fullNameOrAlias.split(" AS ").at(-1) ?? "";
  let path = alias;
  let baseEntity = search.api_entity;
  const labels: string[] = [];
  let join: JoinDefinition | undefined;
  while (path.length) {
    const rest = path;
    join = (meta.joins[baseEntity] ?? []).find((j) => new RegExp(`^${j.alias}_\\d\\d`).test(rest));
    if (!join) return undefined;
    path = path.replace(`${join.alias}_`, "");
    const num = Number.parseInt(path.slice(0, 2), 10);
    labels.push(join.label + (num > 1 ? ` ${String(num)}` : ""));
    path = path.replace(/^\d\d_?/, "");
    if (path.length) baseEntity = join.entity;
  }
  if (!join) return undefined;
  const found = join;
  const defaultLabel = labels.join(" - ");
  // A numbered join's conditions name its alias; a deep join's also its base entity's prefix.
  const prefix = alias.replace(new RegExp(`_?${found.alias}_?\\d?\\d?$`), "");
  const replaceRefs = (condition: unknown) =>
    !Array.isArray(condition)
      ? condition
      : condition.map((ref: unknown, side) => {
          if (side === 1 || typeof ref !== "string") return ref;
          if (ref.includes(`${found.alias}.`)) return ref.replace(`${found.alias}.`, `${alias}.`);
          if (prefix && !ref.startsWith(`${prefix}.`) && !ref.includes('"') && !ref.includes("'"))
            return `${prefix}.${ref}`;
          return ref;
        });
  return {
    ...structuredClone(found),
    conditions: found.conditions.map(replaceRefs),
    defaults: found.defaults.map(replaceRefs),
    label: search.form_values?.join?.[alias] ?? defaultLabel,
    defaultLabel,
    alias,
    baseEntity,
    icon: getEntity(meta, found.entity)?.icon,
  };
}

/** getFieldAndJoin: the field a path names, through an explicit join or a bridge. */
export function getFieldAndJoin(
  meta: SearchAdminMetadata,
  fieldName: string,
  search: SearchInfo,
): { field?: SchemaField; join?: JoinInfo; baseEntity: string } {
  let entityName = search.api_entity;
  const dotSplit = (fieldName.split(":")[0] ?? "").split(".");
  let join: JoinInfo | undefined;
  if (dotSplit.length > 1) {
    join = getJoin(meta, search, dotSplit[0] ?? "");
    if (join) {
      dotSplit.shift();
      entityName = join.entity;
    }
  }
  const name = dotSplit.join(".");
  let field = getEntity(meta, entityName)?.fields.find((f) => f.name === name);
  if (!field && join?.bridge)
    field = getEntity(meta, join.bridge)?.fields.find((f) => f.name === name);
  field ??= meta.pseudoFields.find((f) => f.name === name);
  return { field, join, baseEntity: entityName };
}

export const getField = (meta: SearchAdminMetadata, fieldName: string, search: SearchInfo) =>
  getFieldAndJoin(meta, fieldName, search).field;

/** parseArg: a number, a quoted string, or a field path. */
function parseArg(meta: SearchAdminMetadata, raw: string, search: SearchInfo): ExprArg | undefined {
  const arg = raw.trim();
  if (arg && !Number.isNaN(Number(arg)))
    return {
      type: "number",
      data_type: Number.isInteger(Number(arg)) ? "Integer" : "Float",
      value: Number(arg),
    };
  if (arg.startsWith('"') || arg.startsWith("'"))
    return { type: "string", data_type: "String", value: arg.slice(1, -1) };
  if (!arg) return undefined;
  const { field, join } = getFieldAndJoin(meta, arg, search);
  if (!field) return undefined;
  const [path = "", suffix] = arg.split(":");
  const prefixPos = path.lastIndexOf(field.name);
  return {
    type: "field",
    value: arg,
    path,
    field,
    data_type: field.data_type,
    join,
    prefix: prefixPos > 0 ? path.slice(0, prefixPos) : "",
    suffix: suffix ? `:${suffix}` : "",
  };
}

const flagKeys = (flags: Record<string, string> | undefined) => Object.keys(flags ?? {});

/** parseFnArgs: a function call's arguments, flags and named parts, by its parameters. */
function parseFnArgs(
  meta: SearchAdminMetadata,
  info: ExprInfo,
  expr: string,
  search: SearchInfo,
): void {
  const matches = /([_A-Z]*)\((.*)\)(:[a-z]+)?$/.exec(expr);
  const fnName = matches?.[1] ?? "";
  let argString = matches?.[2] ?? "";
  info.fn = meta.functions.find((fn) => fn.name === (fnName || "e")) ?? null;
  info.data_type = info.fn?.data_type ?? null;
  info.suffix = matches?.[3];
  if (!info.fn) return;

  const keyword = (allowed: string[]): string | undefined => {
    const flag = allowed
      .filter(Boolean)
      .find(
        (f) => argString.startsWith(`${f} `) || argString.startsWith(`${f},`) || argString === f,
      );
    if (flag) argString = argString.slice(flag.length).trim();
    return flag;
  };
  const nextExpr = (): ExprArg | undefined => {
    const quoted = argString.startsWith('"')
      ? /"([^"\\]|\\.)*"/.exec(argString)
      : argString.startsWith("'")
        ? /'([^'\\]|\\.)*'/.exec(argString)
        : /[^ ,]+/.exec(argString);
    const text = quoted?.[0];
    if (!text) return undefined;
    argString = argString.slice(text.length).trim();
    return parseArg(meta, text, search);
  };

  info.fn.params.forEach((param: FunctionParam, index) => {
    argString = argString.trim();
    if (!argString.length || (param.name && !argString.startsWith(`${param.name} `))) return;
    if (param.max_expr) {
      let count = 0;
      while (++count <= param.max_expr && argString.length) {
        const flagBefore = keyword(flagKeys(param.flag_before));
        const name = keyword(param.name ? [param.name] : []);
        const arg = nextExpr();
        if (!arg) break;
        arg.param = param.name ?? index;
        arg.flag_before = flagBefore;
        arg.name = name;
        const mustBe = param.must_be ?? [];
        if (arg.type === "string" && !mustBe.includes("SqlString")) {
          if (mustBe.includes("SqlNumber")) {
            arg.type = "number";
            arg.data_type =
              arg.value === "" || Number.isInteger(Number(arg.value)) ? "Integer" : "Float";
            if (arg.value !== "" && !Number.isNaN(Number(arg.value))) arg.value = Number(arg.value);
          } else if (mustBe.includes("SqlField")) arg.type = "field";
        }
        info.args.push(arg);
        keyword([","]);
      }
      const last = info.args.at(-1);
      if (last && flagKeys(param.flag_after).length)
        last.flag_after = keyword(flagKeys(param.flag_after));
    } else if (param.flag_before && !param.optional) {
      info.args.push({ type: null, value: "", flag_before: keyword(flagKeys(param.flag_before)) });
      keyword([","]);
    }
  });
  if (!info.data_type && info.args.length) info.data_type = info.args[0]?.data_type ?? null;
}

const isPseudoField = (meta: SearchAdminMetadata, name: string) =>
  meta.pseudoFields.some((field) => field.name === name);

/** parseExpr: a select, group-by or clause expression as its function, arguments and alias. */
export function parseExpr(meta: SearchAdminMetadata, expr: string, search: SearchInfo): ExprInfo {
  const splitAs = expr.split(" AS ");
  const info: ExprInfo = { fn: null, args: [], alias: splitAs.at(-1) ?? expr, data_type: null };
  const body = splitAs[0] ?? "";
  if (expr.includes("(") && !isPseudoField(meta, expr)) {
    parseFnArgs(meta, info, body, search);
    return info;
  }
  const arg = parseArg(meta, body, search);
  if (arg) {
    arg.param = 0;
    info.data_type = arg.data_type ?? null;
    info.args.push(arg);
  }
  return info;
}

export const hasFunction = (expr: unknown) => typeof expr === "string" && expr.includes("(");

/** getDefaultLabel: "(Function) Join: Field" for a column without a label of its own. */
export function getDefaultLabel(
  meta: SearchAdminMetadata,
  col: string,
  search: SearchInfo,
): string {
  const info = parseExpr(meta, col, search);
  const parts: string[] = info.fn ? [`(${info.fn.title})`] : [];
  for (const arg of info.args) {
    if (arg.join) parts.push(`${getJoin(meta, search, arg.join.alias)?.label ?? arg.join.label}:`);
    parts.push(arg.field ? arg.field.label : String(arg.value));
  }
  return parts.join(" ");
}

/** getColorField: the `:color` suffix or a sibling `color` field that colours a column. */
export function getColorField(
  meta: SearchAdminMetadata,
  fieldExpr: string,
  search: SearchInfo,
): string | null {
  const field = getField(meta, fieldExpr, search);
  if (!field) return null;
  const pathPart = fieldExpr.split(":")[0] ?? "";
  const lastDot = pathPart.lastIndexOf(".");
  const prefix = lastDot >= 0 ? pathPart.slice(0, lastDot + 1) : "";
  const fieldName = lastDot >= 0 ? pathPart.slice(lastDot + 1) : pathPart;
  if (fieldName === "color") return null;
  if ((field.suffixes ?? []).includes("color")) return `${prefix}${fieldName}:color`;
  return getField(meta, `${prefix}color`, search) ? `${prefix}color` : null;
}

export interface ColumnDefaults {
  label?: boolean | string;
  sortable?: boolean;
  [key: string]: unknown;
}

/** fieldToColumn: a display column for a select expression. */
export function fieldToColumn(
  meta: SearchAdminMetadata,
  fieldExpr: string,
  defaults: ColumnDefaults,
  search: SearchInfo,
): Record<string, unknown> {
  const info = parseExpr(meta, fieldExpr, search);
  const field = info.args.find((arg) => arg.type === "field")?.field;
  const values: Record<string, unknown> = {
    type: field?.input_type === "RichTextEditor" ? "html" : "field",
    key: info.alias,
    ...defaults,
  };
  if (defaults.label === true) values.label = getDefaultLabel(meta, fieldExpr, search);
  if (defaults.sortable) values.sortable = !!field?.type && field.type !== "Pseudo";
  if (values.type === "field") {
    const colorField = getColorField(meta, fieldExpr, search);
    if (colorField) values.colors = [{ field: colorField }];
  }
  return values;
}

/** CRM.utils.munge, the port of CRM_Utils_String::munge(). */
export function munge(name: string, char = "_", len = 63): string {
  let munged = name.trim().replace(/[^a-zA-Z0-9]+/g, char);
  if (!munged.replace(/_/, "").length)
    munged = Array.from({ length: len }, () =>
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".charAt(
        Math.floor(Math.random() * 62),
      ),
    ).join("");
  return len ? munged.slice(0, len) : munged;
}

/** createSqlName: the SQL column name the server derives from a key (Civi\Search\Meta). */
export function createSqlName(key: string): string {
  const name = key.split(":")[0] ?? "";
  return name.length <= 58 ? munge(name, "_") : munge(name, "_", 42) + md5(name).slice(0, 16);
}

/** getDefaultAggregateFn: the group-by's own function on the field, else by data type. */
export function getDefaultAggregateFn(
  meta: SearchAdminMetadata,
  info: ExprInfo,
  search: SearchInfo,
): string | null {
  const arg = info.args[0];
  if (arg?.suffix) return null;
  let groupByFn: string | undefined;
  for (const groupBy of search.api_params.groupBy ?? []) {
    const expr = parseExpr(meta, groupBy, search);
    if (expr.fn && expr.args.some((a) => a.path === arg?.path)) groupByFn = expr.fn.name;
  }
  if (groupByFn) return groupByFn;
  switch (info.data_type) {
    case "Integer":
      return !info.fn && arg?.field?.name === "id" ? "COUNT" : "SUM";
    case "Float":
    case "Money":
      return "SUM";
  }
  return null;
}

/** mustAggregate: whether grouping requires an aggregate function on the column. */
export function mustAggregate(meta: SearchAdminMetadata, col: string, search: SearchInfo): boolean {
  const groupBy = search.api_params.groupBy ?? [];
  if (!groupBy.length) return false;
  const arg = parseExpr(meta, col, search).args.find((a) => a.type === "field");
  const field = arg?.field;
  if (!arg || !field?.entity || !["Field", "Custom", "Extra"].includes(field.type ?? ""))
    return false;
  if (groupBy.includes(arg.path ?? "")) return false;
  const primaryKey = getEntity(meta, field.entity)?.primary_key[0];
  if (!primaryKey) return true;
  return !groupBy.includes((arg.prefix ?? "") + primaryKey);
}

/** reconcileAggregateColumns: aggregate what grouping requires, unwrap what it no longer does. */
export function reconcileAggregateColumns(meta: SearchAdminMetadata, search: SearchInfo): string[] {
  return search.api_params.select.map((col) => {
    const info = parseExpr(meta, col, search);
    const fieldExpr = String(info.args.find((arg) => arg.type === "field")?.value ?? "");
    if (mustAggregate(meta, col, search)) {
      if (info.fn?.category === "aggregate") return col;
      const fn = getDefaultAggregateFn(meta, info, search) ?? "GROUP_CONCAT";
      const flag = fn === "GROUP_CONCAT" ? "DISTINCT " : "";
      return `${fn}(${flag}${fieldExpr}) AS ${fn}_${fieldExpr.replace(/[.:]/g, "_")}`;
    }
    return info.fn?.category === "aggregate" ? fieldExpr : col;
  });
}

export type FieldType = "Field" | "Custom" | "Extra" | "Filter" | "Pseudo";

/** getAllFields: the fields of the entity, SearchKit's extras and each join, as picker options. */
export function getAllFields(
  meta: SearchAdminMetadata,
  search: SearchInfo,
  suffix: string,
  allowedTypes: FieldType[] = ["Field", "Custom", "Extra", "Filter"],
  disabledIf: (id: string) => boolean = () => false,
  topJoin?: string,
): PickerOption[] {
  const optionsFor = (fields: SchemaField[], group: string, prefix = "") =>
    fields
      .filter((field) => allowedTypes.some((type) => type === field.type))
      .map((field) => {
        const id =
          prefix +
          field.name +
          ((field.suffixes ?? []).includes(suffix.replace(":", "")) ? suffix : "");
        return { id, label: field.label, description: field.description, group };
      })
      .filter((option) => !disabledIf(option.id));
  const forEntity = (entity: SchemaEntity | undefined, group: string, join?: JoinInfo) => {
    if (!entity) return [];
    const prefix = join ? `${join.alias}.` : "";
    const bridge = join?.bridge
      ? (getEntity(meta, join.bridge)?.fields ?? []).filter(
          (field) =>
            !["id", "entity_id", "entity_table"].includes(field.name) &&
            field.fk_entity !== entity.name,
        )
      : [];
    return [...optionsFor(bridge, group, prefix), ...optionsFor(entity.fields, group, prefix)];
  };
  const main = getEntity(meta, search.api_entity);
  const groups: { alias?: string; options: PickerOption[] }[] = [
    { options: forEntity(main, main?.title_plural ?? search.api_entity) },
  ];
  if (allowedTypes.includes("Pseudo"))
    groups.push({ options: optionsFor(meta.pseudoFields, ts("Extra")) });
  for (const clause of search.api_params.join ?? []) {
    const join = typeof clause[0] === "string" ? getJoin(meta, search, clause[0]) : undefined;
    if (join)
      groups.push({
        alias: join.alias,
        options: forEntity(getEntity(meta, join.entity), join.label, join),
      });
  }
  const topAlias = topJoin?.split(" AS ")[1];
  if (topAlias) groups.sort((a, b) => (a.alias === topAlias ? -1 : b.alias === topAlias ? 1 : 0));
  return groups.flatMap((group) => group.options);
}

/** getSelectFields: the search's columns by alias, for HAVING and conditions on results. */
export function getSelectFields(meta: SearchAdminMetadata, search: SearchInfo): PickerOption[] {
  return search.api_params.select.map((fieldExpr) => {
    const info = parseExpr(meta, fieldExpr, search);
    return {
      id: info.alias,
      label: getDefaultLabel(meta, fieldExpr, search),
      description: info.fn ? info.fn.description : info.args[0]?.field?.description,
    };
  });
}

/** getSmartGroupColumns: the columns that can serve as a smart group's contact ID. */
export function getSmartGroupColumns(
  meta: SearchAdminMetadata,
  search: SearchInfo,
): PickerOption[] {
  const joins = (search.api_params.join ?? []).map((clause) => String(clause[0]));
  return [search.api_entity, ...joins].flatMap((joinExpr) => {
    const alias = joinExpr.split(" AS ")[1];
    const join = alias ? getJoin(meta, search, alias) : undefined;
    const entity = getEntity(meta, join ? join.entity : joinExpr);
    const prefix = join ? `${join.alias}.` : "";
    const contact = ["Contact", "Individual", "Household", "Organization"].includes(
      entity?.name ?? "",
    );
    return (entity?.fields ?? [])
      .filter((field) => (contact && field.name === "id") || field.fk_entity === "Contact")
      .map((field) => ({
        id: prefix + field.name,
        label: (join ? `${join.label}: ` : "") + field.label,
        icon: entity?.icon,
      }));
  });
}
