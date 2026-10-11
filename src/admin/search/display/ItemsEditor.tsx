import { useId } from "react";
import { Picker } from "../../widgets/Picker";
import { getAllFields, getEntity, getSelectFields } from "../expr";
import {
  Check,
  CssRules,
  NoResultsConfig,
  PagerConfig,
  PlaceholderConfig,
  SearchButtonConfig,
  Section,
  SortConfig,
  TokenSelect,
  ToolbarConfig,
  type Editing,
} from "./common";
import { Columns } from "./Columns";
import {
  colLabel,
  entityHasType,
  listSymbols,
  setSectionGroupBy,
  toggleDraggable,
  type AdminColumn,
  type Draft,
  type LinkItem,
} from "./model";

interface ItemsEditorProps extends Editing {
  rowLinks: LinkItem[];
  toolbarLinks: LinkItem[];
}

/** New Line, Prevent Wrapping and Label, which list, grid and tree fields share. */
function ItemHead({
  ctx,
  col,
  index,
  editCol,
}: {
  ctx: Editing["ctx"];
  col: AdminColumn;
  index: number;
  editCol: (change: (col: AdminColumn, draft: Draft) => void) => void;
}) {
  const id = useId();
  return (
    <>
      <div className="form-inline">
        <label title={ts("Should this item display on its own line or inline with other items?")}>
          <input
            type="checkbox"
            checked={!!col.break}
            onChange={() => {
              editCol((c) => {
                c.break = !c.break;
              });
            }}
          />{" "}
          {ts("New Line")}
        </label>{" "}
        <label title={ts("Disable line breaks to keep contents inline")}>
          <input
            type="checkbox"
            checked={!!col.nowrap}
            onChange={() => {
              editCol((c) => {
                c.nowrap = !c.nowrap;
              });
            }}
          />{" "}
          {ts("Prevent Wrapping")}
        </label>
      </div>
      <div className="form-inline crm-search-admin-flex-row">
        <label>
          <input
            type="checkbox"
            checked={!!col.label}
            onChange={() => {
              editCol((c) => {
                c.label = c.label ? null : colLabel(ctx, c);
              });
            }}
          />{" "}
          {ts("Label")}
        </label>
        {!!col.label && (
          <>
            <label htmlFor={`${id}-label-${String(index)}`} className="sr-only">
              {ts("Label text")}
            </label>
            <input
              id={`${id}-label-${String(index)}`}
              className="form-control crm-flex-1"
              type="text"
              defaultValue={col.label}
              onBlur={(event) => {
                const value = event.target.value;
                editCol((c) => {
                  c.label = value;
                });
              }}
            />
            <TokenSelect
              ctx={ctx}
              suffix=":label"
              onToken={(token) => {
                editCol((c) => {
                  c.label = (c.label ?? "") + token;
                });
              }}
            />
          </>
        )}
      </div>
      {!!col.label && (
        <div className="form-inline">
          <div className="checkbox">
            <label>
              <input
                type="checkbox"
                checked={!!col.forceLabel}
                onChange={() => {
                  editCol((c) => {
                    c.forceLabel = !c.forceLabel;
                  });
                }}
              />{" "}
              {ts("Show label even when field is blank")}
            </label>
          </div>
        </div>
      )}
    </>
  );
}

