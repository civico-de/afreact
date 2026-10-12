import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { api4, errorMessage } from "../api/civi";
import { Icon } from "./LinkContent";
import type { Key, SearchTask } from "./searchTasks";

interface MergeTag {
  id: number;
  label: string;
  is_reserved: boolean;
}

interface TagMergeDialogProps {
  task: SearchTask;
  /** The selected tags. */
  ids: Key[];
  onMerged: (message: string) => void;
  onCancel: () => void;
}

/**
 * crmSearchTaskTagMerge.html: the tag to keep among the selected, its label, then Tag.merge, which
 * re-tags the others' records and moves their children under the kept tag.
 */
export function TagMergeDialog({ task, ids, onMerged, onCancel }: TagMergeDialogProps) {
  const titleId = useId();
  const targetId = useId();
  const labelId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [label, setLabel] = useState("");
  const tags = useQuery({
    queryKey: ["tagMerge", ids],
    queryFn: () =>
      api4<MergeTag>("Tag", "get", {
        select: ["id", "label", "is_reserved"],
        where: [["id", "IN", ids]],
        orderBy: { label: "ASC" },
      }),
    gcTime: 0,
  });
  const merge = useMutation({
    mutationFn: (keep: number) =>
      api4("Tag", "merge", {
        targetId: keep,
        tagIds: ids.filter((id) => String(id) !== String(keep)),
        label,
      }),
    onSuccess: () => {
      const message = ts('%1 tags merged into "%2".', { 1: ids.length, 2: label });
      window.CRM.alert(message, ts("Merged"), "success");
      onMerged(message);
    },
  });

  // The first tag by label is kept unless another is chosen, as core starts.
  const first = tags.data?.[0];
  useEffect(() => {
    if (first && target === null) {
      setTarget(first.id);
      setLabel(first.label);
    }
  }, [first, target]);

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  });

  const running = merge.isPending;
  // deviation:tag-merge-none-left
  const loaded = tags.data?.length ? tags.data : null;
  return (
    <dialog
      ref={dialog}
      className="crm-search-task-dialog afreact-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        if (running) event.preventDefault();
      }}
      onClose={() => {
        if (!running) onCancel();
      }}
    >
      <h2 id={titleId} className="afreact-dialog-title">
        {task.title}
      </h2>
      <form
        className="afreact-dialog-body"
        onSubmit={(event) => {
          event.preventDefault();
          if (target !== null) merge.mutate(target);
        }}
      >
        <p>
          <strong>
            {ts(
              "Merge %1 selected tags into one. Records tagged with the others will be re-tagged with the tag you keep, and any child tags will move under it.",
              { 1: ids.length },
            )}
          </strong>
        </p>
        {tags.isPending && (
          <p role="status">
            <Icon name="fa-spinner fa-spin" />
            <span className="sr-only">{ts("Loading…")}</span>
          </p>
        )}
        {tags.isError && (
          <p className="alert alert-danger" role="alert">
            {errorMessage(tags.error)}
          </p>
        )}
        {tags.isSuccess && !loaded && (
          <p className="alert alert-danger" role="alert">
            {ts("None of the selected tags exists any more.")}
          </p>
        )}
        {loaded && (
          <fieldset>
            <div className="form-inline">
              <label htmlFor={targetId}>{ts("Tag to keep")}</label>{" "}
              <select
                id={targetId}
                className="form-control"
                value={target ?? ""}
                disabled={running}
                onChange={(event) => {
                  const kept = loaded.find((tag) => String(tag.id) === event.target.value);
                  setTarget(kept?.id ?? null);
                  setLabel(kept?.label ?? "");
                }}
              >
                {loaded.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-inline">
              <label htmlFor={labelId}>{ts("Label")}</label>{" "}
              <input
                id={labelId}
                type="text"
                className="form-control"
                required
                value={label}
                disabled={running}
                onChange={(event) => {
                  setLabel(event.target.value);
                }}
              />
            </div>
            {loaded.some((tag) => tag.is_reserved) && (
              <div className="description">
                {ts(
                  'One or more selected tags are reserved. Merging requires the "administer reserved tags" permission.',
                )}
              </div>
            )}
          </fieldset>
        )}
        {merge.isError && (
          <p className="alert alert-danger" role="alert">
            {errorMessage(merge.error)}
          </p>
        )}
        <p role="status">{running ? ts("Merging tags...") : ""}</p>
        <hr />
        <div className="afreact-dialog-buttons">
          <button
            type="button"
            className="btn btn-default"
            disabled={running}
            onClick={() => dialog.current?.close()}
          >
            <Icon name="fa-times" /> {ts("Cancel")}
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!loaded || running || !label || target === null}
          >
            <Icon name={running ? "fa-spin fa-spinner" : "fa-compress"} /> {ts("Merge tags")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
