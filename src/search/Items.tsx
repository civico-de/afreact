import { createElement, Suspense, use, useState, type MouseEvent, type ReactNode } from "react";
import { errorMessage } from "../api/civi";
import { Cell, cellText } from "./Cell";
import { EditableCell } from "./EditableCell";
import { InlineEditContext, useInlineEditContext, type InlineEdit } from "./inlineEdit";
import { loadSortable, type Reorder } from "./Reorder";
import { buildTree, fieldClass, sectionStarts, type TreeItem } from "./rows";
import { rowName } from "./Tasks";
import { FIRST, firstUnder, treeMove } from "./treeDrag";
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
  /** Drag to reorder, used by the tree. */
  reorder?: Reorder;
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
      <InlineEditContext value={props.inlineEdit}>
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

/** What a tree's drag needs from its lists and items. */
interface TreeDrag {
  root: (list: ReactNode) => ReactNode;
  /** The first place of the branch under `parent`, null at the top. */
  slot: (parent: Row["key"] | null) => ReactNode;
  item: (
    item: TreeItem,
    className: string | undefined,
    content: (dragging: boolean) => ReactNode,
  ) => ReactNode;
  handle: (item: TreeItem) => ReactNode;
}

/**
 * crmSearchDisplayTree.html: nested lists under disclosure buttons. Which branches are open
 * survives reloads, where core closes them again after every run.
 */
export function TreeView(props: ItemsProps) {
  const { settings, label, loading, result, error, reorder } = props;
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(new Map());
  const noResults = noResultsText(settings);
  const tree = result ? buildTree(result.rows, settings.parent_field) : [];
  const isCollapsed = (item: TreeItem) =>
    !!settings.collapsible &&
    item.children.length > 0 &&
    (toggled.get(String(item.row.key)) ?? settings.collapsible === "closed");

  const branch = (items: TreeItem[], parent: Row["key"] | null, drag: TreeDrag | undefined) => {
    const list = (
      <ul
        className="crm-search-display-tree-branch"
        // A leaf's empty branch only keeps core's spacing.
        role={items.length ? undefined : "presentation"}
        aria-label={parent === null && label ? label : undefined}
      >
        {drag?.slot(parent)}
        {items.map((item) => {
          const key = String(item.row.key);
          const collapsed = isCollapsed(item);
          const count = item.children.length;
          const className =
            [item.row.cssClass, collapsed ? "crm-search-display-tree-branch-collapsed" : ""]
              .filter(Boolean)
              .join(" ") || undefined;
          const content = (dragging: boolean) => (
            <>
              {drag?.handle(item)}
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
              {!collapsed && !dragging && branch(item.children, item.row.key, drag)}
            </>
          );
          return drag ? (
            drag.item(item, className, content)
          ) : (
            <li key={key} data-entity-id={item.row.key} className={className}>
              {content(false)}
            </li>
          );
        })}
      </ul>
    );
    // Core's branch element: the theme wraps it onto its own line below the item's columns.
    const wrapped = createElement("crm-search-display-tree-branch", null, list);
    return drag && parent === null ? drag.root(wrapped) : wrapped;
  };

  const rows = result?.rows ?? [];
  const draggable = reorder?.weightField && settings.parent_field ? reorder : null;
  const body = draggable ? (
    <Suspense fallback={branch(tree, null, undefined)}>
      <DraggableTree
        reorder={draggable}
        rows={rows}
        weightField={draggable.weightField ?? ""}
        parentField={settings.parent_field ?? ""}
      >
        {(drag) => branch(tree, null, drag)}
      </DraggableTree>
    </Suspense>
  ) : (
    branch(tree, null, undefined)
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
        result && <InlineEditContext value={props.inlineEdit}>{body}</InlineEditContext>
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

interface DraggableTreeProps {
  reorder: Reorder;
  rows: Row[];
  weightField: string;
  parentField: string;
  children: (drag: TreeDrag) => ReactNode;
}

/** The tree's drag and drop, loaded with dnd-kit; a slot at the top of each branch takes a first place. */
function DraggableTree({ reorder, rows, weightField, parentField, children }: DraggableTreeProps) {
  const { TreeDnd, TreeItem: Item, TreeSlot, DragHandle } = use(loadSortable());
  const names = new Map(rows.map((row) => [String(row.key), rowName(row)]));
  const nameOf = (key: string | number) => names.get(String(key)) ?? String(key);
  const placeOf = (active: string | number, over: string | number) => {
    const row = rows.find((each) => each.key === active);
    if (!row || !treeMove(rows, row.key, over, weightField, parentField)) return null;
    if (typeof over === "string" && over.startsWith(FIRST)) {
      const parent = over.slice(FIRST.length);
      return parent ? ts("first under %1", { 1: nameOf(parent) }) : ts("to the first place");
    }
    return ts("after %1", { 1: nameOf(over) });
  };
  const drag: TreeDrag = {
    root: (list) => (
      <TreeDnd nameOf={nameOf} placeOf={placeOf} disabled={reorder.saving} onMove={reorder.move}>
        {list}
      </TreeDnd>
    ),
    slot: (parent) => <TreeSlot id={firstUnder(parent)} disabled={reorder.saving} />,
    item: (item, className, content) => (
      <Item key={String(item.row.key)} rowKey={item.row.key} className={className} disabled={reorder.saving}>
        {content}
      </Item>
    ),
    handle: (item) => <DragHandle tree label={ts("Move %1", { 1: rowName(item.row) })} />,
  };
  return children(drag);
}
