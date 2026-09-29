import type { FieldDefn } from "../afform/types";

/**
 * The filter fields of a search form (an af-fieldset without entity) as afFieldset and
 * afField keep them: one value per field name, operator fields as {operator: value}.
 */
export type FilterValues = Record<string, unknown>;

/** A changed filter searches after this pause; getResultsSoon() in core waits 600 ms. */
export const SEARCH_DELAY_MS = 300;

export interface FilterField {
  name: string;
  defn: FieldDefn;
}

/** A saved filter set (SearchParamSet) as `#?_s=<id>` selects it; `filters` holds field values. */
export interface ParamSet {
  filters?: FilterValues | null;
}

/** What the conversions need from the page. */
export interface ValueContext {
  /** CRM.config.cid, for the "user_contact_id" default of contact references. */
  userContactId?: number;
  now?: Date;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** afField's isMultiple(). */
export function isMultiple(defn: FieldDefn): boolean {
  const multiple = !!defn.input_attrs?.multiple;
  return (
    (["Select", "EntityRef", "ChainSelect"].includes(defn.input_type) && multiple) ||
    (["CheckBox", "Toggle"].includes(defn.input_type) && defn.data_type !== "Boolean") ||
    (["Hidden", "DisplayOnly"].includes(defn.input_type) &&
      (!!defn.serialize || defn.data_type === "Array"))
  );
}

/**
 * afField's correctValueType(); Boolean uses its loose `value == 1`. Range bounds are
 * converted one by one, where core turns a number range into NaN.
 */
function correctValueType(value: unknown, dataType: string): unknown {
  if (value === null) return value;
  if (Array.isArray(value)) return value.map((item) => correctValueType(item, dataType));
  if (isPlainObject(value))
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, correctValueType(item, dataType)]),
    );
  if (dataType === "Integer" || dataType === "Float") return Number(value);
  if (dataType === "Boolean") return value === true || value === 1 || value === "1";
  return value;
}

const pad = (number: number) => String(number).padStart(2, "0");

/** afField's getRelativeDate(): "now", "now +3 day", "now -1 week" in local time. */
export function relativeDate(text: string, includeTime: boolean, now: Date): string {
  const [, rawOffset = "0", unit = "day"] = text.split(" ");
  const days = parseInt(rawOffset, 10) * (unit === "week" ? 7 : unit === "year" ? 365 : 1);
  const date = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return includeTime ? `${day} ${date.toTimeString().slice(0, 8)}` : day;
}

/** The operator a field writes with: the one chosen for it, or its defn's. */
export function operatorOf(field: FilterField, operators: Record<string, string>): string | null {
  return operators[field.name] ?? field.defn.search_operator ?? null;
}

export interface FieldsetState {
  values: FilterValues;
  /** Operators chosen for fields with expose_operator. */
  operators: Record<string, string>;
}

/**
 * afField's setValue(): converts a value from a default, stored values, the URL or a saved
 * filter set to the field's type and writes it the way getSetValue() does.
 */
export function assignValue(
  state: FieldsetState,
  field: FilterField,
  raw: unknown,
  context: ValueContext = {},
): FieldsetState {
  const { defn, name } = field;
  let operators = state.operators;
  let operator = operatorOf(field, operators);
  let value = raw;
  if (typeof value === "string" && isMultiple(defn)) value = value.split(",");
  if (isPlainObject(value) && operator) {
    if (defn.expose_operator) {
      operator = Object.keys(value)[0] ?? operator;
      operators = { ...operators, [name]: operator };
    }
    // Core keeps a truthy value only.
    if (!value[operator]) value = null;
    else value = value[operator];
  }
  if (
    defn.input_type === "EntityRef" &&
    ["Contact", "Individual"].includes(defn.fk_entity ?? "") &&
    value === "user_contact_id"
  ) {
    value = context.userContactId;
  }
  if (defn.input_type !== "DisplayOnly") value = correctValueType(value, defn.data_type);
  if (defn.input_type === "Date" && typeof value === "string" && value.startsWith("now")) {
    value = relativeDate(value, !!defn.input_attrs?.time, context.now ?? new Date());
  }
  const bounds = (text: string) => text.split("-");
  if (defn.input_type === "Number" && defn.search_range) {
    if (!isPlainObject(value)) {
      const [low = "", high = ""] = bounds(String(value));
      value = { ">=": Number(low || 0), "<=": Number(high || 0) };
    }
  } else if (defn.input_type === "Number") {
    value = Number(value);
  } else if (
    defn.search_range &&
    !isPlainObject(value) &&
    !(Array.isArray(defn.options) && defn.options.some((option) => option.id === value))
  ) {
    const [low = "", high = ""] = bounds(String(value));
    value = { ">=": low, "<=": high };
  }
  const values = { ...state.values };
  if (operator) {
    const current = values[name];
    values[name] = { ...(isPlainObject(current) ? current : {}), [operator]: value };
  } else {
    values[name] = value;
  }
  return { values, operators };
}

/**
 * afField's initializeValue(): stored values (on first load) before the defn's default,
 * then a search range starts as an empty object unless it is a relative date choice.
 */
function initializeValue(
  state: FieldsetState,
  field: FilterField,
  stored: FilterValues | undefined,
  context: ValueContext,
): FieldsetState {
  const { defn, name } = field;
  let next = state;
  if (stored?.[name] !== undefined) next = assignValue(next, field, stored[name], context);
  else if ("afform_default" in defn) next = assignValue(next, field, defn.afform_default, context);
  if (defn.search_range) {
    const initial = next.values[name];
    if (
      !Array.isArray(initial) &&
      (defn.input_type !== "Select" || !defn.is_date || initial === "{}")
    ) {
      next = { ...next, values: { ...next.values, [name]: {} } };
    }
  }
  return next;
}

