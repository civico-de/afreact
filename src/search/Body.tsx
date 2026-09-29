import { useState } from "react";
import { Cell, cellText } from "./Cell";
import { onLinkClick } from "./links";
import {
  cellClass,
  descendents,
  hasControlColumn,
  hiddenRows,
  rowClass,
  startsCollapsed,
} from "./rows";
import type { DisplaySettings, Row, SubsearchDisplay } from "./types";

interface BodyRowsProps {
  rows: Row[];
  settings: DisplaySettings;
  subsearch: Record<string, SubsearchDisplay>;
  afform?: string;
}

/** crmSearchDisplayTableBody.html: one row per result, rows under a collapsed parent left out. */
export function BodyRows({ rows, settings, subsearch, afform }: BodyRowsProps) {
  const [toggled, setToggled] = useState<ReadonlyMap<Row["key"], boolean>>(new Map());
  const control = hasControlColumn(settings);
  const isCollapsed = (row: Row) =>
    descendents(row) > 0 && (toggled.get(row.key) ?? startsCollapsed(row, settings));
  const hidden = hiddenRows(rows, isCollapsed);
  return rows
    .filter((row) => !hidden.has(row.key))
    .map((row) => (
      <tr key={row.key} data-entity-id={row.key}>
        {control && (
          <td
            className={["crm-search-ctrl-column", rowClass(row, settings), row.cssClass ?? ""]
              .filter(Boolean)
              .join(" ")}
          >
            {settings.collapsible && (
              <ToggleCollapse
                count={descendents(row)}
                collapsed={isCollapsed(row)}
                onToggle={() => {
                  setToggled(new Map(toggled).set(row.key, !isCollapsed(row)));
                }}
              />
            )}
          </td>
        )}
        {row.columns.map((cell, index) => {
          const column = settings.columns[index];
          return (
            <td
              key={index}
              className={cellClass(column, row, settings, cell?.cssClass)}
              title={cell?.title}
              data-field-name={column?.key}
            >
              {cell && (
                <Cell
                  column={column}
                  cell={cell}
                  colIndex={index}
                  subsearch={subsearch}
                  afform={afform}
                  onLinkClick={onLinkClick}
                />
              )}
            </td>
          );
        })}
      </tr>
    ));
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
export function PlaceholderRows({ settings }: { settings: DisplaySettings }) {
  const control = hasControlColumn(settings);
  return Array.from({ length: settings.placeholder ?? 5 }, (_, placeholder) => (
    <tr key={placeholder}>
      {control && <td />}
      {settings.columns.map((_column, index) => (
        <td key={index}>
          <div className="crm-search-loading-placeholder" />
        </td>
      ))}
    </tr>
  ));
}

/**
 * The header of the control column. Core leaves it empty without bulk actions; the hidden text
 * names what the column holds.
 */
export function ControlHeader({ settings }: { settings: DisplaySettings }) {
  if (!hasControlColumn(settings)) return null;
  const label = settings.collapsible
    ? ts("Show sub-rows")
    : settings.tally
      ? settings.tally.label
      : "";
  return (
    <th>
      <span className="sr-only">{label}</span>
    </th>
  );
}

interface TallyRowProps {
  settings: DisplaySettings;
  /** Null while the tally request runs. */
  tally: Record<string, unknown> | null;
}

/** crmSearchDisplayTally.html: the totals row in the header or footer. */
export function TallyRow({ settings, tally }: TallyRowProps) {
  const label = settings.tally ? settings.tally.label : undefined;
  return (
    <tr className="crm-search-display-tally">
      {hasControlColumn(settings) && <td>{label}</td>}
      {settings.columns.map((column, index) => {
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
