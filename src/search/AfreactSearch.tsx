import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useQueryStates } from "nuqs";
import { useEffect, useMemo, useState } from "react";
import { Unsupported } from "../afform/Unsupported";
import { api4, errorMessage, get, type ApiResult } from "../api/civi";
import { useUrlPrefix } from "../url/UrlState";
import { ColumnPicker, useColumnToggles } from "./ColumnPicker";
import { useInlineEdit } from "./inlineEdit";
import { ItemList, TreeView } from "./Items";
import { useKeptFocus } from "./keptFocus";
import { useAutoOpen, useFormSuccess } from "./links";
import { Pager, SearchButton } from "./Pager";
import { useReorder } from "./Reorder";
import { runPage, settingsOf, unsupportedFeatures } from "./rows";
import { TableView } from "./Table";
import { useTasks } from "./Tasks";
import { DisplayHeader } from "./Toolbar";
import {
  isDisplaySettings,
  isDisplayType,
  type DisplaySettings,
  type DisplayType,
  type Row,
  type RunPage,
} from "./types";
import { displayKeys, positiveInteger, sortParser, sortText, type Sort } from "./urlKeys";

interface AfreactSearchProps {
  search: string;
  display: string;
  /** The display type of the layout's element; loaded with the settings when absent. */
  type?: DisplayType;
  /** Settings Afform already compiled into the layout; loaded via the API when absent. */
  settings?: DisplaySettings;
  /** Embedding Afform, so SearchDisplay.run applies the form's access rules as in Angular. */
  afform?: string;
  /** The form's filter values and the display's own `filters`, merged as getFilters() does. */
  filters?: Record<string, unknown> | unknown[];
  /** The same with the values as typed, before the search pause: what a search button submits. */
  typed?: Record<string, unknown> | unknown[];
  /** False while the filters are not final yet, e.g. a saved filter set still loading. */
  enabled?: boolean;
  /** The columns a loaded saved filter set shows, key or label to label; empty for all. */
  savedColumns?: Record<string, string>;
  /** Takes the labels of each run's own filters, which core puts before the page title. */
  onLabels?: (labels: string[]) => void;
}

const NO_FILTERS = {};

