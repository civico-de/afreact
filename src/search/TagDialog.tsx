import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { api4, errorMessage } from "../api/civi";
import { Icon } from "./LinkContent";
import {
  tagCalls,
  tagTree,
  type EntityInfo,
  type SearchTask,
  type TagRow,
  type Tagset,
} from "./searchTasks";

interface TagDialogProps {
  task: SearchTask;
  entity: EntityInfo;
  /** The chosen tags; the caller runs the batch. */
  onSave: (action: "save" | "delete", tagIds: number[]) => void;
  onCancel: () => void;
}

/** The tags of a tagset, loaded as crm-entityref lists them. */
function tagsetCall(tagset: Tagset) {
  return {
    select: ["id", "label", "color", "description"],
    where: [
      ["parent_id", "=", tagset.id],
      ["is_selectable", "=", true],
    ],
    orderBy: { label: "ASC" },
  };
}

const ids = (select: HTMLSelectElement) => [...select.selectedOptions].map((o) => Number(o.value));

/**
 * crmSearchTaskTag.html: add or remove tags; the plain tags in one list, each tagset's tags in
 * another. The lists are native selects; core's select2 and entityref search the same rows.
 */
export function TagDialog({ task, entity, onSave, onCancel }: TagDialogProps) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [action, setAction] = useState<"save" | "delete">("save");
  const [plain, setPlain] = useState<number[]>([]);
  const [bySet, setBySet] = useState<Record<string, number[]>>({});
  const calls = tagCalls(entity.name);
  const tags = useQuery({
    queryKey: ["tagDialog", "tags", entity.name],
    queryFn: () => api4<TagRow>(...calls.tags),
  });
  const tagsets = useQuery({
    queryKey: ["tagDialog", "tagsets", entity.name],
    queryFn: () => api4<Tagset>(...calls.tagsets),
  });
  const selection = [...plain, ...Object.values(bySet).flat()];
  const loading = !tags.data || !tagsets.data;

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
          if (selection.length) onSave(action, selection);
        }}
      >
        <div className="form-radios">
          <label>
            <input
              type="radio"
              name={`${titleId}-action`}
              checked={action === "save"}
              onChange={() => {
                setAction("save");
              }}
            />{" "}
            {ts("Add Tags")}
          </label>
          <label>
            <input
              type="radio"
              name={`${titleId}-action`}
              checked={action === "delete"}
              onChange={() => {
                setAction("delete");
              }}
            />{" "}
            {ts("Remove Tags")}
          </label>
        </div>
        {loading && !tags.error && !tagsets.error && (
          <div>
            <i className="crm-i fa-spinner fa-spin" role="img" aria-label={ts("Loading")} />
          </div>
        )}
        {[tags.error, tagsets.error]
          .filter((error) => error !== null)
          .map((error) => (
            <p key={errorMessage(error)} className="alert alert-danger" role="alert">
              {errorMessage(error)}
            </p>
          ))}
        <hr />
        {!loading && (
          <fieldset>
            <div className="form-inline">
              <label htmlFor={`${titleId}-tags`}>{ts("Tags")}</label>{" "}
              <select
                id={`${titleId}-tags`}
                multiple
                className="form-control huge"
                value={plain.map(String)}
                onChange={(event) => {
                  setPlain(ids(event.target));
                }}
              >
                {tagTree(tags.data).map(({ tag, depth }) => (
                  <option
                    key={tag.id}
                    value={tag.id}
                    disabled={tag.is_selectable === false}
                    title={tag.description ?? undefined}
                  >
                    {"  ".repeat(depth)}
                    {tag.label}
                  </option>
                ))}
              </select>
            </div>
            {tagsets.data.map((tagset) => (
              <TagsetSelect
                key={tagset.id}
                id={`${titleId}-set-${String(tagset.id)}`}
                tagset={tagset}
                value={bySet[tagset.name] ?? []}
                onChange={(chosen) => {
                  setBySet({ ...bySet, [tagset.name]: chosen });
                }}
              />
            ))}
          </fieldset>
        )}
        <div className="afreact-dialog-buttons">
          <button type="button" className="btn btn-default" onClick={() => dialog.current?.close()}>
            <Icon name="fa-times" /> {ts("Cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!selection.length}>
            <Icon name="fa-check" /> {action === "save" ? ts("Add tags") : ts("Remove tags")}
          </button>
        </div>
      </form>
    </dialog>
  );
}

interface TagsetSelectProps {
  id: string;
  tagset: Tagset;
  value: number[];
  onChange: (chosen: number[]) => void;
}

function TagsetSelect({ id, tagset, value, onChange }: TagsetSelectProps) {
  const tags = useQuery({
    queryKey: ["tagDialog", "tagset", tagset.id],
    queryFn: () => api4<TagRow>("Tag", "get", tagsetCall(tagset)),
  });
  return (
    <div className="form-inline">
      <label htmlFor={id}>{tagset.label}</label>{" "}
      {tags.error ? (
        <span className="alert alert-danger" role="alert">
          {errorMessage(tags.error)}
        </span>
      ) : (
        <select
          id={id}
          multiple
          className={`form-control${tags.data ? "" : " loading"}`}
          disabled={!tags.data}
          value={value.map(String)}
          onChange={(event) => {
            onChange(ids(event.target));
          }}
        >
          {(tags.data ?? []).map((tag) => (
            <option key={tag.id} value={tag.id} title={tag.description ?? undefined}>
              {tag.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
