import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { api4 } from "../../../api/civi";
import { AfreactSearch } from "../../../search/AfreactSearch";
import { isDisplaySettings } from "../../../search/types";
import type { EditorDisplay } from "../editor";
import { ModelText } from "../../widgets/ModelText";
import type { SearchInfo } from "../expr";
import { useSearchTasks } from "./common";
import { AutocompleteEditor } from "./AutocompleteEditor";
import { AutocompletePreview } from "./AutocompletePreview";
import { BatchEditor } from "./BatchEditor";
import { ChartKitEditor } from "./ChartKitEditor";
import { EntityEditor, entityPreviewSettings } from "./EntityEditor";
import { GridEditor, ListEditor, TreeEditor } from "./ItemsEditor";
import {
  buildLinks,
  initAutocomplete,
  initBatch,
  initEntity,
  initGrid,
  initLinkGroups,
  initList,
  initPager,
  initPlaceholder,
  initSubsearchFilters,
  initTable,
  initTasks,
  initToolbar,
  initTree,
  isAdminSettings,
  taskLinks,
  type DisplayContext,
  type Draft,
} from "./model";
import { unknownSettings } from "./knownSettings";
import { TableEditor } from "./TableEditor";

/** The display types whose settings this editor knows, with what each one's $onInit normalizes. */
const EDITORS: Record<string, (ctx: DisplayContext, draft: Draft) => void> = {
  table: (ctx, draft) => {
    initTable(ctx, draft);
    initPlaceholder(draft.settings);
    initPager(ctx, draft.settings);
    initTasks(draft.settings);
    initToolbar(draft.settings);
    initLinkGroups(ctx, draft);
    initSubsearchFilters(draft);
  },
  list: (ctx, draft) => {
    initList(ctx, draft);
    initPager(ctx, draft.settings, !!draft.settings.section_group_by);
    initPlaceholder(draft.settings);
    initToolbar(draft.settings);
    initLinkGroups(ctx, draft);
    initSubsearchFilters(draft);
  },
  grid: (ctx, draft) => {
    initGrid(ctx, draft);
    initPager(ctx, draft.settings, !!draft.settings.section_group_by);
    initPlaceholder(draft.settings);
    initToolbar(draft.settings);
    initLinkGroups(ctx, draft);
    initSubsearchFilters(draft);
  },
  autocomplete: (ctx, draft) => {
    initAutocomplete(ctx, draft);
  },
  entity: (ctx, draft) => {
    initEntity(ctx, draft);
  },
  batch: (ctx, draft) => {
    initBatch(ctx, draft);
    initPager(ctx, draft.settings);
  },
  tree: (ctx, draft) => {
    initTree(ctx, draft);
    initPlaceholder(draft.settings);
    initToolbar(draft.settings);
    initLinkGroups(ctx, draft);
    initSubsearchFilters(draft);
  },
  // Its defaults come from chart_kit's script, so ChartKitEditor adopts them once loaded.
  "chart-kit": () => undefined,
};

export const hasDisplayEditor = (type: string) => type in EDITORS;

/** chart_kit stores columns of its own, by axis, which the shared draft leaves to its editor. */
const ownColumns = (type: string) => type === "chart-kit";

function withoutColumns(display: EditorDisplay): EditorDisplay {
  if (!display.settings) return display;
  return {
    ...display,
    settings: Object.fromEntries(Object.entries(display.settings).filter(([k]) => k !== "columns")),
  };
}

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
  /** The classic builder's address, without hash. */
  classic: string;
  onChange: (display: EditorDisplay) => void;
  onAdopt: (display: EditorDisplay) => void;
}

