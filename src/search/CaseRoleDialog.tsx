import { skipToken, useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { api4, errorMessage } from "../api/civi";
import { EntityRefInput } from "./EntityRefInput";
import { Icon } from "./LinkContent";
import {
  caseRoleBatch,
  caseRoleReplaceCall,
  caseRolesCall,
  fieldEditableInfo,
  presetValues,
  type ApiBatch,
  type Key,
  type RelationshipType,
  type SearchTask,
} from "./searchTasks";
import type { Row } from "./types";

interface CaseRoleDialogProps {
  task: SearchTask;
  /** The selected cases. */
  ids: Key[];
  /** The batch adding the role; the caller runs it. */
  onSave: (apiBatch: ApiBatch) => void;
  onCancel: () => void;
}

const NO_ROW: Row = { key: "", columns: [] };

/** The contact taking the role, as crm-autocomplete on the type's contact type. */
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
 * civiCaseTaskCaseRole.html: the role among the case types' roles, the contact taking it, and
 * where selected cases hold the role already, a choice between adding and replacing.
 */
export function CaseRoleDialog({ task, ids, onSave, onCancel }: CaseRoleDialogProps) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  // hook_civicrm_searchKitTasks may preset the role, the contact and the choice.
  const preset = Object.fromEntries(presetValues(task));
  const [type, setType] = useState(
    typeof preset.relationship_type === "string" ? preset.relationship_type : "",
  );
  const [contactId, setContactId] = useState(
    typeof preset.contact_id === "number" ? preset.contact_id : null,
  );
  const [mode, setMode] = useState(
    preset.addOrReplace === "add" || preset.addOrReplace === "replace" ? preset.addOrReplace : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const types = task.relationshipTypes ?? [];
  const chosen = types.find((item) => item.id === type);
  // Looked up afresh each time the dialog opens: roles may have changed since.
  const existing = useQuery({
    queryKey: ["caseRoles", ids, type],
    queryFn: chosen ? () => api4(...caseRolesCall(ids, type)) : skipToken,
    gcTime: 0,
  });
  const existingCount = existing.data?.count ?? null;
  const ready =
    !!chosen && contactId !== null && existingCount !== null && (!existingCount || !!mode);

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  });

  const submit = async () => {
    if (!ready || contactId === null) return;
    if (mode === "replace") {
      setSaving(true);
      setError(null);
      try {
        await api4(...caseRoleReplaceCall(ids, type, contactId));
      } catch (failure) {
        setError(failure);
        setSaving(false);
        return;
      }
    }
    // deviation:case-role-batch-failure-alerts
    onSave(caseRoleBatch(type, contactId));
  };

  const existingId = `${titleId}-existing`;
  const choice = (value: "add" | "replace", label: string) => (
    <label>
      <input
        type="radio"
        name={`${titleId}-mode`}
        value={value}
        required
        checked={mode === value}
        disabled={saving}
        onChange={() => {
          setMode(value);
        }}
      />{" "}
      {label}
    </label>
  );

  return (
    <dialog
      ref={dialog}
      className="crm-search-task-dialog afreact-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        if (saving) event.preventDefault();
      }}
      onClose={() => {
        if (!saving) onCancel();
      }}
    >
      <h2 id={titleId} className="afreact-dialog-title">
        {task.title}
      </h2>
      <form
        className="afreact-dialog-body"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="form-inline">
          <label htmlFor={`${titleId}-type`}>
            {ts("Role Type")} <i className="crm-marker">*</i>
          </label>{" "}
          <select
            id={`${titleId}-type`}
            className="form-control"
            required
            disabled={preset.disableRelationshipSelect === true || saving}
            value={type}
            onChange={(event) => {
              // Another role may take another contact type, so the contact is picked again.
              setType(event.target.value);
              setContactId(null);
              setMode("");
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
        {existing.isError && (
          <p className="alert alert-danger" role="alert">
            {errorMessage(existing.error)}
          </p>
        )}
        {chosen && !existing.isError && (
          <div
            className={`alert ${
              existingCount === null
                ? "alert-info"
                : existingCount === 0
                  ? "alert-success"
                  : "alert-warning"
            }`}
          >
            {existingCount === null ? (
              <>
                <Icon name="fa-spinner fa-spin" /> {ts("Checking...")}
              </>
            ) : existingCount === 0 ? (
              <>
                <Icon name="fa-check-circle" />{" "}
                {ts("The selected cases do not yet have this role assigned.")}
              </>
            ) : (
              <>
                <Icon name="fa-exclamation-triangle" />{" "}
                <span id={existingId}>
                  {ts("%1 cases already have this role assigned.", { 1: existingCount })}
                </span>
                <div className="form-inline" role="radiogroup" aria-labelledby={existingId}>
                  {choice("add", ts("Add extra roles"))}{" "}
                  {choice("replace", ts("Replace existing roles"))}
                </div>
              </>
            )}
          </div>
        )}
        {!!error && (
          <p className="alert alert-danger" role="alert">
            {errorMessage(error)}
          </p>
        )}
        <p role="status">{saving ? ts("Replacing roles...") : ""}</p>
        <div className="afreact-dialog-buttons">
          <button
            type="button"
            className="btn btn-default"
            disabled={saving}
            onClick={() => dialog.current?.close()}
          >
            <Icon name="fa-times" /> {ts("Cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!ready || saving}>
            <Icon name="fa-user-plus" /> {ts("Save")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
