import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { api4, errorMessage } from "../api/civi";
import { Input } from "./EditableCell";
import { editorFor } from "./inlineEdit";
import { Icon } from "./LinkContent";
import {
  initialUpdateValue,
  updateFieldsCall,
  type EntityInfo,
  type Key,
  type SearchTask,
  type UpdateField,
} from "./searchTasks";
import type { EditableInfo, Row } from "./types";

interface UpdateDialogProps {
  task: SearchTask;
  entity: EntityInfo;
  ids: Key[];
  /** The chosen values; the caller runs the batch. */
  onSave: (values: Record<string, unknown>) => void;
  onCancel: () => void;
}

/** What Input needs to know about a field, as the server describes an editable column. */
function editableInfo(entity: string, field: UpdateField): EditableInfo {
  return {
    entity,
    input_type: field.input_type,
    input_attrs: null,
    data_type: field.data_type,
    options: field.options || false,
    serialize: !!field.serialize,
    nullable: !!field.nullable,
    fk_entity: field.fk_entity ?? null,
    value_key: field.name,
    value_path: field.name,
    id_key: "id",
    id_path: "id",
    explicit_join: null,
    control_field: null,
    grouping_fields: [],
  };
}

const NO_ROW: Row = { key: "", columns: [] };

/**
 * crmSearchTaskUpdate.html: the fields to set on the selected records and their values. Fields
 * whose input the renderer lacks stay in the list, disabled, with the reason as their title.
 */
export function UpdateDialog({ task, entity, ids, onSave, onCancel }: UpdateDialogProps) {
  const titleId = useId();
  const addId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState<[string, unknown][]>([]);
  const [callEntity, action, params] = updateFieldsCall(entity.name);
  const fields = useQuery({
    queryKey: ["updateFields", entity.name],
    queryFn: () => api4<UpdateField>(callEntity, action, params),
  });
  const entityTitle = ids.length === 1 ? entity.title : entity.title_plural;
  const inUse = (name: string) => values.some(([used]) => used === name);
  const fieldByName = (name: string) => fields.data?.find((field) => field.name === name);
  const editor = (field: UpdateField) => editorFor(editableInfo(entity.name, field));
  const fieldTitle = (field: UpdateField) => {
    const chosen = editor(field);
    return "unsupported" in chosen
      ? ts("Not supported by the React renderer: %1", { 1: chosen.unsupported })
      : (field.description ?? undefined);
  };

  const addField = (name: string) => {
    const field = fieldByName(name);
    if (!field || inUse(name)) return;
    setValues([...values, [name, initialUpdateValue(field)]]);
  };
  const setField = (index: number, name: string) => {
    const field = fieldByName(name);
    setValues(
      name === "" || !field
        ? values.filter((_, at) => at !== index)
        : values.map((clause, at) => (at === index ? [name, initialUpdateValue(field)] : clause)),
    );
  };
  const setValue = (index: number, value: unknown) => {
    setValues(values.map(([name, old], at) => [name, at === index ? value : old]));
  };

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  });

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
          if (values.length) onSave(Object.fromEntries(values));
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
        {values.map(([name, value], index) => {
          const field = fieldByName(name);
          if (!field) return null;
          const info = editableInfo(entity.name, field);
          const chosen = editor(field);
          const labelId = `${addId}-${String(index)}`;
          return (
            <div key={name} className="form-inline afreact-update-clause">
              <select
                className="form-control crm-auto-width"
                aria-label={ts("Field")}
                value={name}
                onChange={(event) => {
                  setField(index, event.target.value);
                }}
              >
                <option value="">{ts("Field")}</option>
                {options(name)}
              </select>{" "}
              <label id={labelId} htmlFor={`${labelId}-input`} className="sr-only">
                {field.label}
              </label>
              {"kind" in chosen && (
                <Input
                  kind={chosen.kind}
                  multiple={chosen.multiple}
                  info={info}
                  row={NO_ROW}
                  value={value}
                  nullable={info.nullable}
                  labelId={labelId}
                  common={{
                    id: `${labelId}-input`,
                    required: !info.nullable,
                    "aria-invalid": undefined,
                    "aria-describedby": undefined,
                  }}
                  onChange={(next) => {
                    setValue(index, next);
                  }}
                />
              )}
              {info.serialize && (
                <div className="description">
                  {ts("Note: updating a multi-valued field replaces all existing values for this field")}
                </div>
              )}
            </div>
          );
        })}
        <div className="form-inline">
          <select
            id={addId}
            className={`form-control${fields.data ? "" : " loading"}`}
            aria-label={ts("Add Value")}
            disabled={!fields.data}
            value=""
            onChange={(event) => {
              addField(event.target.value);
            }}
          >
            <option value="">{ts("Add Value")}</option>
            {options()}
          </select>
        </div>
        <hr />
        <div className="afreact-dialog-buttons">
          <button type="button" className="btn btn-default" onClick={() => dialog.current?.close()}>
            <Icon name="fa-times" /> {ts("Cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!values.length}>
            <Icon name="fa-check" /> {ts("Update %1", { 1: entityTitle })}
          </button>
        </div>
      </form>
    </dialog>
  );
}
