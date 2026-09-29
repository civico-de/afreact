import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api4, errorMessage, get } from "../api/civi";
import { onButtonKey } from "../keys";
import { pageLinks } from "./pages";

interface Column {
  type: string;
  key?: string;
  label?: string;
  sortable?: boolean;
}

export interface DisplaySettings {
  columns: Column[];
  limit?: number;
  sort?: [string, "ASC" | "DESC"][];
  pager?: false | { show_count?: boolean; hide_single?: boolean };
  classes?: string[];
  noResultsText?: string;
  /** Placeholder rows while a page loads; SearchKit shows 5 unless set. */
  placeholder?: number;
}

interface CellLink {
  url?: string;
  text?: string;
  title?: string;
  target?: string;
}

export interface Row {
  key: string | number;
  columns: { val?: unknown; links?: CellLink[]; title?: string; cssClass?: string }[];
  cssClass?: string;
}

type Sort = [string, "ASC" | "DESC"][];

interface AfreactSearchProps {
  search: string;
  display: string;
  /** Settings Afform already compiled into the layout; loaded via the API when absent. */
  settings?: DisplaySettings;
  /** Embedding Afform, so SearchDisplay.run applies the form's access rules as in Angular. */
  afform?: string;
}

export function AfreactSearch({ search, display, settings: given, afform }: AfreactSearchProps) {
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
      return { label: found.label ?? "", settings: found.settings as unknown as DisplaySettings };
    },
    enabled: !given,
  });
  const settings = given ?? loaded.data?.settings;
  const [sort, setSort] = useState<Sort | null>(null);
  const [page, setPage] = useState(1);

  const activeSort = sort ?? settings?.sort ?? [];
  const limit = settings?.limit ?? 0;
  const params = { savedSearch: search, display, limit, afform };
  // The count ignores sort and page, so it is asked once per display.
  const countKey = ["SearchDisplay", "count", params];
  const rows = useQuery({
    queryKey: ["SearchDisplay", "run", params, activeSort, page],
    queryFn: async () => {
      const result = await api4<Row>("SearchDisplay", "run", {
        ...params,
        sort: activeSort,
        return: `page:${page}`,
      });
      // Same rule as searchDisplayBaseTrait: a short first page is the whole result, no count call needed.
      if (page === 1 && (!limit || result.length < limit))
        client.setQueryData(countKey, result.length);
      return [...result];
    },
    enabled: !!settings,
  });
  const counted = useQuery({
    queryKey: countKey,
    queryFn: async () =>
      (await api4<unknown>("SearchDisplay", "run", { ...params, return: "row_count" })).count ??
      null,
    enabled: rows.isSuccess && settings?.pager !== false,
  });

  const error = loaded.error ?? rows.error ?? counted.error;
  if (error)
    return (
      <div className="alert alert-danger" role="alert">
        {errorMessage(error)}
      </div>
    );
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
    setSort(next);
    setPage(1);
  };

  const pager = settings.pager;
  return (
    <div className="crm-search-display crm-search-display-table">
      <p role="status" className="sr-only">
        {loading ? ts("Loading…") : ""}
      </p>
      <table className={(settings.classes ?? ["table"]).join(" ")} aria-busy={loading}>
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr>
            {settings.columns.map((column, index) => {
              const direction = directionOf(column.key);
              const sortKey = column.sortable === true ? column.key : undefined;
              // ARIA allows aria-sort on one header: the column sorted first.
              const primary = !!column.key && activeSort[0]?.[0] === column.key;
              return (
                <th
                  key={index}
                  scope="col"
                  className={sortKey ? "crm-sortable-col" : undefined}
                  title={
                    sortKey
                      ? ts("Click to sort results (shift-click to sort by multiple).")
                      : undefined
                  }
                  aria-sort={
                    primary ? (direction === "DESC" ? "descending" : "ascending") : undefined
                  }
                  // The whole cell sorts on click as in SearchKit; the label is the keyboard control.
                  onClick={sortKey ? (event) => toggleSort(sortKey, event.shiftKey) : undefined}
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
                        ? onButtonKey((event) => toggleSort(sortKey, event.shiftKey))
                        : undefined
                    }
                  >
                    {column.label}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: settings.placeholder ?? 5 }, (_, placeholder) => (
              <tr key={placeholder}>
                {settings.columns.map((_column, index) => (
                  <td key={index}>
                    <div className="crm-search-loading-placeholder" />
                  </td>
                ))}
              </tr>
            ))}
          {rows.data?.length === 0 && (
            <tr>
              <td colSpan={settings.columns.length}>
                {settings.noResultsText || ts("None found.")}
              </td>
            </tr>
          )}
          {rows.data?.map((row) => (
            <tr key={row.key} className={row.cssClass}>
              {row.columns.map((cell, index) => (
                <td key={index} className={cell.cssClass}>
                  <Cell cell={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
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
                  onSelect={page > 1 ? () => setPage(page - 1) : null}
                />
                {pageLinks(page, pages).map((link, index) => (
                  <PageItem
                    key={index}
                    className="pagination-page"
                    label={link.label}
                    current={link.active}
                    onSelect={link.active ? null : () => setPage(link.number)}
                  />
                ))}
                <PageItem
                  className="pagination-next"
                  label="⮕"
                  name={ts("Next")}
                  onSelect={page < pages ? () => setPage(page + 1) : null}
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

function Cell({ cell }: { cell: Row["columns"][number] }) {
  const text =
    cell.val === null || cell.val === undefined
      ? ""
      : Array.isArray(cell.val)
        ? cell.val.join(", ")
        : String(cell.val);
  const link = cell.links?.[0];
  if (link?.url) {
    return (
      <a href={link.url} title={cell.title} target={link.target || undefined}>
        {text}
      </a>
    );
  }
  return <>{text}</>;
}