/** Group Sections By and its header tag, for list and grid. */
function SectionGroupBy({ ctx, draft, edit }: Editing) {
  const id = useId();
  const field = draft.settings.section_group_by ?? "";
  return (
    <fieldset>
      <legend className="sr-only">{ts("Group Sections By")}</legend>
      <div className="form-inline">
        <Picker
          id={`${id}-group`}
          label={ts("Group Sections By")}
          placeholder={ts("No grouping")}
          single
          options={[
            ...getSelectFields(ctx.meta, ctx.search).map((f) => ({ ...f, group: ts("Columns") })),
            ...getAllFields(ctx.meta, ctx.search, "", ["Field", "Custom", "Extra"]),
          ]}
          value={field ? [field] : []}
          onChange={(picked) => {
            const next = picked[0];
            edit((d) => {
              setSectionGroupBy(d.settings, next === undefined ? "" : String(next));
            });
          }}
        />
      </div>
      {field && (
        <div className="form-inline">
          <label htmlFor={`${id}-tag`}>{ts("Header Tag")}</label>{" "}
          <select
            id={`${id}-tag`}
            className="form-control"
            value={draft.settings.header_tag ?? "h4"}
            onChange={(event) => {
              const value = event.target.value;
              edit((d) => {
                d.settings.header_tag = value;
              });
            }}
          >
            <option value="h2">{ts("Heading 2")}</option>
            <option value="h3">{ts("Heading 3")}</option>
            <option value="h4">{ts("Heading 4 (default)")}</option>
            <option value="h5">{ts("Heading 5")}</option>
            <option value="div">{ts("Plain (no heading)")}</option>
          </select>
        </div>
      )}
    </fieldset>
  );
}

function GroupedPager(props: Editing) {
  const grouped = !!props.draft.settings.section_group_by;
  return (
    <>
      {grouped && (
        <div className="alert alert-info">
          {ts(
            'Pager is unavailable while grouping - grouping requires fetching all matching rows at once so a group can never be split across pages. Use "Limit Results" instead.',
          )}
        </div>
      )}
      <PagerConfig {...props} noPager={grouped} />
      <PlaceholderConfig draft={props.draft} edit={props.edit} />
    </>
  );
}

function ItemFields(props: ItemsEditorProps & { defaults: { break?: boolean } }) {
  return (
    <fieldset className="crm-search-admin-edit-columns-wrapper">
      <legend>{ts("Fields")}</legend>
      <Columns
        {...props}
        links={props.rowLinks}
        defaults={props.defaults}
        head={(col, index, editCol) => (
          <ItemHead ctx={props.ctx} col={col} index={index} editCol={editCol} />
        )}
      />
    </fieldset>
  );
}

/** searchAdminDisplayList */
export function ListEditor(props: ItemsEditorProps) {
  const { draft, edit, toolbarLinks } = props;
  const id = useId();
  const style = draft.settings.style ?? "ul";
  return (
    <>
      <Section title={ts("Settings")}>
        <SectionGroupBy {...props} />
        <SortConfig {...props} />
        <fieldset>
          <legend className="sr-only">{ts("Style")}</legend>
          <div className="form-inline">
            <label htmlFor={`${id}-style`}>{ts("Style")}</label>{" "}
            <select
              id={`${id}-style`}
              className="form-control"
              value={style}
              onChange={(event) => {
                const value = event.target.value;
                edit((d) => {
                  d.settings.style = value;
                  d.settings.symbol = "";
                });
              }}
            >
              <option value="ul">{ts("Bullets")}</option>
              <option value="ol">{ts("Numbers")}</option>
            </select>{" "}
            <label htmlFor={`${id}-symbol`}>{ts("Symbol")}</label>{" "}
            <select
              id={`${id}-symbol`}
              className="form-control"
              value={draft.settings.symbol ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                edit((d) => {
                  d.settings.symbol = value;
                });
              }}
            >
              {(listSymbols()[style] ?? []).map((symbol) => (
                <option key={symbol.char} value={symbol.char}>
                  {symbol.label}
                </option>
              ))}
            </select>
          </div>
        </fieldset>
        <fieldset>
          <legend className="sr-only">{ts("Search Button")}</legend>
          <div className="form-inline crm-search-admin-flex-row">
            <SearchButtonConfig draft={draft} edit={edit} />
          </div>
          <NoResultsConfig draft={draft} edit={edit} />
        </fieldset>
        <fieldset>
          <legend className="sr-only">{ts("Pager")}</legend>
          <GroupedPager {...props} />
        </fieldset>
        <ToolbarConfig {...props} links={toolbarLinks} />
      </Section>
      <ItemFields {...props} defaults={{}} />
    </>
  );
}

