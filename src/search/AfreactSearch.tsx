import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useQueryStates } from "nuqs";
import { useEffect, useMemo, useState } from "react";
import { Unsupported } from "../afform/Unsupported";
import { api4, errorMessage, get, type ApiResult } from "../api/civi";
import { useUrlPrefix } from "../url/UrlState";
import { ColumnPicker, toggledColumns, useColumnToggles } from "./ColumnPicker";
import { matchesDisplay, useInlineEdit } from "./inlineEdit";
import { ItemList, TreeView } from "./Items";
import { useFreshRows } from "./freshRows";
import { useKeptFocus } from "./keptFocus";
import { BatchDisplay } from "./BatchDisplay";
import {
  ElementDisplay,
  loadChartKit,
  loadPluginElement,
  pluginDisplayTag,
} from "./ElementDisplay";
import { useAutoOpen, useFormSuccess } from "./links";
import { Pager, SearchButton } from "./Pager";
import { useReorder } from "./Reorder";
import { runPage, settingsOf, unsupportedFeatures } from "./rows";
import { resultCount } from "./selection";
import { TableView, type HeaderTools } from "./Table";
import { useTasks } from "./Tasks";
import { DisplayHeader } from "./Toolbar";
import {
  isDisplaySettings,
  isDisplayType,
  type DisplaySettings,
  type DisplayType,
  type Row,
  type RunDebug,
  type RunPage,
} from "./types";
import { displayKeys, positiveInteger, sortParser, sortText, type Sort } from "./urlKeys";
import { debugMode, useDebugFacts } from "../debug/debug";

interface AfreactSearchProps {
  search: string;
  /** Null for the search's default display, as SearchDisplay.getDefault builds it. */
  display: string | null;
  /** The display type of the layout's element; loaded with the settings when absent. */
  type?: string;
  /** Settings Afform already compiled into the layout; loaded via the API when absent. */
  settings?: DisplaySettings;
  /** The display's label, given with the settings; it names the table or list. */
  label?: string;
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
  /** The selected saved set: choosing another one applies its columns afresh. */
  savedSet?: string | null;
  /** Takes the labels of each run's own filters, which core puts before the page title. */
  onLabels?: (labels: string[]) => void;
  /** Takes a table's picked columns, for a saved filter set to keep. */
  onColumns?: (key: string, columns: Record<string, string>) => void;
  /** An unsaved search run as an object, with an unsaved display or the search's default one. */
  inline?: { search: Record<string, unknown>; display?: Record<string, unknown> };
  /** Asks each run for its debug output (SQL, timing) and passes it on. */
  onDebug?: (debug: RunDebug) => void;
  /** A table's header controls for an editor. */
  headerTools?: HeaderTools;
}

const NO_FILTERS = {};

/**
 * A batch display edits import rows, a chart and another extension's display type are elements
 * that draw themselves; every other type shows the results itself.
 */
export function AfreactSearch(props: AfreactSearchProps) {
  const loaded = useSearchDisplay(props.search, props.display, !props.settings);
  const type = props.type ?? loaded.data?.type;
  const element = type === "chart-kit" || (type !== undefined && !isDisplayType(type));
  if (type !== "batch" && !element)
    return <ResultDisplay {...props} type={isResultType(props.type) ? props.type : undefined} />;
  // An element takes an unsaved search and display as JSON in place of their names.
  const inline = element ? props.inline : undefined;
  const display = props.display ?? (inline?.display ? JSON.stringify(inline.display) : null);
  if (display === null)
    return <Failure error={new Error(ts("A %1 display needs a name.", { 1: type }))} />;
  const settings = props.settings ?? loaded.data?.settings;
  if (loaded.error) return <Failure error={loaded.error} />;
  if (!settings) return <p role="status">{ts("Loading…")}</p>;
  if (element) {
    const tag = pluginDisplayTag(type);
    return (
      <ElementDisplay
        tag={tag}
        load={type === "chart-kit" ? loadChartKit : () => loadPluginElement(tag)}
        search={inline ? JSON.stringify(inline.search) : props.search}
        display={display}
        settings={settings}
        afform={props.afform}
        filters={props.filters ?? NO_FILTERS}
        enabled={props.enabled ?? true}
      />
    );
  }
  return (
    <BatchDisplay
      search={props.search}
      display={display}
      settings={settingsOf(settings, "batch")}
      notes={unsupportedFeatures(settings, undefined, "batch")}
      afform={props.afform}
      filters={props.filters ?? NO_FILTERS}
    />
  );
}

type ResultType = Exclude<DisplayType, "batch" | "chart-kit">;
const isResultType = (type: unknown): type is ResultType =>
  isDisplayType(type) && type !== "batch" && type !== "chart-kit";

