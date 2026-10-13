import { useState, type MouseEvent, type ReactNode } from "react";
import { Cell, cellText } from "./Cell";
import { dragField } from "./dragOrder";
import { EditableCell, editingClass, RowEditButtons } from "./EditableCell";
import { useInlineEditContext } from "./inlineEdit";
import type { RowDrag } from "./Reorder";
import {
  cellClass,
  descendents,
  hasControlColumn,
  hiddenRows,
  keyOf,
  rowClass,
  startsCollapsed,
} from "./rows";
import type { RowSelect } from "./Tasks";
import type { DisplaySettings, Link, Row, RowKey, SubsearchDisplay } from "./types";

interface BodyRowsProps {
  rows: Row[];
  settings: DisplaySettings;
  subsearch: Record<string, SubsearchDisplay>;
  afform?: string;
  /** The checkbox of each row, with bulk actions. */
  select?: RowSelect;
  /** Sortable rows with their handles, on a draggable display. */
  drag?: RowDrag;
  onLinkClick: (link: Link, key: Row["key"], event: MouseEvent<HTMLAnchorElement>) => void;
  /** Columns the column picker hides. */
  hidden?: ReadonlySet<number>;
  /** Which rows are folded up, from useCollapse(). */
  collapse: Collapse;
}

const NONE: ReadonlySet<number> = new Set();

export interface Collapse {
  /** Keys of the rows under a collapsed parent. */
  hidden: ReadonlySet<Row["key"]>;
  isCollapsed: (row: Row) => boolean;
  toggle: (row: Row) => void;
}

/** crmSearchDisplayToggleCollapse's state per row, kept while the rows change. */
// deviation:table-rows-stay-open
export function useCollapse(rows: Row[], settings: DisplaySettings): Collapse {
  const [toggled, setToggled] = useState<ReadonlyMap<Row["key"], boolean>>(new Map());
  const isCollapsed = (row: Row) =>
    descendents(row) > 0 && (toggled.get(row.key) ?? startsCollapsed(row, settings));
  return {
    hidden: hiddenRows(rows, isCollapsed),
    isCollapsed,
    toggle: (row) => {
      setToggled(new Map(toggled).set(row.key, !isCollapsed(row)));
    },
  };
}

/** crmSearchDisplayTableBody.html: one row per result, rows under a collapsed parent left out. */
export function BodyRows({
  rows,
  settings,
  subsearch,
  afform,
  select,
  drag,
  onLinkClick,
  hidden: hiddenColumns = NONE,
  collapse,
}: BodyRowsProps) {
  const edit = useInlineEditContext();
  const control = hasControlColumn(settings);
  return rows
    .filter((row) => !collapse.hidden.has(row.key))
    .map((row, position) => {
      const cells = (
        <>
          {control && (
            <td
              className={["crm-search-ctrl-column", rowClass(row, settings), row.cssClass ?? ""]
                .filter(Boolean)
                .join(" ")}
            >
              {drag?.handle(row)}
              {select && row.key !== undefined && (
                <SelectRow select={select} row={row} rowKey={row.key} />
              )}
              {settings.collapsible && (
                <ToggleCollapse
                  count={descendents(row)}
                  collapsed={collapse.isCollapsed(row)}
                  onToggle={() => {
                    collapse.toggle(row);
                  }}
                />
              )}
              <RowEditButtons edit={edit} row={row} />
            </td>
          )}
          {row.columns.map((cell, index) => {
            if (hiddenColumns.has(index)) return null;
            const column = settings.columns[index];
            const target = { rowKey: row.key, colIndex: index };
            // deviation:full-row-editing-class
            const editing = cell?.edit ? editingClass(edit, target) : "";
            return (
              <td
                key={index}
                className={[cellClass(column, row, settings, cell?.cssClass), editing]
                  .filter(Boolean)
                  .join(" ")}
                title={cell?.title}
                data-field-name={column?.key}
              >
                {cell && (
                  <EditableCell
                    edit={edit}
                    row={row}
                    column={column}
                    colIndex={index}
                    settings={settings}
                  >
                    <Cell
                      column={column}
                      cell={cell}
                      data={row.data}
                      colIndex={index}
                      subsearch={subsearch}
                      afform={afform}
                      onLinkClick={(link, event) => {
                        onLinkClick(link, row.key, event);
                      }}
                    />
                  </EditableCell>
                )}
              </td>
            );
          })}
        </>
      );
      // Grouped rows have no key; their order is all that tells them apart.
      return drag ? (
        <drag.Row key={keyOf(row.key)} rowKey={keyOf(row.key)}>
          {cells}
        </drag.Row>
      ) : (
        <PlainRow key={row.key ?? position} rowKey={row.key}>
          {cells}
        </PlainRow>
      );
    });
}

