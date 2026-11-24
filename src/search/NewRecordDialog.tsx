import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { api4, errorMessage } from "../api/civi";
import { addClauses, clauseValues, FieldClauses, type Clause } from "./FieldClauses";
import { Icon } from "./LinkContent";
import {
  caseBatch,
  caseFieldsCall,
  grantBatch,
  grantFieldsCall,
  grantsCall,
  initialCreateFields,
  openCasesCall,
  presetValues,
  type ApiBatch,
  type ApiCall,
  type EntityInfo,
  type Key,
  type SearchTask,
  type UpdateField,
} from "./searchTasks";
import { crmAlert } from "../html";

/** What a dialog that adds one record per selected contact asks, looks up and says. */
export interface NewRecordKind {
  entity: EntityInfo;
  fieldsCall: () => ApiCall;
  /** The selected contacts that hold such a record already, one row per record. */
  existingCall: (ids: Key[]) => ApiCall;
  /** The fields the dialog adds after the required ones. */
  own: string[];
  batch: (values: Record<string, unknown>) => ApiBatch;
  /** One record for all contacts may be created, where the task allows several clients. */
  joint: boolean;
  existing: (count: number) => string;
  skip: (count: number) => string;
  anyway: (count: number) => string;
  /** The alert when every contact is skipped: message and title. */
  noneLeft: () => [string, string];
}

/** civiCaseTaskOpenCase.html. */
export const NEW_CASE: NewRecordKind = {
  entity: { name: "Case", title: "Case", title_plural: "Cases", primary_key: ["id"] },
  fieldsCall: caseFieldsCall,
  existingCall: openCasesCall,
  own: ["subject"],
  batch: caseBatch,
  joint: true,
  existing: (count) =>
    ts("1 contact already has an open case.", {
      plural: "%count contacts already have an open case.",
      count,
    }),
  skip: (count) =>
    ts("Skip contact with open case", { plural: "Skip contacts with open cases", count }),
  anyway: (count) => ts("Create new case anyway", { plural: "Create new cases anyway", count }),
  noneLeft: () => [ts("No cases to open."), ts("All contacts skipped")],
};

// deviation:grant-dialog-case-fixes
/** civiGrantTaskAddGrant.html. */
export const NEW_GRANT: NewRecordKind = {
  entity: { name: "Grant", title: "Grant", title_plural: "Grants", primary_key: ["id"] },
  fieldsCall: grantFieldsCall,
  existingCall: grantsCall,
  own: [],
  batch: grantBatch,
  joint: false,
  existing: (count) =>
    ts("1 contact already has a grant.", {
      plural: "%count contacts already have grants.",
      count,
    }),
  skip: (count) =>
    ts("Skip contact with existing grant", { plural: "Skip contacts with existing grants", count }),
  anyway: (count) => ts("Add new grant anyway", { plural: "Add new grants anyway", count }),
  noneLeft: () => [ts("No grants to add."), ts("All contacts skipped")],
};

interface NewRecordDialogProps {
  kind: NewRecordKind;
  task: SearchTask;
  /** The selected contacts. */
  ids: Key[];
  /** A record per contact: the batch and the contacts it runs on; the caller runs it. */
  onSave: (apiBatch: ApiBatch, ids: Key[]) => void;
  /** One joint case for all contacts was opened here. */
  onOpened: (message: string) => void;
  onCancel: () => void;
}

const isContactId = (row: unknown): row is { contact_id: Key } =>
  typeof row === "object" && row !== null && "contact_id" in row;

/**
 * The new record's fields, a choice between one case per contact and a joint case where the
 * setting allows it, and a choice to skip the contacts that hold such a record already.
 */