export function useSearchDisplay(search: string, display: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["SearchDisplay", "get", search, display],
    queryFn: async () => {
      const name = `${search}.${display ?? ""}`;
      const select: ("label" | "type" | "settings")[] = ["label", "type", "settings"];
      const [found] =
        display === null
          ? await api4<{ label?: string; type?: string; settings?: unknown }>(
              "SearchDisplay",
              "getDefault",
              { savedSearch: search, select },
            )
          : await get("SearchDisplay", {
              select,
              where: [
                ["name", "=", display],
                ["saved_search_id.name", "=", search],
              ],
            });
      if (!found) throw new Error(ts("Search display %1 not found.", { 1: name }));
      const settings = await withAutoColumns(search, found.settings);
      if (!isDisplaySettings(settings))
        throw new Error(ts("Search display %1 has no columns.", { 1: name }));
      return { label: found.label ?? "", type: found.type, settings };
    },
    enabled,
  });
}

function ResultDisplay({
  search,
  display,
  type: givenType,
  settings: given,
  label: givenLabel = "",
  afform,
  filters = NO_FILTERS,
  typed = filters,
  enabled = true,
  savedColumns,
  savedSet = null,
  onLabels,
  onColumns,
  inline,
  onDebug,
  headerTools,
}: AfreactSearchProps & { type?: ResultType }) {
  const client = useQueryClient();
  const loaded = useSearchDisplay(search, display, !given);
  const loadedType = loaded.data?.type;
  const type = givenType ?? (isResultType(loadedType) ? loadedType : "table");
  const stored = given ?? loaded.data?.settings;
  const settings = useMemo(() => stored && settingsOf(stored, type), [stored, type]);
  const [url, setUrl] = useQueryStates(
    { sort: sortParser, page: positiveInteger, limit: positiveInteger },
    { urlKeys: displayKeys(useUrlPrefix(display ?? "")) },
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
  // A page or page size in the link counts only where the display's pager offers it.
  // deviation:url-pager-needs-pager
  const paged = type !== "tree" && !!settings?.pager;
  const exposedLimit = settings?.pager ? settings.pager.expose_limit : false;
  const limit = (exposedLimit ? url.limit : undefined) ?? settings?.limit ?? 0;
  const linkedPage = filtersChanged || !paged ? 1 : (url.page ?? 1);
  // Without a page size the server returns every row on one page.
  const page = limit ? linkedPage : 1;
  const runSearch = inline?.search ?? search;
  const runDisplay = inline?.display ?? display;
  const params = {
    savedSearch: runSearch,
    display: runDisplay,
    seed,
    afform,
    filters: runFilters ?? {},
  };
  const toggles = useColumnToggles(
    settings?.columns,
    savedColumns,
    savedSet,
    JSON.stringify([params, activeSort, limit, page]),
  );
  const { hidden, params: columnParams } = toggles;
  const picked = useMemo(
    () => (type === "table" && settings ? toggledColumns(settings.columns, hidden) : {}),
    [type, settings, hidden],
  );
  // searchDisplayBaseTrait's getSearchDisplayKey().
  const displayKey = display ? `${search}.${display}` : search;
  useEffect(() => {
    onColumns?.(displayKey, picked);
    return () => {
      onColumns?.(displayKey, {});
    };
  }, [onColumns, displayKey, picked]);
  // The count and totals ignore sort, page and page size, so they are asked once per set of filters.
  const countKey = ["SearchDisplay", "count", params];
  const pageKey = (number: number, columns = columnParams) => [
    "SearchDisplay",
    "run",
    params,
    activeSort,
    limit,
    number,
    columns,
  ];
  const fetchPage = async (number: number, columns = columnParams) => {
    const result: ApiResult<Row> = await api4<Row>("SearchDisplay", "run", {
      ...params,
      ...columns,
      limit,
      sort: activeSort,
      return: `page:${number}`,
      ...(onDebug || debugMode() ? { debug: true } : {}),
    });
    // Same rule as searchDisplayBaseTrait: a short first page is the whole result, no count call needed.
    if (number === 1 && (!limit || result.length < limit))
      client.setQueryData(countKey, result.length);
    return runPage(result);
  };
  const rowsKey = pageKey(page);
  const rows = useQuery({
    queryKey: rowsKey,
    queryFn: () => fetchPage(page),
    enabled: !!settings && enabled && runFilters !== null,
    // deviation:page-keeps-rows
    // Another page, sort or size of the same search and columns keeps the rows on show meanwhile.
    placeholderData: (previous, previousQuery) =>
      previousQuery &&
      JSON.stringify([previousQuery.queryKey[2], previousQuery.queryKey[6]]) ===
        JSON.stringify([params, columnParams])
        ? previous
        : undefined,
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
  // A popup form of this display or of its form succeeded: reload as searchDisplayBaseTrait does,
  // under every filter set, as core runs again on the next filter change too.
  const refresh = () => {
    for (const kind of ["run", "count", "tally"])
      void client.invalidateQueries({
        queryKey: ["SearchDisplay", kind],
        predicate: ({ queryKey }) => matchesDisplay(queryKey[2], params),
      });
  };
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  useFormSuccess(root, refresh);
  useAutoOpen(rows.data, refresh);
  useEffect(() => {
    if (rows.data) onLabels?.(rows.data.labels);
  }, [rows.data, onLabels]);
  useEffect(() => {
    if (rows.data?.debug) onDebug?.(rows.data.debug);
  }, [rows.data, onDebug]);
  useDebugFacts({
    [ts("Search displays")]: [displayKey],
    ...(rows.data?.debug?.sql ? { [ts("SQL of %1", { 1: displayKey })]: rows.data.debug.sql } : {}),
  });
  // Core keeps the toolbar of the last run while the next page loads.
  const [shown, setShown] = useState<RunPage | undefined>(undefined);
  if (rows.data && rows.data !== shown) setShown(rows.data);
  // An unsaved search that changes shows no results until its next run, as core's preview.
  const inlineKey = inline ? JSON.stringify(inline.search) : null;
  const [runInline, setRunInline] = useState(inlineKey);
  if (inlineKey !== runInline) {
    setRunInline(inlineKey);
    setSubmitted(null);
    setShown(undefined);
  }
  // Before the first click of a search button nothing loads.
  const loading = rows.isFetching || (rows.isPending && enabled && runFilters !== null);
  const rowCount = rows.error ? null : (counted.data ?? null);
  // deviation:page-past-end-clamped
  // A page past the last one, after rows left the result or from an old link, moves to the last.
  const lastPage = !limit
    ? 1
    : rowCount !== null && !counted.isFetching
      ? Math.max(1, Math.ceil(rowCount / limit))
      : null;
  useEffect(() => {
    if (lastPage !== null && linkedPage > lastPage)
      void setUrl({ page: lastPage === 1 ? null : lastPage });
  }, [lastPage, linkedPage, setUrl]);
  const tasks = useTasks({
    search: runSearch,
    display: runDisplay,
    settings: settings ?? { columns: [] },
    page: loading || rows.error ? undefined : rows.data,
    loading,
    rowCount,
    pageNumber: page,
    runParams: { ...params, ...toggles.nextParams, sort: activeSort, limit },
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
    reloadAll: (gone) => {
      if (gone !== undefined) tasks.deselect(gone);
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
  useFreshRows(
    root,
    rows.data && !rows.isPlaceholderData ? JSON.stringify([activeSort, limit, page]) : null,
    filtersKey,
  );

  if (loaded.error) return <Failure error={loaded.error} />;
  if (!givenType && loadedType !== undefined && !isDisplayType(loadedType))
    return <Unsupported what={`display type ${loadedType}`} />;
  if (!settings) return <p role="status">{ts("Loading…")}</p>;
  // deviation:form-display-named
  const label = loaded.data?.label ?? givenLabel;
  // A failed run shows no rows and no count, as searchDisplayBaseTrait does; kept rows stay meanwhile.
  const result = (loading && !rows.isPlaceholderData) || rows.error ? undefined : rows.data;
  const setPage = (next: number) => void setUrl({ page: next === 1 ? null : next });
  // deviation:next-page-prefetched
  const prefetch = (number: number) =>
    void client.prefetchQuery({
      queryKey: pageKey(number, toggles.nextParams),
      queryFn: () => fetchPage(number, toggles.nextParams),
    });
  const searchAgain = () => {
    const before = client.getQueryState(countKey)?.dataUpdatedAt;
    void client.invalidateQueries({ queryKey: tallyKey });
    // Every page loads afresh when next shown, as core runs each page it shows.
    void client.invalidateQueries({
      queryKey: ["SearchDisplay", "run", params],
      refetchType: "none",
    });
    // The click returns to page 1, so that page is the one to load afresh.
    void client
      .fetchQuery({ queryKey: pageKey(1), queryFn: () => fetchPage(1), staleTime: 0 })
      .then(() => {
        // A short first page has counted itself, as on the first search.
        if (client.getQueryState(countKey)?.dataUpdatedAt === before)
          void client.invalidateQueries({ queryKey: countKey });
      })
      .catch(() => undefined);
  };
  const onSearch = () => {
    // onClickSearchButton(): a click searches, counts and tallies again, also with the same filters.
    if (submitted && JSON.stringify(submitted.filters) === JSON.stringify(typed)) searchAgain();
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
  const lastRows = shown?.rows.length ?? 0;
  const view = {
    settings,
    label,
    loading,
    result,
    error: rows.error,
    // deviation:placeholders-page-tall
    // As many placeholders as the page last on show had rows, so the display keeps its height.
    placeholders: lastRows > 0 ? lastRows : (settings.placeholder ?? 5),
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
      {/* deviation:results-announced */}
      <p role="status" className="sr-only">
        {loading
          ? ts("Loading…")
          : result && rowCount !== null
            ? ts("Search finished: %1", { 1: resultCount(rowCount, 0) })
            : ""}
      </p>
      <p role="status" className="sr-only">
        {inlineEdit.announcement}
      </p>
      {/* deviation:kept-rows-progress */}
      {loading && result && <div className="afreact-search-progress" aria-hidden="true" />}
      {type === "tree" ? (
        <TreeView {...view} reorder={reorder} />
      ) : table ? (
        <TableView
          {...view}
          filtersKey={filtersKey}
          hidden={hidden}
          activeSort={activeSort}
          onSort={toggleSort}
          tally={tallied.data ?? null}
          selectAll={tasks.header}
          select={tasks.rowSelect}
          reorder={reorder}
          headerTools={headerTools}
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
          onPrefetch={prefetch}
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
