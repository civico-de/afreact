import { plainLiteral } from "../fields";
import { encodeLiteral, isLiteralObject, parseAttribute, type Literal } from "../literal";
import { getField, type EditorMeta, type GuiField } from "../meta";
import { filled, textAttribute } from "../model";
import { withoutAttributes } from "../nodes";
import type { ShallowElement } from "../tree";

export type LiteralObject = Record<string, Literal>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The field element's own defn; null where its text is no object literal, so it stays as is. */
export function localDefn(node: ShallowElement): LiteralObject | null {
  const text = textAttribute(node, "defn");
  if (text === undefined || text.trim() === "") return {};
  const value = parseAttribute(text);
  return isLiteralObject(value) ? value : null;
}

/** The element with the defn written back, or without one where it is empty. */
export function withDefn(node: ShallowElement, defn: LiteralObject): ShallowElement {
  return Object.keys(defn).length
    ? { ...node, defn: encodeLiteral(defn) }
    : withoutAttributes(node, ["defn"]);
}

export type BaseDefn = GuiField & { input_attrs: Record<string, unknown> };

/** A field's settings: its metadata (core's getDefn()) and the element's own defn over it. */
export interface FieldState {
  base: BaseDefn;
  local: LiteralObject;
  isSearch: boolean;
  /** The first field name, without its suffix; "" for an extra field. */
  fieldName: string;
}

const drill = (root: unknown, path: string[]): unknown => {
  let value = root;
  for (const key of path) value = isRecord(value) ? value[key] : undefined;
  return value;
};

/** getProp(): the element's own value, else the metadata's. */
// deviation:field-defn-read-only
export function getProp(state: FieldState, prop: string): unknown {
  const path = prop.split(".");
  // An own null wins too: it switches off what the metadata gives, such as its help text.
  const own = drill(plainLiteral(state.local), path);
  return own === undefined ? drill(state.base, path) : own;
}

/** propIsset(). */
export const propIsset = (state: FieldState, prop: string) => {
  const value = getProp(state, prop);
  return value !== undefined && value !== null;
};

/** getSet() as a getter: the value, or "" where it is falsy. */
export const getValue = (state: FieldState, prop: string): unknown =>
  filled(getProp(state, prop)) ?? "";

/** isEmpty(): [], {}, "", null and undefined, but not false or 0. */
function isEmptyValue(value: Literal | undefined): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (isLiteralObject(value)) return Object.keys(value).length === 0;
  return false;
}

/** The defn with `path` set to `value`, or removed with the objects it left empty (clearOut()). */
function setPath(defn: LiteralObject, path: string[], value: Literal | undefined): LiteralObject {
  const [head, ...rest] = path;
  if (head === undefined) return defn;
  const out = { ...defn };
  if (!rest.length) {
    if (value === undefined) delete out[head];
    else out[head] = value;
    return out;
  }
  const child = out[head];
  const next = setPath(isLiteralObject(child) ? child : {}, rest, value);
  if (Object.values(next).every(isEmptyValue)) delete out[head];
  else out[head] = next;
  return out;
}

/** The element's own defn with `path` set or, for undefined, removed. */
export const withLocal = (
  state: FieldState,
  path: string[],
  value: Literal | undefined,
): FieldState => ({
  ...state,
  local: setPath(state.local, path, value),
});

/** The bare setter of getSet(): a value is kept only where it differs from the metadata's. */
function withProp(state: FieldState, prop: string, value: Literal | undefined): FieldState {
  const path = prop.split(".");
  const base = drill(state.base, path);
  const keep = value !== undefined && value !== base && !(!value && !base);
  return withLocal(state, path, keep ? value : undefined);
}

const RANGE_TYPES = ["Date", "Timestamp", "Integer", "Float", "Money"];

/** canBeRange(): a search filter on a number or date, or a postal code. */
export function canBeRange(state: FieldState): boolean {
  if (!state.isSearch) return false;
  if (state.fieldName.endsWith("postal_code")) return true;
  return (
    !state.base.input_attrs.multiple &&
    RANGE_TYPES.includes(String(state.base.data_type)) &&
    ["Date", "Number", "Select"].includes(String(getProp(state, "input_type")))
  );
}

/** getSetOperator() as a getter: `_EXPOSE_` where the user picks the operator. */
export function operatorOf(state: FieldState): string {
  if (getValue(state, "expose_operator")) return "_EXPOSE_";
  const operator = getValue(state, "search_operator");
  return typeof operator === "string" ? operator : "";
}

