import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { api4 } from "../api/civi";
import { clauseValues, FieldClauses, type Clause } from "./FieldClauses";
import { Icon } from "./LinkContent";
import {
  presetValues,
  taskFieldsCall,
  type EntityInfo,
  type Key,
  type SearchTask,
  type UpdateField,
} from "./searchTasks";

interface UpdateDialogProps {
  task: SearchTask;
  entity: EntityInfo;
  ids: Key[];
  /** The chosen values; the caller runs the batch. */
  onSave: (values: Record<string, unknown>) => void;
  onCancel: () => void;
}

/** crmSearchTaskUpdate.html: the fields to set on the selected records and their values. */
export function UpdateDialog({ task, entity, ids, onSave, onCancel }: UpdateDialogProps) {
  const titleId = useId();
  const addId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [clauses, setClauses] = useState<Clause[]>(() =>
    presetValues(task).map(([name, value], key) => ({ key, name, value })),
  );
  const [callEntity, action, params] = taskFieldsCall(entity.name);
  const fields = useQuery({
    queryKey: ["updateFields", entity.name],
    queryFn: () => api4<UpdateField>(callEntity, action, params),
  });
  const entityTitle = ids.length === 1 ? entity.title : entity.title_plural;

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
          if (clauses.length) onSave(clauseValues(clauses));
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
        <FieldClauses
          entity={entity}
          fields={fields.data}
          error={fields.error}
          clauses={clauses}
          onChange={setClauses}
          id={addId}
        />
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
