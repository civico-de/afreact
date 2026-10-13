import { useQuery, useQueryClient } from "@tanstack/react-query";
import { parseAsString, useQueryState } from "nuqs";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { api4, errorMessage } from "../../api/civi";
import { Menu } from "../../search/Menu";
import { Pager } from "../../search/Pager";
import type { Link } from "../../search/types";
import { ConfirmDialog } from "../widgets/ConfirmDialog";
import { EntityTags } from "../widgets/EntityTags";
import { Picker, type PickerOption } from "../widgets/Picker";
import { ExportDialog } from "./ExportDialog";
import { ImportDialog } from "./ImportDialog";
import {
  consequences,
  currentPermissions,
  deleteOrRevertCall,
  isListTab,
  listingParams,
  loadEmbeddingForms,
  NO_FILTERS,
  rowAccess,
  type EmbeddingForm,
  type ListedSearch,
  type ListFilters,
  type ListSort,
  type ListTab,
} from "./listing";
import { entitySelect, searchAdminSettings, useSearchMetadata } from "./meta";
import { SegmentList } from "./SegmentList";

type SearchTab = Exclude<ListTab, "segment">;

interface TabInfo {
  name: ListTab;
  title: string;
  icon: string;
}

const tabs = (): TabInfo[] => [
  { name: "custom", title: ts("Saved Searches"), icon: "fa-search-plus" },
  { name: "template", title: ts("Search Templates"), icon: "fa-clipboard" },
  { name: "segment", title: ts("Search Segments"), icon: "fa-object-group" },
  { name: "packaged", title: ts("Packaged Searches"), icon: "fa-suitcase" },
];

const TAB_WHERE: Record<SearchTab, unknown[]> = {
  custom: ["has_base", "=", false],
  template: ["is_template", "=", true],
  packaged: ["has_base", "=", true],
};

/** Each tab's total, which core shows in its badge. */
function useTabCount(tab: ListTab) {
  return useQuery({
    queryKey: ["SavedSearch", "listCount", tab],
    queryFn: async () => {
      const result =
        tab === "segment"
          ? await api4("SearchSegment", "get", { select: ["row_count"] })
          : await api4("SavedSearch", "get", {
              select: ["row_count"],
              where: [["api_entity", "IS NOT NULL"], ["is_current", "=", true], TAB_WHERE[tab]],
            });
      return result.countMatched ?? 0;
    },
  });
}

interface TabButtonProps {
  tab: TabInfo;
  active: boolean;
  onSelect: () => void;
  /** The arrow keys move between tabs. */
  onKeyDown: (event: KeyboardEvent) => void;
}

function TabButton({ tab, active, onSelect, onKeyDown }: TabButtonProps) {
  const count = useTabCount(tab.name);
  return (
    <li role="presentation" className={active ? "active" : undefined}>
      <button
        type="button"
        role="tab"
        id={`afreact-search-tab-${tab.name}`}
        aria-selected={active}
        aria-controls={`afreact-search-panel-${tab.name}`}
        tabIndex={active ? 0 : -1}
        className="btn btn-link"
        onClick={onSelect}
        onKeyDown={onKeyDown}
      >
        <i className={`crm-i ${tab.icon}`} role="img" aria-hidden="true" /> {tab.title}{" "}
        <span className="badge">{count.data ?? ""}</span>
      </button>
    </li>
  );
}

