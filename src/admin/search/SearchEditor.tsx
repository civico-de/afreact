import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api4, errorMessage } from "../../api/civi";
import { Menu } from "../../search/Menu";
import type { RunDebug } from "../../search/types";
import { splitHash } from "../../url/hash";
import { isDirty, useHistory } from "../history";
import { LeaveGuardContext, navigate, useLeaveGuard } from "../route";
import { useCoreHas } from "../version";
import {
  addDisplay,
  cloneDisplay,
  cloneSearch,
  loadParams,
  newGroup,
  newSearch,
  normalize,
  removeDisplay,
  savePayload,
  toggleEntitySet,
  validate,
  withSelect,
  type EditorDisplay,
  type EditorSearch,
} from "./editor";
import { DisplayEditor, hasDisplayEditor } from "./display/DisplayEditor";
import { ConditionsTab } from "./editor/ConditionsTab";
import { EntitySetQueryTab, EntitySetsTab } from "./editor/EntitySetTabs";
import { FieldsTab } from "./editor/FieldsTab";
import { ForTab } from "./editor/ForTab";
import { GroupTab } from "./editor/GroupTab";
import { QueryTab } from "./editor/QueryTab";
import { ResultsPreview } from "./editor/ResultsPreview";
import { SettingsTab } from "./editor/SettingsTab";
import { withEntitySetFields } from "./entitySets";
import { ExportDialog } from "./ExportDialog";
import { getEntity, type ApiParams } from "./expr";
import { displayChanges, findCriticalChanges, postSaveDisplay, preSaveDisplay } from "./saveHooks";
import {
  searchAdminSettings,
  useRefreshSearchMetadata,
  useSearchMetadata,
  type SchemaField,
  type SearchAdminMetadata,
} from "./meta";

/** The classic builder's address, without hash, for links to the same record there. */
export const ClassicContext = createContext("");

export type EditorRoute =
  | { mode: "create"; entity: string }
  | { mode: "edit" | "clone"; id: number };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isApiParams = (value: unknown): value is ApiParams =>
  isRecord(value) &&
  Array.isArray(value.select) &&
  value.select.every((col) => typeof col === "string");

/** The create route's `params`, `label`, `is_template` and `tab`, as core binds them to the URL. */
function createOptions() {
  const query = splitHash(window.location.hash).params;
  const raw = query.get("params");
  let params: ApiParams | undefined;
  if (raw) {
    const parsed: unknown = JSON.parse(raw);
    if (!isApiParams(parsed))
      throw new Error(ts("The search parameters in the address are invalid."));
    params = parsed;
  }
  return {
    params,
    label: query.get("label") ?? undefined,
    isTemplate: query.get("is_template") === "1" || query.get("is_template") === "true",
    tab: query.get("tab"),
  };
}

async function loadSearch(meta: SearchAdminMetadata, route: EditorRoute): Promise<EditorSearch> {
  if (route.mode === "create") return newSearch(meta, route.entity, createOptions());
  const [raw] = await api4<Record<string, unknown>>(
    "SavedSearch",
    "get",
    loadParams(route.id, route.mode),
  );
  if (!raw) throw new Error(ts("Saved search %1 not found.", { 1: route.id }));
  const search = normalize(raw);
  return route.mode === "clone" ? cloneSearch(search, createOptions().isTemplate) : search;
}

/** crmSearchAdmin's routes: `#/create/<entity>`, `#/edit/<id>` and `#/clone/<id>`. */
export function SearchEditor(route: EditorRoute) {
  const meta = useSearchMetadata();
  const loaded = useQuery({
    queryKey: ["SavedSearch", "editor", route],
    queryFn: () => {
      if (!meta.data) throw new Error(ts("The SearchKit metadata is not loaded."));
      return loadSearch(meta.data, route);
    },
    enabled: !!meta.data,
    gcTime: 0,
    staleTime: Infinity,
  });
  const error = meta.error ?? loaded.error;
  if (error)
    return (
      <p className="crm-error" role="alert">
        {errorMessage(error)}
      </p>
    );
  if (!meta.data || !loaded.data) return <p role="status">{ts("Loading…")}</p>;
  return <Editor meta={meta.data} initial={loaded.data} create={route.mode === "create"} />;
}

/**
 * Saved displays a change can break: another entity, sets or grouping, or a column or join gone or
 * renamed. Added or reordered columns and joins break none, so they ask nothing.
 */
