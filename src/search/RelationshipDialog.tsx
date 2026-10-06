import { skipToken, useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { api4, errorMessage } from "../api/civi";
import { Input } from "./EditableCell";
import { EntityRefInput } from "./EntityRefInput";
import { editorFor } from "./inlineEdit";
import { Icon } from "./LinkContent";
import {
  fieldEditableInfo,
  initialBatchValue,
  presetValues,
  relationshipFieldsCall,
  type RelationshipType,
  type SearchTask,
  type UpdateField,
} from "./searchTasks";
import type { Row } from "./types";

interface RelationshipDialogProps {
  task: SearchTask;
  /** The chosen type key, contact and field values; the caller runs the batch. */
  onSave: (type: string, contactId: number, values: Record<string, unknown>) => void;
  onCancel: () => void;
}

const NO_ROW: Row = { key: "", columns: [] };

/** The contact side b of the relationship, as crm-autocomplete on the type's contact type. */
const contactInfo = (type: RelationshipType) => ({
  ...fieldEditableInfo("Relationship", {
    name: "contact_id",
    label: ts("Contact"),
    input_type: "EntityRef",
    data_type: "Integer",
    fk_entity: type.contact_type,
  }),
  nullable: false,
});

/**
 * crmSearchTaskRelationship.html: the relationship type, the contact on its other side and the
 * type's own fields (description, dates, custom fields). Fields the renderer cannot show stay
 * listed with the reason.
 */
export function RelationshipDialog({ task, onSave, onCancel }: RelationshipDialogProps) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const preset = Object.fromEntries(presetValues(task));
  const [type, setType] = useState(
    typeof preset.relationship_type === "string" ? preset.relationship_type : "",
  );
  const [contactId, setContactId] = useState<number | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const types = task.relationshipTypes ?? [];
  const chosen = types.find((item) => item.id === type);
  const typeId = type.split("_")[0] ?? "";
  const fields = useQuery({
    queryKey: ["relationshipFields", typeId],
    queryFn: chosen ? () => api4<UpdateField>(...relationshipFieldsCall(typeId)) : skipToken,
  });
  const ready = !!chosen && contactId !== null && fields.isSuccess;
  const lockType = preset.disableRelationshipSelect === true;

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  });

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
          if (ready && contactId !== null) onSave(type, contactId, values);
        }}
      >
        <div className="form-inline">
          <label htmlFor={`${titleId}-type`}>
            {ts("Relationship Type")} <i className="crm-marker">*</i>
          </label>{" "}
          <select
            id={`${titleId}-type`}
            className="form-control"
            required
            disabled={lockType}
            value={type}
            onChange={(event) => {
              setType(event.target.value);
              setContactId(null);
              setValues({});
            }}
          >
            <option value="">{ts("- select -")}</option>
            {types.map((item) => (
              <option key={item.id} value={item.id} title={item.description ?? undefined}>
                {item.text}
              </option>
            ))}
          </select>
        </div>
        <div className="form-inline">
          <label id={`${titleId}-contact-label`} htmlFor={`${titleId}-contact`}>
            {ts("Contact")} <i className="crm-marker">*</i>
          </label>{" "}
          {chosen ? (
            <EntityRefInput
              key={chosen.id}
              kind="entityref"
              multiple={false}
              info={contactInfo(chosen)}
              row={NO_ROW}
              value={contactId}
              nullable={false}
              labelId={`${titleId}-contact-label`}
              common={{
                id: `${titleId}-contact`,
                required: true,
                "aria-invalid": undefined,
                "aria-describedby": undefined,
              }}
              params={{ filters: { contact_sub_type: chosen.contact_sub_type ?? null } }}
              onChange={(next) => {
                setContactId(typeof next === "number" ? next : null);
              }}
            />
          ) : (
            <input id={`${titleId}-contact`} className="form-control" disabled />
          )}
        </div>
        {fields.isError && (
          <p className="alert alert-danger" role="alert">
            {errorMessage(fields.error)}
          </p>
        )}
        {chosen && fields.isPending && (
          <div>
            <i className="crm-i fa-spinner fa-spin" role="img" aria-label={ts("Loading")} />
          </div>
        )}
        {(fields.data ?? []).map((field) => {
          const info = fieldEditableInfo("Relationship", field);
          const input = editorFor(info);
          const labelId = `${titleId}-${field.name}`;
          return (
            <div key={field.name} className="form-inline">
              <label
                id={labelId}
                htmlFor={`${labelId}-input`}
                title={field.description ?? undefined}
              >
                {field.label}
                {field.required && (
                  <>
                    {" "}
                    <i className="crm-marker">*</i>
                  </>
                )}
              </label>{" "}
              {"kind" in input ? (
                <Input
                  kind={input.kind}
                  multiple={input.multiple}
                  info={info}
                  row={NO_ROW}
                  value={field.name in values ? values[field.name] : initialBatchValue(field)}
                  nullable={info.nullable}
                  labelId={labelId}
                  common={{
                    id: `${labelId}-input`,
                    required: !!field.required,
                    "aria-invalid": undefined,
                    "aria-describedby": undefined,
                  }}
                  onChange={(next) => {
                    setValues({ ...values, [field.name]: next });
                  }}
                />
              ) : (
                <span className="afreact-unsupported" role="note">
                  {ts("Not supported by the React renderer: %1", { 1: input.unsupported })}
                </span>
              )}
            </div>
          );
        })}
        <div className="afreact-dialog-buttons">
          <button type="button" className="btn btn-default" onClick={() => dialog.current?.close()}>
            <Icon name="fa-times" /> {ts("Cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!ready}>
            <Icon name="fa-user-plus" /> {ts("Save")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