/** searchList.html: the saved search listing in tabs, with the buttons to create a search. */
export function SearchList() {
  const [tabParam, setTab] = useQueryState("tab", parseAsString);
  const tab: ListTab = isListTab(tabParam) ? tabParam : "custom";
  const all = tabs();
  const meta = useSearchMetadata();
  const primary = (meta.data?.schema ?? []).filter((entity) => entity.searchable === "primary");
  const [segmentDialog, setSegmentDialog] = useState<{ entity?: string } | null>(null);

  // deviation:search-listing-a11y
  function onTabKey(event: KeyboardEvent) {
    const index = all.findIndex((t) => t.name === tab);
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = all[(index + step + all.length) % all.length];
    if (!next) return;
    void setTab(next.name);
    document.getElementById(`afreact-search-tab-${next.name}`)?.focus();
  }

  const template = tab === "template" ? 1 : 0;
  const createLinks: Link[] = [
    ...primary.map((entity) => ({
      url: `#/create/${entity.name}?is_template=${String(template)}`,
      text: entity.title_plural,
      icon: entity.icon ?? undefined,
      task: tab === "segment" ? entity.name : undefined,
    })),
    {
      url: `#/create/Contact?is_template=${String(template)}`,
      text: ts("More..."),
      title: ts("Choose other entities on the search screen"),
    },
  ];
  return (
    <div id="bootstrap-theme" className="crm-search">
      <h1>{ts("SearchKit")}</h1>
      <div className="crm-search-nav-tabs">
        <ul role="tablist" className="nav nav-tabs">
          {all.map((t) => (
            <TabButton
              key={t.name}
              tab={t}
              active={t.name === tab}
              onSelect={() => void setTab(t.name === "custom" ? null : t.name)}
              onKeyDown={onTabKey}
            />
          ))}
        </ul>
        {tab === "segment" ? (
          <Menu
            buttonClass="btn btn-primary dropdown-toggle"
            srLabel={ts("Select Base Entity for new data segment")}
            alignRight
            label=""
            prefix={
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setSegmentDialog({});
                }}
              >
                <i className="crm-i fa-plus" role="img" aria-hidden="true" /> {ts("New Segment")}
              </button>
            }
            links={createLinks.map((link) => ({ ...link, url: undefined, task: link.task ?? "" }))}
            onLinkClick={(link, event) => {
              event.preventDefault();
              setSegmentDialog(link.task ? { entity: link.task } : {});
            }}
          />
        ) : (
          <Menu
            buttonClass="btn btn-primary dropdown-toggle"
            srLabel={ts("Add New Search with entity")}
            alignRight
            label=""
            prefix={
              <a
                className="btn btn-primary"
                href={`#/create/Contact?is_template=${String(template)}`}
              >
                <i className="crm-i fa-plus" role="img" aria-hidden="true" />{" "}
                {tab === "template" ? ts("New Template") : ts("New Search")}
              </a>
            }
            links={createLinks}
          />
        )}
      </div>
      {tab === "segment" ? (
        <div
          role="tabpanel"
          id="afreact-search-panel-segment"
          aria-labelledby="afreact-search-tab-segment"
        >
          <SegmentList dialog={segmentDialog} onDialog={setSegmentDialog} />
        </div>
      ) : (
        <ListingTab key={tab} tab={tab} />
      )}
    </div>
  );
}

const SORTABLE = new Set([
  "label",
  "description",
  "api_entity:label",
  "groups",
  "base_module:label",
  "local_modified_date",
  "created_date",
  "modified_date",
  "expires_date",
]);

interface ColumnDef {
  key: string;
  label: string;
  className?: string;
  render: (row: ListedSearch, access: { edit: boolean; remove: boolean }) => React.ReactNode;
}

const formatDate = (value: string | null) =>
  value ? window.CRM.utils.formatDate(value, null, false) : "";

const authored = (date: string | null, name: string | null) =>
  date ? ts("%1 by %2", { 1: formatDate(date), 2: name ?? "" }) : "";