export function structuralRisk(saved: EditorSearch, present: EditorSearch): EditorDisplay[] {
  if (!saved.id) return [];
  const json = (value: unknown) => JSON.stringify(value ?? []);
  const alias = (col: string) => col.split(" AS ").at(-1) ?? col;
  const joinAlias = (join: unknown) => (Array.isArray(join) ? String(join[0]) : json(join));
  const gone = (before: string[], after: string[]) => before.some((item) => !after.includes(item));
  const risky =
    saved.api_entity !== present.api_entity ||
    json(saved.api_params.sets) !== json(present.api_params.sets) ||
    json(saved.api_params.groupBy) !== json(present.api_params.groupBy) ||
    gone(saved.api_params.select.map(alias), present.api_params.select.map(alias)) ||
    gone(
      (saved.api_params.join ?? []).map(joinAlias),
      (present.api_params.join ?? []).map(joinAlias),
    );
  return risky
    ? present.displays.filter(
        (display) => display.id && !display.trashed && !hasDisplayEditor(display.type),
      )
    : [];
}

/** The entity's fields for the dynamic parameters' values, as core reloads them. */
function useDynamicFields(meta: SearchAdminMetadata, entityName: string, params: ApiParams) {
  const dynamic = (getEntity(meta, entityName)?.ui_params ?? []).filter(
    (param) => param.dynamicFieldControl,
  );
  const values = Object.fromEntries(dynamic.map((param) => [param.name, params[param.name]]));
  // Once a value left its default, the fields follow every later value, the default included.
  const [changed, setChanged] = useState(false);
  if (
    !changed &&
    dynamic.some(
      (param) => values[param.name] !== undefined && values[param.name] !== param.default,
    )
  )
    setChanged(true);
  return useQuery({
    queryKey: ["afreact-admin", "dynamicFields", entityName, values],
    queryFn: async () => {
      const fields = await api4<SchemaField>(entityName, "getFields", {
        action: "get",
        loadOptions: ["id", "name", "label", "description", "color", "icon"],
        ...Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)),
      });
      return fields.map((field) => ({ ...field, fieldName: field.name }));
    },
    enabled: changed,
    staleTime: Infinity,
  }).data;
}

/** Sends save()'s calls in core's order and reads back what the server assigned. */
async function persist(search: EditorSearch, groupExists: boolean, target: EventTarget) {
  let saved: Record<string, unknown> | undefined;
  const results: Record<string, unknown> = {};
  const calls = savePayload(search, groupExists, (displays, apiCalls) => {
    preSaveDisplay(target, displays, apiCalls);
  });
  for (const [key, call] of Object.entries(calls)) {
    const [entity, action, params, index] = call;
    if (typeof entity !== "string" || typeof action !== "string" || !isRecord(params))
      throw new Error(ts("Malformed save call %1.", { 1: key }));
    const rows = await api4<Record<string, unknown>>(entity, action, params);
    results[key] = index === 0 ? rows[0] : rows;
    if (key === "saved") saved = rows[0];
  }
  if (!saved || typeof saved.id !== "number") throw new Error(ts("The search was not saved."));
  const groups = Array.isArray(saved.groups) ? saved.groups : [];
  const displays = (Array.isArray(saved.displays) ? saved.displays : []).filter(
    (d): d is EditorDisplay =>
      isRecord(d) && typeof d.type === "string" && typeof d.label === "string",
  );
  const after = Array.isArray(saved.displays)
    ? postSaveDisplay(target, displays, results)
    : { reloadMetadata: false, refreshes: [] };
  return {
    id: saved.id,
    name: typeof saved.name === "string" ? saved.name : undefined,
    groupId: isRecord(groups[0]) && typeof groups[0].id === "number" ? groups[0].id : undefined,
    displays,
    ...after,
  };
}

/**
 * What the server assigned, put into `state`: sent displays become the saved ones, deleted ones go,
 * and displays or a group added or edited since the save started stay as they are.
 */
