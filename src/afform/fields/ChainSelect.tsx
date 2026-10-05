import { skipToken, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api4, errorMessage } from "../../api/civi";
import type { FieldDefn, FieldOption } from "../types";
import { controlFieldName, valueIds } from "./autocomplete";
import { useFieldEnv, type FieldEnv } from "./env";

interface ChainSelectProps {
  id: string;
  defn: FieldDefn;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled: boolean;
  describedBy: string | undefined;
}

/** afField's watcher condition: a number, or a string or list that is not empty. */
function isSet(value: unknown): boolean {
  if (typeof value === "number") return true;
  return (typeof value === "string" || Array.isArray(value)) && value.length > 0;
}

/** The label of the nearest af-field of that name, as afField finds the control field's defn. */
function nearestLabel(from: Element | null, name: string): string | null {
  for (let element = from?.parentElement; element; element = element.parentElement) {
    const label = element.querySelector(`af-field[name="${name}"] label.crm-af-field-label`);
    if (label) return label.firstChild?.textContent ?? null;
  }
  return null;
}

/** The ids of the options that are left, and the value without the ones that went. */
function keepOffered(value: unknown, offered: Set<string>): { changed: boolean; value: unknown } {
  if (Array.isArray(value)) {
    const kept = value.filter((item) => offered.has(String(item)));
    return { changed: kept.length < value.length, value: kept };
  }
  const gone = valueIds(value).some((item) => !offered.has(String(item)));
  return { changed: gone, value: gone ? undefined : value };
}

function loadOptions(env: FieldEnv): Promise<FieldOption[]> {
  return api4<FieldOption>("Afform", "getOptions", {
    name: env.formName,
    modelName: env.modelName,
    fieldName: env.fieldName,
    joinEntity: env.joinEntity ?? null,
    values: env.values,
  });
}

/**
 * fields/ChainSelect.html: options from Afform.getOptions for the control field's value
 * (country → state/province → county). A value the new options lack is dropped.
 */
export function ChainSelect({
  id,
  defn,
  value,
  onChange,
  disabled,
  describedBy,
}: ChainSelectProps) {
  const env = useFieldEnv("ChainSelect");
  const element = useRef<HTMLSelectElement>(null);
  const attrs = defn.input_attrs ?? {};
  const control = attrs.control_field ? controlFieldName(defn, env, attrs.control_field) : null;
  const controlValue = control === null ? undefined : env.values[control];
  const chained = control !== null && isSet(controlValue);
  const loaded = useQuery({
    queryKey: [
      "Afform",
      "getOptions",
      env.formName,
      env.modelName,
      env.joinEntity,
      env.fieldName,
      controlValue,
    ],
    queryFn: chained ? () => loadOptions(env) : skipToken,
  });
  const fixed = Array.isArray(defn.options) ? defn.options : [];
  const options = control === null ? fixed : chained ? (loaded.data ?? []) : [];
  const settled = control === null || !chained || loaded.isSuccess;

  // afField's validateValue() runs when the option ids change, starting from none.
  const ids = new Set(options.map((option) => String(option.id)));
  const key = [...ids].join(",");
  const [validatedFor, setValidatedFor] = useState("");
  useEffect(() => {
    if (control === null || !settled || key === validatedFor) return;
    setValidatedFor(key);
    const kept = keepOffered(value, ids);
    if (kept.changed) onChange(kept.value);
  });

  const [controlLabel, setControlLabel] = useState<string | null>(null);
  useEffect(() => {
    if (control !== null) setControlLabel(nearestLabel(element.current, control));
  }, [control]);

  const placeholder = ((): string => {
    if (control !== null && !chained) return ts("Choose %1 first", { 1: controlLabel ?? control });
    if (attrs.placeholder) return attrs.placeholder;
    return settled && !options.length ? ts("None Found") : ts("Select");
  })();
  const byId = (raw: string) => options.find((option) => String(option.id) === raw)?.id;
  const common = {
    id,
    ref: element,
    className: "form-control",
    disabled: disabled || !options.length,
    required: defn.required === true,
    "aria-describedby": describedBy,
    "aria-busy": chained && loaded.isFetching,
  };
  const choices = options.map((option) => (
    <option key={String(option.id)} value={String(option.id)}>
      {option.label}
    </option>
  ));
  return (
    <div className={`form-group ${defn.input_style ?? ""}`.trim()}>
      <span className={`afreact-select${loaded.isFetching ? " loading" : ""}`}>
        {attrs.multiple ? (
          <select
            {...common}
            multiple
            value={valueIds(value).map(String)}
            onChange={(event) => {
              onChange([...event.target.selectedOptions].map((option) => byId(option.value)));
            }}
          >
            {options.length ? choices : <option disabled>{placeholder}</option>}
          </select>
        ) : (
          <select
            {...common}
            value={valueIds(value).map(String)[0] ?? ""}
            onChange={(event) => {
              onChange(event.target.value === "" ? null : byId(event.target.value));
            }}
          >
            <option value="">{placeholder}</option>
            {choices}
          </select>
        )}
      </span>
      {loaded.isError && (
        <span className="crm-error" role="alert">
          {errorMessage(loaded.error)}
        </span>
      )}
    </div>
  );
}