/** crmSearchAdminDisplay: the shared header, the type's settings and the live preview. */
export function DisplayEditor(props: DisplayEditorProps) {
  const { ctx, search, display, typeInfo, onChange, onAdopt } = props;
  const id = useId();
  const own = ownColumns(display.type);
  const draft = draftOf(own ? withoutColumns(display) : display);
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
  const restore = (d: Draft): EditorDisplay =>
    own && display.settings && "columns" in display.settings
      ? { ...d, settings: { ...d.settings, columns: display.settings.columns } }
      : d;
  const edit = (change: (draft: Draft) => void) => {
    const copy = structuredClone(draft);
    change(copy);
    onChange(restore(copy));
  };
  const superAdmin = window.CRM.checkPerm("all CiviCRM permissions and ACLs");
  const viewable = !!display.id && !!typeInfo && typeInfo.grouping !== "non-viewable";
  const rowLinks = [...buildLinks(ctx, true), ...taskLinks(tasks.data ?? [])];
  const adopt = (change: (draft: Draft) => void) => {
    const copy = structuredClone(draft);
    change(copy);
    onAdopt(restore(copy));
  };
  const editing = { ctx, draft, edit };
  const ownHeader = ["autocomplete", "entity", "batch"].includes(display.type);
  const links = { rowLinks, toolbarLinks: buildLinks(ctx, false) };
  return (
    <>
      {!ownHeader && (
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
              <ModelText
                id={`${id}-label`}
                className="form-control"
                live
                required
                placeholder={ts("Untitled")}
                value={display.label}
                onChange={(label) => {
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
                <span>
                  {display.acl_bypass ? ts("Bypass Permissions") : ts("Enforce Permissions")}
                </span>
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
              <ModelText
                id={`${id}-description`}
                className="form-control"
                multiline
                live
                placeholder={ts("Description (shown above)")}
                value={draft.settings.description ?? ""}
                onChange={(value) => {
                  edit((d) => {
                    d.settings.description = value;
                  });
                }}
              />
            </div>
          </fieldset>
        </>
      )}
      <UnknownSettings
        paths={unknownSettings(display.type, display.settings)}
        classic={search.id && display.id ? `${props.classic}#/edit/${String(search.id)}` : null}
      />
      {display.type === "autocomplete" && <AutocompleteEditor {...editing} />}
      {display.type === "entity" && <EntityEditor {...editing} adopt={adopt} />}
      {display.type === "batch" && <BatchEditor {...editing} />}
      {display.type === "table" && <TableEditor {...editing} {...links} />}
      {display.type === "list" && <ListEditor {...editing} {...links} />}
      {display.type === "grid" && <GridEditor {...editing} {...links} />}
      {display.type === "tree" && <TreeEditor {...editing} {...links} />}
      {display.type === "chart-kit" && (
        <ChartKitEditor
          ctx={ctx}
          display={display}
          onSettings={(settings) => {
            onChange({ ...display, settings });
          }}
          onAdoptSettings={(settings) => {
            onAdopt({ ...display, settings });
          }}
        />
      )}
      <hr />
      <Preview
        search={search}
        draft={next === display ? draft : null}
        display={next === display ? restore(draft) : null}
        icon={typeInfo?.icon}
      />
    </>
  );
}

/** Settings React's editor does not know, which a save hands back unchanged. */
function UnknownSettings({ paths, classic }: { paths: string[]; classic: string | null }) {
  if (!paths.length) return null;
  return (
    <div className="messages status no-popup" role="status">
      <i className="crm-i fa-info-circle" role="img" aria-hidden="true" />{" "}
      {ts("This display has settings the React builder cannot edit; saving keeps them unchanged.")}{" "}
      {classic ? (
        <a href={classic}>{ts("Edit them in the classic builder.")}</a>
      ) : (
        ts("Save the search to edit them in the classic builder.")
      )}
      <ul>
        {paths.map((path) => (
          <li key={path}>
            <code>{path}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The preview of a display whose editor is another extension's element. */
export function PluginPreview(props: {
  search: SearchInfo & { name?: string };
  display: EditorDisplay;
  icon: string | undefined;
}) {
  return <Preview {...props} draft={draftOf(props.display)} />;
}

/** The preview button and the runtime display with the settings as they were when clicked. */
function Preview({
  search,
  draft,
  display,
  icon,
}: {
  search: SearchInfo & { name?: string };
  draft: Draft | null;
  display: EditorDisplay | null;
  icon: string | undefined;
}) {
  const [shown, setShown] = useState<{ key: string; draft: Draft; display: EditorDisplay } | null>(
    null,
  );
  const key = draft && display ? JSON.stringify([search.api_params, display]) : null;
  const stale = !shown || shown.key !== key;
  return (
    <>
      <button
        type="button"
        className={`btn btn-${!stale ? "success" : shown ? "warning" : "primary"}`}
        disabled={!stale || !key}
        onClick={() => {
          if (draft && display && key)
            setShown({ key, draft: structuredClone(draft), display: structuredClone(display) });
        }}
      >
        <i className={`crm-i ${icon ?? ""}`} role="img" aria-hidden="true" />{" "}
        {shown && stale ? ts("Refresh") : ts("Preview")}
      </button>
      <hr />
      {shown?.draft.type === "autocomplete" && (
        <AutocompletePreview key={shown.key} search={search} draft={shown.draft} />
      )}
      {shown && shown.draft.type !== "autocomplete" && (
        <PreviewDisplay
          key={shown.key}
          search={search}
          draft={shown.draft}
          display={shown.display}
        />
      )}
    </>
  );
}

function PreviewDisplay({
  search,
  draft,
  display,
}: {
  search: SearchInfo & { name?: string };
  draft: Draft;
  display: EditorDisplay;
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
    auto && isDisplaySettings(defaults.data) ? defaults.data.columns : display.settings?.columns;
  // crmSearchDisplayEntity previews a DB entity as a table of its first rows.
  const entity = draft.type === "entity";
  const settings = entity
    ? entityPreviewSettings(draft.settings)
    : { ...display.settings, columns };
  const type = entity ? "table" : draft.type;
  if (auto && defaults.isPending) return <p role="status">{ts("Loading…")}</p>;
  if (defaults.error)
    return (
      <p className="crm-error" role="alert">
        {defaults.error.message}
      </p>
    );
  if (!isDisplaySettings(settings))
    return (
      <p className="crm-error" role="alert">
        {ts("This display cannot be previewed.")}
      </p>
    );
  return (
    <AfreactSearch
      search={search.name ?? ""}
      display={null}
      type={type}
      settings={settings}
      inline={{ search: savedSearch, display: { ...display, type, settings } }}
    />
  );
}