/** One tab of saved searches: its filters, the table and the pager. */
function ListingTab({ tab }: { tab: SearchTab }) {
  const settings = searchAdminSettings();
  const perms = currentPermissions(settings.modules);
  const meta = useSearchMetadata();
  const client = useQueryClient();
  const [filters, setFilters] = useState<ListFilters>(NO_FILTERS);
  const [sort, setSort] = useState<ListSort>(["modified_date", "DESC"]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(settings.defaultPagerSize);
  const afformEnabled = "org.civicrm.afform" in settings.modules;
  // Without FormBuilder no form embeds a display.
  const [forms, setForms] = useState<Record<string, EmbeddingForm[]> | null>(
    afformEnabled ? null : {},
  );
  const [pending, setPending] = useState<ListedSearch | null>(null);
  const [exporting, setExporting] = useState<ListedSearch | null>(null);
  const [importing, setImporting] = useState(false);
  const formsLoad = useRef<Promise<Record<string, EmbeddingForm[]>> | null>(null);
  const afformAdmin =
    window.CRM.checkPerm("manage own afform") && "org.civicrm.afform_admin" in settings.modules;
  const scheduleAllowed = perms.communications && perms.schedule;
  const id = useId();

  const params = listingParams(tab, filters, sort, page, limit, perms.communications);
  const listing = useQuery({
    queryKey: ["SavedSearch", "listing", params],
    queryFn: () => api4<ListedSearch>("SavedSearch", "get", params),
    placeholderData: (previous) => previous,
  });
  const rows = listing.data ?? [];
  const rowCount = listing.data?.countMatched ?? 0;

  const loadForms = () => {
    if (!afformEnabled) return;
    formsLoad.current ??= loadEmbeddingForms().then(
      (loaded) => {
        setForms(loaded);
        return loaded;
      },
      (error: unknown) => {
        formsLoad.current = null;
        window.CRM.alert(errorMessage(error), ts("Error"), "error");
        return {};
      },
    );
  };

  const refresh = () => client.invalidateQueries({ queryKey: ["SavedSearch"] });
  const update = (filter: Partial<ListFilters>) => {
    setFilters({ ...filters, ...filter });
    setPage(1);
  };

  async function save(row: ListedSearch, values: Partial<ListedSearch>) {
    const status = window.CRM.status({});
    try {
      await api4("SavedSearch", "update", { where: [["id", "=", row.id]], values });
      status.resolve();
    } catch (error) {
      status.reject();
      window.CRM.alert(errorMessage(error), ts("Error"), "error");
    }
    await refresh();
  }

  async function deleteOrRevert(row: ListedSearch) {
    const revert = !!row["base_module:label"];
    setPending(null);
    const status = window.CRM.status({
      start: revert ? ts("Reverting...") : ts("Deleting..."),
      success: revert ? ts("Search Reverted") : ts("Search Deleted"),
    });
    try {
      await api4(...deleteOrRevertCall(row));
      status.resolve();
    } catch (error) {
      status.reject();
      window.CRM.alert(errorMessage(error), ts("Error"), "error");
    }
    await refresh();
  }

  const columns: ColumnDef[] = [
    {
      key: "label",
      label: ts("Label"),
      render: (row, access) => (
        <InlineText
          value={row.label}
          title={ts("Edit Label")}
          editable={access.edit}
          required
          onSave={(label) => void save(row, { label })}
        />
      ),
    },
    {
      key: "description",
      label: ts("Description"),
      render: (row, access) => (
        <InlineText
          value={row.description ?? ""}
          title={ts("Edit Description")}
          editable={access.edit}
          onSave={(description) => void save(row, { description })}
        />
      ),
    },
    {
      key: "api_entity:label",
      label: ts("For"),
      render: (row) => row["api_entity:label"] ?? <em>{ts("Missing")}</em>,
    },
    {
      key: "tags",
      label: ts("Tags"),
      render: (row, access) => (
        <EntityTags
          size="xs"
          entityTable="civicrm_saved_search"
          entityId={row.id}
          tagIds={row.tag_id ?? []}
          editable={access.edit}
          onChange={() => void refresh()}
        />
      ),
    },
    { key: "displays", label: ts("Displays"), render: (row) => <DisplaysMenu row={row} /> },
  ];
  if (afformEnabled && tab !== "template")
    columns.push({
      key: "forms",
      label: ts("Forms"),
      render: (row) => <FormsMenu row={row} forms={forms} admin={afformAdmin} onOpen={loadForms} />,
    });
  if (scheduleAllowed && tab !== "template")
    columns.push({
      key: "communications",
      label: ts("Communications"),
      render: (row) => <CommunicationsMenu row={row} />,
    });
  if (tab !== "template")
    columns.push({
      key: "groups",
      label: ts("Smart Group"),
      render: (row) => row.groups?.join(", "),
    });
  if (tab !== "custom") {
    columns.push({
      key: "base_module:label",
      label: ts("Package"),
      render: (row) =>
        row["base_module:label"] ?? (tab === "packaged" ? <em>{ts("Missing")}</em> : null),
    });
    columns.push({
      key: "local_modified_date",
      label: ts("Modified"),
      render: (row) =>
        row.local_modified_date ? (
          authored(row.modified_date, row["modified_id.display_name"])
        ) : (
          <em>{ts("No")}</em>
        ),
    });
  } else {
    columns.push({
      key: "created_date",
      label: ts("Created"),
      render: (row) => authored(row.created_date, row["created_id.display_name"]),
    });
    columns.push({
      key: "modified_date",
      label: ts("Modified"),
      render: (row) => authored(row.modified_date, row["modified_id.display_name"]),
    });
  }
  if (tab !== "template")
    columns.push({
      key: "expires_date",
      label: ts("Expires"),
      render: (row) => formatDate(row.expires_date),
    });
  columns.push({
    key: "buttons",
    label: "",
    className: "text-right",
    render: (row, access) => (
      <RowButtons
        row={row}
        access={access}
        onAction={(action) => {
          if (action === "export") setExporting(row);
          else {
            setPending(row);
            loadForms();
          }
        }}
      />
    ),
  });

  const entityOptions: PickerOption[] = meta.data ? entitySelect(meta.data) : [];
  const moduleOptions: PickerOption[] = Object.entries(settings.modules)
    .map(([key, label]) => ({ id: key, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const tagOptions: PickerOption[] = settings.tags.map((tag) => ({
    id: tag.id,
    label: tag.label,
    color: tag.color,
    description: tag.description,
  }));

  const noResults =
    tab === "custom" && !Object.values(filters).some((v) => (Array.isArray(v) ? v.length : v))
      ? ts(
          "Welcome to SearchKit. Click the New Search button above to start composing your first search.",
        )
      : ts("No Saved Searches match filter criteria.");

  return (
    <div
      role="tabpanel"
      id={`afreact-search-panel-${tab}`}
      aria-labelledby={`afreact-search-tab-${tab}`}
    >
      <div className="form-inline afreact-search-filters">
        <input
          className="form-control"
          type="search"
          aria-label={ts("Filter by label")}
          placeholder={ts("Filter by label...")}
          value={filters.label}
          onChange={(event) => {
            update({ label: event.target.value });
          }}
        />
        {tab === "custom" && (
          <input
            className="form-control"
            type="search"
            aria-label={ts("Filter by author")}
            placeholder={ts("Filter by author...")}
            value={filters.author}
            onChange={(event) => {
              update({ author: event.target.value });
            }}
          />
        )}
        {tab !== "custom" && (
          <span>
            <label htmlFor={`${id}-package`} className="sr-only">
              {ts("Filter by package")}
            </label>
            <Picker
              id={`${id}-package`}
              externalLabel
              label={ts("Filter by package")}
              placeholder={ts("Filter by package...")}
              options={moduleOptions}
              value={filters.modules}
              onChange={(pick) => {
                setFilters((f) => ({ ...f, modules: pick(f.modules).map(String) }));
                setPage(1);
              }}
            />
          </span>
        )}
        <span>
          <label htmlFor={`${id}-entity`} className="sr-only">
            {ts("Filter by entity")}
          </label>
          <Picker
            id={`${id}-entity`}
            externalLabel
            label={ts("Filter by entity")}
            placeholder={ts("Filter by entity...")}
            options={entityOptions}
            value={filters.entities}
            onChange={(pick) => {
              setFilters((f) => ({ ...f, entities: pick(f.entities).map(String) }));
              setPage(1);
            }}
          />
        </span>
        {tagOptions.length > 0 && (
          <span>
            <label htmlFor={`${id}-tags`} className="sr-only">
              {ts("Filter by tags")}
            </label>
            <Picker
              id={`${id}-tags`}
              externalLabel
              label={ts("Filter by tags")}
              placeholder={ts("Filter by tags...")}
              options={tagOptions}
              value={filters.tags}
              onChange={(pick) => {
                setFilters((f) => ({ ...f, tags: pick(f.tags).map(Number) }));
                setPage(1);
              }}
            />
          </span>
        )}
        {tab === "custom" && (
          <button
            type="button"
            className="btn btn-secondary btn-sm pull-right"
            onClick={() => {
              setImporting(true);
            }}
          >
            <i className="crm-i fa-upload" role="img" aria-hidden="true" /> {ts("Import")}
          </button>
        )}
      </div>
      <table className="table table-striped crm-search-admin-search-listing">
        <thead>
          <tr>
            {columns.map((column) => (
              <SortHeader
                key={column.key}
                column={column}
                sort={sort}
                onSort={(next) => {
                  setSort(next);
                  setPage(1);
                }}
              />
            ))}
          </tr>
        </thead>
        <tbody aria-busy={listing.isFetching}>
          {listing.error ? (
            <tr>
              <td colSpan={columns.length} className="crm-error" role="alert">
                {errorMessage(listing.error)}
              </td>
            </tr>
          ) : listing.data && !rows.length ? (
            <tr>
              <td colSpan={columns.length}>{noResults}</td>
            </tr>
          ) : !listing.data ? (
            <tr>
              <td colSpan={columns.length} role="status">
                {ts("Loading…")}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const access = rowAccess(row, perms);
              return (
                <tr key={row.id}>
                  {columns.map((column) => (
                    <td key={column.key} className={column.className}>
                      {column.render(row, access)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      <Pager
        settings={{ show_count: true, expose_limit: true }}
        rowCount={rowCount}
        page={page}
        limit={limit}
        onPage={setPage}
        onLimit={(next) => {
          setLimit(next);
          setPage(1);
        }}
      />
      {pending && (
        <DeleteDialog
          row={pending}
          forms={forms}
          onConfirm={() => void deleteOrRevert(pending)}
          onCancel={() => {
            setPending(null);
          }}
        />
      )}
      {exporting && (
        <ExportDialog
          search={exporting}
          onClose={() => {
            setExporting(null);
          }}
        />
      )}
      {importing && (
        <ImportDialog
          onClose={(imported) => {
            setImporting(false);
            if (imported) void refresh();
          }}
        />
      )}
    </div>
  );
}

function SortHeader({
  column,
  sort,
  onSort,
}: {
  column: ColumnDef;
  sort: ListSort;
  onSort: (sort: ListSort) => void;
}) {
  if (!column.label) return <td />;
  if (!SORTABLE.has(column.key)) return <th scope="col">{column.label}</th>;
  const active = sort[0] === column.key;
  const direction = active ? sort[1] : null;
  return (
    <th
      scope="col"
      aria-sort={
        direction === "ASC" ? "ascending" : direction === "DESC" ? "descending" : undefined
      }
    >
      <button
        type="button"
        className="btn btn-link afreact-sort"
        onClick={() => {
          onSort([column.key, direction === "ASC" ? "DESC" : "ASC"]);
        }}
      >
        {column.label}{" "}
        <i
          className={`crm-i ${direction === "ASC" ? "fa-sort-asc" : direction === "DESC" ? "fa-sort-desc" : "fa-sort disabled"}`}
          role="img"
          aria-hidden="true"
        />
      </button>
    </th>
  );
}

/** A text cell that turns into an input on click, as the editable trait's inline edit. */
function InlineText({
  value,
  title,
  editable,
  required = false,
  onSave,
}: {
  value: string;
  title: string;
  editable: boolean;
  required?: boolean;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const editing = useRef(false);
  // deviation:inline-edit-returns-focus
  const close = () => {
    editing.current = true;
    setDraft(null);
  };
  if (!editable) return <>{value}</>;
  if (draft === null)
    return (
      <button
        type="button"
        className="btn btn-link afreact-inline-edit"
        title={title}
        ref={(button) => {
          if (button && editing.current) button.focus();
          editing.current = false;
        }}
        onClick={() => {
          setDraft(value);
        }}
      >
        {value || <span className="sr-only">{title}</span>}{" "}
        <i className="crm-i fa-pencil" role="img" aria-hidden="true" />
      </button>
    );
  return (
    <form
      className="form-inline"
      onSubmit={(event) => {
        event.preventDefault();
        if (required && !draft.trim()) return;
        if (draft !== value) onSave(draft);
        close();
      }}
    >
      <input
        className="form-control"
        aria-label={title}
        value={draft}
        required={required}
        ref={(input) => {
          input?.focus();
        }}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
        }}
      />
      <button type="submit" className="btn btn-xs btn-primary" title={ts("Save")}>
        <i className="crm-i fa-check" role="img" aria-hidden="true" />
        <span className="sr-only">{ts("Save")}</span>
      </button>
      <button
        type="button"
        className="btn btn-xs btn-secondary"
        title={ts("Cancel")}
        onClick={close}
      >
        <i className="crm-i fa-times" role="img" aria-hidden="true" />
        <span className="sr-only">{ts("Cancel")}</span>
      </button>
    </form>
  );
}

function DisplaysMenu({ row }: { row: ListedSearch }) {
  const names = row.display_name ?? [];
  if (!names.length)
    return (
      <button type="button" disabled className="btn btn-xs btn-primary-outline">
        {ts("0 Displays")}
      </button>
    );
  const path = window.CRM.url("civicrm/search");
  const links: Link[] = names.map((name, index) => {
    const bypass = row.display_acl_bypass?.[index] === true;
    return {
      url: bypass ? undefined : `${path}#/display/${row.name}/${name}`,
      target: "_blank",
      text: row.display_label?.[index] ?? name,
      icon: row.display_icon?.[index],
      title: bypass ? ts("Display has permissions disabled") : ts("View display"),
      task: bypass ? "bypass" : undefined,
    };
  });
  return (
    <Menu
      buttonClass="btn btn-xs dropdown-toggle btn-primary-outline"
      label={ts("1 Display", { plural: "%count Displays", count: names.length })}
      links={links}
      alignRight={false}
      itemClass={(link) => (link.task === "bypass" ? "disabled" : undefined)}
      isDisabled={(link) => link.task === "bypass"}
    />
  );
}

function FormsMenu({
  row,
  forms,
  admin,
  onOpen,
}: {
  row: ListedSearch;
  forms: Record<string, EmbeddingForm[]> | null;
  admin: boolean;
  onOpen: () => void;
}) {
  const path = window.CRM.url("civicrm/admin/afform");
  const found = forms?.[row.name] ?? [];
  const links: Link[] = [];
  if (admin) {
    links.push({
      url: `${path}#/create/search/${row.name}`,
      target: "_blank",
      icon: "fa-plus",
      text: ts("Create form for search results table"),
    });
    for (const [index, name] of (row.display_name ?? []).entries())
      links.push({
        url: `${path}#/create/search/${row.name}.${name}`,
        target: "_blank",
        icon: "fa-plus",
        text: ts("Create form for %1", { 1: row.display_label?.[index] ?? name }),
      });
  }
  if (!forms) links.push({ text: ts("Loading..."), icon: "fa-spinner fa-spin", task: "none" });
  else if (!found.length) links.push({ text: ts("None found."), task: "none" });
  for (const form of found)
    links.push({
      url: admin ? `${path}#/edit/${form.name}` : undefined,
      target: "_blank",
      icon: admin ? "fa-pencil-square-o" : "fa-list-alt",
      text: form.title,
      title: admin ? ts("Edit form") : undefined,
      task: admin ? undefined : "none",
    });
  return (
    <Menu
      buttonClass="btn btn-xs dropdown-toggle btn-primary-outline"
      label={forms ? ts("1 Form", { plural: "%count Forms", count: found.length }) : ts("Forms...")}
      links={links}
      alignRight={false}
      onOpen={onOpen}
      itemClass={(link) => (link.task === "none" ? "disabled" : undefined)}
      isDisabled={(link) => link.task === "none"}
    />
  );
}

function CommunicationsMenu({ row }: { row: ListedSearch }) {
  const ids = row.schedule_id ?? [];
  const url = (query: string) =>
    window.CRM.url(`civicrm/admin/scheduleReminders/edit?reset=1&mapping_id=saved_search&${query}`);
  const links: Link[] = [
    ...ids.map((scheduleId, index) => ({
      url: url(`action=update&id=${String(scheduleId)}&entity_value=${String(row.id)}`),
      target: "crm-popup",
      icon: "fa-pencil",
      text: row.schedule_title?.[index] ?? String(scheduleId),
      title: ts("Edit Scheduled Communication"),
    })),
    {
      url: url(`action=add&entity_value=${String(row.id)}`),
      target: "crm-popup",
      icon: "fa-plus",
      text: ts("New Communication"),
      title: ts("Add Scheduled Communication"),
    },
  ];
  return (
    <Menu
      buttonClass="btn btn-xs dropdown-toggle btn-primary-outline"
      label={ts("1 Communication", { plural: "%count Communications", count: ids.length })}
      links={links}
      alignRight={false}
    />
  );
}

function RowButtons({
  row,
  access,
  onAction,
}: {
  row: ListedSearch;
  access: { edit: boolean; remove: boolean };
  onAction: (action: "export" | "delete") => void;
}) {
  const template = row.is_template;
  const links: Link[] = [];
  if (access.edit)
    links.push({
      url: `#/edit/${String(row.id)}`,
      icon: "fa-pencil",
      text: template ? ts("Edit Template") : ts("Edit Search"),
      title: ts("Edit search and displays"),
    });
  links.push(
    {
      url: `${window.CRM.url("civicrm/search")}#/display/${row.name}`,
      target: "_blank",
      icon: "fa-table",
      text: ts("View Results"),
      title: ts("View search results table"),
    },
    {
      url: `#/clone/${String(row.id)}?is_template=0`,
      icon: "fa-clone",
      text: template ? ts("Create from Template") : ts("Clone Search"),
      title: ts("Create a new search based on this one"),
    },
    {
      url: `#/clone/${String(row.id)}?is_template=1`,
      icon: "fa-paste",
      text: template ? ts("Clone Template") : ts("Save as Template"),
      title: ts("Create a new template based on this one"),
    },
    {
      task: "export",
      icon: "fa-download",
      text: template ? ts("Export Template") : ts("Export Search"),
      title: ts("Export this saved search for sharing or reuse"),
    },
  );
  if (!row["base_module:label"] && access.remove)
    links.push({
      task: "delete",
      icon: "fa-trash",
      text: ts("Delete"),
      title: ts("Delete search along with any displays and forms"),
    });
  if (row["base_module:label"] && row.local_modified_date)
    links.push({
      task: "delete",
      icon: "fa-undo",
      text: ts("Revert"),
      title: ts("Revert search to its packaged state"),
    });
  const edit = access.edit && !template;
  return (
    <Menu
      groupClass="btn-group btn-group-xs crm-search-admin-search-listing-buttons"
      buttonClass="btn btn-secondary dropdown-toggle"
      label={<i className="crm-i fa-bars" role="img" aria-hidden="true" />}
      srLabel={ts("Row Actions")}
      alignRight
      links={links}
      onLinkClick={(link, event) => {
        if (link.task !== "export" && link.task !== "delete") return;
        event.preventDefault();
        onAction(link.task);
      }}
      prefix={
        <a
          className="btn btn-primary"
          href={edit ? `#/edit/${String(row.id)}` : `#/clone/${String(row.id)}?is_template=0`}
          title={
            edit ? ts("Edit search and displays") : ts("Create a new search based on this one")
          }
        >
          <i
            className={`crm-i ${edit ? "fa-pencil" : "fa-clone"} fa-fw`}
            role="img"
            aria-hidden="true"
          />
          <span className="sr-only">
            {edit ? ts("Edit search and displays") : ts("Create a new search based on this one")}
          </span>
        </a>
      }
    />
  );
}

function DeleteDialog({
  row,
  forms,
  onConfirm,
  onCancel,
}: {
  row: ListedSearch;
  forms: Record<string, EmbeddingForm[]> | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const revert = !!row["base_module:label"];
  const list = consequences(row, forms?.[row.name] ?? []);
  return (
    <ConfirmDialog
      title={revert ? ts("Revert %1", { 1: row.label }) : ts("Delete %1", { 1: row.label })}
      confirmLabel={revert ? ts("Revert") : ts("Delete")}
      busy={!forms}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <h4>
        {revert
          ? ts("Revert this search to its packaged settings?")
          : ts("Permanently delete this saved search?")}
      </h4>
      <ul>
        {list.map((item) => (
          <li key={item.text} className={item.severe ? "crm-error" : undefined}>
            {item.severe && (
              <>
                <i className="crm-i fa-exclamation-triangle" role="img" aria-hidden="true" />{" "}
              </>
            )}
            {item.form && (
              <>
                <i className="crm-i fa-list-alt" role="img" aria-hidden="true" />{" "}
              </>
            )}
            {item.text}
          </li>
        ))}
      </ul>
      {!forms && <p role="status">{ts("Loading...")}</p>}
    </ConfirmDialog>
  );
}
