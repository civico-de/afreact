import { useQuery } from "@tanstack/react-query";
import { parseAsString, useQueryStates } from "nuqs";
import {
  createContext,
  createElement,
  useCallback,
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
import { savedColumnsOf } from "../search/ColumnPicker";
import { evaluateDisplayFilters, routeKeys, RouteOptionsContext } from "../search/displayFilters";
import { displayTypeOf } from "../search/types";
import {
  defaultValues,
  fieldsetReducer,
  filterValues,
  initialState,
  operatorOf,
  SEARCH_DELAY_MS,
  urlText,
  writesWhole,
  type FieldsetAction,
  type FieldsetReducerState,
  type FilterField,
  type FilterValues,
  type ParamSet,
  type ValueContext,
} from "../search/filters";
import { useHashParams, useParamStore, useUrlPrefix } from "../url/UrlState";
import { Field, fieldClasses } from "./Field";
import {
  fieldAttributesNote,
  searchDisplayCheck,
  searchRangeNote,
  unknownFilterAttributes,
} from "./support";
import { TabCount, useTab } from "./Tabs";
import { TAB_COUNT } from "./tabsets";
import type { ElementNode, LayoutNode } from "./types";
import { isElement, isFieldDefn } from "./types";
import { FieldEnvContext } from "./fields/env";
import { RANGE_TYPES } from "./fields/SearchRange";
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
  /** afFieldset.getName() and the form, for the fields that call the server. */
  name: string;
  formName: string;
  /** The saved set's shown columns, per "search.display". */
  columns: unknown;
  fields: FilterField[];
  /** The saved set the URL names (`_s`), if any. */
  setId: string | null;
  /** Applies a saved set as afSearchParamSets does: a new history entry `#?_s=<id>`. */
  select: (id: number) => void;
  /** The tables' picked columns per "search.display", as getToggledColumns() reports them. */
  toggled: Record<string, Record<string, string>>;
  reportColumns: (key: string, columns: Record<string, string>) => void;
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
  return found ?? { missing: true };
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

  useUrlWriter(fields, name, state, context, setId, paramSet.data);

  const [toggled, setToggled] = useState<Record<string, Record<string, string>>>({});
  const reportColumns = useCallback((key: string, picked: Record<string, string>) => {
    setToggled((all) => {
      if (JSON.stringify(all[key] ?? {}) === JSON.stringify(picked)) return all;
      const rest = Object.fromEntries(Object.entries(all).filter(([other]) => other !== key));
      return Object.keys(picked).length ? { ...rest, [key]: picked } : rest;
    });
  }, []);
  const select = useCallback(
    (id: number) => {
      store.write(new URLSearchParams({ _s: String(id) }), { push: true });
      setRoute(store.params());
    },
    [store],
  );
  const columns = paramSet.data?.columns;
  const value = useMemo(
    () => ({
      state,
      dispatch,
      ready,
      name,
      formName,
      columns,
      fields,
      setId,
      select,
      toggled,
      reportColumns,
    }),
    [state, ready, name, formName, columns, fields, setId, select, toggled, reportColumns],
  );
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
 * Writes the user's filter changes to the hash under the keys afField reads. Values equal to
 * what a reload would give anyway stay out: the saved set's (`_s`), else the defaults.
 */
// deviation:param-set-edits-in-url
function useUrlWriter(
  fields: FilterField[],
  name: string,
  state: FieldsetReducerState,
  context: ValueContext,
  setId: string | null,
  paramSet: ParamSet | undefined,
) {
  const prefix = useUrlPrefix(name);
  const unique = useMemo(
    () => fields.filter((field, index) => fields.findIndex((o) => o.name === field.name) === index),
    [fields],
  );
  const keyMap = useMemo(() => {
    const keys: Record<string, typeof parseAsString> = {};
    for (const field of unique) {
      keys[field.name] = parseAsString;
      keys[`${name}.${field.name}`] = parseAsString;
    }
    return keys;
  }, [unique, name]);
  const [, setUrl] = useQueryStates(keyMap);
  const defaults = useMemo(() => filterValues(defaultValues(fields, context)), [fields, context]);
  const write = useEffectEvent(() => {
    const update: Record<string, string | null> = {};
    const filters = filterValues(state.applied);
    const base = setId && !paramSet?.missing ? filterValues(paramSet?.filters ?? {}) : defaults;
    for (const field of unique) {
      const plain = field.name;
      const full = `${name}.${field.name}`;
      const isDefault = JSON.stringify(filters[plain]) === JSON.stringify(base[plain]);
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
  const value =
    operator && !writesWhole(defn) ? (isRecord(current) ? current[operator] : undefined) : current;
  const unknown = unknownFilterAttributes(node);
  const label = defn.label === false ? name : (defn.label ?? name);
  return createElement(
    "af-field",
    {
      name,
      className: `${fieldClasses(defn)} ${typeof node.class === "string" ? node.class : ""}`.trim(),
    },
    unknown.length > 0 && <Unsupported what={fieldAttributesNote(unknown, name)} />,
    defn.search_range && !RANGE_TYPES.has(defn.input_type) ? (
      <Unsupported what={searchRangeNote(label)} />
    ) : (
      <FieldEnvContext.Provider
        value={{
          formName: fieldset.formName,
          modelName: fieldset.name,
          fieldName: name,
          values: state.values,
        }}
      >
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
      </FieldEnvContext.Provider>
    ),
  );
}

interface FieldsetDisplayProps {
  node: ElementNode;
  formName: string;
  /** Takes the labels of the display's own filters; core reads them only inside a fieldset. */
  onLabels: (labels: string[]) => void;
}

/**
 * An embedded search display: searches with the fieldset's values and its own `filters`,
 * which win on the same key (getFilters()).
 */
export function FieldsetDisplay({ node, formName, onLabels }: FieldsetDisplayProps) {
  const search = String(node["search-name"]);
  const display = String(node["display-name"]);
  const fieldset = useSearchFieldset();
  const options = useContext(RouteOptionsContext);
  const tab = useTab();
  const inTab = tab !== null;
  const check = useMemo(() => searchDisplayCheck(node, options, inTab), [node, options, inTab]);
  const params = useHashParams(check.filters ? routeKeys(check.filters) : []);
  const notes = check.notes.map((note) => <Unsupported key={note} what={note} />);
  if (check.filters === null) return notes;
  const own = evaluateDisplayFilters(check.filters, params, options);
  const merged = (values: FilterValues | undefined) => ({
    ...(values ? filterValues(values) : {}),
    ...own,
  });
  return (
    <>
      {notes}
      {inTab && node["total-count"] === TAB_COUNT && (
        <TabCount
          search={String(node["search-name"])}
          display={String(node["display-name"])}
          afform={formName}
          filters={own}
        />
      )}
      <AfreactSearch
        search={search}
        display={display}
        type={displayTypeOf(node["#tag"]) ?? "table"}
        settings={check.settings}
        savedColumns={savedColumnsOf(fieldset?.columns, `${search}.${display}`)}
        // The form also outside a fieldset, so its markup filters apply. deviation:display-outside-fieldset-form
        afform={formName}
        filters={merged(fieldset?.state.applied)}
        typed={merged(fieldset?.state.values)}
        enabled={(fieldset?.ready ?? true) && (tab?.shown ?? true)}
        onLabels={fieldset ? onLabels : undefined}
        onColumns={fieldset?.reportColumns}
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
