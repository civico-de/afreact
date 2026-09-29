import { useQuery } from "@tanstack/react-query";
import { parseAsString, useQueryStates } from "nuqs";
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useReducer,
  useState,
  type ActionDispatch,
  type ReactNode,
} from "react";
import { api4, errorMessage } from "../api/civi";
import { AfreactSearch } from "../search/AfreactSearch";
import { isDisplaySettings } from "../search/types";
import {
  evaluateDisplayFilters,
  parseDisplayFilters,
  readsOptions,
  routeKeys,
  RouteOptionsContext,
  type DisplayFilters,
} from "../search/displayFilters";
import {
  defaultValues,
  fieldsetReducer,
  filterValues,
  initialState,
  operatorOf,
  SEARCH_DELAY_MS,
  urlText,
  type FieldsetAction,
  type FieldsetReducerState,
  type FilterField,
  type FilterValues,
  type ParamSet,
  type ValueContext,
} from "../search/filters";
import { useHashParams, useParamStore, useUrlPrefix } from "../url/UrlState";
import { Field, fieldClasses } from "./Field";
import type { ElementNode, LayoutNode } from "./types";
import { isElement, isFieldDefn } from "./types";
import { Unsupported } from "./Unsupported";

/**
 * A search form's af-fieldset without entity: its af-fields are filters, and the search
 * displays inside search with their values (afFieldset + searchDisplayBaseTrait).
 */

interface FieldsetContextValue {
  state: FieldsetReducerState;
  dispatch: ActionDispatch<[FieldsetAction]>;
  /** False until a saved filter set (`#?_s=`) has loaded. */
  ready: boolean;
}

const SearchFieldsetContext = createContext<FieldsetContextValue | null>(null);

export function useSearchFieldset(): FieldsetContextValue | null {
  return useContext(SearchFieldsetContext);
}

/** The af-fields of a fieldset, without those of fieldsets nested in it. */
export function filterFields(nodes: LayoutNode[]): FilterField[] {
  return nodes.filter(isElement).flatMap((node) => {
    if (node["af-fieldset"] !== undefined) return [];
    if (node["#tag"] === "af-field" && isFieldDefn(node.defn))
      return [{ name: String(node.name), defn: node.defn }];
    return filterFields(node["#children"] ?? []);
  });
}

/** afFieldset.getName() without an entity: the first search display inside. */
export function fieldsetName(nodes: LayoutNode[]): string {
  for (const node of nodes.filter(isElement)) {
    if (typeof node["display-name"] === "string" && typeof node["search-name"] === "string")
      return node["display-name"];
    const inner = fieldsetName(node["#children"] ?? []);
    if (inner) return inner;
  }
  return "";
}

/** The bound `store-values` attribute; FormBuilder writes "1". */
function storesValues(value: unknown): boolean {
  return typeof value === "string" && !["", "0", "false"].includes(value.trim());
}

const isRecord = (value: unknown): value is FilterValues =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function readStored(key: string): FilterValues | undefined {
  const stored = window.CRM.cache?.get(key, {});
  return isRecord(stored) ? stored : undefined;
}

async function loadParamSet(formName: string, id: string): Promise<ParamSet> {
  const [found] = await api4<ParamSet>("SearchParamSet", "get", {
    where: [
      ["id", "=", id],
      ["afform_name", "=", formName],
    ],
    select: ["filters", "columns"],
  });
  // afFieldset keeps an empty set when the id belongs to no set of this form.
  return found ?? {};
}

interface SearchFieldsetProps {
  node: ElementNode;
  formName: string;
  children: ReactNode;
}