export function AfreactSearch({
  search,
  display,
  type: givenType,
  settings: given,
  afform,
  filters = NO_FILTERS,
  typed = filters,
  enabled = true,
  savedColumns,
  onLabels,
}: AfreactSearchProps) {
  const client = useQueryClient();
  const loaded = useQuery({
    queryKey: ["SearchDisplay", "get", search, display],
    queryFn: async () => {
      const [found] = await get("SearchDisplay", {
        select: ["label", "type", "settings"],
        where: [
          ["name", "=", display],
          ["saved_search_id.name", "=", search],
        ],
      });
      if (!found)
        throw new Error(ts("Search display %1 not found.", { 1: `${search}.${display}` }));
      const settings = await withAutoColumns(search, found.settings);
      if (!isDisplaySettings(settings))
        throw new Error(ts("Search display %1 has no columns.", { 1: `${search}.${display}` }));
      return { label: found.label ?? "", type: found.type, settings };
    },
    enabled: !given,
  });
  const loadedType = loaded.data?.type;
  const type = givenType ?? (isDisplayType(loadedType) ? loadedType : "table");
  const stored = given ?? loaded.data?.settings;
  const settings = useMemo(() => stored && settingsOf(stored, type), [stored, type]);
  const [url, setUrl] = useQueryStates(
    { sort: sortParser, page: positiveInteger, limit: positiveInteger },
    { urlKeys: displayKeys(useUrlPrefix(display)) },
  );
  // With a search button the filters apply on its click (onClickSearchButton), not as they change.
  const [submitted, setSubmitted] = useState<{
    filters: Record<string, unknown> | unknown[];
  } | null>(null);
  const runFilters = settings?.button ? (submitted?.filters ?? null) : filters;
  const filtersKey = JSON.stringify(runFilters);
  // A page belongs to the filters it was shown with; new filters start on page 1. Filters
  // that settle before the first search (a saved set loading) keep the page of the link.
  const [pageFilters, setPageFilters] = useState({ key: filtersKey, enabled });
  const filtersChanged = pageFilters.enabled && pageFilters.key !== filtersKey;
  useEffect(() => {
    if (pageFilters.key === filtersKey && pageFilters.enabled === enabled) return;
    setPageFilters({ key: filtersKey, enabled });
    if (filtersChanged) void setUrl({ page: null });
  }, [pageFilters, filtersKey, enabled, filtersChanged, setUrl]);
  // searchDisplayBaseTrait's uniqueId: keeps a RAND() sort stable across pages and reloads.
  const [seed] = useState(() => Math.floor(Math.random() * 10e10));

  const activeSort = url.sort ?? settings?.sort ?? [];
  const limit = url.limit ?? settings?.limit ?? 0;
  const page = filtersChanged ? 1 : (url.page ?? 1);
  const params = { savedSearch: search, display, seed, afform, filters: runFilters ?? {} };
  const toggles = useColumnToggles(
    settings?.columns,
    savedColumns,
    JSON.stringify([params, activeSort, limit, page]),
  );
  const { hidden, params: columnParams } = toggles;
  // The count and totals ignore sort, page and page size, so they are asked once per set of filters.
  const countKey = ["SearchDisplay", "count", params];
  const rowsKey = ["SearchDisplay", "run", params, activeSort, limit, page, columnParams];
  const rows = useQuery({
    queryKey: rowsKey,
    queryFn: async () => {
      const result: ApiResult<Row> = await api4<Row>("SearchDisplay", "run", {
        ...params,
        ...columnParams,
        limit,
        sort: activeSort,
        return: `page:${page}`,
      });
      // Same rule as searchDisplayBaseTrait: a short first page is the whole result, no count call needed.
      if (page === 1 && (!limit || result.length < limit))
        client.setQueryData(countKey, result.length);
      return runPage(result);
    },
    enabled: !!settings && enabled && runFilters !== null,
  });
  const counted = useQuery({
    queryKey: countKey,
    queryFn: async () =>
      (await api4<unknown>("SearchDisplay", "run", { ...params, limit, return: "row_count" }))
        .count ?? null,
    enabled: rows.isSuccess && (!!settings?.pager || !!settings?.headerCount),
  });
  const tallyKey = ["SearchDisplay", "tally", params, columnParams];
  const tallied = useQuery({
    queryKey: tallyKey,
    queryFn: async () =>
      (
        await api4<Record<string, unknown>>("SearchDisplay", "run", {
          ...params,
          ...columnParams,
          limit,
          return: "tally",
        })
      )[0] ?? {},
    enabled: rows.isSuccess && !!settings?.tally,
  });
  // A popup form of this display or of its form succeeded: reload as searchDisplayBaseTrait does.
  const refresh = () => {
    for (const kind of ["run", "count", "tally"])
      void client.invalidateQueries({ queryKey: ["SearchDisplay", kind, params] });
  };
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  useFormSuccess(root, refresh);
  useAutoOpen(rows.data, refresh);
  useEffect(() => {
    if (rows.data) onLabels?.(rows.data.labels);
  }, [rows.data, onLabels]);
  // Core keeps the toolbar of the last run while the next page loads.
  const [shown, setShown] = useState<RunPage | undefined>(undefined);
  if (rows.data && rows.data !== shown) setShown(rows.data);
  // Before the first click of a search button nothing loads.
  const loading = rows.isFetching || (rows.isPending && enabled && runFilters !== null);
  const rowCount = rows.error ? null : (counted.data ?? null);
  const tasks = useTasks({
    search,
    display,
    settings: settings ?? { columns: [] },
    page: loading || rows.error ? undefined : rows.data,
    loading,
    rowCount,
    pageNumber: page,
    runParams: { ...params, sort: activeSort, limit },
    filtersKey,
    root,
  });
  const inlineEdit = useInlineEdit({
    page: rows.data,
    columns: settings?.columns ?? [],
    hidden,
    // Only a table has the control column that holds the row's buttons.
    full: type === "table" && !!settings?.editableRow && !!settings.editableRow.full,
    rowsKey,
    tallyKey,
    countKey,
    params: { ...params, ...columnParams, sort: activeSort, limit },
    // refreshAfterEditing(): a row that left the result reloads every display of the form.
    reloadAll: () => {
      if (root) window.CRM.$(root).trigger("crmPopupFormSuccess");
    },
  });
  const reorder = useReorder({
    type,
    settings,
    runKey: rowsKey,
    runParams: { ...params, ...columnParams, sort: activeSort, limit },
  });

  useKeptFocus(root, loading);

  if (loaded.error) return <Failure error={loaded.error} />;
  if (!givenType && loadedType !== undefined && !isDisplayType(loadedType))
    return <Unsupported what={`display type ${String(loadedType)}`} />;
  if (!settings) return <p role="status">{ts("Loading…")}</p>;
  const label = loaded.data?.label ?? "";
  // A failed run shows no rows and no count, as searchDisplayBaseTrait does.
  const result = loading || rows.error ? undefined : rows.data;
  const setPage = (next: number) => void setUrl({ page: next === 1 ? null : next });
  const onSearch = () => {
    // A click searches again even when the filters are the same.
    if (submitted && JSON.stringify(submitted.filters) === JSON.stringify(typed))
      void rows.refetch();
    setSubmitted({ filters: typed });
    setPage(1);
  };

  // setSort() of searchDisplaySortableTrait: Shift adds the column or flips it in place.
  const toggleSort = (key: string, add: boolean) => {
    const current = activeSort.find(([sorted]) => sorted === key)?.[1];
    const direction = current === "ASC" ? "DESC" : "ASC";
    const next: Sort = add
      ? activeSort.map(([sorted, was]) => [sorted, sorted === key ? direction : was])
      : [];
    if (!next.some(([sorted]) => sorted === key)) next.push([key, direction]);
    // Core's setSort() stays on the current page.
    const isDefault = sortText(next) === sortText(settings.sort ?? []);
    void setUrl({ sort: isDefault ? null : next });
  };

  const table = type === "table";
  const pager = type === "tree" ? false : settings.pager;
  const unsupported = [...unsupportedFeatures(stored ?? settings, shown, type), ...tasks.notes];
  const failed = counted.error ?? tallied.error ?? tasks.error ?? reorder.error;
  const view = {
    settings,
    label,
    loading,
    result,
    error: rows.error,
    afform,
    onLinkClick: tasks.onRowLink,
    inlineEdit,
  };
  return (
    <div
      // A table carries the display's classes itself; the other types on this element.
      className={[
        "crm-search-display",
        `crm-search-display-${type}`,
        ...(table ? [] : (settings.classes ?? [])),
      ].join(" ")}
      ref={setRoot}
    >
      {unsupported.length > 0 && <Unsupported what={unsupported.join(", ")} />}
      {failed ? <Failure error={failed} /> : null}
      <DisplayHeader
        settings={settings}
        rowCount={rowCount}
        toolbar={shown?.toolbar}
        actions={tasks.menu}
        selected={tasks.selected}
        button={
          settings.button && (
            <SearchButton label={settings.button} loading={loading} onSearch={onSearch} />
          )
        }
        picker={
          settings.toggleColumns && (
            <ColumnPicker columns={settings.columns} hidden={hidden} onChange={toggles.pick} />
          )
        }
      />
      <p role="status" className="sr-only">
        {loading ? ts("Loading…") : ""}
      </p>
      <p role="status" className="sr-only">
        {inlineEdit.announcement}
      </p>
      {type === "tree" ? (
        <TreeView {...view} reorder={reorder} />
      ) : table ? (
        <TableView
          {...view}
          hidden={hidden}
          activeSort={activeSort}
          onSort={toggleSort}
          tally={tallied.data ?? null}
          selectAll={tasks.header}
          select={tasks.rowSelect}
          reorder={reorder}
        />
      ) : (
        <ItemList type={type} {...view} />
      )}
      {tasks.overlay}
      {pager && !!rowCount && (
        <Pager
          settings={pager}
          rowCount={rowCount}
          page={page}
          limit={limit}
          selected={tasks.selected}
          onPage={setPage}
          onLimit={(next) => {
            void setUrl({ limit: next === settings.limit ? null : next, page: null });
          }}
        />
      )}
    </div>
  );
}

function Failure({ error }: { error: unknown }) {
  return (
    <div className="alert alert-danger" role="alert">
      {errorMessage(error)}
    </div>
  );
}

/** A display in columnMode "auto" stores no columns; core fills in SearchDisplay.getDefault's. */
async function withAutoColumns(search: string, settings: unknown): Promise<unknown> {
  if (!isRecord(settings) || settings.columnMode !== "auto") return settings;
  if (Array.isArray(settings.columns) && settings.columns.length > 0) return settings;
  const [defaults] = await api4<{ settings?: unknown }>("SearchDisplay", "getDefault", {
    savedSearch: search,
    select: ["settings"],
  });
  const columns = isRecord(defaults?.settings) ? defaults.settings.columns : undefined;
  return { ...settings, columns };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
