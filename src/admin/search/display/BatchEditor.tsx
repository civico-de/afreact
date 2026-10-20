import { useId } from "react";
import { getField } from "../expr";
import { useFieldOptions } from "../meta";
import { SearchInput } from "../SearchInput";
import { ModelText } from "../../widgets/ModelText";
import { Check, PagerConfig, Section, type Editing } from "./common";
import { Columns } from "./Columns";
import {
  setBatchTallyFn,
  tableClasses,
  toggleBatchTally,
  toggleDefault,
  toggleItem,
  type AdminColumn,
  type Draft,
} from "./model";

type EditCol = (change: (col: AdminColumn, draft: Draft) => void) => void;

/** Required, input format, default value and footer of one data entry column. */
function BatchColumn({
  ctx,
  col,
  tally,
  editCol,
}: {
  ctx: Editing["ctx"];
  col: AdminColumn;
  tally: boolean;
  editCol: EditCol;
}) {
  const id = useId();
  const field = col.key ? getField(ctx.meta, col.key, ctx.search) : undefined;
  const options = useFieldOptions(
    field?.options ? (field.entity ?? ctx.search.api_entity) : undefined,
  );
  const isField = col.type === "field";
  return (
    <>
      <div className="form-inline crm-search-admin-flex-row">
        <label htmlFor={`${id}-header`}>{ts("Header")}</label>
        <ModelText
          id={`${id}-header`}
          className="form-control crm-flex-1"
          live
          value={typeof col.label === "string" ? col.label : ""}
          onChange={(value) => {
            editCol((c) => {
              c.label = value;
            });
          }}
        />
      </div>
      {isField && (
        <div className="form-inline">
          <label>
            <input
              type="checkbox"
              checked={!!col.required}
              onChange={() => {
                editCol((c) => {
                  c.required = !c.required;
                });
              }}
            />{" "}
            {ts("Required")}
          </label>
        </div>
      )}
      {field?.data_type === "Timestamp" && (
        <div className="form-inline">
          <label htmlFor={`${id}-format`}>{ts("Input Format")}</label>{" "}
          <select
            id={`${id}-format`}
            className="form-control"
            value={typeof col.format === "string" ? col.format : ""}
            onChange={(event) => {
              const value = event.target.value;
              editCol((c) => {
                c.format = value;
              });
            }}
          >
            <option value="">{ts("Date and Time")}</option>
            <option value="dateformatFull">{ts("Date Only")}</option>
          </select>
        </div>
      )}
      {isField && (
        <div className="form-inline">
          <label>
            <input
              type="checkbox"
              checked={"default" in col}
              onChange={() => {
                editCol((c) => {
                  toggleDefault(c);
                });
              }}
            />{" "}
            {ts("Default Value")}
          </label>
          {"default" in col && field && (
            <>
              <label htmlFor={`${id}-default`} className="sr-only">
                {ts("Default value of %1", { 1: col.label ?? col.key })}
              </label>{" "}
              <SearchInput
                id={`${id}-default`}
                field={{ ...field, entity: field.entity ?? ctx.search.api_entity }}
                options={options.data?.[field.name]}
                value={col.default}
                onChange={(value) => {
                  editCol((c) => {
                    c.default = value;
                  });
                }}
              />
            </>
          )}
        </div>
      )}
      {isField && tally && (
        <div className="form-inline">
          <label htmlFor={`${id}-tally-label`}>{ts("Footer")}</label>{" "}
          <ModelText
            id={`${id}-tally-label`}
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
          <label htmlFor={`${id}-tally-fn`}>{ts("Aggregate")}</label>{" "}
          <select
            id={`${id}-tally-fn`}
            className="form-control"
            title={ts("Totals aggregate function")}
            value={col.tally?.fn ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              editCol((c) => {
                setBatchTallyFn(c, value);
              });
            }}
          >
            <option value="">{ts("None")}</option>
            <option value="SUM">{ts("Sum")}</option>
            <option value="AVG">{ts("Average")}</option>
            <option value="COUNT">{ts("Count")}</option>
          </select>
          {col.tally?.fn === "SUM" && (
            <label>
              <input
                type="checkbox"
                checked={!!col.tally.target}
                onChange={() => {
                  editCol((c) => {
                    c.tally = { ...c.tally, target: !c.tally?.target };
                  });
                }}
              />{" "}
              {ts("Target Total")}
            </label>
          )}
        </div>
      )}
    </>
  );
}

/** searchAdminDisplayBatch */
export function BatchEditor(props: Editing) {
  const { ctx, draft, edit } = props;
  const id = useId();
  const s = draft.settings;
  return (
    <>
      <fieldset className="crm-search-admin-display-header">
        <div className="form-inline crm-search-admin-flex-row">
          <label htmlFor={`${id}-label`}>
            {ts("Label")}{" "}
            <span className="crm-marker" aria-hidden="true">
              *
            </span>
          </label>
          <ModelText
            id={`${id}-label`}
            className="form-control crm-flex-1"
            live
            required
            placeholder={ts("Untitled")}
            value={draft.label}
            onChange={(label) => {
              edit((d) => {
                d.label = label;
              });
            }}
          />
        </div>
        <div>
          <label htmlFor={`${id}-description`} className="sr-only">
            {ts("Description")}
          </label>
          <ModelText
            id={`${id}-description`}
            className="form-control"
            multiline
            live
            placeholder={ts("Description (shown above)")}
            value={s.description ?? ""}
            onChange={(value) => {
              edit((d) => {
                d.settings.description = value;
              });
            }}
          />
        </div>
      </fieldset>

      <Section title={ts("Style")}>
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
      </Section>

      <Section title={ts("Footer")}>
        <PagerConfig {...props} noLimit />
        <div className="form-inline">
          <Check
            label={ts("Show Totals in Footer")}
            title={ts("Shows grand totals or other statistics, configured per-column.")}
            checked={!!s.tally}
            onChange={() => {
              edit((d) => {
                toggleBatchTally(ctx, d.settings);
              });
            }}
          />
        </div>
      </Section>

      <fieldset className="crm-search-admin-edit-columns-wrapper">
        <legend>{ts("Columns")}</legend>
        <Columns
          {...props}
          links={[]}
          defaults={{ label: true }}
          withTypes={false}
          typeFields={false}
          marked={(col) => !!col.required}
          head={(col, _index, editCol) => (
            <BatchColumn ctx={ctx} col={col} tally={!!s.tally} editCol={editCol} />
          )}
        />
      </fieldset>
    </>
  );
}
