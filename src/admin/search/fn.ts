import type { PickerOption } from "../widgets/Picker";
import {
  createSqlName,
  getEntity,
  mustAggregate,
  parseExpr,
  type ArgType,
  type ExprArg,
  type SearchInfo,
} from "./expr";
import type { FunctionParam, SearchAdminMetadata, SqlFunction } from "./meta";

/** Where an expression is edited: a column, a group-by or a condition. */
export type FnMode = "select" | "groupBy" | "clause";

export interface FnState {
  fn: SqlFunction | null;
  args: ExprArg[];
  /** The index in `args` of the field the expression transforms. */
  fieldIndex: number;
}

export const SQL_EXPR_TYPES: { type: string; name: ArgType; label: () => string; icon: string }[] =
  [
    { type: "SqlField", name: "field", label: () => ts("Field"), icon: "fa-database" },
    { type: "SqlString", name: "string", label: () => ts("Text"), icon: "fa-i-cursor" },
    { type: "SqlNumber", name: "number", label: () => ts("Number"), icon: "fa-hashtag" },
  ];

const typeName = (sqlType: string | undefined) =>
  SQL_EXPR_TYPES.find((t) => t.type === sqlType)?.name ?? null;
const firstKey = (flags: Record<string, string> | undefined) =>
  Object.keys(flags ?? {}).find(Boolean);

export function getParam(state: FnState, index: number): FunctionParam | undefined {
  return state.fn ? (state.fn.params[index] ?? state.fn.params.at(-1)) : undefined;
}

function pushArg(state: FnState, sqlType: string | undefined, optional?: boolean): FnState {
  const param = getParam(state, state.args.length);
  const arg: ExprArg = {
    type: typeName(sqlType),
    flag_before: firstKey(param?.flag_before),
    flag_after: firstKey(param?.flag_after),
    name: param?.name,
    value: "",
    optional,
  };
  return { ...state, args: [...state.args, arg] };
}

/** initFunction: arguments up to each parameter's minimum, apart from server defaults. */
function fillMinimum(state: FnState): FnState {
  let next = state;
  (state.fn?.params ?? []).forEach((param, index) => {
    while (
      next.args.length - index < (param.min_expr ?? 0) &&
      !param.api_default &&
      (!param.optional || (param.must_be ?? []).length === 1)
    )
      next = pushArg(next, param.must_be?.[0], param.optional);
  });
  return next;
}

export function fnState(meta: SearchAdminMetadata, expr: string, search: SearchInfo): FnState {
  const info = parseExpr(meta, expr, search);
  const state = {
    fn: info.fn,
    args: info.args,
    fieldIndex: Math.max(
      0,
      info.args.findIndex((a) => a.type === "field"),
    ),
  };
  return fillMinimum(state);
}

export const addArg = (state: FnState, sqlType: string) => pushArg(state, sqlType);

export function removeArg(state: FnState, index: number): FnState {
  return { ...state, args: state.args.filter((_, i) => i !== index) };
}

export function setArg(state: FnState, index: number, change: Partial<ExprArg>): FnState {
  return {
    ...state,
    args: state.args.map((arg, i) => (i === index ? { ...arg, ...change } : arg)),
  };
}

export function changeArgType(state: FnState, index: number, type: ArgType): FnState {
  return state.args[index]?.type === type ? state : setArg(state, index, { type, value: "" });
}

/** selectFunction: the field goes where the function takes a field, other arguments around it. */
export function selectFunction(meta: SearchAdminMetadata, state: FnState, name: string): FnState {
  const fieldArg = state.args[state.fieldIndex];
  if (!fieldArg) return state;
  const fn = meta.functions.find((f) => f.name === name) ?? null;
  if (!fn)
    return {
      fn: null,
      args: [{ ...fieldArg, flag_before: undefined, flag_after: undefined, name: undefined }],
      fieldIndex: 0,
    };
  const fieldPos = fn.params.findIndex((param) => (param.must_be ?? []).includes("SqlField"));
  if (fieldPos < 0) throw new Error(ts("Function %1 takes no field.", { 1: fn.title }));
  const before = fn.params.slice(0, fieldPos).map((param): ExprArg => {
    const sqlType = param.must_be?.[0];
    return {
      type: typeName(sqlType),
      flag_before: firstKey(param.flag_before),
      flag_after: firstKey(param.flag_after),
      name: param.name,
      value: sqlType === "SqlNumber" ? 0 : "",
    };
  });
  const fieldParam = fn.params[fieldPos];
  const field: ExprArg = {
    ...fieldArg,
    flag_before: Object.keys(fieldParam?.flag_before ?? {})[0],
    flag_after: Object.keys(fieldParam?.flag_after ?? {})[0],
    name: fieldParam?.name,
  };
  return fillMinimum({ fn, args: [...before, field], fieldIndex: fieldPos });
}

