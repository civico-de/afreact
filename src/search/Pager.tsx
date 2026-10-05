import { useEffect, useEffectEvent, useId, useState } from "react";
import { SEARCH_DELAY_MS } from "./filters";
import { pageLinks } from "./pages";
import { resultCount } from "./selection";

interface PagerSettings {
  show_count?: boolean;
  hide_single?: boolean;
  expose_limit?: boolean;
}

interface PagerProps {
  settings: PagerSettings;
  rowCount: number;
  page: number;
  limit: number;
  onPage: (page: number) => void;
  onLimit: (limit: number) => void;
  /** Rows selected for bulk actions. */
  selected?: number;
}

/** crmSearchDisplay/Pager.html: result count, page links and the page size input. */
export function Pager({
  settings,
  rowCount,
  page,
  limit,
  onPage,
  onLimit,
  selected = 0,
}: PagerProps) {
  const pages = limit ? Math.max(1, Math.ceil(rowCount / limit)) : 1;
  const shown = !settings.hide_single || pages > 1;
  return (
    <div className="crm-flex-box crm-search-display-pager">
      <div>
        {settings.show_count && (
          <div className="form-inline">
            <label>{resultCount(rowCount, selected)}</label>
          </div>
        )}
      </div>
      {shown && (
        <nav className="text-center crm-flex-2" aria-label={ts("Pages")}>
          <ul className="pagination">
            <PageItem
              className="pagination-prev"
              label="⬅"
              name={ts("Previous")}
              onSelect={
                page > 1
                  ? () => {
                      onPage(page - 1);
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
                        onPage(link.number);
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
                      onPage(page + 1);
                    }
                  : null
              }
            />
          </ul>
        </nav>
      )}
      <div>{settings.expose_limit && shown && <PageSize limit={limit} onLimit={onLimit} />}</div>
    </div>
  );
}

/** The page size input; like the Angular watcher it searches once typing pauses. */
function PageSize({ limit, onLimit }: { limit: number; onLimit: (limit: number) => void }) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const commit = useEffectEvent((text: string) => {
    const next = Number(text);
    if (Number.isInteger(next) && next >= 1 && next !== limit) onLimit(next);
    setDraft(null);
  });
  useEffect(() => {
    const timer = setTimeout(() => {
      if (draft !== null) commit(draft);
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [draft]);
  return (
    <div className="form-inline text-right">
      <label htmlFor={id}>{ts("Page Size")}</label>{" "}
      <input
        className="form-control four"
        id={id}
        type="number"
        min={1}
        value={draft ?? String(limit)}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
      />
    </div>
  );
}

interface SearchButtonProps {
  label: string;
  loading: boolean;
  onSearch: () => void;
}

/** crmSearchDisplay/SearchButton.html. */
export function SearchButton({ label, loading, onSearch }: SearchButtonProps) {
  return (
    <button type="button" className="btn btn-primary" disabled={loading} onClick={onSearch}>
      <i className={`crm-i ${loading ? "fa-spin fa-spinner" : "fa-search"}`} aria-hidden="true" />{" "}
      {label}
    </button>
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
