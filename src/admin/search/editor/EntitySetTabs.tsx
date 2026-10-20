import { useId } from "react";
import { Picker } from "../../widgets/Picker";
import {
  addEntitySet,
  addEntitySetRow,
  removeEntitySet,
  realign,
  removeEntitySetRow,
  setEntitySet,
  setsOf,
  type SetParams,
} from "../entitySets";
import { getAllFields, getEntity, hasFunction, type ApiParams, type SearchInfo } from "../expr";
import { entitySelect, type SearchAdminMetadata } from "../meta";
import { ClauseEditor } from "./ClauseEditor";
import { GroupBy, Joins } from "./ForTab";
import { FunctionEditor } from "./FunctionEditor";

interface EntitySetsTabProps {
  meta: SearchAdminMetadata;
  params: ApiParams;
  onChange: (params: ApiParams) => void;
}

const setInfo = (entity: string, inner: SetParams): SearchInfo => ({
  api_entity: entity,
  api_params: { ...inner, select: inner.select.filter((col) => col !== null) },
});

/** crmSearchAdminEntitySetSelect: the sets side by side, one row per combined column. */
export function EntitySetsTab({ meta, params, onChange }: EntitySetsTabProps) {
  const id = useId();
  const sets = setsOf(params);
  const operations = Object.entries(
    typeof meta.setOperations === "object" && meta.setOperations !== null ? meta.setOperations : {},
  ).filter((entry): entry is [string, string] => typeof entry[1] === "string");
  const groupable = (entity: string) =>
    getEntity(meta, entity)?.params?.includes("groupBy") ?? false;
  const addable = entitySelect(meta).filter((option) => groupable(option.id));
  const setCell = (setIndex: number, row: number, value: string | null) => {
    const set = sets[setIndex];
    if (!set) return;
    const select = set[3].select.map((col, i) => (i === row ? value : col));
    onChange(setEntitySet(meta, params, setIndex, { ...set[3], select }));
  };
  const fieldsFor = (setIndex: number) => {
    const set = sets[setIndex];
    if (!set) return [];
    const info = setInfo(set[1], set[3]);
    return getAllFields(meta, info, ":label", ["Field", "Custom", "Extra"], (key) =>
      set[3].select.includes(key),
    );
  };
  return (
    <>
      <p className="help">
        <i className="crm-i fa-layer-group" role="img" aria-hidden="true" />{" "}
        {ts("Combine the following searches into one set of results:")}
      </p>
      <table className="crm-search-select-fields crm-search-entity-set-select table table-bordered">
        <thead>
          <tr>
            {sets.map((set, setIndex) => {
              const title = getEntity(meta, set[1])?.title_plural ?? set[1];
              return (
                <th scope="col" key={setIndex}>
                  <span className="form-inline">
                    {setIndex > 0 && (
                      <select
                        className="form-control crm-auto-width"
                        aria-label={ts("Set Operation for %1", { 1: title })}
                        value={set[0]}
                        onChange={(event) => {
                          onChange({
                            ...params,
                            sets: sets.map((s, i) =>
                              i === setIndex ? [event.target.value, s[1], s[2], s[3]] : s,
                            ),
                          });
                        }}
                      >
                        {operations.map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    )}{" "}
                    {title}
                    {sets.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-xs btn-danger-outline pull-right"
                        aria-label={ts("Remove Search %1", { 1: title })}
                        onClick={() => {
                          onChange(removeEntitySet(meta, params, setIndex));
                        }}
                      >
                        <i className="crm-i fa-trash" role="img" aria-hidden="true" />
                      </button>
                    )}
                  </span>
                </th>
              );
            })}
            <th scope="col">
              <Picker
                id={`${id}-add-set`}
                label={ts("Add Search")}
                hiddenLabel
                placeholder=" "
                className="crm-auto-width"
                single
                options={addable}
                value={[]}
                onChange={(picked) => {
                  const entity = picked[0];
                  if (entity !== undefined) onChange(addEntitySet(meta, params, String(entity)));
                }}
              />
            </th>
          </tr>
        </thead>
        <tbody>
          {(sets[0]?.[3].select ?? []).map((_, row) => (
            <tr key={row}>
              {sets.map((set, setIndex) => {
                const expr = set[3].select[row] ?? null;
                const info = setInfo(set[1], set[3]);
                const cellLabel = ts("Column %1 of %2", {
                  1: row + 1,
                  2: getEntity(meta, set[1])?.title_plural ?? set[1],
                });
                return (
                  <td key={setIndex}>
                    <div className="form-inline">
                      {expr && groupable(set[1]) && (
                        <FunctionEditor
                          meta={meta}
                          search={info}
                          expr={expr}
                          mode="select"
                          onChange={(next) => {
                            setCell(setIndex, row, next);
                          }}
                        />
                      )}
                      {!(expr && hasFunction(expr)) && (
                        <Picker
                          id={`${id}-${String(setIndex)}-${String(row)}`}
                          label={cellLabel}
                          hiddenLabel
                          placeholder=" "
                          single
                          options={fieldsFor(setIndex).concat(
                            getAllFields(meta, info, ":label", ["Field", "Custom", "Extra"]).filter(
                              (f) => f.id === expr,
                            ),
                          )}
                          value={expr ? [expr] : []}
                          onChange={(picked) => {
                            const next = picked[0];
                            // The first set names the columns, so its cells cannot be emptied.
                            if (next !== undefined || setIndex > 0)
                              setCell(setIndex, row, next === undefined ? null : String(next));
                          }}
                        />
                      )}
                    </div>
                  </td>
                );
              })}
              <td>
                <button
                  type="button"
                  className="btn btn-xs btn-danger-outline"
                  aria-label={ts("Remove row %1", { 1: row + 1 })}
                  onClick={() => {
                    onChange(removeEntitySetRow(meta, params, row));
                  }}
                >
                  <i className="crm-i fa-times" role="img" aria-hidden="true" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={sets.length + 1}>
              <Picker
                id={`${id}-add-row`}
                label={ts("Add Field")}
                hiddenLabel
                placeholder={ts("Add Field")}
                single
                options={fieldsFor(0)}
                value={[]}
                onChange={(picked) => {
                  const field = picked[0];
                  if (field !== undefined) onChange(addEntitySetRow(meta, params, String(field)));
                }}
              />
            </td>
          </tr>
        </tfoot>
      </table>
    </>
  );
}

interface EntitySetQueryTabProps {
  meta: SearchAdminMetadata;
  params: ApiParams;
  index: number;
  onChange: (params: ApiParams) => void;
}

/** crmSearchAdminEntitySetQuery: one set's joins, grouping and conditions. */
export function EntitySetQueryTab({ meta, params, index, onChange }: EntitySetQueryTabProps) {
  const set = setsOf(params)[index];
  if (!set) return null;
  const [, entity] = set;
  const entityParams = getEntity(meta, entity)?.params ?? [];
  // The inner editors work on a search whose select holds only real columns; nulls keep their rows.
  const info = setInfo(entity, set[3]);
  const setInner = (next: ApiParams) => {
    onChange(
      setEntitySet(meta, params, index, { ...next, select: realign(set[3].select, next.select) }),
    );
  };
  return (
    <>
      <fieldset>
        <legend>{ts("Join")}</legend>
        {entityParams.includes("join") && (
          <Joins
            meta={meta}
            search={info}
            editableLabels={false}
            onChange={(next) => {
              setInner(next.api_params);
            }}
          />
        )}
      </fieldset>
      <fieldset>
        <legend>{ts("Group By")}</legend>
        {entityParams.includes("groupBy") && (
          <GroupBy meta={meta} search={info} onChange={setInner} />
        )}
      </fieldset>
      <div className="crm-search-wheres">
        <ClauseEditor
          meta={meta}
          search={info}
          clauses={info.api_params.where ?? []}
          op="AND"
          label={ts("Where")}
          allowFunctions={entityParams.includes("groupBy")}
          fields={getAllFields(meta, info, ":name")}
          onChange={(where) => {
            setInner({
              ...info.api_params,
              where: where.filter((c): c is unknown[] => Array.isArray(c)),
            });
          }}
        />
      </div>
    </>
  );
}
