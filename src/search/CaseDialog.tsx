import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { api4, errorMessage } from "../api/civi";
import { addClauses, clauseValues, FieldClauses, type Clause } from "./FieldClauses";
import { Icon } from "./LinkContent";
import {
  caseBatch,
  caseFieldsCall,
  initialCreateFields,
  openCasesCall,
  presetValues,
  type ApiBatch,
  type EntityInfo,
  type Key,
  type SearchTask,
  type UpdateField,
} from "./searchTasks";

interface CaseDialogProps {
  task: SearchTask;
  /** The selected contacts. */
  ids: Key[];
  /** A case per contact: the batch and the contacts it runs on; the caller runs it. */
  onSave: (apiBatch: ApiBatch, ids: Key[]) => void;
  /** One case for all contacts was opened here. */
  onOpened: (message: string) => void;
  onCancel: () => void;
}

const CASE: EntityInfo = {
  name: "Case",
  title: "Case",
  title_plural: "Cases",
  primary_key: ["id"],
};

const isContactId = (row: unknown): row is { contact_id: Key } =>
  typeof row === "object" && row !== null && "contact_id" in row;

/**
 * civiCaseTaskOpenCase.html: the new case's fields, a choice between one case per contact and a
 * joint case where the setting allows it, and a choice to skip the contacts that have a case
 * open already.
 */
export function CaseDialog({ task, ids, onSave, onOpened, onCancel }: CaseDialogProps) {
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
  const [callEntity, action, params] = caseFieldsCall();
  const fields = useQuery({
    queryKey: ["caseFields"],
    queryFn: () => api4<UpdateField>(callEntity, action, params),
  });
  const [casesEntity, casesAction, casesParams] = openCasesCall(ids);
  // Looked up afresh each time the dialog opens: a case may have been opened or closed since.
  const openCases = useQuery({
    queryKey: ["openCases", ids],
    queryFn: () => api4(casesEntity, casesAction, casesParams),
    gcTime: 0,
  });
  const withCase = new Set(
    (openCases.data ?? []).filter(isContactId).map((row) => String(row.contact_id)),
  );
  const jointAllowed = ids.length > 1 && !!task.allowMultipleClients;

  // The trait's first clauses, once the fields are known: required without default, then subject.
  useEffect(() => {
    if (!fields.data || started) return;
    setStarted(true);
    setClauses((current) =>
      addClauses(current, fields.data, initialCreateFields(fields.data, ["subject"])),
    );
  }, [fields.data, started]);

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  });

  const submit = async () => {
    const clients = skip ? ids.filter((id) => !withCase.has(String(id))) : ids;
    if (!clients.length) {
      window.CRM.alert(ts("No cases to open."), ts("All contacts skipped"));
      dialog.current?.close();
      return;
    }
    const values = clauseValues(clauses);
    if (!(joint && jointAllowed)) {
      onSave(caseBatch(values), clients);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api4("Case", "create", { values: { ...values, contact_id: clients } });
      const message = ts("Successfully opened 1 case.");
      window.CRM.alert(message, ts("Saved"), "success");
      onOpened(message);
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
          entity={CASE}
          fields={fields.data}
          error={fields.error}
          clauses={clauses}
          onChange={setClauses}
          id={addId}
        />
        {openCases.isError && (
          <p className="alert alert-danger" role="alert">
            {errorMessage(openCases.error)}
          </p>
        )}
        {withCase.size > 0 && (
          <div className="alert alert-warning">
            <Icon name="fa-exclamation-triangle" />{" "}
            <span id={skipId}>
              {ts("1 contact already has an open case.", {
                plural: "%count contacts already have an open case.",
                count: withCase.size,
              })}
            </span>
            <div className="form-inline" role="radiogroup" aria-labelledby={skipId}>
              {choice(
                "skip",
                true,
                skip,
                setSkip,
                ts("Skip contact with open case", {
                  plural: "Skip contacts with open cases",
                  count: withCase.size,
                }),
              )}{" "}
              {choice(
                "skip",
                false,
                skip,
                setSkip,
                ts("Create new case anyway", {
                  plural: "Create new cases anyway",
                  count: withCase.size,
                }),
              )}
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
            disabled={saving || !fields.data || !openCases.isSuccess}
          >
            <Icon name="fa-user-plus" /> {ts("Save")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
