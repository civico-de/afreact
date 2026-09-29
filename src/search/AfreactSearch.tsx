import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Unsupported } from "../afform/Unsupported";
import { api4, errorMessage, get, type ApiResult } from "../api/civi";
import { onButtonKey } from "../keys";
import { BodyRows, ControlHeader, PlaceholderRows, TallyRow } from "./Body";
import { useAutoOpen, useFormSuccess } from "./links";
import { pageLinks } from "./pages";
import { hasControlColumn, headerClass, isSortable, runPage, unsupportedFeatures } from "./rows";
import { DisplayHeader } from "./Toolbar";
import { isDisplaySettings, type DisplaySettings, type Row, type RunPage } from "./types";

type Sort = [string, "ASC" | "DESC"][];

interface AfreactSearchProps {
  search: string;
  display: string;
  /** Settings Afform already compiled into the layout; loaded via the API when absent. */
  settings?: DisplaySettings;
  /** Embedding Afform, so SearchDisplay.run applies the form's access rules as in Angular. */
  afform?: string;
  /** Fixed filters, e.g. those a subsearch column passes on from its row. */
  filters?: Record<string, unknown> | unknown[];
}

export function AfreactSearch({
  search,
  display,
  settings: given,
  afform,
  filters,
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
  const [sort, setSort] = useState<Sort | null>(null);
  const [page, setPage] = useState(1);
  // searchDisplayBaseTrait's uniqueId: keeps a RAND() sort stable across pages and reloads.
  const [seed] = useState(() => Math.floor(Math.random() * 10e10));

  const activeSort = sort ?? settings?.sort ?? [];
  const limit = settings?.limit ?? 0;
  const params = {
    savedSearch: search,
    display,
    limit,
    seed,
    afform,
    ...(filters ? { filters } : {}),
  };
  // The count ignores sort and page, so it is asked once per display.
  const countKey = ["SearchDisplay", "count", params];
  const rows = useQuery({
    queryKey: ["SearchDisplay", "run", params, activeSort, page],
    queryFn: async () => {
      const result: ApiResult<Row> = await api4<Row>("SearchDisplay", "run", {
        ...params,
        sort: activeSort,
        return: `page:${page}`,
      });
      // Same rule as searchDisplayBaseTrait: a short first page is the whole result, no count call needed.
      if (page === 1 && (!limit || result.length < limit))
        client.setQueryData(countKey, result.length);
      return runPage(result);
    },
    enabled: !!settings,
  });
  const counted = useQuery({
    queryKey: countKey,
    queryFn: async () =>
      (await api4<unknown>("SearchDisplay", "run", { ...params, return: "row_count" })).count ??
      null,
    enabled: rows.isSuccess && (!!settings?.pager || !!settings?.headerCount),
  });
  // The totals row ignores sort and page, like the count.
  const tallied = useQuery({
    queryKey: ["SearchDisplay", "tally", params],
    queryFn: async () =>
      (
        await api4<Record<string, unknown>>("SearchDisplay", "run", { ...params, return: "tally" })
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
  // Core keeps the toolbar of the last run while the next page loads.
  const [shown, setShown] = useState<RunPage | undefined>(undefined);
  if (rows.data && rows.data !== shown) setShown(rows.data);

  const error = loaded.error ?? rows.error;
  if (error) return <Failure error={error} />;
  if (!settings) return <p role="status">{ts("Loading…")}</p>;
  const label = loaded.data?.label ?? "";
  const rowCount = counted.data ?? null;
  const loading = rows.isPending;

  const pages = rowCount !== null && limit ? Math.max(1, Math.ceil(rowCount / limit)) : 1;
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
    setSort(next);
  };

  const pager = settings.pager;
  const unsupported = unsupportedFeatures(settings, shown);
  const failed = counted.error ?? tallied.error;
  const tally = settings.tally;
  const tallyRow = !loading && !!rows.data?.rows.length && !!tally && (
    <TallyRow settings={settings} tally={tallied.data ?? null} />
  );
  return (
    <div className="crm-search-display crm-search-display-table" ref={setRoot}>
      {unsupported.length > 0 && <Unsupported what={unsupported.join(", ")} />}
      {failed && <Failure error={failed} />}
      <DisplayHeader settings={settings} rowCount={rowCount} toolbar={shown?.toolbar} />
      <p role="status" className="sr-only">
        {loading ? ts("Loading…") : ""}
      </p>
      <table className={(settings.classes ?? []).join(" ")} aria-busy={loading}>
        <caption className="sr-only">{label}</caption>
        <thead hidden={settings.hideThead === true}>
          <tr>
            <ControlHeader settings={settings} />
            {settings.columns.map((column, index) => {
              const direction = directionOf(column.key);
              const sortKey = isSortable(column, settings) ? column.key : undefined;
              // ARIA allows aria-sort on one header: the column sorted first.
              const primary = !!column.key && activeSort[0]?.[0] === column.key;
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
                </th>
              );
            })}
          </tr>
          {tally && tally.header && tallyRow}
        </thead>
        <tbody>
          {loading && <PlaceholderRows settings={settings} />}
          {rows.data?.rows.length === 0 && settings.noResultsText !== false && (
            <tr>
              <td colSpan={settings.columns.length + (hasControlColumn(settings) ? 1 : 0)}>
                <p className="alert alert-info text-center">
                  {/* Core falls back on an empty text too. */}
                  {settings.noResultsText === undefined || settings.noResultsText === ""
                    ? ts("None found.")
                    : settings.noResultsText}
                </p>
              </td>
            </tr>
          )}
          {rows.data && (
            <BodyRows
              rows={rows.data.rows}
              settings={settings}
              subsearch={rows.data.subsearch}
              afform={afform}
            />
          )}
        </tbody>
        {tally && tally.footer !== false && tallyRow && <tfoot>{tallyRow}</tfoot>}
      </table>
      {pager && !!rowCount && (
        <div className="crm-flex-box crm-search-display-pager">
          <div>
            {pager.show_count && (
              <div className="form-inline">
                <label>{rowCount === 1 ? ts("1 result") : ts("%1 results", { 1: rowCount })}</label>
              </div>
            )}
          </div>
          {(!pager.hide_single || pages > 1) && (
            <nav className="text-center crm-flex-2" aria-label={ts("Pages")}>
              <ul className="pagination">
                <PageItem
                  className="pagination-prev"
                  label="⬅"
                  name={ts("Previous")}
                  onSelect={
                    page > 1
                      ? () => {
                          setPage(page - 1);
                        }
                      : null
                  }
                />
                {pageLinks(page, pages).map((link, index) => (
                  <PageItem
                    key={index}
                    className="pagination-page"
                    label={link.label}
                    current={link.active}
                    onSelect={
                      link.active
                        ? null
                        : () => {
                            setPage(link.number);
                          }
                    }
                  />
                ))}
                <PageItem
                  className="pagination-next"
                  label="⮕"
                  name={ts("Next")}
                  onSelect={
                    page < pages
                      ? () => {
                          setPage(page + 1);
                        }
                      : null
                  }
                />
              </ul>
            </nav>
          )}
          <div />
        </div>
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

interface PageItemProps {
  className: string;
  label: string;
  name?: string;
  current?: boolean;
  onSelect: (() => void) | null;
}

/** An entry of SearchKit's pager; the theme styles its links and spans, so an inactive entry is a span. */
function PageItem({ className, label, name, current = false, onSelect }: PageItemProps) {
  const state = current ? " active" : onSelect ? "" : " disabled";
  const content = name ? (
    <>
      <span aria-hidden="true">{label}</span>
      <span className="sr-only">{name}</span>
    </>
  ) : (
    label
  );
  return (
    <li className={className + state}>
      {onSelect ? (
        <a
          href="#"
          onClick={(event) => {
            event.preventDefault();
            onSelect();
          }}
        >
          {content}
        </a>
      ) : (
        <span aria-current={current ? "page" : undefined}>{content}</span>
      )}
    </li>
  );
}