/** canBeMultiple(): a search filter with a select, its operator allowing a list. */
export function canBeMultiple(state: FieldState): boolean {
  if (
    !state.isSearch ||
    ["Date", "Timestamp"].includes(String(state.base.data_type)) ||
    !["Select", "EntityRef", "ChainSelect"].includes(String(getProp(state, "input_type")))
  )
    return false;
  const operator = operatorOf(state);
  return !operator || ["_EXPOSE_", "IN", "NOT IN"].includes(operator);
}

/** isMultiSelect(). */
export const isMultiSelect = (state: FieldState) =>
  getProp(state, "data_type") !== "Boolean" &&
  (getProp(state, "input_type") === "CheckBox" ||
    getProp(state, "input_type") === "Toggle" ||
    !!getProp(state, "input_attrs.multiple"));

/**
 * getSet() as a setter, with what follows a new input type; where the field has a default,
 * a change between one value and a list carries the default over.
 */
export function setValue(
  state: FieldState,
  prop: string,
  value: Literal | undefined,
  hasDefault: boolean,
): FieldState {
  let next = withProp(state, prop, value);
  if (prop === "input_type") {
    if (next.local.search_range && !canBeRange(next))
      next = withLocal(next, ["search_range"], undefined);
    const attrs = next.local.input_attrs;
    if (isLiteralObject(attrs) && "multiple" in attrs && !canBeMultiple(next))
      next = withLocal(next, ["input_attrs", "multiple"], undefined);
    if ((value === "CheckBox" || value === "Toggle") && state.base.data_type === "Boolean")
      next = withLocal(next, ["options"], undefined);
  }
  if (hasDefault && (prop === "input_type" || prop === "input_attrs.multiple")) {
    const current = next.local.afform_default;
    if (!isMultiSelect(next) && Array.isArray(current))
      next = withLocal(next, ["afform_default"], current[0]);
    else if (isMultiSelect(next) && typeof current === "string" && current.length)
      next = withLocal(next, ["afform_default"], current.split(","));
  }
  return next;
}

/** toggleMultiple(): multi-select on or off, search by range off with it. */
export function toggleMultiple(state: FieldState, hasDefault: boolean): FieldState {
  const multiple = !getValue(state, "input_attrs.multiple");
  let next = setValue(state, "input_attrs.multiple", multiple, hasDefault);
  if (multiple && getValue(next, "search_range"))
    next = setValue(next, "search_range", false, hasDefault);
  return next;
}

/** toggleSearchRange(): search by range on or off, multi-select off with it. */
export function toggleSearchRange(state: FieldState, hasDefault: boolean): FieldState {
  const range = !getValue(state, "search_range");
  let next = setValue(state, "search_range", range, hasDefault);
  if (range && getValue(next, "input_attrs.multiple"))
    next = setValue(next, "input_attrs.multiple", false, hasDefault);
  return next;
}

/** getSetOperator() as a setter: `_EXPOSE_` lets the user pick, starting at the first. */
export function withOperator(
  state: FieldState,
  operator: string,
  operators: string[],
  hasDefault: boolean,
): FieldState {
  const expose = operator === "_EXPOSE_";
  let next = setValue(state, "expose_operator", expose, hasDefault);
  next = setValue(next, "search_operator", expose ? operators[0] : operator, hasDefault);
  if (["_EXPOSE_", "IN", "NOT IN"].includes(operator) !== !!getValue(next, "input_attrs.multiple"))
    next = toggleMultiple(next, hasDefault);
  return next;
}

/** inputTypeCanBe(): whether an input type suits the field. */
export function inputTypeCanBe(state: FieldState, type: string): boolean {
  const defn = state.base;
  if (defn.input_type === type) return true;
  if (defn.readonly && !state.isSearch) return type === "DisplayOnly" || type === "Hidden";
  const options = !!defn.options;
  switch (type) {
    case "CheckBox":
    case "Toggle":
    case "Radio":
      return options || defn.data_type === "Boolean";
    case "Select":
      return (
        options ||
        defn.data_type === "Boolean" ||
        (defn.input_type === "EntityRef" && !state.isSearch) ||
        (defn.input_type === "Date" && state.isSearch)
      );
    case "Date":
      return defn.input_type === "Date";
    case "TextArea":
    case "RichTextEditor":
      return defn.data_type === "Text" || defn.data_type === "String";
    case "Text":
      return !(
        options ||
        defn.input_type === "Date" ||
        defn.input_type === "EntityRef" ||
        defn.data_type === "Boolean"
      );
    case "Number":
      return !(options || defn.data_type === "Boolean");
    case "Range":
      return ["Integer", "Float", "Money"].includes(String(defn.data_type));
    case "DisplayOnly":
    case "Hidden":
      return true;
    default:
      return false;
  }
}