export function mergeSaved(
  state: EditorSearch,
  sent: EditorSearch,
  sentGroup: boolean,
  result: { id: number; name?: string; groupId?: number; displays: EditorDisplay[] },
): EditorSearch {
  const kept = sent.displays.filter((d) => !d.trashed);
  const savedAs = new Map(kept.map((d, i) => [d, result.displays[i] ?? d]));
  const deleted = new Set(sent.displays.filter((d) => d.trashed));
  const sentFirst = sent.groups[0];
  return {
    ...state,
    id: result.id,
    name: result.name ?? state.name,
    groups:
      !sentGroup && Object.is(state.groups, sent.groups)
        ? []
        : state.groups.map((g, i) =>
            i === 0 && sentGroup && result.groupId && (Object.is(g, sentFirst) || !g.id)
              ? { ...g, id: result.groupId }
              : g,
          ),
    // A display edited since keeps its edits and takes the id and name its sent version got.
    displays: state.displays
      .map((d, i) => {
        const exact = savedAs.get(d);
        if (exact) return exact;
        const before = sent.displays[i];
        const saved = before && savedAs.get(before);
        return saved && before.id === d.id && before.type === d.type
          ? { ...d, id: saved.id, name: saved.name }
          : d;
      })
      .filter((d) => !deleted.has(d)),
  };
}

interface Tab {
  key: string;
  title: string;
  icon?: string | null;
  panel: () => ReactNode;
}

interface EditorProps {
  meta: SearchAdminMetadata;
  initial: EditorSearch;
  create: boolean;
}

