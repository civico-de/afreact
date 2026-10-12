import { useEffect, useRef, useState } from "react";
import { errorMessage } from "../api/civi";
import { Input } from "./EditableCell";
import { editorFor } from "./inlineEdit";
import { Icon } from "./LinkContent";
import {
  fieldEditableInfo,
  initialUpdateValue,
  type EntityInfo,
  type UpdateField,
} from "./searchTasks";
import type { Row } from "./types";

const NO_ROW: Row = { key: "", columns: [] };

/** A clause keeps its key while its field changes, so its select keeps the focus. */
export interface Clause {
  key: number;
  name: string;
  value: unknown;
}

export const clauseValues = (clauses: Clause[]): Record<string, unknown> =>
  Object.fromEntries(clauses.map((clause) => [clause.name, clause.value]));

/** Clauses for `names`, after `clauses`, each field once, with the trait's starting value. */
export function addClauses(clauses: Clause[], fields: UpdateField[], names: string[]): Clause[] {
  let key = Math.max(-1, ...clauses.map((clause) => clause.key)) + 1;
  const added = [...clauses];
  for (const name of names) {
    const field = fields.find((f) => f.name === name);
    if (!field || added.some((clause) => clause.name === name)) continue;
    added.push({ key: key++, name, value: initialUpdateValue(field) });
  }
  return added;
}

interface FieldClausesProps {
  /** The entity whose fields the clauses set; its name types the inputs. */
  entity: EntityInfo;
  /** The fields to choose from, once loaded. */
  fields: UpdateField[] | undefined;
  error: unknown;
  clauses: Clause[];
  onChange: (clauses: Clause[]) => void;
  /** Prefix of the element ids. */
  id: string;
}

/**
 * searchTaskFieldsTrait's rows of field and value, as crmSearchTaskUpdate.html shows them, with
 * the "Add Value" select below. Fields whose input the renderer lacks stay in the list, disabled,
 * with the reason as their title.
 */
// deviation:bulk-update-native-picker
export function FieldClauses({ entity, fields, error, clauses, onChange, id }: FieldClausesProps) {
  const [chosen, setChosen] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const [added, setAdded] = useState<number | null>(null);
  const inUse = (name: string) => clauses.some((clause) => clause.name === name);
  const fieldByName = (name: string) => fields?.find((field) => field.name === name);
  const editor = (field: UpdateField) => editorFor(fieldEditableInfo(entity.name, field));
  const fieldTitle = (field: UpdateField) => {
    const editorOf = editor(field);
    return "unsupported" in editorOf
      ? ts("Not supported by the React renderer: %1", { 1: editorOf.unsupported })
      : (field.description ?? undefined);
  };

  const addField = () => {
    if (!fields || !fieldByName(chosen) || inUse(chosen)) return;
    const next = addClauses(clauses, fields, [chosen]);
    onChange(next);
    setChosen("");
    setAdded(next.at(-1)?.key ?? null);
  };
  // deviation:update-clause-field-resets
  const setField = (key: number, name: string) => {
    const field = fieldByName(name);
    onChange(
      name === "" || !field
        ? clauses.filter((clause) => clause.key !== key)
        : clauses.map((clause) =>
            clause.key === key ? { ...clause, name, value: initialUpdateValue(field) } : clause,
          ),
    );
  };
  const setValue = (key: number, value: unknown) => {
    onChange(clauses.map((clause) => (clause.key === key ? { ...clause, value } : clause)));
  };

  // The Add button goes disabled once used, so the focus moves on to the new clause's input.
  useEffect(() => {
    if (added === null) return;
    const clause = list.current?.querySelector<HTMLElement>(`[data-key="${String(added)}"]`);
    const input = clause?.querySelector<HTMLElement>(`[id="${id}-${String(added)}-input"]`);
    (input ?? clause?.querySelector("select"))?.focus();
    setAdded(null);
  }, [added, id]);

  const options = (current?: string) =>
    (fields ?? []).map((field) => (
      <option
        key={field.name}
        value={field.name}
        disabled={(inUse(field.name) && field.name !== current) || "unsupported" in editor(field)}
        title={fieldTitle(field)}
      >
        {field.label}
      </option>
    ));

  return (
    <>
      {!!error && (
        <p className="alert alert-danger" role="alert">
          {errorMessage(error)}
        </p>
      )}
      <div ref={list}>
        {clauses.map(({ key, name, value }) => {
          const field = fieldByName(name);
          const labelId = `${id}-${String(key)}`;
          const select = (
            <select
              className="form-control crm-auto-width"
              aria-label={ts("Field")}
              value={name}
              onChange={(event) => {
                setField(key, event.target.value);
              }}
            >
              <option value="">{ts("Field")}</option>
              {!field && <option value={name}>{name}</option>}
              {options(name)}
            </select>
          );
          // deviation:update-preset-unknown-field
          // A preset on a field getFields leaves out keeps its value; the clause can be removed.
          if (!field)
            return (
              <div key={key} data-key={key} className="form-inline afreact-update-clause">
                {select}
              </div>
            );
          const info = fieldEditableInfo(entity.name, field);
          const input = editor(field);
          return (
            <div key={key} data-key={key} className="form-inline afreact-update-clause">
              {select}{" "}
              <label id={labelId} htmlFor={`${labelId}-input`} className="sr-only">
                {field.label}
              </label>
              {"kind" in input && (
                <Input
                  kind={input.kind}
                  multiple={input.multiple}
                  info={info}
                  row={NO_ROW}
                  value={value}
                  nullable={info.nullable}
                  labelId={labelId}
                  common={{
                    id: `${labelId}-input`,
                    required: !info.nullable || !!field.required,
                    "aria-invalid": undefined,
                    "aria-describedby": undefined,
                  }}
                  onChange={(next) => {
                    setValue(key, next);
                  }}
                />
              )}
              {"unsupported" in input && (
                <span className="afreact-unsupported" role="note">
                  {ts("Not supported by the React renderer: %1", { 1: input.unsupported })}
                </span>
              )}
              {info.serialize && (
                <div className="description">
                  {ts(
                    "Note: updating a multi-valued field replaces all existing values for this field",
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="form-inline">
        <select
          id={id}
          className={`form-control${fields ? "" : " loading"}`}
          aria-label={ts("Add Value")}
          disabled={!fields}
          value={chosen}
          onChange={(event) => {
            setChosen(event.target.value);
          }}
        >
          <option value="">{ts("Add Value")}</option>
          {options()}
        </select>{" "}
        <button
          type="button"
          className="btn btn-default"
          disabled={!chosen || inUse(chosen)}
          onClick={addField}
        >
          <Icon name="fa-plus" /> {ts("Add")}
        </button>
      </div>
    </>
  );
}
