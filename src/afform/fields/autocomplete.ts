import { api4 } from "../../api/civi";
import type { FieldDefn } from "../types";
import type { FieldEnv } from "./env";

/** A row of `<Entity>.autocomplete` (AutocompleteAction::_run, plus a display's `extra` keys). */
export interface AutocompleteItem {
  id: string | number;
  label: string;
  icon?: string | null;
  description?: (string | null)[];
  color?: string | null;
  prefix?: string;
  suffix?: string;
  image?: string;
  icon_class?: string;
  label_class?: string;
}

/**
 * $.fn.crmAutocomplete's paging: a further page excludes the ids already listed and,
 * once a search field has no more rows, moves on to the next one.
 */
export interface SearchContext {
  searchField: string | null;
  searchFields: string[];
  previousIds: (string | number)[];
}

export interface SearchPage {
  items: AutocompleteItem[];
  more: boolean;
  context: SearchContext;
}

/** afField's getAutocompleteParams(): the server finds the field's saved search and filters by these. */
export function autocompleteParams(env: FieldEnv) {
  const join = env.joinEntity ? `+${env.joinEntity}` : "";
  return {
    formName: `afform:${env.formName}`,
    fieldName: `${env.modelName}${join}:${env.fieldName}`,
    values: env.values,
  };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

/** One page of search results, as select2's ajax `data` and `results` callbacks build them. */
export async function searchPage(
  entity: string,
  env: FieldEnv,
  input: string,
  context: SearchContext,
): Promise<SearchPage> {
  const result = await api4<AutocompleteItem>(entity, "autocomplete", {
    input,
    searchField: context.searchField,
    exclude: context.previousIds.length ? context.previousIds : null,
    quickEdit: false,
    ...autocompleteParams(env),
  });
  const searchField = "searchField" in result ? result.searchField : null;
  const next: SearchContext = {
    searchField: typeof searchField === "string" ? searchField : null,
    searchFields: "searchFields" in result ? stringList(result.searchFields) : [],
    previousIds: [...context.previousIds, ...result.map((item) => item.id)],
  };
  let more = (result.countMatched ?? 0) > (result.countFetched ?? result.length);
  const fieldIndex = next.searchField === null ? -1 : next.searchFields.indexOf(next.searchField);
  if (!more && input && next.searchField !== null && fieldIndex < next.searchFields.length - 1) {
    next.searchField = next.searchFields[fieldIndex + 1] ?? null;
    more = true;
  }
  return { items: [...result], more, context: next };
}

/** The records behind a stored value, as select2's initSelection loads them. */
export async function resolveIds(
  entity: string,
  env: FieldEnv,
  ids: (string | number)[],
): Promise<AutocompleteItem[]> {
  return [
    ...(await api4<AutocompleteItem>(entity, "autocomplete", {
      quickEdit: false,
      ...autocompleteParams(env),
      ids,
    })),
  ];
}

/** formatEntityRefSelection: the label with the display's prefix and suffix. */
export function itemText(item: AutocompleteItem): string {
  return [item.prefix, item.label, item.suffix].filter((part) => part !== undefined).join(" ");
}

/** The ids a value holds: a list, a single id, or none. */
export function valueIds(value: unknown): (string | number)[] {
  const list = Array.isArray(value) ? value : [value];
  return list.filter(
    (item): item is string | number =>
      (typeof item === "string" && item !== "") || typeof item === "number",
  );
}

/** afField's getSetSelect(): numeric ids stay numbers; an emptied required field has no value. */
export function modelValue(defn: FieldDefn, ids: (string | number)[]): unknown {
  const numeric = defn.data_type === "Integer" || defn.data_type === "Float";
  const typed = ids.map((id) => (numeric ? Number(id) : String(id)));
  if (!typed.length && defn.required) return undefined;
  if (defn.input_attrs?.multiple) return typed;
  return typed[0] ?? (numeric ? null : "");
}

/**
 * The entity the field searches: fk_entity, or with dfk_entities the one the control field's
 * value names (afField's dynamic foreign key). No entity while the control field is empty.
 */
export function searchedEntity(
  defn: FieldDefn,
  env: FieldEnv,
): { entity: string | null } | { error: string } {
  const control = defn.input_attrs?.control_field;
  if (!defn.dfk_entities || !control) return { entity: defn.fk_entity ?? null };
  const [key] = valueIds(env.values[controlFieldName(defn, env, control)]);
  if (key === undefined) return { entity: null };
  const entity = defn.dfk_entities[String(key)];
  return entity
    ? { entity }
    : { error: ts("No entity to search for %1 = %2", { 1: control, 2: key }) };
}

/** afField's namePrefix: the part of the af-field's name before defn.name, kept for the control field. */
export function controlFieldName(defn: FieldDefn, env: FieldEnv, control: string): string {
  const { fieldName } = env;
  const prefix = fieldName.endsWith(defn.name) ? fieldName.slice(0, -defn.name.length) : "";
  return prefix + control;
}

/** What the renderer cannot do for an EntityRef, as its note words it; null when it can. */
export function entityRefProblem(defn: FieldDefn): string | null {
  if (!defn.fk_entity && !(defn.dfk_entities && defn.input_attrs?.control_field))
    return `field type EntityRef without fk_entity (${defn.name})`;
  return hasQuickAdd(defn) ? `input_attrs.quickAdd on ${defn.name}` : null;
}

/** crmAutocomplete's quick-add links: true for every form of the entity, or a list of paths. */
export function hasQuickAdd(defn: FieldDefn): boolean {
  const quickAdd = defn.input_attrs?.quickAdd;
  return quickAdd === true || (Array.isArray(quickAdd) && quickAdd.length > 0);
}
