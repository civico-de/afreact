import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { api4, errorMessage } from "../api/civi";
import { Icon } from "./LinkContent";
import { mailingCalls, mailingGroupCall, type Key, type SearchTask } from "./searchTasks";

interface MailingDialogProps {
  task: SearchTask;
  ids: Key[];
  /** The hidden group and the mailing exist; the caller adds the contacts and opens the mailing. */
  onCreated: (groupId: number, mailingId: number) => void;
  onCancel: () => void;
}

interface TemplateTypeField {
  options?: { id: string; label: string; description?: string | null }[] | false;
}

interface CreatedGroup {
  id: number;
  mailing: { id: number };
}

/**
 * crmSearchTaskMailing.html: the mailing's name and type, with how many of the selected contacts
 * can receive it; creating makes the hidden group and the mailing here, the contacts join in the
 * task dialog's batch.
 */
export function MailingDialog({ task, ids, onCreated, onCancel }: MailingDialogProps) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const [name, setName] = useState("");
  const [templateType, setTemplateType] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const calls = mailingCalls(ids);
  const types = useQuery({
    queryKey: ["mailingDialog", "templateTypes"],
    queryFn: async () => {
      const [field] = await api4<TemplateTypeField>(...calls.templateTypes);
      return field?.options || [];
    },
  });
  const recipients = useQuery({
    queryKey: ["mailingDialog", "recipients", ids],
    queryFn: async () => {
      const result = await api4(...calls.recipientCount);
      if (result.count === undefined) throw new Error("Contact.get answered without a count.");
      return result.count;
    },
  });
  const options = types.data ?? [];
  const chosenType = templateType ?? options[0]?.id ?? null;
  const count = recipients.data;
  const ready = !!name && !!count && !creating;

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  });

  const create = async () => {
    setCreating(true);
    setError(null);
    title.current?.focus();
    try {
      const [group] = await api4<CreatedGroup>(
        ...mailingGroupCall({ name, template_type: chosenType }),
      );
      if (!group) throw new Error("Group.create returned no group.");
      onCreated(group.id, group.mailing.id);
    } catch (cause) {
      // Core alerts its own message and closes; React keeps the dialog with both messages.
      setError(
        `${ts("An error occurred while attempting to create mailing.")} ${errorMessage(cause)}`,
      );
      setCreating(false);
    }
  };

  const status =
    count === undefined ? (
      <div className="alert">
        <i className="crm-i fa-spinner fa-spin" role="img" aria-hidden="true" />{" "}
        {ts("Checking recipients...")}
      </div>
    ) : count === 0 ? (
      <div className="alert alert-danger">
        <i className="crm-i fa-exclamation-triangle" role="img" aria-hidden="true" />{" "}
        {ts(
          "None of the selected contacts are eligible to receive mailings (due to lack of email address or unsubscribe status).",
        )}
      </div>
    ) : count < ids.length ? (
      <div className="alert alert-warning">
        <i className="crm-i fa-exclamation-triangle" role="img" aria-hidden="true" />{" "}
        {ts(
          "%1 of the selected contacts cannot receive mailings (due to lack of email address or unsubscribe status).",
          { 1: ids.length - count },
        )}
      </div>
    ) : (
      <div className="alert alert-success">
        <i className="crm-i fa-check-circle" role="img" aria-hidden="true" />{" "}
        {ts("All of the selected contacts have active email addresses.")}
      </div>
    );

  return (
    <dialog
      ref={dialog}
      className="crm-search-task-dialog afreact-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        if (creating) event.preventDefault();
      }}
      onClose={onCancel}
    >
      <h2 ref={title} id={titleId} className="afreact-dialog-title" tabIndex={-1}>
        {task.title}
      </h2>
      <form
        className="afreact-dialog-body"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) void create();
        }}
      >
        <div className="alert alert-info">
          <p>
            {ts(
              "Compose and send a mass-mailing to the %1 selected contacts (you will be able to add or exclude additional groups of contacts in the next step).",
              { 1: ids.length },
            )}
          </p>
        </div>
        <label htmlFor={`${titleId}-name`}>
          {ts("Mailing Name")} <span className="crm-marker">*</span>
        </label>
        <input
          id={`${titleId}-name`}
          className="form-control"
          required
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        {options.length > 0 && (
          <div className="form-inline">
            <label htmlFor={`${titleId}-type`}>{ts("Mailing Type")}</label>{" "}
            <select
              id={`${titleId}-type`}
              className="form-control"
              value={chosenType ?? ""}
              onChange={(event) => {
                setTemplateType(event.target.value);
              }}
            >
              {options.map((option) => (
                <option key={option.id} value={option.id} title={option.description ?? undefined}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {[types.error, recipients.error]
          .filter((failure) => failure !== null)
          .map((failure, index) => (
            <p key={index} className="alert alert-danger" role="alert">
              {errorMessage(failure)}
            </p>
          ))}
        <div aria-live="polite">{!recipients.error && status}</div>
        {creating && (
          <div className="crm-search-task-progress" role="status">
            <h5>{ts("Creating mailing...")}</h5>
          </div>
        )}
        {error && (
          <p className="alert alert-danger" role="alert">
            {error}
          </p>
        )}
        <div className="afreact-dialog-buttons">
          <button
            type="button"
            className="btn btn-default"
            disabled={creating}
            onClick={() => dialog.current?.close()}
          >
            <Icon name="fa-times" /> {ts("Cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!ready}>
            <Icon name="fa-paper-plane" /> {ts("Create Mailing")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