export function canAddArg(state: FnState): boolean {
  const param = getParam(state, state.args.length);
  if (!state.fn || !param) return false;
  if (param.name && param.optional) return false;
  return state.args.length - state.fn.params.indexOf(param) < (param.max_expr ?? 0);
}

export function canRemoveArg(state: FnState, index: number): boolean {
  if (!state.fn) return false;
  const param = state.fn.params[index];
  return !param || !!param.optional;
}

/** writeExpr: the expression text, with `:label` and an alias for a column. */
export function writeExpr(state: FnState, mode: FnMode): string {
  const fnName = state.fn?.name ?? "";
  if (!fnName) return String(state.args[state.fieldIndex]?.value ?? "");
  const parts = state.args.map((arg, index) => {
    const value = arg.value;
    let prefix = "";
    if (arg.name) prefix = (index ? " " : "") + arg.name + (value === "" ? "" : " ");
    else if (index && fnName === "e") prefix = " ";
    else if (index) prefix = ", ";
    const suffix = arg.flag_after ? ` ${arg.flag_after}` : "";
    if (arg.optional && value === "" && !arg.flag_before) return "";
    const content = getParam(state, index)?.max_expr
      ? arg.type === "string" || value === ""
        ? JSON.stringify(value)
        : String(value)
      : "";
    // A flag-only argument such as EXTRACT's unit takes no trailing space.
    const flag = arg.flag_before ? arg.flag_before + (content ? " " : "") : "";
    return prefix + flag + content + suffix;
  });
  let expr = `${fnName === "e" ? "" : fnName}(${parts.join("")})`;
  if (mode === "select") {
    if (state.fn?.options) expr += ":label";
    const alias = [
      fnName,
      ...state.args.filter((a) => a.value && a.type !== null).map((a) => String(a.value)),
    ]
      .join("_")
      .replace(/:/g, "_");
    expr += ` AS ${createSqlName(alias)}`;
  }
  return expr;
}

const categories = (): Record<string, string> => ({
  aggregate: ts("Aggregate"),
  comparison: ts("Comparison"),
  date: ts("Date Calculation"),
  partial_date: ts("Partial Date"),
  math: ts("Math"),
  string: ts("Text"),
});

/** getFunctions: the functions the field may take where it is used, by category. */
export function availableFunctions(
  meta: SearchAdminMetadata,
  state: FnState,
  expr: string,
  mode: FnMode,
  search: SearchInfo,
): PickerOption[] {
  const field = state.args[state.fieldIndex]?.field;
  if (!expr || !field) return [];
  const labels = categories();
  const options: PickerOption[] = [];
  const types: string[] = [];
  const groupBy = search.api_params.groupBy ?? [];
  const groupable = getEntity(meta, search.api_entity)?.params?.includes("groupBy") ?? false;
  const canAggregate = groupable && (!groupBy.length || mustAggregate(meta, expr, search));
  if (mode !== "groupBy" && canAggregate) {
    types.push("aggregate");
    // A function the group-by applies to the same field is allowed too.
    for (const groupExpr of groupBy) {
      if (!groupExpr.includes(field.name) || !groupExpr.includes("(")) continue;
      const parsed = parseExpr(meta, groupExpr, search);
      const groupField = parsed.args.find((a) => a.type === "field");
      if (parsed.fn && parsed.fn.name !== "e" && groupField?.field?.name === field.name)
        options.push({
          id: parsed.fn.name,
          label: parsed.fn.title,
          description: parsed.fn.description,
          group: labels[parsed.fn.category],
        });
    }
  }
  if (mode === "groupBy" || !mustAggregate(meta, expr, search)) {
    types.push("comparison", "string");
    if (["Integer", "Float", "Date", "Timestamp", "Money"].includes(field.data_type))
      types.push("math");
    if (["Date", "Timestamp"].includes(field.data_type)) types.push("date", "partial_date");
  }
  for (const type of types)
    for (const fn of meta.functions)
      if (fn.category === type && fn.params.length)
        options.push({
          id: fn.name,
          label: fn.title,
          description: fn.description,
          group: labels[type],
        });
  return options;
}