export function NewRecordDialog({
  kind,
  task,
  ids,
  onSave,
  onOpened,
  onCancel,
}: NewRecordDialogProps) {
  const titleId = useId();
  const addId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [clauses, setClauses] = useState<Clause[]>(() =>
    presetValues(task).map(([name, value], key) => ({ key, name, value })),
  );
  const [started, setStarted] = useState(false);
  const [joint, setJoint] = useState(false);
  const [skip, setSkip] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const entity = kind.entity.name;
  const [callEntity, action, params] = kind.fieldsCall();
  const fields = useQuery({
    queryKey: ["newRecordFields", entity],
    queryFn: () => api4<UpdateField>(callEntity, action, params),
  });
  const [existingEntity, existingAction, existingParams] = kind.existingCall(ids);
  // Looked up afresh each time the dialog opens: a record may have been added or closed since.
  const existing = useQuery({
    queryKey: ["newRecordExisting", entity, ids],
    queryFn: () => api4(existingEntity, existingAction, existingParams),
    gcTime: 0,
  });
  // deviation:grant-count-contacts-once
  const holders = new Set(
    (existing.data ?? []).filter(isContactId).map((row) => String(row.contact_id)),
  );
  const jointAllowed = kind.joint && ids.length > 1 && !!task.allowMultipleClients;

  // The trait's first clauses, once the fields are known: required without default, then own.
  useEffect(() => {
    if (!fields.data || started) return;
    setStarted(true);
    setClauses((current) =>
      addClauses(current, fields.data, initialCreateFields(fields.data, kind.own)),
    );
  }, [fields.data, started, kind.own]);

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  });

  const submit = async () => {
    if (saving) return;
    const contacts = skip ? ids.filter((id) => !holders.has(String(id))) : ids;
    // deviation:skipped-contacts-send-nothing
    if (!contacts.length) {
      crmAlert(...kind.noneLeft());
      dialog.current?.close();
      return;
    }
    const values = clauseValues(clauses);
    if (!(joint && jointAllowed)) {
      onSave(kind.batch(values), contacts);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api4("Case", "create", { values: { ...values, contact_id: contacts } });
      const message = ts("Successfully opened 1 case.");
      crmAlert(message, ts("Saved"), "success");
      onOpened(message);
      // deviation:open-case-batch-failure
    } catch (failure) {
      setError(failure);
      setSaving(false);
    }
  };

  const jointId = `${addId}-joint`;
  const skipId = `${addId}-skip`;
  const choice = (
    name: string,
    value: boolean,
    current: boolean,
    set: (value: boolean) => void,
    label: string,
  ) => (
    <label>
      <input
        type="radio"
        name={`${addId}-${name}`}
        checked={current === value}
        disabled={saving}
        onChange={() => {
          set(value);
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
        {jointAllowed && (
          <div className="alert alert-info">
            <Icon name="fa-folder-open" />{" "}
            <span id={jointId}>{ts("Multiple contacts selected...")}</span>
            <div className="form-inline" role="radiogroup" aria-labelledby={jointId}>
              {choice("joint", false, joint, setJoint, ts("Open new cases for each contact"))}{" "}
              {choice(
                "joint",
                true,
                joint,
                setJoint,
                ts("Open a single case with all contacts jointly"),
              )}
            </div>
          </div>
        )}
        <FieldClauses
          entity={kind.entity}
          fields={fields.data}
          error={fields.error}
          clauses={clauses}
          onChange={setClauses}
          id={addId}
        />
        {existing.isError && (
          <p className="alert alert-danger" role="alert">
            {errorMessage(existing.error)}
          </p>
        )}
        {holders.size > 0 && (
          <div className="alert alert-warning">
            <Icon name="fa-exclamation-triangle" />{" "}
            <span id={skipId}>{kind.existing(holders.size)}</span>
            <div className="form-inline" role="radiogroup" aria-labelledby={skipId}>
              {choice("skip", true, skip, setSkip, kind.skip(holders.size))}{" "}
              {choice("skip", false, skip, setSkip, kind.anyway(holders.size))}
            </div>
          </div>
        )}
        {!!error && (
          <p className="alert alert-danger" role="alert">
            {errorMessage(error)}
          </p>
        )}
        <p role="status">{saving ? ts("Opening case...") : ""}</p>
        <hr />
        <div className="afreact-dialog-buttons">
          <button
            type="button"
            className="btn btn-default"
            disabled={saving}
            onClick={() => dialog.current?.close()}
          >
            <Icon name="fa-times" /> {ts("Cancel")}
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            // deviation:open-case-save-waits-lookup
            disabled={saving || !fields.data || !existing.isSuccess}
          >
            <Icon name="fa-user-plus" /> {ts("Save")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
