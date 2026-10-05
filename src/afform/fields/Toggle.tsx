import type { FieldDefn, FieldOption } from "../types";

interface ToggleProps {
  id: string;
  defn: FieldDefn;
  /** The field's options as afField reads them; Yes/No for a Boolean field without any. */
  options: FieldOption[];
  value: unknown;
  onChange: (value: boolean) => void;
  disabled: boolean;
  describedBy: string | undefined;
}

/**
 * fields/Toggle.html: a checkbox the theme draws as a switch, with the on and off option labels
 * after it. FormBuilder makes every Toggle Boolean (Utils::getInputTypes), so it sets true or false.
 */
export function Toggle({ id, defn, options, value, onChange, disabled, describedBy }: ToggleProps) {
  return (
    <div className={`crm-form-toggle-container ${defn.input_style ?? ""}`.trim()}>
      <input
        id={id}
        name={defn.name}
        type="checkbox"
        role="switch"
        className="crm-form-toggle"
        required={defn.required === true}
        disabled={disabled}
        aria-describedby={describedBy}
        checked={value === true || value === 1 || value === "1"}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
      />
      {options.map((option) => (
        <span
          key={String(option.id)}
          className={`crm-form-toggle-text crm-form-toggle-text-${option.id ? "on" : "off"}`}
        >
          {option.label}
        </span>
      ))}
    </div>
  );
}
