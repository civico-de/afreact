import { createElement, useState, type MouseEvent } from "react";
import { errorMessage } from "../api/civi";
import { Cell, cellText } from "./Cell";
import { EditableCell } from "./EditableCell";
import { InlineEditContext, useInlineEditContext, type InlineEdit } from "./inlineEdit";
import { buildTree, editsCells, fieldClass, sectionStarts, type TreeItem } from "./rows";
import type { DisplaySettings, Link, Row, RunPage, SubsearchDisplay } from "./types";

/** The text core shows when nothing is found, falling back on an empty one too; null for none. */
export function noResultsText(settings: DisplaySettings): string | null {
  const text = settings.noResultsText;
  if (text === false) return null;
  return text === undefined || text === "" ? ts("None found.") : text;
}

/** searchDisplayError.html, e.g. for a search that ran past its time limit. */
export function ServerError({ error }: { error: unknown }) {
  return (
    <p className="alert alert-warning text-center" role="alert">
      <i className="crm-i fa-circle-exclamation" role="img" aria-hidden="true" />{" "}
      {errorMessage(error)}
    </p>
  );
}

type OnLinkClick = (link: Link, key: Row["key"], event: MouseEvent<HTMLAnchorElement>) => void;

interface ItemsProps {
  settings: DisplaySettings;
  /** Names the list for screen readers, as the caption names a table. */
  label: string;
  loading: boolean;
  /** The page shown, undefined while it loads or after a failed run. */
  result: RunPage | undefined;
  error: unknown;
  afform?: string;
  onLinkClick: OnLinkClick;
  inlineEdit: InlineEdit;
}

interface ColumnsProps {
  row: Row;
  settings: DisplaySettings;
  subsearch: Record<string, SubsearchDisplay>;
  afform?: string;
  onLinkClick: OnLinkClick;
}

/** The columns of one item, as crmSearchDisplayListItems.html and its grid and tree twins. */
function ItemColumns({ row, settings, subsearch, afform, onLinkClick }: ColumnsProps) {
  const edit = useInlineEditContext();
  return row.columns.map((cell, index) => {
    if (!cell) return null;
    const column = settings.columns[index];
    return (
      <div key={index} title={cell.title} className={fieldClass(column, cell.cssClass)}>
        {cell.label && <label>{cell.label}</label>}
        <span>
          <EditableCell edit={edit} row={row} column={column} colIndex={index} settings={settings}>
            <Cell
              column={column}
              cell={cell}
              colIndex={index}
              subsearch={subsearch}
              afform={afform}
              onLinkClick={(link, event) => {
                onLinkClick(link, row.key, event);
              }}
            />
          </EditableCell>
        </span>
      </div>
    );
  });
}

const HEADER_TAGS = new Set(["h2", "h3", "h4", "h5", "div"]);

/** crmSearchDisplayListHeader.html: the value a section of rows shares. */
function SectionHeader({ value, tag }: { value: unknown; tag: string | undefined }) {
  const text = Array.isArray(value) ? value.map(cellText).join(", ") : cellText(value);
  const element = tag && HEADER_TAGS.has(tag) ? tag : "h4";
  return createElement(
    element,
    { className: "crm-search-display-group-header" },
    text || ts("(none)"),
  );
}

/**
 * crmSearchDisplayList.html and crmSearchDisplayGrid.html: one item per row, a heading before
 * each section. The grid's boxes form a list for screen readers, as the list's items do.
 */
