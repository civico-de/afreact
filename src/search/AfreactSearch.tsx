import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useQueryStates } from "nuqs";
import { useEffect, useState } from "react";
import { Unsupported } from "../afform/Unsupported";
import { api4, errorMessage, get, type ApiResult } from "../api/civi";
import { onButtonKey } from "../keys";
import { useUrlPrefix } from "../url/UrlState";
import { BodyRows, ControlHeader, PlaceholderRows, TallyRow } from "./Body";
import { ColumnPicker, useColumnToggles } from "./ColumnPicker";
import { InlineEditContext, useInlineEdit } from "./inlineEdit";
import { useAutoOpen, useFormSuccess } from "./links";
import { Pager, SearchButton } from "./Pager";
import { ReorderRows, useReorder } from "./Reorder";
import {
  editsCells,
  hasControlColumn,
  headerClass,
  isSortable,
  runPage,
  unlabelledHeader,
  unsupportedFeatures,
} from "./rows";
import { useTasks } from "./Tasks";
import { DisplayHeader } from "./Toolbar";
import { isDisplaySettings, type DisplaySettings, type Row, type RunPage } from "./types";
import { displayKeys, positiveInteger, sortParser, sortText, type Sort } from "./urlKeys";

interface AfreactSearchProps {
  search: string;
  display: string;
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
        select: ["label", "settings"],
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
      return { label: found.label ?? "", settings };
    },
    enabled: !given,
  });
  const settings = given ?? loaded.data?.settings;
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
    rowsKey,
    tallyKey,
    params: { ...params, ...columnParams, sort: activeSort, limit },
    // refreshAfterEditing(): a row that left the result reloads every display of the form.
    reloadAll: () => {
      if (root) window.CRM.$(root).trigger("crmPopupFormSuccess");
    },
  });
  const reorder = useReorder({
    settings,
    runKey: rowsKey,
    runParams: { ...params, ...columnParams, sort: activeSort, limit },
  });

  if (loaded.error) return <Failure error={loaded.error} />;
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

  const directionOf = (key: string | undefined) =>
    activeSort.find(([sorted]) => sorted === key)?.[1] ?? null;
  // setSort() of searchDisplaySortableTrait: Shift adds the column or flips it in place.
  const toggleSort = (key: string, add: boolean) => {
    const direction = directionOf(key) === "ASC" ? "DESC" : "ASC";
    const next: Sort = add
      ? activeSort.map(([sorted, current]) => [sorted, sorted === key ? direction : current])
      : [];
    if (!next.some(([sorted]) => sorted === key)) next.push([key, direction]);
    // Core's setSort() stays on the current page.
    const isDefault = sortText(next) === sortText(settings.sort ?? []);
    void setUrl({ sort: isDefault ? null : next });
  };

  const pager = settings.pager;
  const unsupported = [...unsupportedFeatures(settings, shown), ...tasks.notes];
  const failed = counted.error ?? tallied.error ?? tasks.error ?? reorder.error;
  const tally = settings.tally;
  const columnCount = settings.columns.length + (hasControlColumn(settings) ? 1 : 0);
  const tallyRow = !!result?.rows.length && !!tally && (
    <TallyRow settings={settings} tally={tallied.data ?? null} hidden={hidden} />
  );
  return (
    <div className="crm-search-display crm-search-display-table" ref={setRoot}>
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
      <table className={(settings.classes ?? []).join(" ")} aria-busy={loading}>
        <caption className="sr-only">{label}</caption>
        <thead hidden={settings.hideThead === true}>
          <tr>
            <ControlHeader settings={settings} selectAll={tasks.header} />
            {settings.columns.map((column, index) => {
              if (hidden.has(index)) return null;
              const direction = directionOf(column.key);
              const sortKey = isSortable(column, settings) ? column.key : undefined;
              // ARIA allows aria-sort on one header: the column sorted first.
              const primary = !!column.key && activeSort[0]?.[0] === column.key;
              const unlabelled = unlabelledHeader(column, index);
              return (
                <th
                  key={index}
                  scope="col"
                  className={headerClass(column, !!sortKey)}
                  title={
                    sortKey
                      ? ts("Click to sort results (shift-click to sort by multiple).")
                      : undefined
                  }
                  aria-sort={
                    primary ? (direction === "DESC" ? "descending" : "ascending") : undefined
                  }
                  // The whole cell sorts on click as in SearchKit; the label is the keyboard control.
                  onClick={
                    sortKey
                      ? (event) => {
                          toggleSort(sortKey, event.shiftKey);
                        }
                      : undefined
                  }
                >
                  {sortKey && (
                    <>
                      <i
                        className={`crm-i crm-search-table-column-sort-icon ${direction === "ASC" ? "fa-sort-asc" : direction === "DESC" ? "fa-sort-desc" : "fa-sort disabled"}`}
                        aria-hidden="true"
                      />{" "}
                    </>
                  )}
                  <span
                    className="crm-search-display-table-column-label"
                    role={sortKey ? "button" : undefined}
                    tabIndex={sortKey ? 0 : undefined}
                    onKeyDown={
                      sortKey
                        ? onButtonKey((event) => {
                            toggleSort(sortKey, event.shiftKey);
                          })
                        : undefined
                    }
                  >
                    {column.label}
                  </span>
                  {unlabelled && <span className="sr-only">{unlabelled}</span>}
                </th>
              );
            })}
          </tr>
          {tally && tally.header && tallyRow}
        </thead>
        {/* Core swaps the rows for placeholders while a run loads. */}
        <tbody>
          {loading && <PlaceholderRows settings={settings} hidden={hidden} />}
          {result?.rows.length === 0 && settings.noResultsText !== false && (
            <tr>
              <td colSpan={columnCount}>
                <p className="alert alert-info text-center">
                  {/* Core falls back on an empty text too. */}
                  {settings.noResultsText === undefined || settings.noResultsText === ""
                    ? ts("None found.")
                    : settings.noResultsText}
                </p>
              </td>
            </tr>
          )}
          {!loading && rows.error && (
            // searchDisplayError.html, e.g. for a search that ran past its time limit.
            <tr>
              <td colSpan={columnCount}>
                <p className="alert alert-warning text-center" role="alert">
                  <i className="crm-i fa-circle-exclamation" role="img" aria-hidden="true" />{" "}
                  {errorMessage(rows.error)}
                </p>
              </td>
            </tr>
          )}
          {result && (
            <InlineEditContext value={editsCells(settings) ? inlineEdit : null}>
              <ReorderRows reorder={reorder} rows={result.rows}>
                {(drag) => (
                  <BodyRows
                    rows={result.rows}
                    settings={settings}
                    subsearch={result.subsearch}
                    afform={afform}
                    select={tasks.rowSelect}
                    drag={drag}
                    onLinkClick={tasks.onRowLink}
                    hidden={hidden}
                  />
                )}
              </ReorderRows>
            </InlineEditContext>
          )}
        </tbody>
        {tally && tally.footer !== false && tallyRow && <tfoot>{tallyRow}</tfoot>}
      </table>
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
