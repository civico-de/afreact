import { useId } from "react";
import { ModelText } from "../../widgets/ModelText";
import { Picker } from "../../widgets/Picker";
import {
  Check,
  CssRules,
  NoResultsConfig,
  PagerConfig,
  PlaceholderConfig,
  SearchButtonConfig,
  Section,
  SortConfig,
  TasksConfig,
  TokenSelect,
  ToolbarConfig,
  type Editing,
} from "./common";
import { Columns } from "./Columns";
import {
  canBeSortable,
  entityHasType,
  setColumnMode,
  tableClasses,
  tallyFunctions,
  toggleDraggable,
  toggleEditableRowMode,
  toggleItem,
  toggleTally,
  toggleTallyRewrite,
  type LinkItem,
} from "./model";

interface TableEditorProps extends Editing {
  rowLinks: LinkItem[];
  toolbarLinks: LinkItem[];
}

/** searchAdminDisplayTable */
export function TableEditor(props: TableEditorProps) {
  const { ctx, draft, edit, rowLinks, toolbarLinks } = props;
  const id = useId();
  const s = draft.settings;
  const sortable = entityHasType(ctx, "SortableEntity");
  const hierarchical = entityHasType(ctx, "HierarchicalEntity");
  const row = s.editableRow ?? {};
  const fns = tallyFunctions(ctx.meta).map((fn) => ({
    id: fn.name,
    label: fn.title,
    description: fn.description,
  }));
  const tallyCheck = (position: "header" | "footer", label: string) => (
    <div className="form-inline">
      <Check
        label={label}
        title={ts("Shows grand totals or other statistics, configured per-column.")}
        checked={!!s.tally?.[position]}
        onChange={() => {
          edit((d) => {
            toggleTally(ctx, d, position);
          });
        }}
      />
      {s.tally?.[position] && (
        <div className="form-group">
          <label htmlFor={`${id}-tally-${position}`}>{ts("Label")}</label>{" "}
          <ModelText
            id={`${id}-tally-${position}`}
            className="form-control"
            live
            value={s.tally.label ?? ""}
            onChange={(value) => {
              edit((d) => {
                if (d.settings.tally) d.settings.tally.label = value;
              });
            }}
          />
        </div>
      )}
    </div>
  );
  return (
    <>
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
              <Check
                label={ts("Show nested hierarchy")}
                checked={!!s.hierarchical}
                onChange={() => {
                  edit((d) => {
                    d.settings.hierarchical = !d.settings.hierarchical;
                  });
                }}
              />
              {s.hierarchical && (
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
              )}
            </div>
          )}
        </Section>

        <Section title={ts("Style")}>
          <PlaceholderConfig draft={draft} edit={edit} />
          <NoResultsConfig draft={draft} edit={edit} />
          <fieldset className="form-inline">
            <legend className="afreact-inline-legend">{ts("Table Style")}</legend>
            {tableClasses().map((style) => (
              <Check
                key={style.name}
                label={style.label}
                checked={!!s.classes?.includes(style.name)}
                onChange={() => {
                  edit((d) => {
                    d.settings.classes = toggleItem(d.settings.classes ?? [], style.name);
                  });
                }}
              />
            ))}
          </fieldset>
          <CssRules
            ctx={ctx}
            label={ts("Row Style")}
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
          <div className="form-inline">
            <TasksConfig {...props} />
          </div>
          <ToolbarConfig {...props} links={toolbarLinks} />
          <div
            className="form-inline crm-search-admin-flex-row"
            title={ts("Allow user to pick which columns to include when viewing/download results")}
          >
            <label>
              <input
                type="checkbox"
                checked={!!s.toggleColumns}
                onChange={() => {
                  edit((d) => {
                    d.settings.toggleColumns = !d.settings.toggleColumns;
                  });
                }}
              />{" "}
              {ts("Enable Column Picker")}
            </label>
          </div>
          {tallyCheck("header", ts("Show Totals in Header"))}
          <div className="form-inline">
            <Check
              label={ts("Hide Table Header")}
              checked={!!s.hideThead}
              onChange={() => {
                edit((d) => {
                  d.settings.hideThead = !d.settings.hideThead;
                });
              }}
            />
          </div>
        </Section>

        <Section title={ts("Footer")}>
          <PagerConfig {...props} />
          {tallyCheck("footer", ts("Show Totals in Footer"))}
        </Section>

        <Section title={ts("In-Place Edit")}>
          <fieldset className="form-inline">
            <legend className="sr-only">{ts("In-Place Edit")}</legend>
            <label className="radio-inline">
              <input
                type="radio"
                name={`${id}-edit-mode`}
                checked={!row.full && !row.disable}
                onChange={() => {
                  edit((d) => {
                    toggleEditableRowMode(d.settings, "full", false);
                  });
                }}
              />{" "}
              {ts("Single Field")}
            </label>
            <label className="radio-inline">
              <input
                type="radio"
                name={`${id}-edit-mode`}
                checked={!!row.full}
                onChange={() => {
                  edit((d) => {
                    toggleEditableRowMode(d.settings, "full", true);
                  });
                }}
              />{" "}
              {ts("Entire Row")}
            </label>
            <label className={`radio-inline${row.create ? "" : " disabled"}`}>
              <input
                type="radio"
                name={`${id}-edit-mode`}
                checked={!!row.disable}
                disabled={!row.create}
                onChange={() => {
                  edit((d) => {
                    toggleEditableRowMode(d.settings, "disable", true);
                  });
                }}
              />{" "}
              {ts("Disabled (create only)")}
            </label>
          </fieldset>
          <div className="form-inline">
            <Check
              label={ts("Add New Button")}
              title={ts("Create a new record using in-place edit.")}
              checked={!!row.create}
              onChange={() => {
                edit((d) => {
                  toggleEditableRowMode(d.settings, "create");
                });
              }}
            />
            {row.create && (
              <ModelText
                className="form-control"
                live
                aria-label={ts("Add New Button label")}
                placeholder={ts("(no label)")}
                value={row.createLabel ?? ""}
                onChange={(value) => {
                  edit((d) => {
                    if (d.settings.editableRow) d.settings.editableRow.createLabel = value;
                  });
                }}
              />
            )}
          </div>
        </Section>
      </fieldset>

      <fieldset className="crm-search-admin-edit-columns-wrapper">
        <legend>{ts("Columns")}</legend>
        <fieldset className="form-inline">
          <legend className="sr-only">{ts("Column mode")}</legend>
          <label className="radio-inline">
            <input
              type="radio"
              name={`${id}-column-mode`}
              checked={s.columnMode === "auto"}
              onChange={() => {
                edit((d) => {
                  setColumnMode(ctx, d, "auto");
                });
              }}
            />{" "}
            {ts("Use default columns from search")}
          </label>
          <label className="radio-inline">
            <input
              type="radio"
              name={`${id}-column-mode`}
              checked={s.columnMode === "custom"}
              onChange={() => {
                edit((d) => {
                  setColumnMode(ctx, d, "custom", true);
                });
              }}
            />{" "}
            {ts("Use custom columns")}
          </label>
        </fieldset>
        {s.columnMode !== "auto" && (
          <Columns
            {...props}
            links={rowLinks}
            defaults={{ label: true, sortable: true }}
            head={(col, index, editCol) => (
              <>
                <div className="form-inline crm-search-admin-flex-row">
                  <label htmlFor={`${id}-header-${String(index)}`}>{ts("Header")}</label>
                  <ModelText
                    id={`${id}-header-${String(index)}`}
                    className="form-control crm-flex-1"
                    live
                    value={col.label ?? ""}
                    onChange={(value) => {
                      editCol((c) => {
                        c.label = value;
                      });
                    }}
                  />
                </div>
                <div className="form-inline">
                  <label>
                    {ts("Alignment")}{" "}
                    <select
                      className="form-control crm-auto-width"
                      value={col.alignment ?? ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        editCol((c) => {
                          c.alignment = value;
                        });
                      }}
                    >
                      <option value="">{ts("Left")}</option>
                      <option value="text-center">{ts("Center")}</option>
                      <option value="text-right">{ts("Right")}</option>
                    </select>
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
                {canBeSortable(ctx, s, col) && (
                  <div className="form-inline">
                    <label title={ts("Allow user to click on header to sort table by this column")}>
                      <input
                        type="checkbox"
                        checked={col.sortable !== false}
                        onChange={() => {
                          editCol((c) => {
                            c.sortable = c.sortable === false;
                          });
                        }}
                      />{" "}
                      {ts("Sortable Header")}
                    </label>
                  </div>
                )}
              </>
            )}
            tail={(col, index, editCol) =>
              col.type === "field" &&
              s.tally && (
                <div className="form-inline">
                  <label htmlFor={`${id}-tally-label-${String(index)}`}>{ts("Totals")}</label>{" "}
                  <ModelText
                    id={`${id}-tally-label-${String(index)}`}
                    className="form-control"
                    live
                    placeholder={ts("No label")}
                    title={ts("Totals label")}
                    value={col.tally?.label ?? ""}
                    onChange={(value) => {
                      editCol((c) => {
                        c.tally = { ...c.tally, label: value };
                      });
                    }}
                  />{" "}
                  <Picker
                    id={`${id}-tally-fn-${String(index)}`}
                    label={ts("Aggregate")}
                    placeholder={ts("None")}
                    single
                    options={fns}
                    value={col.tally?.fn ? [col.tally.fn] : []}
                    onChange={(picked) => {
                      const fn = picked[0];
                      editCol((c) => {
                        c.tally = { ...c.tally, fn: fn === undefined ? null : String(fn) };
                      });
                    }}
                  />{" "}
                  <label>
                    <input
                      type="checkbox"
                      checked={!!col.tally?.rewrite}
                      onChange={() => {
                        editCol(toggleTallyRewrite);
                      }}
                    />{" "}
                    {ts("Totals Rewrite")}
                  </label>
                  {col.tally?.rewrite !== undefined && col.tally.rewrite !== "" && (
                    <>
                      <ModelText
                        className="form-control"
                        aria-label={ts("Totals rewrite with tokens")}
                        placeholder={ts("None")}
                        value={col.tally.rewrite}
                        onChange={(value) => {
                          editCol((c) => {
                            c.tally = { ...c.tally, rewrite: value };
                          });
                        }}
                      />
                      <TokenSelect
                        ctx={ctx}
                        onlySelect
                        onToken={(token) => {
                          editCol((c) => {
                            c.tally = { ...c.tally, rewrite: (c.tally?.rewrite ?? "") + token };
                          });
                        }}
                      />
                    </>
                  )}
                </div>
              )
            }
          />
        )}
      </fieldset>
    </>
  );
}
