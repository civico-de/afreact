import { useContext, useEffect, useId, useRef, useState } from "react";
import { onButtonKey } from "../../keys";
import type { FieldDefn } from "../types";
import { Unsupported } from "../Unsupported";
import { useFieldEnv } from "./env";
import { isFileInfo, UploadsContext } from "./upload";

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
  const env = useFieldEnv("File");
  const uploads = useContext(UploadsContext);
  const key = useId();
  const input = useRef<HTMLInputElement>(null);
  const [replaced, setReplaced] = useState(false);
  const stored = isFileInfo(value) && value.id ? value : null;
  const latest = useRef({ onChange, env });
  useEffect(() => {
    latest.current = { onChange, env };
  });

  // A field that leaves the form (af-if) takes its file along.
  const pending = uploads?.pending;
  useEffect(
    () => () => {
      pending?.delete(key);
    },
    [pending, key],
  );
  useEffect(() => {
    if (replaced && !stored) input.current?.focus();
  }, [replaced, stored]);

  if (!uploads || env.entityIndex === undefined)
    return <Unsupported what={fileOutsideFormNote(defn)} />;
  if (stored) {
    const icon = (
      <i className={`crm-i ${stored.icon ?? ""}`.trim()} role="img" aria-hidden="true" />
    );
    const replace = () => {
      // Both keys empty: the server then clears the field on the entity and on a join record.
      onChange({ id: null, file_name: null });
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
  return (
    <input
      ref={input}
      id={id}
      type="file"
      name={defn.name}
      required={defn.required === true}
      disabled={disabled && !uploads.retry?.has(key)}
      aria-describedby={describedBy}
      onChange={(event) => {
        const file = event.target.files?.[0];
        uploads.changed();
        if (!file) {
          uploads.pending.delete(key);
          return;
        }
        uploads.pending.set(key, {
          file,
          target: () => {
            const { modelName, fieldName, joinEntity, entityIndex, joinIndex } = latest.current.env;
            if (entityIndex === undefined) throw new Error(fileOutsideFormNote(defn));
            const join = joinEntity ?? null;
            return { modelName, fieldName, joinEntity: join, entityIndex, joinIndex: joinIndex ?? null };
          },
          onUploaded: (stored) => {
            latest.current.onChange(stored);
          },
        });
      }}
    />
  );
}
