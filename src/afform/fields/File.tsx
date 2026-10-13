import { useContext, useEffect, useId, useRef, useState } from "react";
import { onButtonKey } from "../../keys";
import type { FieldDefn } from "../types";
import { Unsupported } from "../Unsupported";
import { ItemPathContext, useFieldEnv, useInvalid } from "./env";
import { isFileInfo, UploadsContext, type PendingUpload } from "./upload";

interface FileFieldProps {
  id: string;
  defn: FieldDefn;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled: boolean;
  describedBy: string | undefined;
}

export function fileOutsideFormNote(defn: FieldDefn): string {
  const label = defn.label === false ? defn.name : (defn.label ?? defn.name);
  return `file upload outside a form (${label})`;
}

/**
 * fields/File.html: the stored file with a link to replace it, else a file input whose file
 * the form uploads through Afform.submitFile once the record is saved.
 */
export function FileField({ id, defn, value, onChange, disabled, describedBy }: FileFieldProps) {
  const invalid = useInvalid(id);
  const env = useFieldEnv();
  const uploads = useContext(UploadsContext);
  const key = useId();
  const input = useRef<HTMLInputElement>(null);
  const [replaced, setReplaced] = useState(false);
  const stored = isFileInfo(value) && value.id ? value : null;
  const latest = useRef({ onChange, env });
  useEffect(() => {
    latest.current = { onChange, env };
  });
  const owner = `${useContext(ItemPathContext)}/${env.joinEntity ?? ""}.${env.fieldName}`;
  // deviation:repeat-remove-undo
  // A file input cannot be refilled: an undone removal's file shows by name instead.
  const [restored, setRestored] = useState(() => uploads?.restored.get(owner) ?? null);
  const [dropped, setDropped] = useState(false);

  const upload = (file: File): PendingUpload => ({
    file,
    owner,
    target: () => {
      const { modelName, fieldName, joinEntity, entityIndex, joinIndex } = latest.current.env;
      if (entityIndex === undefined) throw new Error(fileOutsideFormNote(defn));
      const join = joinEntity ?? null;
      return {
        modelName,
        fieldName,
        joinEntity: join,
        entityIndex,
        // deviation:first-join-upload-index
        joinIndex: joinIndex ?? null,
      };
    },
    onUploaded: (uploaded) => {
      latest.current.onChange(uploaded);
    },
    // The submit drops a draft's file on a join record it creates.
    // deviation:draft-join-file-reupload
    again: () => !!latest.current.env.joinEntity && !latest.current.env.values.id,
  });
  const takeBack = useRef(upload);
  useEffect(() => {
    takeBack.current = upload;
  });

  // A field that leaves the form (af-if) takes its file along.
  const pending = uploads?.pending;
  const enqueued = useRef<File | null>(null);
  useEffect(() => {
    if (!restored || enqueued.current === restored) return;
    enqueued.current = restored;
    uploads?.restored.delete(owner);
    pending?.set(key, takeBack.current(restored));
  }, [restored, uploads, pending, owner, key]);
  useEffect(
    () => () => {
      pending?.delete(key);
    },
    [pending, key],
  );
  useEffect(() => {
    // deviation:file-replace-button
    if ((replaced && !stored) || dropped) input.current?.focus();
  }, [replaced, stored, dropped]);

  if (!uploads || env.entityIndex === undefined)
    return <Unsupported what={fileOutsideFormNote(defn)} />;
  if (stored) {
    const icon = (
      <i className={`crm-i ${stored.icon ?? ""}`.trim()} role="img" aria-hidden="true" />
    );
    const replace = () => {
      pending?.delete(key);
      // Both keys empty: the server then clears the field on the entity and on a join record.
      // deviation:replace-join-file-clears
      onChange({ id: null, file_name: null });
      setRestored(null);
      setReplaced(true);
    };
    return (
      <span>
        {stored.url ? (
          <a href={stored.url}>
            {icon} {stored.file_name}
          </a>
        ) : (
          <span>
            {icon} {stored.file_name}
          </span>
        )}
        {!disabled && (
          <>
            {" "}
            <a
              role="button"
              tabIndex={0}
              className="crm-hover-button"
              title={ts("Replace")}
              aria-label={ts("Replace %1", { 1: stored.file_name ?? "" })}
              onClick={replace}
              onKeyDown={onButtonKey(replace)}
            >
              <i className="crm-i fa-times" role="img" aria-hidden="true" />
            </a>
          </>
        )}
      </span>
    );
  }
  const retrying = uploads.retry?.has(key) === true;
  if (restored && !retrying) {
    const drop = () => {
      uploads.pending.delete(key);
      uploads.changed();
      setRestored(null);
      setDropped(true);
    };
    return (
      <span id={id}>
        {restored.name}{" "}
        <button
          type="button"
          className="btn btn-xs btn-default"
          aria-label={ts("Remove file %1", { 1: restored.name })}
          disabled={disabled}
          onClick={drop}
        >
          {ts("Remove file")}
        </button>
      </span>
    );
  }
  const chooser = (
    <input
      ref={input}
      id={id}
      type="file"
      name={defn.name}
      required={defn.required === true && !retrying}
      disabled={disabled && !retrying}
      aria-describedby={describedBy}
      aria-invalid={invalid}
      onChange={(event) => {
        const file = event.target.files?.[0];
        uploads.changed();
        if (!file) {
          uploads.pending.delete(key);
          return;
        }
        uploads.pending.set(key, upload(file));
      }}
    />
  );
  // The records are saved: the file is no longer required, and leaving it out ends the retry.
  if (!retrying) return chooser;
  const remove = () => {
    if (input.current) input.current.value = "";
    uploads.pending.delete(key);
    uploads.changed();
    input.current?.focus();
  };
  return (
    <>
      {chooser}{" "}
      <button type="button" className="btn btn-xs btn-default" onClick={remove}>
        {ts("Remove file")}
      </button>
    </>
  );
}