function Editor({ meta: baseMeta, initial, create }: EditorProps) {
  const id = useId();
  const classic = useContext(ClassicContext);
  const setGuard = useContext(LeaveGuardContext);
  const settings = searchAdminSettings();
  const entityIndex = useCoreHas({ "6.20": "6.20.alpha1" });
  const afformEnabled = "org.civicrm.afform" in settings.modules;
  const afformAdmin =
    window.CRM.checkPerm("manage own afform") && "org.civicrm.afform_admin" in settings.modules;
  const [history, dispatch] = useHistory(initial);
  const search = history.present;
  const [groupExists, setGroupExists] = useState(initial.groups.length > 0);
  const [savedGroup, setSavedGroup] = useState(groupExists);
  const [saving, setSaving] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const refreshMetadata = useRefreshSearchMetadata();
  const [errors, setErrors] = useState<string[]>([]);
  const [debug, setDebug] = useState<RunDebug | null>(null);
  const [exporting, setExporting] = useState(false);
  const [goto, setGoto] = useState<number | null>(null);
  const dirty = isDirty(history) || groupExists !== savedGroup || (create && !search.id);
  const changed = isDirty(history) || groupExists !== savedGroup;
  useLeaveGuard(changed);

  const isEntitySet = search.api_entity === "EntitySet";
  const dynamicFields = useDynamicFields(baseMeta, search.api_entity, search.api_params);
  const meta = useMemo(() => {
    let next = baseMeta;
    if (dynamicFields)
      next = {
        ...next,
        schema: next.schema.map((entity) =>
          entity.name === search.api_entity ? { ...entity, fields: dynamicFields } : entity,
        ),
      };
    return isEntitySet ? withEntitySetFields(next, search.api_params) : next;
  }, [baseMeta, dynamicFields, isEntitySet, search.api_entity, search.api_params]);

  const change = (update: (state: EditorSearch) => EditorSearch) => {
    dispatch({ type: "change", update });
  };
  const setParams = (params: ApiParams) => {
    change((state) => ({
      ...state,
      api_params: withSelect({ ...params, select: state.api_params.select }, params.select),
    }));
  };

  // Core binds a new search's parameters and label to the address, so it can be copied.
  useEffect(() => {
    if (!create || search.id) return;
    const { path, params } = splitHash(window.location.hash);
    params.set("params", JSON.stringify(search.api_params));
    params.set("label", search.label);
    window.history.replaceState(window.history.state, "", `#${path}?${params.toString()}`);
  }, [create, search.id, search.api_params, search.label]);

  // A new search moves to its edit route once the unsaved-changes guard is gone; edits made
  // while it saved keep the screen, and only the address names the saved search, for reloads.
  useEffect(() => {
    if (goto === null) return;
    if (!changed) navigate(`/edit/${String(goto)}`);
    else window.history.replaceState(window.history.state, "", `#/edit/${String(goto)}`);
  }, [goto, changed]);

  const createRoute = (entity: string, params?: ApiParams, tab?: string) => {
    // Only the create route's own keys carry over; the preview's sort and page belong to the old entity.
    const current = splitHash(window.location.hash).params;
    const query = new URLSearchParams();
    for (const key of ["label", "is_template"]) {
      const value = current.get(key);
      if (value !== null) query.set(key, value);
    }
    if (params) query.set("params", JSON.stringify(params));
    if (tab) query.set("tab", tab);
    setGuard(null);
    navigate(`/create/${entity}?${query.toString()}`);
  };

  const tabs: Tab[] = [];
  if (!isEntitySet)
    tabs.push(
      {
        key: "for",
        title: ts("Search For"),
        icon: "fa-search",
        panel: () => (
          <ForTab
            meta={meta}
            search={search}
            entityLocked={!!search.id}
            onEntity={(entity) => {
              createRoute(entity);
            }}
            onChange={(next) => {
              change((state) => ({
                ...state,
                form_values: {
                  ...state.form_values,
                  ...next.form_values,
                  join: next.form_values?.join ?? state.form_values.join,
                },
                api_params: withSelect(
                  { ...next.api_params, select: state.api_params.select },
                  next.api_params.select,
                ),
              }));
            }}
          />
        ),
      },
      {
        key: "fields",
        title: ts("Select Fields"),
        icon: "fa-columns",
        panel: () => (
          <FieldsTab meta={meta} search={search} firstLocked={groupExists} onChange={setParams} />
        ),
      },
    );
  else {
    tabs.push({
      key: "entitySets",
      title: ts("Combine Searches"),
      icon: "fa-layer-group",
      panel: () => <EntitySetsTab meta={meta} params={search.api_params} onChange={setParams} />,
    });
    (search.api_params.sets ?? []).forEach((set, index) => {
      const entity = typeof set[1] === "string" ? getEntity(meta, set[1]) : undefined;
      tabs.push({
        key: `set_${String(index)}`,
        title: `${String(index + 1)}. ${entity?.title_plural ?? String(set[1])}`,
        icon: entity?.icon,
        panel: () => (
          <EntitySetQueryTab
            meta={meta}
            params={search.api_params}
            index={index}
            onChange={setParams}
          />
        ),
      });
    });
  }
  tabs.push(
    {
      key: "conditions",
      title: ts("Filter Conditions"),
      icon: "fa-filter",
      panel: () => <ConditionsTab meta={meta} search={search} onChange={setParams} />,
    },
    {
      key: "settings",
      title: ts("Configure Settings"),
      icon: "fa-gears",
      panel: () => (
        <SettingsTab
          search={search}
          canBeEntitySet={getEntity(meta, search.api_entity)?.params?.includes("groupBy") ?? false}
          onChange={(next) => {
            change((state) => ({ ...state, ...next }));
          }}
          onToggleEntitySet={() => {
            const toggled = toggleEntitySet(search);
            if (create && !search.id) createRoute(toggled.api_entity, toggled.api_params, tab);
            else
              change((state) => {
                const next = toggleEntitySet(state);
                return { ...state, api_entity: next.api_entity, api_params: next.api_params };
              });
          }}
        />
      ),
    },
    {
      key: "query",
      title: ts("Query Info"),
      icon: "fa-info-circle",
      panel: () => <QueryTab params={search.api_params} debug={debug} />,
    },
  );

  const [tab, setTab] = useState(() => {
    const wanted = create ? createOptions().tab : null;
    if (wanted && (tabs.some((t) => t.key === wanted) || (wanted === "group" && groupExists)))
      return wanted;
    return tabs[0]?.key ?? "for";
  });
  const selectTab = (key: string) => {
    change((state) =>
      new Set(state.api_params.select).size === state.api_params.select.length
        ? state
        : {
            ...state,
            api_params: { ...state.api_params, select: [...new Set(state.api_params.select)] },
          },
    );
    setTab(key);
  };
  const displayIndex = tab.startsWith("display_") ? Number(tab.slice(8)) : null;
  const shownTab =
    tabs.find((t) => t.key === tab) ?? (tab === "group" || displayIndex !== null ? null : tabs[0]);

  const forms = useQuery({
    queryKey: ["Afform", "searchEditor", search.name, search.displays.map((d) => d.name)],
    queryFn: () =>
      api4<{ name: string; title: string; search_displays: string[] }>("Afform", "get", {
        select: ["name", "title", "search_displays"],
        where: [
          [
            "OR",
            [
              ["search_displays", "CONTAINS", search.name],
              ...search.displays.flatMap((d) =>
                d.id && d.name
                  ? [["search_displays", "CONTAINS", `${String(search.name)}.${d.name}`]]
                  : [],
              ),
            ],
          ],
        ],
      }),
    enabled: afformEnabled && !!search.id && !!search.name,
  });

  function save() {
    const problems = validate(search, groupExists);
    setErrors(problems.map((p) => p.message));
    if (problems.length) {
      const first = problems.find((p) => p.tab);
      if (first?.tab) setTab(first.tab);
      return;
    }
    const risky = structuralRisk(history.saved, search);
    if (
      risky.length &&
      !window.confirm(
        ts("The following displays may no longer match the search: %1. Save anyway?", {
          1: risky.map((d) => d.label).join(", "),
        }),
      )
    )
      return;
    const target = root.current ?? document;
    const critical = findCriticalChanges(
      target,
      displayChanges(history.saved.displays, search.displays),
    );
    if (
      critical.length &&
      !window.confirm(
        `${ts("The following change(s) may affect other customizations:")}\n\n${critical.join("\n")}`,
      )
    )
      return;
    setSaving(true);
    const sent = search;
    const sentGroup = groupExists;
    persist(sent, sentGroup, target).then(
      (result) => {
        const report = (failure: unknown) => {
          window.CRM.alert(errorMessage(failure), ts("Error"), "error");
        };
        if (result.reloadMetadata) refreshMetadata().catch(report);
        for (const refresh of result.refreshes) refresh.catch(report);
        const merge = (state: EditorSearch) => mergeSaved(state, sent, sentGroup, result);
        dispatch({ type: "savedFrom", sent, merge });
        setSavedGroup(sentGroup);
        setSaving(false);
        if (!sent.id) setGoto(result.id);
      },
      (failure: unknown) => {
        setSaving(false);
        window.CRM.alert(errorMessage(failure), ts("Error"), "error");
      },
    );
  }

  const status = saving ? "saving" : dirty ? "unsaved" : "saved";
  const displayPath = window.CRM.url("civicrm/search");
  const afformPath = window.CRM.url("civicrm/admin/afform");
  const typeOf = (type: string) => meta.displayTypes.find((t) => t.id === type);
  const addable = meta.displayTypes.filter(
    (t) => t.id !== "entity" || window.CRM.checkPerm("all CiviCRM permissions and ACLs"),
  );
  const group = search.groups[0];
  const panelId = `${id}-panel`;

  return (
    <div id="bootstrap-theme" className="crm-search" ref={root}>
      <h2 className="sr-only">
        {(search.is_template ? ts("Search Template") : ts("Saved Search")) + ": " + search.label}
      </h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <div className="crm-flex-box crm-search-admin-outer">
          <div className="crm-flex-1">
            <input
              id="crm-saved-search-label"
              className="form-control"
              type="text"
              required
              aria-label={ts("Saved Search label")}
              title={ts("Saved Search label")}
              placeholder={ts("Untitled Search")}
              value={search.label}
              onChange={(event) => {
                const label = event.target.value;
                change((state) => ({ ...state, label }));
              }}
            />
          </div>
          <div className="crm-flex-1 form-inline">
            <div className="btn-group">
              <button
                type="button"
                className={`btn ${status === "unsaved" ? "btn-primary" : status === "saving" ? "btn-warning" : "btn-success"}`}
                disabled={status !== "unsaved"}
                onClick={() => {
                  save();
                }}
              >
                <i
                  className={`crm-i ${status === "saving" ? "fa-spin fa-spinner" : "fa-check"}`}
                  role="img"
                  aria-hidden="true"
                />{" "}
                {status === "saved"
                  ? ts("Saved")
                  : status === "saving"
                    ? ts("Saving...")
                    : ts("Save")}
              </button>
            </div>
            <div className="form-group pull-right">
              {afformEnabled && search.id && search.name && !search.is_template && (
                <Menu
                  groupClass="btn-group"
                  buttonClass="btn dropdown-toggle btn-primary-outline"
                  label={
                    <>
                      <i className="crm-i fa-list-alt" role="img" aria-hidden="true" />{" "}
                      {forms.data
                        ? ts("1 Form", { plural: "%count Forms", count: forms.data.length })
                        : ts("Forms...")}
                    </>
                  }
                  alignRight
                  links={[
                    ...(afformAdmin
                      ? [
                          {
                            url: `${afformPath}#/create/search/${search.name}`,
                            target: "_blank",
                            icon: "fa-plus",
                            text: ts("Create form for search results table"),
                          },
                          ...search.displays.flatMap((d) =>
                            d.id && d.name
                              ? [
                                  {
                                    url: `${afformPath}#/create/search/${String(search.name)}.${d.name}`,
                                    target: "_blank",
                                    icon: "fa-plus",
                                    text: ts("Create form for %1", { 1: d.label }),
                                  },
                                ]
                              : [],
                          ),
                        ]
                      : []),
                    ...(forms.data ?? []).map((form) => ({
                      url: afformAdmin ? `${afformPath}#/edit/${form.name}` : undefined,
                      target: "_blank",
                      icon: afformAdmin ? "fa-pencil-square-o" : "fa-list-alt",
                      text: form.title,
                      title: afformAdmin ? ts("Edit form") : undefined,
                    })),
                  ]}
                />
              )}{" "}
              {search.id && search.name && (
                <Menu
                  groupClass="btn-group crm-search-admin-links"
                  buttonClass="btn btn-primary-outline dropdown-toggle"
                  label={null}
                  srLabel={ts("View results using display")}
                  alignRight
                  prefix={
                    <a
                      href={`${displayPath}#/display/${search.name}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-primary-outline"
                      title={ts("View search results table")}
                    >
                      <i className="crm-i fa-external-link" role="img" aria-hidden="true" />{" "}
                      {ts("View Results")}
                    </a>
                  }
                  links={[
                    {
                      url: `${displayPath}#/display/${search.name}`,
                      target: "_blank",
                      icon: "fa-table",
                      text: ts("Search results table"),
                      title: ts("View search results table"),
                    },
                    ...search.displays.flatMap((d) =>
                      d.id &&
                      d.name &&
                      typeOf(d.type) &&
                      typeOf(d.type)?.grouping !== "non-viewable"
                        ? [
                            d.acl_bypass
                              ? {
                                  icon: "fa-unlock",
                                  text: d.label,
                                  title: ts("Display has permissions disabled"),
                                }
                              : {
                                  url: `${displayPath}#/display/${String(search.name)}/${d.name}`,
                                  target: "_blank",
                                  icon: typeOf(d.type)?.icon,
                                  text: d.label,
                                  title: ts("View display"),
                                },
                          ]
                        : [],
                    ),
                    {
                      task: "export",
                      icon: "fa-download",
                      text: search.is_template ? ts("Export Template") : ts("Export Search"),
                      title: ts("Export this saved search for sharing or reuse"),
                    },
                  ]}
                  isDisabled={(link) => !link.url && !link.task}
                  onLinkClick={(link, event) => {
                    if (link.task !== "export") return;
                    event.preventDefault();
                    setExporting(true);
                  }}
                />
              )}
            </div>
          </div>
        </div>
        {errors.length > 0 && (
          <div className="messages error no-popup" role="alert">
            <ul>
              {errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="crm-flex-box crm-search-admin-outer">
          <nav className="crm-search-admin-main-tabs" aria-label={ts("Search settings")}>
            <ul className="nav nav-pills nav-stacked">
              {tabs.map((t) => (
                <TabItem
                  key={t.key}
                  id={id}
                  tabKey={t.key}
                  active={tab === t.key}
                  onSelect={selectTab}
                >
                  <i className={`crm-i ${t.icon ?? ""}`} role="img" aria-hidden="true" /> {t.title}
                </TabItem>
              ))}
              <li className="disabled" aria-hidden="true" />
              {group && (
                <TabItem
                  id={id}
                  tabKey="group"
                  active={tab === "group"}
                  disabled={!groupExists}
                  title={groupExists ? undefined : ts("Group will be deleted.")}
                  onSelect={selectTab}
                  control={
                    <button
                      type="button"
                      className="btn btn-xs btn-danger-outline crm-search-display-control"
                      aria-label={
                        groupExists ? ts("Delete smart group") : ts("Undelete smart group")
                      }
                      title={groupExists ? ts("Delete") : ts("Undelete")}
                      onClick={() => {
                        const exists = !groupExists;
                        setGroupExists(exists);
                        if (!exists && !group.id) change((state) => ({ ...state, groups: [] }));
                        if (tab === "group") selectTab(tabs[0]?.key ?? "for");
                      }}
                    >
                      <i
                        className={`crm-i fa-${groupExists ? "trash" : "undo"}`}
                        role="img"
                        aria-hidden="true"
                      />
                    </button>
                  }
                >
                  <i className="crm-i fa-users" role="img" aria-hidden="true" /> {ts("Smart Group")}{" "}
                  {group.title}
                </TabItem>
              )}
              {search.displays.map((display, index) => (
                <TabItem
                  key={`${String(display.id ?? "new")}-${String(index)}`}
                  id={id}
                  tabKey={`display_${String(index)}`}
                  active={tab === `display_${String(index)}`}
                  disabled={!!display.trashed}
                  title={display.trashed ? ts("Display will be deleted.") : undefined}
                  onSelect={selectTab}
                  control={
                    <>
                      <button
                        type="button"
                        className="btn btn-xs btn-danger-outline crm-search-display-control"
                        aria-label={
                          display.trashed
                            ? ts("Undelete %1", { 1: display.label })
                            : ts("Delete %1", { 1: display.label })
                        }
                        title={display.trashed ? ts("Undelete") : ts("Delete")}
                        onClick={() => {
                          const restoring = !!display.trashed;
                          change((state) => ({
                            ...state,
                            displays: removeDisplay(state.displays, index),
                          }));
                          if (restoring) selectTab(`display_${String(index)}`);
                          else if (!display.id || tab === `display_${String(index)}`)
                            selectTab(tabs[0]?.key ?? "for");
                          if (!restoring && display.id && display.name)
                            warnEmbedded(
                              forms.data ?? [],
                              `${String(search.name)}.${display.name}`,
                              display.label,
                            );
                        }}
                      >
                        <i
                          className={`crm-i fa-${display.trashed ? "undo" : "trash"}`}
                          role="img"
                          aria-hidden="true"
                        />
                      </button>
                      {!display.trashed && (
                        <button
                          type="button"
                          className="btn btn-xs btn-primary-outline crm-search-display-control"
                          aria-label={ts("Clone %1", { 1: display.label })}
                          title={ts("Clone display")}
                          onClick={() => {
                            change((state) => ({
                              ...state,
                              displays: cloneDisplay(state.displays, index),
                            }));
                            selectTab(`display_${String(search.displays.length)}`);
                          }}
                        >
                          <i className="crm-i fa-copy" role="img" aria-hidden="true" />
                        </button>
                      )}
                    </>
                  }
                >
                  <i
                    className={`crm-i ${typeOf(display.type)?.icon ?? ""}`}
                    role="img"
                    aria-hidden="true"
                  />{" "}
                  {display.label || ts("Untitled")}
                </TabItem>
              ))}
              <li>
                <Menu
                  buttonClass="btn btn-secondary dropdown-toggle"
                  label={
                    <>
                      <i className="crm-i fa-plus" role="img" aria-hidden="true" /> {ts("Add...")}
                    </>
                  }
                  alignRight={false}
                  links={[
                    ...(!search.groups.length && !search.is_template
                      ? [
                          {
                            task: "group",
                            icon: "fa-users",
                            text: ts("Smart Group"),
                            title: ts("Smart group of contacts based on search results"),
                          },
                        ]
                      : []),
                    ...addable.map((t) => ({
                      task: `display:${t.id}`,
                      icon: t.icon,
                      text: t.label,
                      title: t.description,
                    })),
                  ]}
                  onLinkClick={(link, event) => {
                    event.preventDefault();
                    if (link.task === "group") {
                      change((state) => ({ ...state, groups: [newGroup()] }));
                      setGroupExists(true);
                      setTab("group");
                    } else if (link.task?.startsWith("display:")) {
                      const type = link.task.slice(8);
                      change((state) => ({ ...state, displays: addDisplay(meta, state, type) }));
                      setTab(`display_${String(search.displays.length)}`);
                    }
                  }}
                />
              </li>
            </ul>
          </nav>
          <div className="crm-flex-4 panel panel-default">
            <div
              className="panel-body"
              role="region"
              id={panelId}
              aria-labelledby={`${id}-tab-${shownTab?.key ?? tab}`}
            >
              <div className="crm-search-admin-relative">
                {shownTab?.panel()}
                {tab === "group" && group && (
                  <GroupTab
                    meta={meta}
                    search={search}
                    onGroup={(next) => {
                      change((state) => ({ ...state, groups: [next, ...state.groups.slice(1)] }));
                    }}
                    onSelect={(select) => {
                      change((state) => ({
                        ...state,
                        api_params: withSelect(state.api_params, select),
                      }));
                    }}
                  />
                )}
                {displayIndex !== null &&
                  search.displays[displayIndex] &&
                  hasDisplayEditor(search.displays[displayIndex].type) && (
                    <DisplayEditor
                      ctx={{
                        meta,
                        search,
                        defaultPagerSize: settings.defaultPagerSize,
                        entityIndex,
                      }}
                      search={search}
                      display={search.displays[displayIndex]}
                      typeInfo={typeOf(search.displays[displayIndex].type)}
                      searchDisplayPath={displayPath}
                      onChange={(display) => {
                        change((state) => ({
                          ...state,
                          displays: state.displays.map((d, i) =>
                            i === displayIndex ? display : d,
                          ),
                        }));
                      }}
                      onAdopt={(display) => {
                        dispatch({
                          type: "adopt",
                          update: (state) => ({
                            ...state,
                            displays: state.displays.map((d, i) =>
                              i === displayIndex ? display : d,
                            ),
                          }),
                        });
                      }}
                    />
                  )}
                {displayIndex !== null &&
                  search.displays[displayIndex] &&
                  !hasDisplayEditor(search.displays[displayIndex].type) && (
                    <DisplayTab
                      display={search.displays[displayIndex]}
                      typeLabel={typeOf(search.displays[displayIndex].type)?.label}
                      classic={classic}
                      searchId={search.id}
                      onLabel={(label) => {
                        change((state) => ({
                          ...state,
                          displays: state.displays.map((d, i) =>
                            i === displayIndex ? { ...d, label } : d,
                          ),
                        }));
                      }}
                    />
                  )}
              </div>
            </div>
          </div>
        </div>

        {displayIndex === null && (
          <ResultsPreview
            meta={meta}
            search={search}
            firstLocked={groupExists}
            onChange={setParams}
            onDebug={setDebug}
          />
        )}
      </form>
      {exporting && search.id && search.name && (
        <ExportDialog
          search={{
            id: search.id,
            name: search.name,
            label: search.label,
            api_entity: search.api_entity,
            api_params: search.api_params,
            display_name: search.displays.flatMap((d) => (d.id && d.name ? [d.name] : [])),
          }}
          onClose={() => {
            setExporting(false);
          }}
        />
      )}
    </div>
  );
}

/** removeDisplay's alert: removing an embedded display deletes the forms that embed it. */
function warnEmbedded(
  forms: { title: string; search_displays: string[] }[],
  key: string,
  label: string,
) {
  const using = forms.filter((form) => form.search_displays.includes(key));
  const first = using[0];
  if (!first) return;
  const message =
    using.length === 1
      ? ts('Form "%1" will be deleted if the embedded display "%2" is deleted.', {
          1: first.title,
          2: label,
        })
      : ts('%1 forms will be deleted if the embedded display "%2" is deleted.', {
          1: using.length,
          2: label,
        });
  window.CRM.alert(message, ts("Display embedded"), "alert");
}

interface TabItemProps {
  id: string;
  tabKey: string;
  active: boolean;
  disabled?: boolean;
  title?: string;
  onSelect: (key: string) => void;
  control?: ReactNode;
  children: ReactNode;
}

function TabItem({
  id,
  tabKey,
  active,
  disabled,
  title,
  onSelect,
  control,
  children,
}: TabItemProps) {
  return (
    <li className={active ? "active" : undefined} title={title}>
      <button
        type="button"
        id={`${id}-tab-${tabKey}`}
        className="btn-link"
        aria-current={active ? "true" : undefined}
        aria-controls={`${id}-panel`}
        disabled={disabled}
        onClick={() => {
          onSelect(tabKey);
        }}
      >
        {children}
      </button>
      {control}
    </li>
  );
}

interface DisplayTabProps {
  display: EditorDisplay;
  typeLabel: string | undefined;
  classic: string;
  searchId: number | undefined;
  onLabel: (label: string) => void;
}

/** A display's label; its settings editor opens in the classic builder until React has one. */
function DisplayTab({ display, typeLabel, classic, searchId, onLabel }: DisplayTabProps) {
  const id = useId();
  return (
    <>
      <div className="form-group">
        <label htmlFor={`${id}-label`}>{ts("Display Label")}</label>
        <input
          id={`${id}-label`}
          className="form-control"
          type="text"
          required
          value={display.label}
          onChange={(event) => {
            onLabel(event.target.value);
          }}
        />
      </div>
      <div className="messages status no-popup" role="status">
        <i className="crm-i fa-info-circle" role="img" aria-hidden="true" />{" "}
        {ts("The settings of a %1 display cannot be edited in the React builder yet.", {
          1: typeLabel ?? display.type,
        })}{" "}
        {searchId && display.id ? (
          <a href={`${classic}#/edit/${String(searchId)}`}>
            {ts("Edit them in the classic builder.")}
          </a>
        ) : (
          ts("Save the search to edit them in the classic builder.")
        )}
      </div>
    </>
  );
}
