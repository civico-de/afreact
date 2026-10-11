import { useId } from "react";
import { Picker } from "../../widgets/Picker";
import { getAllFields, getEntity } from "../expr";
import { SortConfig, TokenSelect, type Editing } from "./common";
import { IconsConfig } from "./ColumnFields";
import { Columns } from "./Columns";
import { colLabel, toggleEmptyVal, toggleRewrite, type AdminColumn, type Draft } from "./model";

/** Empty placeholder or rewrite: a checkbox, then a text area with tokens. */
function ColumnText({
  ctx,
  col,
  field,
  label,
  title,
  toggle,
  editCol,
}: {
  ctx: Editing["ctx"];
  col: AdminColumn;
  field: "empty_value" | "rewrite";
  label: string;
  title: string;
  toggle: (col: AdminColumn) => void;
  editCol: (change: (col: AdminColumn, draft: Draft) => void) => void;
}) {
  const id = useId();
  const value = col[field];
  return (
    <div className="form-inline crm-search-admin-flex-row">
      <label title={title}>
        <input
          type="checkbox"
          checked={!!value}
          onChange={() => {
            editCol((c) => {
              toggle(c);
            });
          }}
        />{" "}
        {label}
      </label>
      {!!value && (
        <>
          <label htmlFor={id} className="sr-only">
            {label}
          </label>
          <textarea
            id={id}
            rows={2}
            className="form-control crm-flex-1"
            defaultValue={value}
            onBlur={(event) => {
              const text = event.target.value;
              editCol((c) => {
                c[field] = text;
              });
            }}
          />
          <TokenSelect
            ctx={ctx}
            suffix=":label"
            onToken={(token) => {
              editCol((c) => {
                c[field] = (c[field] ?? "") + token;
              });
            }}
          />
        </>
      )}
    </div>
  );
}

/** searchAdminDisplayAutocomplete */
export function AutocompleteEditor(props: Editing) {
  const { ctx, draft, edit } = props;
  const id = useId();
  const fields = draft.settings.searchFields ?? [];
  const entity = getEntity(ctx.meta, ctx.search.api_entity);
  const options = (keep?: string) =>
    getAllFields(
      ctx.meta,
      ctx.search,
      "",
      ["Field", "Custom", "Extra"],
      (key) => key !== keep && fields.includes(key),
    );
  const setFields = (next: string[]) => {
    edit((d) => {
      d.settings.searchFields = next;
    });
  };
  return (
    <>
      <div className="form-inline">
        <label htmlFor={`${id}-label`}>
          {ts("Label")}{" "}
          <span className="crm-marker" aria-hidden="true">
            *
          </span>
        </label>{" "}
        <input
          id={`${id}-label`}
          type="text"
          className="form-control"
          required
          placeholder={ts("Untitled")}
          value={draft.label}
          onChange={(event) => {
            const label = event.target.value;
            edit((d) => {
              d.label = label;
            });
          }}
        />
      </div>
      {window.CRM.checkPerm("administer CiviCRM") && (
        <div>
          <label>
            <input
              type="checkbox"
              checked={!!draft.is_autocomplete_default}
              onChange={() => {
                edit((d) => {
                  d.is_autocomplete_default = !d.is_autocomplete_default;
                });
              }}
            />{" "}
            {ts("Make Default Autocomplete for %1", {
              1: entity?.title_plural ?? ctx.search.api_entity,
            })}
          </label>
        </div>
      )}

      <fieldset>
        <legend className="sr-only">{ts("Search by")}</legend>
        {fields.map((field, index) => (
          <div className="form-inline" key={field}>
            <Picker
              id={`${id}-search-${String(index)}`}
              label={index ? ts("Also by") : ts("Search by")}
              placeholder={ts("Search field")}
              single
              options={options(field)}
              value={[field]}
              onChange={(picked) => {
                const next = picked[0];
                if (next !== undefined)
                  setFields(fields.map((f, i) => (i === index ? String(next) : f)));
              }}
            />
            <button
              type="button"
              className="btn btn-xs"
              disabled={index === 0}
              aria-label={ts("Move %1 up", { 1: field })}
              onClick={() => {
                const next = [...fields];
                next.splice(index - 1, 0, ...next.splice(index, 1));
                setFields(next);
              }}
            >
              <i className="crm-i fa-arrow-up" role="img" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="btn btn-xs"
              disabled={index === fields.length - 1}
              aria-label={ts("Move %1 down", { 1: field })}
              onClick={() => {
                const next = [...fields];
                next.splice(index + 1, 0, ...next.splice(index, 1));
                setFields(next);
              }}
            >
              <i className="crm-i fa-arrow-down" role="img" aria-hidden="true" />
            </button>
            {fields.length > 1 && (
              <button
                type="button"
                className="btn btn-xs crm-hover-button"
                aria-label={ts("Remove %1", { 1: field })}
                title={ts("Remove")}
                onClick={() => {
                  setFields(fields.filter((_, i) => i !== index));
                }}
              >
                <i className="crm-i fa-times" role="img" aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
        <div className="form-inline">
          <Picker
            id={`${id}-search-add`}
            label={fields.length ? ts("Also by") : ts("Search by")}
            placeholder={ts("Search field")}
            single
            options={options()}
            value={[]}
            onChange={(picked) => {
              const next = picked[0];
              if (next !== undefined && !fields.includes(String(next)))
                setFields([...fields, String(next)]);
            }}
          />
        </div>
      </fieldset>

      <SortConfig {...props} />

      <fieldset className="crm-search-admin-edit-columns-wrapper">
        <legend className="sr-only">{ts("Columns")}</legend>
        <p className="help-block">
          {ts(
            "The top-most line will be shown as the autocomplte result title (combine multiple fields using rewrite + tokens).",
          )}{" "}
          {ts("Other lines will be shown below in smaller text.")}
        </p>
        <Columns
          {...props}
          links={[]}
          defaults={{}}
          withTypes={false}
          typeFields={false}
          title={(col, index) =>
            `${index ? ts("Description %1:", { 1: index }) : ts("Title:")} ${colLabel(ctx, col)}`
          }
          head={(col, _index, editCol) => (
            <>
              <ColumnText
                ctx={ctx}
                col={col}
                field="empty_value"
                label={ts("Empty placeholder")}
                title={ts("Text to display if the field contents are empty.")}
                toggle={toggleEmptyVal}
                editCol={editCol}
              />
              <ColumnText
                ctx={ctx}
                col={col}
                field="rewrite"
                label={ts("Rewrite Text")}
                title={ts("Change the contents of this field, or combine multiple field values.")}
                toggle={toggleRewrite}
                editCol={editCol}
              />
            </>
          )}
          tail={(col, index, editCol) =>
            index === 0 && (
              <IconsConfig
                ctx={ctx}
                icons={col.icons}
                onChange={(icons) => {
                  editCol((c) => {
                    c.icons = icons;
                  });
                }}
              />
            )
          }
        />
      </fieldset>
    </>
  );
}
