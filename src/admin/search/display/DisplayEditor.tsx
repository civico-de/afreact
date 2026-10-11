import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { api4 } from "../../../api/civi";
import { AfreactSearch } from "../../../search/AfreactSearch";
import { isDisplaySettings, isDisplayType } from "../../../search/types";
import type { EditorDisplay } from "../editor";
import type { SearchInfo } from "../expr";
import { useSearchTasks } from "./common";
import { GridEditor, ListEditor, TreeEditor } from "./ItemsEditor";
import {
  buildLinks,
  initGrid,
  initList,
  initPager,
  initPlaceholder,
  initTable,
  initTasks,
  initToolbar,
  initTree,
  isAdminSettings,
  taskLinks,
  type DisplayContext,
  type Draft,
} from "./model";
import { TableEditor } from "./TableEditor";

/** The display types whose settings this editor knows, with what each one's $onInit normalizes. */
const EDITORS: Record<string, (ctx: DisplayContext, draft: Draft) => void> = {
  table: (ctx, draft) => {
    initTable(ctx, draft);
    initPlaceholder(draft.settings);
    initPager(ctx, draft.settings);
    initTasks(draft.settings);
    initToolbar(draft.settings);
  },
  list: (ctx, draft) => {
    initList(ctx, draft);
    initPager(ctx, draft.settings, !!draft.settings.section_group_by);
    initPlaceholder(draft.settings);
    initToolbar(draft.settings);
  },
  grid: (ctx, draft) => {
    initGrid(ctx, draft);
    initPager(ctx, draft.settings, !!draft.settings.section_group_by);
    initPlaceholder(draft.settings);
    initToolbar(draft.settings);
  },
  tree: (ctx, draft) => {
    initTree(ctx, draft);
    initPlaceholder(draft.settings);
    initToolbar(draft.settings);
  },
};

export const hasDisplayEditor = (type: string) => type in EDITORS;

/** A draft of the display, or null when its stored settings are not an object. */
export function draftOf(display: EditorDisplay): Draft | null {
  const settings = display.settings ?? {};
  return isAdminSettings(settings) ? { ...display, settings } : null;
}

/** The display as its editor's $onInit leaves it; the same object when nothing changes. */
export function initialized(ctx: DisplayContext, display: EditorDisplay): EditorDisplay {
  const init = EDITORS[display.type];
  const draft = draftOf(display);
  if (!init || !draft) return display;
  const next = structuredClone(draft);
  init(ctx, next);
  return JSON.stringify(next) === JSON.stringify(draft) ? display : next;
}

interface DisplayEditorProps {
  ctx: DisplayContext;
  search: SearchInfo & { id?: number; name?: string };
  display: EditorDisplay;
  typeInfo: { label: string; description: string; icon: string; grouping?: string } | undefined;
  searchDisplayPath: string;
  onChange: (display: EditorDisplay) => void;
  onAdopt: (display: EditorDisplay) => void;
}