/** showLabel(): not where the label is off or a single checkbox carries it. */
export const showLabel = (state: FieldState) =>
  state.local.label !== false &&
  !(getValue(state, "input_type") === "CheckBox" && state.base.data_type === "Boolean");

/** toggleLabel(). */
export const toggleLabel = (state: FieldState): FieldState =>
  withLocal(state, ["label"], state.local.label === false ? undefined : false);

/** isReadOnly(). */
export const isReadOnly = (state: FieldState) =>
  !!state.base.readonly || getProp(state, "input_type") === "DisplayOnly";

/** defaultDateType(): how a date's default is given. */
export function defaultDateType(state: FieldState): "fixed" | "now" | "relative" {
  if (getProp(state, "input_type") !== "Date") return "fixed";
  const value = getValue(state, "afform_default");
  if (value === "now") return "now";
  if (typeof value === "string" && value.startsWith("now")) return "relative";
  return "fixed";
}

/** defaultValueContains(). */
export function defaultContains(state: FieldState, value: unknown): boolean {
  const current = getValue(state, "afform_default");
  return current === value || (Array.isArray(current) && current.includes(value));
}

/** toggleDefaultValueItem(): an option added to or taken from the default. */
export function toggleDefaultItem(
  state: FieldState,
  value: Literal,
): { state: FieldState; hasDefault: boolean } {
  if (isMultiSelect(state)) {
    const current = state.local.afform_default;
    const list = Array.isArray(current) ? current : [];
    if (!list.includes(value))
      return { state: withLocal(state, ["afform_default"], [...list, value]), hasDefault: true };
    const rest = list.filter((item) => item !== value);
    return {
      state: setValue(state, "afform_default", rest.length ? rest : undefined, true),
      hasDefault: rest.length > 0,
    };
  }
  if (getValue(state, "afform_default") === value)
    return { state: setValue(state, "afform_default", undefined, true), hasDefault: false };
  return { state: setValue(state, "afform_default", value, true), hasDefault: true };
}

/** getDefn(): the metadata a field element starts from; null for a suffix without options. */
export function baseDefn(
  meta: EditorMeta,
  node: ShallowElement,
  entityType: string | undefined,
  calcFields: { name: string; [key: string]: unknown }[] | undefined,
  local: LiteralObject,
): BaseDefn | null {
  const first = (textAttribute(node, "name") ?? "").split(",")[0] ?? "";
  const [fieldName = "", suffix] = first.split(":");
  let defn: Record<string, unknown> | undefined;
  if (fieldName) {
    defn = entityType === undefined ? undefined : getField(meta, entityType, fieldName);
    defn ??= calcFields?.find((field) => field.name === fieldName);
  } else {
    const type = meta.gui.inputTypes.find((each) => each.name === local.input_type);
    defn = type?.extra_defn;
  }
  const copy = structuredClone(defn ?? { label: ts("Untitled"), required: false });
  const attrs = copy.input_attrs;
  const options = copy.options;
  if (suffix && !Array.isArray(options)) return null;
  return {
    ...copy,
    name: typeof copy.name === "string" ? copy.name : fieldName,
    input_attrs: isRecord(attrs) ? attrs : {},
    ...(suffix && Array.isArray(options)
      ? {
          options: options.filter(isRecord).map((option) => ({
            ...option,
            id: option[suffix],
            label: String(option.label),
          })),
        }
      : {}),
  };
}

/** setFieldDefn(): the metadata with the element's defn merged in, its options taken whole. */
export function mergedDefn(state: FieldState): Record<string, unknown> {
  const merge = (base: unknown, extra: unknown): unknown => {
    if (!isRecord(base) || !isRecord(extra)) return extra === undefined ? base : extra;
    const out: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(extra)) out[key] = merge(base[key], value);
    return out;
  };
  const local = plainLiteral(state.local);
  const merged = merge(state.base, local);
  if (!isRecord(merged) || !isRecord(local)) throw new Error("A field definition is no object.");
  if (local.options) merged.options = local.options;
  return merged;
}

export interface FieldOption {
  id: unknown;
  label: string;
  [key: string]: unknown;
}

const isOption = (value: unknown): value is FieldOption =>
  isRecord(value) && "id" in value && typeof value.label === "string";

/** The options a list of records gives, or null where it holds none. */
export const optionList = (value: unknown): FieldOption[] | null =>
  Array.isArray(value) ? value.filter(isOption) : null;
