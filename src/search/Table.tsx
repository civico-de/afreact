import type { MouseEvent, ReactNode } from "react";
import { onButtonKey } from "../keys";
import { BodyRows, ControlHeader, PlaceholderRows, TallyRow, useCollapse } from "./Body";
import { InlineEditContext, type InlineEdit } from "./inlineEdit";
import { noResultsText, ServerError } from "./Items";
import { NewRow } from "./NewRow";
import { ReorderRows, type Reorder } from "./Reorder";
import { hasControlColumn, headerClass, isSortable, unlabelledHeader } from "./rows";
import type { RowSelect } from "./Tasks";
import type { DisplaySettings, Link, Row, RunPage } from "./types";
import type { Sort } from "./urlKeys";

interface TableViewProps {
  settings: DisplaySettings;
  label: string;
  loading: boolean;
  /** The page shown, undefined while it loads or after a failed run. */
  result: RunPage | undefined;
  error: unknown;
  /** How many placeholders stand in for a loading page. */
  placeholders: number;
  afform?: string;
  hidden: ReadonlySet<number>;
  activeSort: Sort;
  onSort: (key: string, add: boolean) => void;
  /** Null while the tally request runs. */
  tally: Record<string, unknown> | null;
  selectAll?: ReactNode;
  select?: RowSelect;
  onLinkClick: (link: Link, key: Row["key"], event: MouseEvent<HTMLAnchorElement>) => void;
  inlineEdit: InlineEdit;
  reorder: Reorder;
  headerTools?: HeaderTools;
}

/** Controls an editor adds to the header: per column, and in a cell after the last one. */
export interface HeaderTools {
  column: (index: number) => ReactNode;
  end: ReactNode;
  /** Names the extra header cell, whose controls are no header text. */
  endLabel: string;
}

/** crmSearchDisplayTable.html: the header with sort controls, the rows and the totals. */
export function TableView(props: TableViewProps) {
  const { settings, label, loading, result, error, hidden, activeSort, onSort } = props;
  const collapse = useCollapse(result?.rows ?? [], settings);
  const directionOf = (key: string | undefined) =>
    activeSort.find(([sorted]) => sorted === key)?.[1] ?? null;
  const tally = settings.tally;
  // A full-width row spans the header's cells: shown columns, controls and the header tools.
  const columnCount =
    settings.columns.filter((_, index) => !hidden.has(index)).length +
    (hasControlColumn(settings) ? 1 : 0) +
    (props.headerTools ? 1 : 0);
  const tallyRow = !!result?.rows.length && !!tally && (
    <TallyRow settings={settings} tally={props.tally} hidden={hidden} />
  );
  const noResults = noResultsText(settings);
  return (
    <table className={(settings.classes ?? []).join(" ")} aria-busy={loading}>
      <caption className="sr-only">{label}</caption>
      <thead hidden={settings.hideThead === true}>
        <tr>
          <ControlHeader settings={settings} selectAll={props.selectAll} />
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
                        onSort(sortKey, event.shiftKey);
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
                          onSort(sortKey, event.shiftKey);
                        })
                      : undefined
                  }
                >
                  {column.label}
                </span>
                {unlabelled && <span className="sr-only">{unlabelled}</span>}
                {props.headerTools?.column(index)}
              </th>
            );
          })}
          {props.headerTools && (
            <th scope="col" className="form-inline text-right">
              <span className="sr-only">{props.headerTools.endLabel}</span>
              {props.headerTools.end}
            </th>
          )}
        </tr>
        {tally && tally.header && tallyRow}
      </thead>
      {/* Core swaps the rows for placeholders while a run loads; kept rows wait, inert. */}
      {/* deviation:page-keeps-rows */}
      <tbody inert={loading && !!result}>
        {loading && !result && (
          <PlaceholderRows settings={settings} hidden={hidden} count={props.placeholders} />
        )}
        {result?.rows.length === 0 && noResults !== null && (
          <tr>
            <td colSpan={columnCount}>
              {/* deviation:angular-runtime-classes */}
              {/* Riverlea sizes a table's alerts by Angular's binding class. */}
              <p className="alert alert-info text-center ng-binding">{noResults}</p>
            </td>
          </tr>
        )}
        {!loading && !!error && (
          <tr>
            <td colSpan={columnCount}>
              <ServerError error={error} />
            </td>
          </tr>
        )}
        {result && (
          <InlineEditContext value={props.inlineEdit}>
            <ReorderRows
              reorder={props.reorder}
              rows={result.rows}
              shown={result.rows.filter((row) => !collapse.hidden.has(row.key))}
            >
              {(drag) => (
                <BodyRows
                  rows={result.rows}
                  settings={settings}
                  subsearch={result.subsearch}
                  afform={props.afform}
                  select={props.select}
                  drag={drag}
                  onLinkClick={props.onLinkClick}
                  hidden={hidden}
                  collapse={collapse}
                />
              )}
            </ReorderRows>
          </InlineEditContext>
        )}
      </tbody>
      {!loading && result && settings.editableRow && settings.editableRow.create && (
        <tbody>
          <NewRow settings={settings} edit={props.inlineEdit} hidden={hidden} />
        </tbody>
      )}
      {tally && tally.footer !== false && tallyRow && <tfoot>{tallyRow}</tfoot>}
    </table>
  );
}