/** crmSearchAdminDisplay: the shared header, the type's settings and the live preview. */
export function DisplayEditor(props: DisplayEditorProps) {
  const { ctx, search, display, typeInfo, onChange, onAdopt } = props;
  const id = useId();
  const draft = draftOf(display);
  const next = initialized(ctx, display);
  useEffect(() => {
    if (next !== display) onAdopt(next);
  }, [next, display, onAdopt]);
  const tasks = useSearchTasks(search.api_entity);
  if (!draft)
    return (
      <p className="crm-error" role="alert">
        {ts("The settings of this display are not an object, so they cannot be edited.")}
      </p>
    );
  const edit = (change: (draft: Draft) => void) => {
    const copy = structuredClone(draft);
    change(copy);
    onChange(copy);
  };
  const superAdmin = window.CRM.checkPerm("all CiviCRM permissions and ACLs");
  const viewable = !!display.id && !!typeInfo && typeInfo.grouping !== "non-viewable";
  const rowLinks = [...buildLinks(ctx, true), ...taskLinks(tasks.data ?? [])];
  const editing = { ctx, draft, edit };
  const links = { rowLinks, toolbarLinks: buildLinks(ctx, false) };
  return (
    <>
      <div className="crm-search-admin-flex-row">
        <div className="help-block">
          <i className={`crm-i ${typeInfo?.icon ?? ""}`} role="img" aria-hidden="true" />{" "}
          {typeInfo?.description}
        </div>
        {viewable && search.name && display.name && (
          <div className="btn-group crm-search-admin-display-header-links">
            <a
              href={`${props.searchDisplayPath}#/display/${search.name}/${display.name}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-primary-outline"
              title={ts("View search display on its own page")}
            >
              <i className="crm-i fa-external-link" role="img" aria-hidden="true" />{" "}
              {ts("View Display")}
            </a>
          </div>
        )}
      </div>
      <fieldset className="crm-search-admin-display-header">
        <legend className="sr-only">{ts("Display")}</legend>
        <div className="form-inline">
          <label htmlFor={`${id}-label`}>
            {ts("Name")}{" "}
            <span className="crm-marker" aria-hidden="true">
              *
            </span>
          </label>{" "}
          <input
            id={`${id}-label`}
            type="text"
            className="form-control"
            required
            placeholder={ts("Untitled")}
            value={display.label}
            onChange={(event) => {
              const label = event.target.value;
              edit((d) => {
                d.label = label;
              });
            }}
          />{" "}
          <label
            className={`form-control${superAdmin ? "" : " disabled"}`}
            title={ts(
              'Only users with "all CiviCRM permissions and ACLs" can disable permission checks.',
            )}
          >
            <input
              type="checkbox"
              className="sr-only"
              disabled={!superAdmin}
              checked={!!display.acl_bypass}
              onChange={() => {
                edit((d) => {
                  d.acl_bypass = !d.acl_bypass;
                });
              }}
            />
            <i
              className={`crm-i ${display.acl_bypass ? "fa-unlock text-danger" : "fa-lock text-success"}`}
              role="img"
              aria-hidden="true"
            />{" "}
            <span>{display.acl_bypass ? ts("Bypass Permissions") : ts("Enforce Permissions")}</span>
          </label>
          {display.acl_bypass && (
            <div className="help-block bg-warning">
              <i className="crm-i fa-unlock" role="img" aria-hidden="true" />{" "}
              {ts(
                "Anyone who can view this display will be able to see all results, regardless of their permission level.",
              )}
            </div>
          )}
        </div>
        <div>
          <label htmlFor={`${id}-description`} className="sr-only">
            {ts("Description (shown above)")}
          </label>
          <textarea
            id={`${id}-description`}
            className="form-control"
            placeholder={ts("Description (shown above)")}
            value={draft.settings.description ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              edit((d) => {
                d.settings.description = value;
              });
            }}
          />
        </div>
      </fieldset>
      {display.type === "table" && <TableEditor {...editing} {...links} />}
      {display.type === "list" && <ListEditor {...editing} {...links} />}
      {display.type === "grid" && <GridEditor {...editing} {...links} />}
      {display.type === "tree" && <TreeEditor {...editing} {...links} />}
      <hr />
      <Preview search={search} draft={next === display ? draft : null} icon={typeInfo?.icon} />
    </>
  );
}

/** The preview button and the runtime display with the settings as they were when clicked. */
function Preview({
  search,
  draft,
  icon,
}: {
  search: SearchInfo & { name?: string };
  draft: Draft | null;
  icon: string | undefined;
}) {
  const [shown, setShown] = useState<{ key: string; draft: Draft } | null>(null);
  const key = draft ? JSON.stringify([search.api_params, draft]) : null;
  const stale = !shown || shown.key !== key;
  return (
    <>
      <button
        type="button"
        className={`btn btn-${!stale ? "success" : shown ? "warning" : "primary"}`}
        disabled={!stale || !draft || !key}
        onClick={() => {
          if (draft && key) setShown({ key, draft: structuredClone(draft) });
        }}
      >
        <i className={`crm-i ${icon ?? ""}`} role="img" aria-hidden="true" />{" "}
        {shown && stale ? ts("Refresh") : ts("Preview")}
      </button>
      <hr />
      {shown && <PreviewDisplay key={shown.key} search={search} draft={shown.draft} />}
    </>
  );
}

function PreviewDisplay({
  search,
  draft,
}: {
  search: SearchInfo & { name?: string };
  draft: Draft;
}) {
  const savedSearch = {
    name: search.name,
    api_entity: search.api_entity,
    api_params: search.api_params,
  };
  const auto = draft.settings.columnMode === "auto";
  const defaults = useQuery({
    queryKey: ["SearchDisplay", "getDefault", savedSearch, draft.type],
    queryFn: async () => {
      const [found] = await api4<{ settings?: unknown }>("SearchDisplay", "getDefault", {
        savedSearch,
        type: draft.type,
        select: ["settings"],
      });
      return found?.settings;
    },
    enabled: auto,
  });
  const columns =
    auto && isDisplaySettings(defaults.data) ? defaults.data.columns : draft.settings.columns;
  const settings = { ...draft.settings, columns };
  if (auto && defaults.isPending) return <p role="status">{ts("Loading…")}</p>;
  if (defaults.error)
    return (
      <p className="crm-error" role="alert">
        {defaults.error.message}
      </p>
    );
  if (!isDisplaySettings(settings) || !isDisplayType(draft.type))
    return (
      <p className="crm-error" role="alert">
        {ts("This display cannot be previewed.")}
      </p>
    );
  return (
    <AfreactSearch
      search={search.name ?? ""}
      display={null}
      type={draft.type}
      settings={settings}
      inline={{ search: savedSearch, display: { ...draft, settings } }}
    />
  );
}