/** A URL value in the form React writes it; an empty one clears the field. */
function fromUrl(text: string, defn: FieldDefn): unknown {
  if (text === "") return null;
  if ((defn.search_operator || defn.search_range) && text.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (isPlainObject(parsed)) return parsed;
    } catch {
      // Not JSON: an ordinary value that starts with a brace.
    }
  }
  return text;
}

/**
 * afField's setValueFromRouteParams(): `<fieldset>.<field>` before `<field>`; without
 * either, a saved filter set (`_s`) gives the value, or null until it has loaded.
 */
export function applyRoute(
  state: FieldsetState,
  fields: FilterField[],
  fieldsetName: string,
  params: URLSearchParams,
  paramSet: ParamSet | undefined,
  context: ValueContext = {},
): FieldsetState {
  let next = state;
  for (const field of fields) {
    const text = params.get(`${fieldsetName}.${field.name}`) ?? params.get(field.name);
    if (text !== null) {
      next = assignValue(next, field, fromUrl(text, field.defn), context);
    } else if (params.get("_s")) {
      next = assignValue(next, field, paramSet?.filters?.[field.name] ?? null, context);
    }
  }
  return next;
}

export interface InitialSources {
  fields: FilterField[];
  /** Name of the fieldset: its first display, as afFieldset.getName() reads it. */
  fieldsetName: string;
  params: URLSearchParams;
  /** Values of CRM.cache "afform:<form><fieldset>" when the fieldset has store-values. */
  stored?: FilterValues;
  paramSet?: ParamSet;
  context?: ValueContext;
}

/**
 * A fieldset's complete values before the first search: stored values, else the field
 * defaults; the URL over both; a saved filter set for fields the URL leaves out.
 */
export function initialState({
  fields,
  fieldsetName,
  params,
  stored,
  paramSet,
  context = {},
}: InitialSources): FieldsetState {
  let state: FieldsetState = { values: {}, operators: {} };
  for (const field of fields) state = initializeValue(state, field, stored, context);
  return applyRoute(state, fields, fieldsetName, params, paramSet, context);
}

/** Values from the field defaults alone: what the URL leaves out. */
export function defaultValues(fields: FilterField[], context: ValueContext = {}): FilterValues {
  let state: FieldsetState = { values: {}, operators: {} };
  for (const field of fields) state = initializeValue(state, field, undefined, context);
  return state.values;
}

const isEmpty = (value: unknown) =>
  value === null ||
  value === "" ||
  (Array.isArray(value) && value.length === 0) ||
  (isPlainObject(value) && Object.keys(value).length === 0);

/**
 * afFieldset's getFilterValues(): the values without empty ones (null, "", [], {}), also one
 * level down in operator and range objects.
 */
export function filterValues(values: FilterValues): FilterValues {
  const filters: FilterValues = {};
  for (const [name, value] of Object.entries(values)) {
    const kept = isPlainObject(value)
      ? Object.fromEntries(Object.entries(value).filter(([, inner]) => !isEmpty(inner)))
      : value;
    if (!isEmpty(kept) && kept !== undefined) filters[name] = kept;
  }
  return filters;
}

function scalarText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return JSON.stringify(value);
}

/**
 * A value as URL text core reads back through setValue(): lists comma-separated, booleans
 * 1/0, an operator value bare. Objects core cannot read (two operators, ranges) are JSON.
 */
export function urlText(value: unknown, operator: string | null): string {
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (operator && keys.length === 1 && keys[0] === operator)
      return urlText(value[operator], null);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return value.map(scalarText).join(",");
  return scalarText(value);
}

export type FieldsetAction =
  | { type: "input"; field: FilterField; value: unknown }
  | { type: "operator"; field: FilterField; operator: string }
  | { type: "commit" }
  | {
      type: "route";
      fields: FilterField[];
      fieldsetName: string;
      params: URLSearchParams;
      paramSet: ParamSet | undefined;
      context?: ValueContext;
    };

export interface FieldsetReducerState extends FieldsetState {
  /** The values the displays search with; typing reaches them after a pause. */
  applied: FilterValues;
  /** Counts the user's changes that reached `applied`, so only those are written to the URL. */
  commits: number;
}

export function fieldsetReducer(
  state: FieldsetReducerState,
  action: FieldsetAction,
): FieldsetReducerState {
  switch (action.type) {
    case "input": {
      const operator = operatorOf(action.field, state.operators);
      const current = state.values[action.field.name];
      const value = operator
        ? { ...(isPlainObject(current) ? current : {}), [operator]: action.value }
        : action.value;
      return { ...state, values: { ...state.values, [action.field.name]: value } };
    }
    case "operator":
      // afField's onChangeOperator() empties the value.
      return {
        ...state,
        operators: { ...state.operators, [action.field.name]: action.operator },
        values: { ...state.values, [action.field.name]: {} },
      };
    case "commit":
      return state.applied === state.values
        ? state
        : { ...state, applied: state.values, commits: state.commits + 1 };
  }
  // "route": a new hash or a loaded saved filter set applies at once.
  const next = applyRoute(
    state,
    action.fields,
    action.fieldsetName,
    action.params,
    action.paramSet,
    action.context,
  );
  return { ...state, ...next, applied: next.values };
}
