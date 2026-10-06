import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { api4, errorMessage } from "../api/civi";
import { Input } from "./EditableCell";
import { editorFor } from "./inlineEdit";
import { Icon } from "./LinkContent";
import {
  fieldEditableInfo,
  initialUpdateValue,
  presetValues,
  updateFieldsCall,
  type EntityInfo,
  type Key,
  type SearchTask,
  type UpdateField,
} from "./searchTasks";
import type { Row } from "./types";

interface UpdateDialogProps {
  task: SearchTask;
  entity: EntityInfo;
  ids: Key[];
  /** The chosen values; the caller runs the batch. */
  onSave: (values: Record<string, unknown>) => void;
  onCancel: () => void;
}

const NO_ROW: Row = { key: "", columns: [] };

/** A clause keeps its key while its field changes, so its select keeps the focus. */
interface Clause {
  key: number;
  name: string;
  value: unknown;
}

/**
 * crmSearchTaskUpdate.html: the fields to set on the selected records and their values. Fields
 * whose input the renderer lacks stay in the list, disabled, with the reason as their title.
 */
export function UpdateDialog({ task, entity, ids, onSave, onCancel }: UpdateDialogProps) {
  const titleId = useId();
  const addId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [clauses, setClauses] = useState<Clause[]>(() =>
    presetValues(task).map(([name, value], key) => ({ key, name, value })),
  );
  const [chosen, setChosen] = useState("");
  const nextKey = useRef(clauses.length);
  const list = useRef<HTMLDivElement>(null);
  const [added, setAdded] = useState<number | null>(null);
  const [callEntity, action, params] = updateFieldsCall(entity.name);
  const fields = useQuery({
    queryKey: ["updateFields", entity.name],
    queryFn: () => api4<UpdateField>(callEntity, action, params),
  });
  const entityTitle = ids.length === 1 ? entity.title : entity.title_plural;
  const inUse = (name: string) => clauses.some((clause) => clause.name === name);
  const fieldByName = (name: string) => fields.data?.find((field) => field.name === name);
  const editor = (field: UpdateField) => editorFor(fieldEditableInfo(entity.name, field));
  const fieldTitle = (field: UpdateField) => {
    const chosen = editor(field);
    return "unsupported" in chosen
      ? ts("Not supported by the React renderer: %1", { 1: chosen.unsupported })
      : (field.description ?? undefined);
  };

  const addField = () => {
    const field = fieldByName(chosen);
    if (!field || inUse(chosen)) return;
    const clause = { key: nextKey.current++, name: chosen, value: initialUpdateValue(field) };
    setClauses([...clauses, clause]);
    setChosen("");
    setAdded(clause.key);
  };
  const setField = (key: number, name: string) => {
    const field = fieldByName(name);
    setClauses(
      name === "" || !field
        ? clauses.filter((clause) => clause.key !== key)
        : clauses.map((clause) =>
            clause.key === key ? { ...clause, name, value: initialUpdateValue(field) } : clause,
          ),
    );
  };
  const setValue = (key: number, value: unknown) => {
    setClauses(clauses.map((clause) => (clause.key === key ? { ...clause, value } : clause)));
  };

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  });

  // The Add button goes disabled once used, so the focus moves on to the new clause's input.
  useEffect(() => {
    if (added === null) return;
    const clause = list.current?.querySelector<HTMLElement>(`[data-key="${String(added)}"]`);
    const input = clause?.querySelector<HTMLElement>(`[id="${addId}-${String(added)}-input"]`);
    (input ?? clause?.querySelector("select"))?.focus();
    setAdded(null);
  }, [added]);

  const options = (current?: string) =>
    (fields.data ?? []).map((field) => (
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
    <dialog
      ref={dialog}
      className="crm-search-task-dialog afreact-dialog"
      aria-labelledby={titleId}
      onClose={onCancel}
    >
      <h2 id={titleId} className="afreact-dialog-title">
        {task.title}
      </h2>
      <form
        className="afreact-dialog-body"
        onSubmit={(event) => {
          event.preventDefault();
          if (clauses.length) onSave(Object.fromEntries(clauses.map((c) => [c.name, c.value])));
        }}
      >
        <p>
          <strong>
            {ts("Update the %1 selected %2 with the following values:", {
              1: ids.length,
              2: entityTitle,
            })}
          </strong>
        </p>
        {fields.error && (
          <p className="alert alert-danger" role="alert">
            {errorMessage(fields.error)}
          </p>
        )}
        <div ref={list}>
          {clauses.map(({ key, name, value }) => {
            const field = fieldByName(name);
            const labelId = `${addId}-${String(key)}`;
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
            id={addId}
            className={`form-control${fields.data ? "" : " loading"}`}
            aria-label={ts("Add Value")}
            disabled={!fields.data}
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
        <hr />
        <div className="afreact-dialog-buttons">
          <button type="button" className="btn btn-default" onClick={() => dialog.current?.close()}>
            <Icon name="fa-times" /> {ts("Cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!clauses.length}>
            <Icon name="fa-check" /> {ts("Update %1", { 1: entityTitle })}
          </button>
        </div>
      </form>
    </dialog>
  );
}