export function ItemList({ type, ...props }: ItemsProps & { type: "list" | "grid" }) {
  const { settings, label, loading, result, error } = props;
  const grid = type === "grid";
  const container = grid ? "div" : settings.style === "ol" ? "ol" : "ul";
  const item = grid ? "div" : "li";
  const role = grid ? "listitem" : undefined;
  const sections = sectionStarts(result?.rows ?? [], settings.section_group_by);
  const noResults = noResultsText(settings);
  const items = loading
    ? Array.from({ length: settings.placeholder ?? 5 }, (_, index) =>
        createElement(
          item,
          // crmSearchDisplayGridLoading.html sizes each placeholder box.
          { key: index, role, style: grid ? { width: "100px", height: "50px" } : undefined },
          <div className="crm-search-loading-placeholder" />,
        ),
      )
    : (result?.rows ?? []).flatMap((row) => [
        ...(sections.has(row.key)
          ? [
              createElement(
                item,
                {
                  key: `header-${String(row.key)}`,
                  role,
                  className: grid
                    ? "crm-search-display-grid-header-item"
                    : "crm-search-display-group-header-item",
                },
                <SectionHeader value={sections.get(row.key)} tag={settings.header_tag} />,
              ),
            ]
          : []),
        createElement(
          item,
          {
            key: row.key,
            role,
            "data-entity-id": row.key,
            className: [`crm-search-display-${type}item`, row.cssClass].filter(Boolean).join(" "),
          },
          <ItemColumns
            row={row}
            settings={settings}
            subsearch={result?.subsearch ?? {}}
            afform={props.afform}
            onLinkClick={props.onLinkClick}
          />,
        ),
      ]);
  return (
    <>
      <InlineEditContext value={editsCells(settings) ? props.inlineEdit : null}>
        {createElement(
          container,
          {
            className: grid
              ? `crm-search-display-grid-container crm-search-display-grid-layout-${String(settings.colno ?? "")}`
              : "crm-search-display-list-container",
            role: grid ? "list" : undefined,
            "aria-label": label || undefined,
            "aria-busy": loading,
            style: !grid && settings.symbol ? { listStyle: settings.symbol } : undefined,
          },
          items,
        )}
      </InlineEditContext>
      {result?.rows.length === 0 && noResults !== null && (
        <div className={`crm-search-display-${type}-no-results`}>
          <p className="alert alert-info text-center">{noResults}</p>
        </div>
      )}
      {!loading && !!error && <ServerError error={error} />}
    </>
  );
}

/**
 * crmSearchDisplayTree.html: nested lists under disclosure buttons. Which branches are open
 * survives reloads, where core closes them again after every run.
 */
export function TreeView(props: ItemsProps) {
  const { settings, label, loading, result, error } = props;
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(new Map());
  const noResults = noResultsText(settings);
  const tree = result ? buildTree(result.rows, settings.parent_field) : [];
  const isCollapsed = (item: TreeItem) =>
    !!settings.collapsible &&
    item.children.length > 0 &&
    (toggled.get(String(item.row.key)) ?? settings.collapsible === "closed");

  const branch = (items: TreeItem[], root: boolean) => (
    <ul
      className="crm-search-display-tree-branch"
      // A leaf's empty branch only keeps core's spacing.
      role={items.length ? undefined : "presentation"}
      aria-label={root && label ? label : undefined}
    >
      {items.map((item) => {
        const key = String(item.row.key);
        const collapsed = isCollapsed(item);
        const count = item.children.length;
        return (
          <li
            key={key}
            data-entity-id={item.row.key}
            className={
              [item.row.cssClass, collapsed ? "crm-search-display-tree-branch-collapsed" : ""]
                .filter(Boolean)
                .join(" ") || undefined
            }
          >
            {settings.collapsible && (
              <button
                type="button"
                className="btn btn-xs crm-search-display-tree-collapse-toggle"
                style={count ? undefined : { visibility: "hidden" }}
                aria-expanded={count ? !collapsed : undefined}
                aria-label={ts("%1 sub-items", { 1: count })}
                onClick={() => {
                  setToggled(new Map(toggled).set(key, !collapsed));
                }}
              >
                <i className="crm-i fa-caret-down" role="img" aria-hidden="true" />
                <span className="crm-search-display-tree-branch-count">{count}</span>
              </button>
            )}
            <ItemColumns
              row={item.row}
              settings={settings}
              subsearch={result?.subsearch ?? {}}
              afform={props.afform}
              onLinkClick={props.onLinkClick}
            />
            {!collapsed && branch(item.children, false)}
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      {loading ? (
        <ul aria-busy="true">
          {Array.from({ length: settings.placeholder ?? 5 }, (_, index) => (
            <li key={index}>
              <div className="crm-search-loading-placeholder" />
            </li>
          ))}
        </ul>
      ) : (
        result && (
          <InlineEditContext value={editsCells(settings) ? props.inlineEdit : null}>
            {branch(tree, true)}
          </InlineEditContext>
        )
      )}
      {result?.rows.length === 0 && noResults !== null && (
        <div className="crm-search-display-list-no-results">
          <p className="alert alert-info text-center">{noResults}</p>
        </div>
      )}
      {!loading && !!error && <ServerError error={error} />}
    </>
  );
}
