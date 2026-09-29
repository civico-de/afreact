import { useId } from "react";
import type { FieldDefn, FieldOption } from "./types";
import { Unsupported } from "./Unsupported";

interface FieldProps {
  defn: FieldDefn;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled: boolean;
}

const TEXT_TYPES: Record<string, string> = {
  Text: "text",
  Email: "email",
  Url: "url",
  Number: "number",
  Hidden: "hidden",
};

/** Option IDs keep their type (e.g. 2, not "2") so the submission matches Angular's. */
function optionById(options: FieldOption[], raw: string): FieldOption["id"] | undefined {
  return options.find((option) => String(option.id) === raw)?.id;
}

/** afField makes Boolean options truly boolean and supplies Yes/No when there are none. */
function fieldOptions(defn: FieldDefn): FieldOption[] {
  if (defn.data_type !== "Boolean") return defn.options || [];
  return defn.options
    ? defn.options.map((option) => ({ ...option, id: Boolean(option.id) }))
    : [
        { id: true, label: ts("Yes") },
        { id: false, label: ts("No") },
      ];
}

/** "2026-09-29 14:30:00" <-> "2026-09-29T14:30" for datetime-local inputs. */
function toLocalDateTime(value: unknown): string {
  return typeof value === "string" ? value.replace(" ", "T").slice(0, 16) : "";
}
function fromLocalDateTime(value: string): string | null {
  return value ? `${value.replace("T", " ")}:00` : null;
}

function textValue(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

export function Field({ defn, value, onChange, disabled }: FieldProps) {
  const id = useId();
  const helpId = `${id}-help`;
  const label = defn.label === false ? undefined : (defn.label ?? defn.name);
  const required = defn.required === true;
  const describedBy = defn.help_post ? helpId : undefined;
  const common = { id, name: defn.name, disabled, required, "aria-describedby": describedBy };
  const attrs = defn.input_attrs ?? {};

  const control = (() => {
    const textType = TEXT_TYPES[defn.input_type];
    if (textType) {
      const numeric = textType === "number";
      return (
        <input
          {...common}
          type={textType}
          className="crm-form-text form-control"
          value={textValue(value)}
          min={attrs.min}
          max={attrs.max}
          step={attrs.step}
          onChange={(event) =>
            onChange(
              event.target.value === ""
                ? null
                : numeric
                  ? Number(event.target.value)
                  : event.target.value,
            )
          }
        />
      );
    }
    switch (defn.input_type) {
      case "TextArea":
        return (
          <textarea
            {...common}
            className="crm-form-textarea form-control"
            value={textValue(value)}
            onChange={(event) => onChange(event.target.value)}
          />
        );
      case "Date":
        return attrs.time ? (
          <input
            {...common}
            type="datetime-local"
            className="crm-form-date form-control"
            value={toLocalDateTime(value)}
            onChange={(event) => onChange(fromLocalDateTime(event.target.value))}
          />
        ) : (
          <input
            {...common}
            type="date"
            className="crm-form-date form-control"
            value={textValue(value)}
            onChange={(event) => onChange(event.target.value || null)}
          />
        );
      case "Select": {
        const options = fieldOptions(defn);
        if (attrs.multiple) {
          const selected = Array.isArray(value) ? value.map(String) : [];
          return (
            <select
              {...common}
              multiple
              className="crm-form-select form-control"
              value={selected}
              onChange={(event) =>
                onChange(
                  [...event.target.selectedOptions].map((option) =>
                    optionById(options, option.value),
                  ),
                )
              }
            >
              {options.map((option) => (
                <option key={String(option.id)} value={String(option.id)}>
                  {option.label}
                </option>
              ))}
            </select>
          );
        }
        return (
          <select
            {...common}
            className="crm-form-select form-control"
            value={textValue(value)}
            onChange={(event) =>
              onChange(event.target.value === "" ? null : optionById(options, event.target.value))
            }
          >
            <option value="">{attrs.placeholder ?? ""}</option>
            {options.map((option) => (
              <option key={String(option.id)} value={String(option.id)}>
                {option.label}
              </option>
            ))}
          </select>
        );
      }
      case "DisplayOnly":
        return <output id={id}>{textValue(value)}</output>;
      default:
        return null;
    }
  })();

  if (defn.input_type === "Radio" || (defn.input_type === "CheckBox" && defn.options)) {
    return (
      <OptionGroup
        defn={defn}
        value={value}
        onChange={onChange}
        disabled={disabled}
        label={label}
        helpId={helpId}
      />
    );
  }
  if (defn.input_type === "CheckBox") {
    return (
      <div className="af-field-type-checkbox facade-field">
        <input
          {...common}
          type="checkbox"
          className="crm-form-checkbox"
          checked={value === true || value === 1 || value === "1"}
          onChange={(event) => onChange(event.target.checked)}
        />
        {label && <label htmlFor={id}>{label}</label>}
        <Help defn={defn} helpId={helpId} />
      </div>
    );
  }
  if (control === null) {
    return <Unsupported what={`field type ${defn.input_type} (${label ?? defn.name})`} />;
  }
  return (
    <div className={`af-field-type-${defn.input_type.toLowerCase()} facade-field`}>
      {label && defn.input_type !== "Hidden" && (
        <label htmlFor={id}>
          {label}
          {required && (
            <span className="crm-marker" aria-hidden="true">
              {" "}
              *
            </span>
          )}
        </label>
      )}
      {defn.help_pre && <p className="help-block">{defn.help_pre}</p>}
      {control}
      <Help defn={defn} helpId={helpId} />
    </div>
  );
}

function Help({ defn, helpId }: { defn: FieldDefn; helpId: string }) {
  return defn.help_post ? (
    <p id={helpId} className="help-block">
      {defn.help_post}
    </p>
  ) : null;
}

interface OptionGroupProps extends Omit<FieldProps, "defn"> {
  defn: FieldDefn;
  label: string | undefined;
  helpId: string;
}

/** Radio buttons, or a checkbox list for multi-value fields with options. */
function OptionGroup({ defn, value, onChange, disabled, label, helpId }: OptionGroupProps) {
  const name = useId();
  const multiple = defn.input_type === "CheckBox";
  const selected = multiple ? (Array.isArray(value) ? value : []) : [value];
  const toggle = (id: FieldOption["id"], checked: boolean) =>
    onChange(
      multiple ? (checked ? [...selected, id] : selected.filter((item) => item !== id)) : id,
    );
  return (
    <fieldset
      className={`af-field-type-${defn.input_type.toLowerCase()} facade-field`}
      aria-describedby={defn.help_post ? helpId : undefined}
    >
      {label && (
        <legend>
          {label}
          {defn.required && (
            <span className="crm-marker" aria-hidden="true">
              {" "}
              *
            </span>
          )}
        </legend>
      )}
      {fieldOptions(defn).map((option) => {
        const id = `${name}-${String(option.id)}`;
        return (
          <span key={String(option.id)} className="facade-option">
            <input
              id={id}
              type={multiple ? "checkbox" : "radio"}
              name={name}
              disabled={disabled}
              required={!multiple && defn.required === true}
              checked={selected.some((item) => String(item) === String(option.id))}
              onChange={(event) => toggle(option.id, event.target.checked)}
            />
            <label htmlFor={id}>{option.label}</label>
          </span>
        );
      })}
      <Help defn={defn} helpId={helpId} />
    </fieldset>
  );
}
