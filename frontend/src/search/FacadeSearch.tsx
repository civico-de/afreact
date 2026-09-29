import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api4, errorMessage, get } from "../api/civi";

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
  pager?: false | { show_count?: boolean };
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

interface FacadeSearchProps {
  search: string;
  display: string;
  /** Settings Afform already compiled into the layout; loaded via the API when absent. */
  settings?: DisplaySettings;
  /** Embedding Afform, so SearchDisplay.run applies the form's access rules as in Angular. */
  afform?: string;
}

export function FacadeSearch({ search, display, settings: given, afform }: FacadeSearchProps) {
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
  const sort0 = activeSort[0];

  const pages = rowCount !== null && limit ? Math.max(1, Math.ceil(rowCount / limit)) : null;
  const toggleSort = (key: string) => {
    const current = sort0?.[0] === key ? sort0[1] : null;
    setSort([[key, current === "ASC" ? "DESC" : "ASC"]]);
    setPage(1);
  };

  return (
    <div className="facade-search">
      <p role="status" className="sr-only">
        {loading ? ts("Loading…") : ""}
      </p>
      <table className={(settings.classes ?? ["table"]).join(" ")} aria-busy={loading}>
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr>
            {settings.columns.map((column, index) => {
              const direction = column.key && sort0?.[0] === column.key ? sort0[1] : null;
              return (
                <th
                  key={index}
                  scope="col"
                  aria-sort={
                    direction === "ASC"
                      ? "ascending"
                      : direction === "DESC"
                        ? "descending"
                        : undefined
                  }
                >
                  {column.sortable && column.key ? (
                    <button
                      type="button"
                      className="facade-sort"
                      onClick={() => toggleSort(column.key!)}
                    >
                      {column.label}
                      <i
                        className={`crm-i ${direction === "ASC" ? "fa-sort-asc" : direction === "DESC" ? "fa-sort-desc" : "fa-sort"}`}
                        aria-hidden="true"
                      />
                    </button>
                  ) : (
                    column.label
                  )}
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
      {pages !== null && pages > 1 && (
        <nav className="facade-pager" aria-label={ts("Pages")}>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            {ts("Previous")}
          </button>
          <span aria-live="polite">{ts("Page %1 of %2", { 1: page, 2: pages })}</span>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >
            {ts("Next")}
          </button>
        </nav>
      )}
      {rowCount !== null && <p className="facade-count">{ts("%1 results", { 1: rowCount })}</p>}
    </div>
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