function SelectRow({ select, row, rowKey }: { select: RowSelect; row: Row; rowKey: RowKey }) {
  return (
    <input
      type="checkbox"
      className="crm-search-ctrl-select-row"
      aria-label={select.label(row)}
      checked={select.isSelected(rowKey)}
      disabled={select.disabled}
      onChange={(event) => {
        const click = event.nativeEvent;
        select.toggle(rowKey, click instanceof MouseEvent && click.shiftKey);
      }}
    />
  );
}

function PlainRow({ rowKey, children }: { rowKey: Row["key"]; children: ReactNode }) {
  // An empty id on grouped rows, as core's `{{:: row.key }}` writes it.
  return <tr data-entity-id={rowKey ?? ""}>{children}</tr>;
}

interface ToggleCollapseProps {
  count: number;
  collapsed: boolean;
  onToggle: () => void;
}

/** crmSearchDisplayToggleCollapse: hidden, but keeping its space, on rows without sub-rows. */
function ToggleCollapse({ count, collapsed, onToggle }: ToggleCollapseProps) {
  return (
    <button
      className="btn crm-search-ctrl-toggle-row"
      type="button"
      title={ts("Show sub-rows")}
      aria-expanded={!collapsed}
      style={count ? undefined : { visibility: "hidden" }}
      onClick={onToggle}
    >
      <i
        className={`crm-i ${collapsed ? "fa-caret-right" : "fa-caret-down"}`}
        role="img"
        aria-hidden="true"
      />{" "}
      {collapsed && <span>{count}</span>} <span className="sr-only">{ts("Show sub-rows")}</span>
    </button>
  );
}

/** crmSearchDisplayTableLoading.html. */
export function PlaceholderRows({
  settings,
  hidden = NONE,
  count = settings.placeholder ?? 5,
}: {
  settings: DisplaySettings;
  hidden?: ReadonlySet<number>;
  count?: number;
}) {
  const control = hasControlColumn(settings);
  return Array.from({ length: count }, (_, placeholder) => (
    <tr key={placeholder}>
      {control && (
        <td>
          {settings.actions && <input type="checkbox" disabled aria-label={ts("Loading…")} />}
        </td>
      )}
      {settings.columns.map((_column, index) =>
        hidden.has(index) ? null : (
          <td key={index}>
            <div className="crm-search-loading-placeholder" />
          </td>
        ),
      )}
    </tr>
  ));
}

/**
 * The header of the control column. Core leaves it empty without bulk actions; the hidden text
 * names what the column holds.
 */
export function ControlHeader({
  settings,
  selectAll,
}: {
  settings: DisplaySettings;
  selectAll?: ReactNode;
}) {
  if (!hasControlColumn(settings)) return null;
  // crmSearchDisplayTaskHeader.html marks a draggable table with an icon.
  const dragIcon = dragField(settings) && (
    <i
      className="crm-i fa-sort-amount-asc"
      title={ts("Drag columns to reposition")}
      role="img"
      aria-hidden="true"
    />
  );
  if (selectAll)
    return (
      <th className="crm-search-result-select">
        {dragIcon}
        {selectAll}
      </th>
    );
  const label = settings.collapsible
    ? ts("Show sub-rows")
    : settings.tally
      ? settings.tally.label
      : dragField(settings)
        ? ts("Drag to reposition")
        : settings.editableRow
          ? ts("Row editing")
          : "";
  return (
    <th>
      {dragIcon}
      <span className="sr-only">{label}</span>
    </th>
  );
}

interface TallyRowProps {
  settings: DisplaySettings;
  /** Null while the tally request runs. */
  tally: Record<string, unknown> | null;
  hidden?: ReadonlySet<number>;
}

/** crmSearchDisplayTally.html: the totals row in the header or footer. */
export function TallyRow({ settings, tally, hidden = NONE }: TallyRowProps) {
  const label = settings.tally ? settings.tally.label : undefined;
  return (
    <tr className="crm-search-display-tally">
      {hasControlColumn(settings) && <td>{label}</td>}
      {settings.columns.map((column, index) => {
        if (hidden.has(index)) return null;
        const value = column.key === undefined ? undefined : tally?.[column.key];
        return (
          <td key={index}>
            {tally ? (
              <div>
                {column.tally?.label}{" "}
                {Array.isArray(value) ? value.map(cellText).join(", ") : cellText(value)}
              </div>
            ) : (
              <div className="crm-search-loading-placeholder" />
            )}
          </td>
        );
      })}
    </tr>
  );
}