export function SearchFieldset({ node, formName, children }: SearchFieldsetProps) {
  const store = useParamStore();
  const fields = useMemo(() => filterFields(node["#children"] ?? []), [node]);
  const name = useMemo(() => fieldsetName(node["#children"] ?? []), [node]);
  const cacheKey = `afform:${formName}${name}`;
  const stores = storesValues(node["store-values"]);
  const [context] = useState<ValueContext>(() => ({ userContactId: window.CRM.config?.cid }));
  const [route, setRoute] = useState(() => store.params());
  useEffect(
    () =>
      store.external(() => {
        setRoute(store.params());
      }),
    [store],
  );
  const setId = route.get("_s");
  const paramSet = useQuery({
    queryKey: ["SearchParamSet", "get", formName, setId],
    queryFn: () => loadParamSet(formName, setId ?? ""),
    enabled: !!setId,
  });
  const [state, dispatch] = useReducer(fieldsetReducer, null, () => {
    const initial = initialState({
      fields,
      fieldsetName: name,
      params: route,
      stored: stores ? readStored(cacheKey) : undefined,
      paramSet: paramSet.data,
      context,
    });
    return { ...initial, applied: initial.values, commits: 0 };
  });

  // A new hash or a loaded saved set sets the fields again, as afField's routeParams watcher.
  // Compared by identity: own writes leave `route` behind, so a link back to it is new.
  const [seen, setSeen] = useState({ route, loaded: paramSet.dataUpdatedAt });
  if (seen.route !== route || seen.loaded !== paramSet.dataUpdatedAt) {
    setSeen({ route, loaded: paramSet.dataUpdatedAt });
    dispatch({
      type: "route",
      fields,
      fieldsetName: name,
      params: route,
      paramSet: paramSet.data,
      context,
    });
  }

  // A commit without a change leaves the state as it is. Until a saved set has loaded
  // nothing commits: the set replaces what was typed, as in afField.
  const ready = !setId || paramSet.isSuccess;
  useEffect(() => {
    if (!ready) return undefined;
    const timer = setTimeout(() => {
      dispatch({ type: "commit" });
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [state.values, ready]);

  // afFieldset's watcher stores every change, the untouched first values included.
  useEffect(() => {
    if (stores && Object.keys(state.values).length) window.CRM.cache?.set(cacheKey, state.values);
  }, [stores, cacheKey, state.values]);

  useUrlWriter(fields, name, state, context);

  const value = useMemo(() => ({ state, dispatch, ready }), [state, ready]);
  return (
    <SearchFieldsetContext.Provider value={value}>
      {paramSet.isError && (
        <div className="alert alert-danger" role="alert">
          {errorMessage(paramSet.error)}
        </div>
      )}
      {children}
    </SearchFieldsetContext.Provider>
  );
}

/**
 * Writes the user's filter changes to the hash under the keys afField reads, leaves
 * defaults out, and drops the saved set (`_s`) the values no longer match.
 */
function useUrlWriter(
  fields: FilterField[],
  name: string,
  state: FieldsetReducerState,
  context: ValueContext,
) {
  const prefix = useUrlPrefix(name);
  const unique = useMemo(
    () => fields.filter((field, index) => fields.findIndex((o) => o.name === field.name) === index),
    [fields],
  );
  const keyMap = useMemo(() => {
    const keys: Record<string, typeof parseAsString> = { _s: parseAsString };
    for (const field of unique) {
      keys[field.name] = parseAsString;
      keys[`${name}.${field.name}`] = parseAsString;
    }
    return keys;
  }, [unique, name]);
  const [, setUrl] = useQueryStates(keyMap);
  const defaults = useMemo(() => filterValues(defaultValues(fields, context)), [fields, context]);
  const write = useEffectEvent(() => {
    const update: Record<string, string | null> = { _s: null };
    const filters = filterValues(state.applied);
    for (const field of unique) {
      const plain = field.name;
      const full = `${name}.${field.name}`;
      const isDefault = JSON.stringify(filters[plain]) === JSON.stringify(defaults[plain]);
      update[prefix ? full : plain] = isDefault
        ? null
        : urlText(state.applied[plain], operatorOf(field, state.operators));
      update[prefix ? plain : full] = null;
    }
    void setUrl(update);
  });
  useEffect(() => {
    if (state.commits > 0) write();
  }, [state.commits]);
}

/** af-field attributes a filter uses; `class` goes onto the field element. */
const FILTER_ATTRIBUTES = new Set(["#tag", "#children", "name", "defn", "class"]);

/** An af-field inside a search fieldset: its value is a filter. */
export function FilterFieldNode({
  node,
  fieldset,
}: {
  node: ElementNode;
  fieldset: FieldsetContextValue;
}) {
  const name = String(node.name);
  const defn = node.defn;
  if (!isFieldDefn(defn)) return <Unsupported what={`field ${name} without metadata`} />;
  const field = { name, defn };
  const { state, dispatch } = fieldset;
  const operator = operatorOf(field, state.operators);
  const current = state.values[name];
  const value = operator ? (isRecord(current) ? current[operator] : undefined) : current;
  const unknown = Object.keys(node).filter((attr) => !FILTER_ATTRIBUTES.has(attr));
  const label = defn.label === false ? name : (defn.label ?? name);
  return createElement(
    "af-field",
    {
      name,
      className: `${fieldClasses(defn)} ${typeof node.class === "string" ? node.class : ""}`.trim(),
    },
    unknown.length > 0 && <Unsupported what={`${unknown.join(", ")} on ${name}`} />,
    defn.search_range ? (
      <Unsupported what={`search range (${label})`} />
    ) : (
      <Field
        defn={defn}
        value={value}
        disabled={false}
        onChange={(next) => {
          dispatch({ type: "input", field, value: next });
        }}
        operator={
          defn.expose_operator ? (
            <select
              className="form-control afform-search-operator"
              aria-label={ts("Operator")}
              value={operator ?? ""}
              onChange={(event) => {
                dispatch({ type: "operator", field, operator: event.target.value });
              }}
            >
              {Object.entries(defn.operators ?? {}).map(([key, text]) => (
                <option key={key} value={key}>
                  {text}
                </option>
              ))}
            </select>
          ) : undefined
        }
      />
    ),
  );
}

function parseFilters(attribute: unknown): { filters: DisplayFilters } | { error: string } {
  if (attribute === undefined) return { filters: [] };
  if (typeof attribute !== "string") return { error: `filters=${JSON.stringify(attribute)}` };
  try {
    return { filters: parseDisplayFilters(attribute) };
  } catch (error) {
    console.warn("[afreact] display filters", error);
    return { error: `filters="${attribute}"` };
  }
}

interface FieldsetDisplayProps {
  node: ElementNode;
  formName: string;
}

/**
 * An embedded search display: searches with the fieldset's values and its own `filters`,
 * which win on the same key (getFilters()).
 */
export function FieldsetDisplay({ node, formName }: FieldsetDisplayProps) {
  const fieldset = useSearchFieldset();
  const parsed = useMemo(() => parseFilters(node.filters), [node.filters]);
  const params = useHashParams("filters" in parsed ? routeKeys(parsed.filters) : []);
  const options = useContext(RouteOptionsContext);
  const settings = node.settings;
  if (settings !== undefined && !isDisplaySettings(settings))
    return <Unsupported what="search display settings without columns" />;
  // Without its own filters the display would show rows the form means to hide.
  if ("error" in parsed) return <Unsupported what={parsed.error} />;
  // Outside a placement that provides options, `options.x` has no value to filter by.
  if (options === undefined && readsOptions(parsed.filters))
    return <Unsupported what="display filters from options outside a placement" />;
  const own = evaluateDisplayFilters(parsed.filters, params, options);
  const merged = (values: FilterValues | undefined) => ({
    ...(values ? filterValues(values) : {}),
    ...own,
  });
  return (
    <>
      {/* Core writes the row count into the page's scope; nothing reads it here. */}
      {node["total-count"] !== undefined && (
        <Unsupported what={`total-count=${JSON.stringify(node["total-count"])}`} />
      )}
      <AfreactSearch
        search={String(node["search-name"])}
        display={String(node["display-name"])}
        settings={settings}
        afform={formName}
        filters={merged(fieldset?.state.applied)}
        typed={merged(fieldset?.state.values)}
        enabled={fieldset?.ready ?? true}
      />
    </>
  );
}

/** Search displays in a layout: with more than one, their URL keys carry their names. */
export function countDisplays(nodes: LayoutNode[]): number {
  return nodes
    .filter(isElement)
    .reduce(
      (count, node) =>
        count +
        (node["#tag"].startsWith("crm-search-display-") ? 1 : 0) +
        countDisplays(node["#children"] ?? []),
      0,
    );
}
