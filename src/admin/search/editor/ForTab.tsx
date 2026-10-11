import { useId, useState } from "react";
import { Picker } from "../../widgets/Picker";
import {
  getAllFields,
  getEntity,
  getJoin,
  hasFunction,
  reconcileAggregateColumns,
  type ApiParams,
  type SearchInfo,
} from "../expr";
import {
  addJoin,
  changeJoinType,
  isJoinType,
  joinEntities,
  joinTypes,
  removeJoin,
  setJoinLabel,
  type JoinType,
} from "../joins";
import { entitySelect, type SearchAdminMetadata } from "../meta";
import { ClauseEditor } from "./ClauseEditor";
import { FunctionEditor } from "./FunctionEditor";

interface ForTabProps {
  meta: SearchAdminMetadata;
  search: SearchInfo;
  /** A saved search keeps its entity. */
  entityLocked: boolean;
  onEntity: (entity: string) => void;
  onChange: (search: SearchInfo) => void;
}

/** crmSearch-for: the entity with its own API parameters, the joins and the grouping. */
export function ForTab({ meta, search, entityLocked, onEntity, onChange }: ForTabProps) {
  const id = useId();
  const entity = getEntity(meta, search.api_entity);
  const setParams = (api_params: ApiParams) => {
    onChange({ ...search, api_params });
  };
  return (
    <>
      <div className="form-inline">
        <label htmlFor={`${id}-entity`}>{ts("Search for")}</label>{" "}
        {entityLocked ? (
          <input
            id={`${id}-entity`}
            className="form-control twenty"
            disabled
            value={entity?.title_plural ?? search.api_entity}
          />
        ) : (
          <Picker
            id={`${id}-entity`}
            label={ts("Search for")}
            hiddenLabel
            placeholder={ts("Entity")}
            className="twenty"
            single
            options={entitySelect(meta)}
            value={[search.api_entity]}
            onChange={(picked) => {
              const next = picked[0];
              if (next !== undefined && next !== search.api_entity) onEntity(String(next));
            }}
          />
        )}
      </div>
      {(entity?.ui_params ?? []).map((param) => {
        const value = search.api_params[param.name];
        const text = typeof value === "string" || typeof value === "number" ? String(value) : "";
        const setValue = (next: string) => {
          setParams({ ...search.api_params, [param.name]: next });
        };
        return (
          <div className="form-inline" key={param.name}>
            <label htmlFor={`${id}-ui-${param.name}`} title={param.description}>
              {param.title}
              {param.required && <span className="crm-marker"> *</span>}
            </label>{" "}
            {param.options ? (
              <select
                id={`${id}-ui-${param.name}`}
                className="form-control twenty"
                required={param.required}
                value={text}
                onChange={(event) => {
                  setValue(event.target.value);
                }}
              >
                <option value="" />
                {param.options.map((option) => (
                  <option key={option.id} value={String(option.id)}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={`${id}-ui-${param.name}`}
                className="form-control twenty"
                type="text"
                required={param.required}
                value={text}
                onChange={(event) => {
                  setValue(event.target.value);
                }}
              />
            )}
          </div>
        );
      })}
      {entity?.params?.includes("join") && (
        <Joins meta={meta} search={search} onChange={onChange} />
      )}
      {entity?.params?.includes("groupBy") && (
        <GroupBy meta={meta} search={search} onChange={setParams} />
      )}
    </>
  );
}

interface JoinsProps {
  meta: SearchAdminMetadata;
  search: SearchInfo;
  onChange: (search: SearchInfo) => void;
  /** Join labels are stored only for a saved search, not for an entity set's inner searches. */
  editableLabels?: boolean;
}

/** crmSearchAdminJoin: each join with its type, label and conditions, and a picker for more. */
export function Joins({ meta, search, onChange, editableLabels = true }: JoinsProps) {
  const id = useId();
  const [joinType, setJoinType] = useState<JoinType>("LEFT");
  const types = joinTypes();
  const joins = search.api_params.join ?? [];
  return (
    <div className="crm-search-joins">
      {joins.map((clause, index) => {
        const name = typeof clause[0] === "string" ? clause[0] : "";
        const join = getJoin(meta, search, name);
        if (!join) return null;
        const legend = ts("Join %1", { 1: index + 1 });
        return (
          <fieldset className="crm-search-join" key={`${name}-${String(index)}`}>
            <legend className="sr-only">{legend}</legend>
            <div className="form-inline">
              <select
                className="form-control crm-auto-width"
                aria-label={ts("Join Type of %1", { 1: join.label })}
                value={typeof clause[1] === "string" ? clause[1] : "LEFT"}
                onChange={(event) => {
                  const next = event.target.value;
                  if (isJoinType(next)) onChange(changeJoinType(meta, search, index, next));
                }}
              >
                {types.map((type) => (
                  <option key={type.key} value={type.key}>
                    {type.label}
                  </option>
                ))}
              </select>{" "}
              {editableLabels ? (
                <span className="input-group">
                  <span className="input-group-addon" title={join.defaultLabel}>
                    <i className={`crm-i ${join.icon ?? ""}`} role="img" aria-hidden="true" />
                  </span>
                  <input
                    className="form-control crm-search-join-label twenty"
                    aria-label={ts("Optional label for this join")}
                    placeholder={join.defaultLabel}
                    defaultValue={search.form_values?.join?.[join.alias] ?? join.defaultLabel}
                    onBlur={(event) => {
                      onChange({
                        ...search,
                        form_values: setJoinLabel(meta, search, name, event.target.value),
                      });
                    }}
                  />
                </span>
              ) : (
                <span className="crm-search-join-static-label">
                  <i className={`crm-i ${join.icon ?? ""}`} role="img" aria-hidden="true" />{" "}
                  {join.defaultLabel}
                </span>
              )}{" "}
              <button
                type="button"
                className="btn btn-xs btn-danger-outline"
                aria-label={ts("Remove join %1", { 1: join.label })}
                onClick={() => {
                  onChange(removeJoin(meta, search, index));
                }}
              >
                <i className="crm-i fa-trash" role="img" aria-hidden="true" />
              </button>
            </div>
            <ClauseEditor
              meta={meta}
              search={search}
              clauses={clause}
              skip={2 + join.conditions.length}
              format="json"
              op="AND"
              label={ts("If")}
              placeholder={ts("Add Condition")}
              fields={getAllFields(
                meta,
                search,
                ":name",
                ["Field", "Custom", "Extra"],
                undefined,
                name,
              )}
              onChange={(next) => {
                onChange({
                  ...search,
                  api_params: {
                    ...search.api_params,
                    join: joins.map((c, i) => (i === index ? next : c)),
                  },
                });
              }}
            />
          </fieldset>
        );
      })}
      <fieldset className="crm-search-join-add">
        <legend className="sr-only">{ts("Add Join")}</legend>
        <div className="form-inline">
          <select
            className="form-control crm-auto-width"
            aria-label={ts("Join Type")}
            value={joinType}
            onChange={(event) => {
              const next = event.target.value;
              if (isJoinType(next)) setJoinType(next);
            }}
          >
            {types.map((type) => (
              <option key={type.key} value={type.key}>
                {type.label}
              </option>
            ))}
          </select>{" "}
          <Picker
            id={`${id}-add`}
            label={ts("Join Entity")}
            hiddenLabel
            placeholder={ts("Entity")}
            className="crm-auto-width"
            single
            options={joinEntities(meta, search)}
            value={[]}
            onChange={(picked) => {
              const value = picked[0];
              if (value !== undefined)
                onChange({ ...search, api_params: addJoin(meta, search, String(value), joinType) });
            }}
          />
        </div>
      </fieldset>
    </div>
  );
}

interface GroupByProps {
  meta: SearchAdminMetadata;
  search: SearchInfo;
  onChange: (params: ApiParams) => void;
}

/** crmSearchAdminGroupBy: grouping fields or functions; columns follow with aggregates. */
export function GroupBy({ meta, search, onChange }: GroupByProps) {
  const id = useId();
  const groupBy = search.api_params.groupBy ?? [];
  const withGroupBy = (next: string[]) => {
    const params = { ...search.api_params, groupBy: next };
    onChange({
      ...params,
      select: reconcileAggregateColumns(meta, { ...search, api_params: params }),
    });
  };
  const fields = getAllFields(meta, search, "", ["Field", "Custom", "Extra"], (key) =>
    groupBy.includes(key),
  );
  return (
    <fieldset className="crm-search-groupbys">
      <legend className="sr-only">{ts("Group By")}</legend>
      {groupBy.map((expr, index) => (
        <div className="form-inline crm-search-groupby" key={`${expr}-${String(index)}`}>
          <label htmlFor={`${id}-${String(index)}`}>{ts("Group By")}</label>{" "}
          <FunctionEditor
            meta={meta}
            search={search}
            expr={expr}
            mode="groupBy"
            onChange={(next) => {
              withGroupBy(groupBy.map((g, i) => (i === index ? next : g)));
            }}
          />
          {!hasFunction(expr) && (
            <Picker
              id={`${id}-${String(index)}`}
              label={ts("Group by field")}
              hiddenLabel
              placeholder=" "
              className="crm-auto-width"
              single
              options={[
                ...getAllFields(meta, search, "", ["Field", "Custom", "Extra"]).filter(
                  (f) => f.id === expr,
                ),
                ...fields,
              ]}
              value={[expr]}
              onChange={(picked) => {
                const next = picked[0];
                withGroupBy(
                  next === undefined
                    ? groupBy.filter((_, i) => i !== index)
                    : groupBy.map((g, i) => (i === index ? String(next) : g)),
                );
              }}
            />
          )}
          <hr />
        </div>
      ))}
      <div className="form-inline crm-search-groupby-add">
        <Picker
          id={`${id}-add`}
          label={ts("Add Group By")}
          hiddenLabel
          placeholder={ts("Group By")}
          className="crm-auto-width"
          single
          options={fields}
          value={[]}
          onChange={(picked) => {
            const next = picked[0];
            if (next !== undefined && !groupBy.includes(String(next)))
              withGroupBy([...groupBy, String(next)]);
          }}
        />
      </div>
    </fieldset>
  );
}
