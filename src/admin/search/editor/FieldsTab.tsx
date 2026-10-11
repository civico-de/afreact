import { useId } from "react";
import { Picker } from "../../widgets/Picker";
import {
  getAllFields,
  getDefaultLabel,
  getEntity,
  parseExpr,
  reconcileAggregateColumns,
  type ApiParams,
  type SearchInfo,
} from "../expr";
import type { SearchAdminMetadata } from "../meta";
import { FunctionEditor } from "./FunctionEditor";

interface FieldsTabProps {
  meta: SearchAdminMetadata;
  search: SearchInfo;
  /** A smart group reserves the first column for its contact ID. */
  firstLocked: boolean;
  onChange: (params: ApiParams) => void;
}

/** fieldsForSelect: every field and pseudo field, without the columns the search has. */
export function selectableFields(meta: SearchAdminMetadata, search: SearchInfo) {
  return getAllFields(meta, search, ":label", ["Field", "Custom", "Extra", "Pseudo"], (key) =>
    search.api_params.select.includes(key),
  );
}

/** addParam('select'): a new column, aggregated when the search groups. */
export function addColumn(
  meta: SearchAdminMetadata,
  search: SearchInfo,
  column: string,
): ApiParams {
  if (!column || search.api_params.select.includes(column)) return search.api_params;
  const params = { ...search.api_params, select: [...search.api_params.select, column] };
  return { ...params, select: reconcileAggregateColumns(meta, { ...search, api_params: params }) };
}

/** crmSearchAdminFields: the columns in order, each with its function and format. */
export function FieldsTab({ meta, search, firstLocked, onChange }: FieldsTabProps) {
  const id = useId();
  const select = search.api_params.select;
  const grouping = getEntity(meta, search.api_entity)?.params?.includes("groupBy") ?? false;
  const pseudo = new Set(meta.pseudoFields.map((field) => field.name));
  const setSelect = (next: string[]) => {
    onChange({ ...search.api_params, select: next });
  };
  const move = (from: number, to: number) => {
    const next = [...select];
    const [moved] = next.splice(from, 1);
    if (moved === undefined) return;
    next.splice(to, 0, moved);
    setSelect(next);
  };
  return (
    <div className="crm-search-select-fields">
      <ol className="list-unstyled">
        {select.map((key, index) => {
          const label = getDefaultLabel(meta, key, search);
          const [rawKey = key] = key.split(":");
          const info = parseExpr(meta, key, search);
          const suffixes = !info.fn ? info.args[0]?.field?.suffixes : undefined;
          const suffixOptions = Object.entries(meta.optionAttributes).filter(([attr]) =>
            suffixes?.includes(attr),
          );
          const canMoveUp = index > (firstLocked ? 1 : 0);
          const canMoveDown = index < select.length - 1 && !(firstLocked && index === 0);
          return (
            <li key={`${key}-${String(index)}`}>
              <fieldset className="form-inline">
                <legend className="sr-only">{label}</legend>
                {!pseudo.has(key) && grouping ? (
                  <FunctionEditor
                    meta={meta}
                    search={search}
                    expr={key}
                    mode="select"
                    showLabel
                    onChange={(next) => {
                      setSelect(select.map((col, i) => (i === index ? next : col)));
                    }}
                  />
                ) : (
                  <label>{label}</label>
                )}
                {suffixOptions.length > 0 && (
                  <select
                    className="form-control crm-auto-width"
                    aria-label={ts("Format for %1", { 1: label })}
                    title={ts("Format for %1", { 1: label })}
                    value={key}
                    onChange={(event) => {
                      setSelect(select.map((col, i) => (i === index ? event.target.value : col)));
                    }}
                  >
                    <option value={rawKey}>{ts("Raw Value")}</option>
                    {suffixOptions.map(([attr, text]) => (
                      <option key={attr} value={`${rawKey}:${attr}`}>
                        {text}
                      </option>
                    ))}
                  </select>
                )}
                <span className="pull-right">
                  <button
                    type="button"
                    className="btn btn-xs"
                    aria-label={ts("Move %1 up", { 1: label })}
                    disabled={!canMoveUp}
                    onClick={() => {
                      move(index, index - 1);
                    }}
                  >
                    <i className="crm-i fa-arrow-up" role="img" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-xs"
                    aria-label={ts("Move %1 down", { 1: label })}
                    disabled={!canMoveDown}
                    onClick={() => {
                      move(index, index + 1);
                    }}
                  >
                    <i className="crm-i fa-arrow-down" role="img" aria-hidden="true" />
                  </button>
                  {select.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-xs"
                      aria-label={ts("Remove %1", { 1: label })}
                      onClick={() => {
                        setSelect(select.filter((_, i) => i !== index));
                      }}
                    >
                      <i className="crm-i fa-times" role="img" aria-hidden="true" />
                    </button>
                  )}
                </span>
              </fieldset>
            </li>
          );
        })}
      </ol>
      <Picker
        id={`${id}-add`}
        label={ts("Add Field")}
        hiddenLabel
        placeholder={ts("Add Field")}
        className="crm-auto-width"
        single
        options={selectableFields(meta, search)}
        value={[]}
        onChange={(picked) => {
          const next = picked[0];
          if (next !== undefined) onChange(addColumn(meta, search, String(next)));
        }}
      />
    </div>
  );
}
