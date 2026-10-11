import type { ReactNode } from "react";
import { Menu } from "../../../search/Menu";
import type { ColumnDefaults } from "../expr";
import type { Editing } from "./common";
import { ColumnTypeFields } from "./ColumnFields";
import {
  addCol,
  colLabel,
  colTypes,
  columnsOf,
  getColumnIndex,
  getFieldLabel,
  removeCol,
  toggleColumn,
  type AdminColumn,
  type Draft,
  type LinkItem,
} from "./model";

interface ColumnsProps extends Editing {
  links: LinkItem[];
  defaults: ColumnDefaults;
  /** Whether a select column may be shown, e.g. only fields in a tree. */
  isAllowed?: (expr: string) => boolean;
  /** Without it, only field columns (addColMenu without getColTypes). */
  withTypes?: boolean;
  /** What the display type configures per column before its type's own settings. */
  head: (
    col: AdminColumn,
    index: number,
    editCol: (change: (col: AdminColumn, draft: Draft) => void) => void,
  ) => ReactNode;
  /** And after them. */
  tail?: (
    col: AdminColumn,
    index: number,
    editCol: (change: (col: AdminColumn, draft: Draft) => void) => void,
  ) => ReactNode;
}

/** addColMenu and the column list every display type shares, in order with move buttons. */
export function Columns(props: ColumnsProps) {
  const { ctx, draft, edit, links, defaults, isAllowed, withTypes = true, head, tail } = props;
  const columns = columnsOf(draft.settings);
  const dateFormats = ctx.meta.dateFormats;
  const editAt = (index: number) => (change: (col: AdminColumn, draft: Draft) => void) => {
    edit((d) => {
      const col = d.settings.columns?.[index];
      if (col) change(col, d);
    });
  };
  const move = (from: number, to: number) => {
    edit((d) => {
      const list = [...columnsOf(d.settings)];
      const [moved] = list.splice(from, 1);
      if (moved) list.splice(to, 0, moved);
      d.settings.columns = list;
    });
  };
  const select = ctx.search.api_params.select.filter((expr) => !isAllowed || isAllowed(expr));
  return (
    <>
      <div className="btn-group">
        <details className="afreact-column-picker">
          <summary className="btn btn-primary">
            <i className="crm-i fa-plus-square-o" role="img" aria-hidden="true" />{" "}
            {ts("Add/Remove Fields")}
          </summary>
          <fieldset className="afreact-column-picker-list">
            <legend className="sr-only">{ts("Add/Remove Fields")}</legend>
            {select.map((expr) => (
              <div className="checkbox" key={expr}>
                <label>
                  <input
                    type="checkbox"
                    checked={getColumnIndex(draft.settings, expr) > -1}
                    onChange={() => {
                      edit((d) => {
                        toggleColumn(ctx, d, expr, defaults);
                      });
                    }}
                  />{" "}
                  {getFieldLabel(ctx, expr)}
                </label>
              </div>
            ))}
          </fieldset>
        </details>
      </div>{" "}
      {withTypes && (
        <Menu
          buttonClass="btn dropdown-toggle btn-primary"
          label={
            <>
              <i className="crm-i fa-link" role="img" aria-hidden="true" /> {ts("Add Links, etc.")}
            </>
          }
          alignRight={false}
          links={Object.entries(colTypes()).map(([type, info]) => ({
            task: type,
            icon: info.icon,
            text: info.label,
          }))}
          onLinkClick={(link, event) => {
            event.preventDefault();
            const type = link.task;
            if (type)
              edit((d) => {
                addCol(d, type);
              });
          }}
        />
      )}
      <fieldset className="crm-search-admin-edit-columns">
        <legend className="sr-only">{ts("Columns")}</legend>
        {columns.map((col, index) => {
          const label = colLabel(ctx, col);
          const editCol = editAt(index);
          return (
            <fieldset
              key={`${col.type}-${col.key ?? ""}-${String(index)}`}
              className="crm-draggable"
            >
              <legend className="sr-only">{label}</legend>
              <div className="pull-right">
                <button
                  type="button"
                  className="btn btn-xs"
                  disabled={index === 0}
                  aria-label={ts("Move %1 up", { 1: label })}
                  onClick={() => {
                    move(index, index - 1);
                  }}
                >
                  <i className="crm-i fa-arrow-up" role="img" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="btn btn-xs"
                  disabled={index === columns.length - 1}
                  aria-label={ts("Move %1 down", { 1: label })}
                  onClick={() => {
                    move(index, index + 1);
                  }}
                >
                  <i className="crm-i fa-arrow-down" role="img" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="btn btn-xs"
                  aria-label={ts("Remove %1", { 1: label })}
                  title={ts("Remove")}
                  onClick={() => {
                    edit((d) => {
                      removeCol(d.settings, index);
                    });
                  }}
                >
                  <i className="crm-i fa-ban" role="img" aria-hidden="true" />
                </button>
              </div>
              <details>
                <summary>{label}</summary>
                <div className="crm-accordion-body">
                  {head(col, index, editCol)}
                  <ColumnTypeFields
                    ctx={ctx}
                    col={col}
                    links={links}
                    dateFormats={dateFormats}
                    editCol={(change) => {
                      editCol((c) => {
                        change(c);
                      });
                    }}
                  />
                  {tail?.(col, index, editCol)}
                </div>
              </details>
            </fieldset>
          );
        })}
      </fieldset>
    </>
  );
}