/** searchAdminDisplayGrid */
export function GridEditor(props: ItemsEditorProps) {
  const { draft, edit, toolbarLinks } = props;
  const id = useId();
  return (
    <>
      <Section title={ts("Settings")}>
        <SectionGroupBy {...props} />
        <SortConfig {...props} />
        <fieldset>
          <legend className="sr-only">{ts("Layout")}</legend>
          <div className="form-inline">
            <label htmlFor={`${id}-colno`}>{ts("Layout")}</label>{" "}
            <select
              id={`${id}-colno`}
              className="form-control"
              value={draft.settings.colno ?? "3"}
              onChange={(event) => {
                const value = event.target.value;
                edit((d) => {
                  d.settings.colno = value;
                });
              }}
            >
              <option value="2">{ts("2 x 2")}</option>
              <option value="3">{ts("3 x 3")}</option>
              <option value="4">{ts("4 x 4")}</option>
              <option value="5">{ts("5 x 5")}</option>
            </select>{" "}
            <SearchButtonConfig draft={draft} edit={edit} />
          </div>
          <NoResultsConfig draft={draft} edit={edit} />
          <GroupedPager {...props} />
          <ToolbarConfig {...props} links={toolbarLinks} />
        </fieldset>
      </Section>
      <ItemFields {...props} defaults={{}} />
    </>
  );
}

/** searchAdminDisplayTree */
export function TreeEditor(props: ItemsEditorProps) {
  const { ctx, draft, edit, toolbarLinks } = props;
  const s = draft.settings;
  const sortable = entityHasType(ctx, "SortableEntity");
  const hierarchical = entityHasType(ctx, "HierarchicalEntity");
  const plural = getEntity(ctx.meta, ctx.search.api_entity)?.title_plural ?? ctx.search.api_entity;
  return (
    <>
      {!hierarchical && (
        <div className="alert alert-warning">
          {ts("%1 do not support hierarchical nesting. Consider using a different display type.", {
            1: plural,
          })}
        </div>
      )}
      <fieldset>
        <legend>{ts("Display Settings")}</legend>
        <Section title={ts("Sorting")}>
          {sortable && (
            <div className="form-inline">
              <Check
                label={ts("Drag and drop sorting")}
                checked={!!s.draggable}
                onChange={() => {
                  edit((d) => {
                    toggleDraggable(ctx, d.settings);
                  });
                }}
              />
            </div>
          )}
          {!s.draggable && <SortConfig {...props} />}
          {hierarchical && (
            <div className="form-inline">
              <select
                className="form-control"
                aria-label={ts("Should hierarchical tree be collapsible")}
                title={ts("Should hierarchical tree be collapsible")}
                value={s.collapsible ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  edit((d) => {
                    d.settings.collapsible = value;
                  });
                }}
              >
                <option value="">{ts("Not collapsible")}</option>
                <option value="open">{ts("Collapsible - Open")}</option>
                <option value="closed">{ts("Collapsible - Closed")}</option>
              </select>
            </div>
          )}
        </Section>
        <Section title={ts("Style")}>
          <PlaceholderConfig draft={draft} edit={edit} />
          <NoResultsConfig draft={draft} edit={edit} />
          <CssRules
            ctx={ctx}
            label={ts("Item Style")}
            rules={s.cssRules}
            onChange={(rules) => {
              edit((d) => {
                d.settings.cssRules = rules;
              });
            }}
          />
        </Section>
        <Section title={ts("Header")}>
          <div className="form-inline">
            <SearchButtonConfig draft={draft} edit={edit} />
          </div>
          <ToolbarConfig {...props} links={toolbarLinks} />
        </Section>
      </fieldset>
      <ItemFields {...props} defaults={{ break: false }} />
    </>
  );
}
