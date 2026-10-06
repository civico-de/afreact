import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { onButtonKey } from "../keys";
import { ChainSelect } from "./fields/ChainSelect";
import { DisplayOnly } from "./fields/DisplayOnly";
import { EntityRef } from "./fields/EntityRef";
import { Toggle } from "./fields/Toggle";
import { FileField } from "./fields/File";
import { Location } from "./fields/Location";
import { Range } from "./fields/Range";
import { RichTextEditor } from "./fields/RichTextEditor";
import { RANGE_TYPES, SearchRange } from "./fields/SearchRange";
import type { FieldDefn, FieldOption } from "./types";
import { Markup } from "./Markup";
import { Unsupported } from "./Unsupported";

/**
 * A field in the markup of core's afField templates (afField.html, fields/*.html), so the
 * site theme styles it as it styles Angular's.
 */

interface FieldProps {
  defn: FieldDefn;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled: boolean;
  /** The operator choice of a search filter with expose_operator (afFieldWithSearchOperator.html). */
  operator?: ReactNode;
}

const TEXT_TYPES: Record<string, string> = {
  Text: "text",
  Email: "email",
  Url: "url",
  Number: "number",
  Hidden: "hidden",
};

/** ngModel's value for an emptied input: "" as text, null as a number, none while required fails. */
function emptied(required: boolean, numeric: boolean): string | null | undefined {
  if (required) return undefined;
  return numeric ? null : "";
}

/**
 * ngModel trims typed text, while the control keeps the raw text so "John Smith" survives typing.
 * Text the model no longer matches (a reset, a prefill, a token default) replaces the shown text.
 */
function useTrimmedText(
  enabled: boolean,
  value: unknown,
  required: boolean,
  onChange: (value: unknown) => void,
) {
  const model = enabled ? textValue(value) : "";
  const [shown, setShown] = useState(model);
  if (shown.trim() !== model.trim()) setShown(model);
  const blank = shown !== "" && shown.trim() === "";
  return {
    value: shown,
    onChange: (event: { target: { value: string } }) => {
      const text = event.target.value;
      setShown(text);
      onChange(text.trim() === "" ? emptied(required, false) : text.trim());
    },
    // Only spaces pass the browser's required check, but leave ngModel's value empty.
    ref: (node: HTMLInputElement | HTMLTextAreaElement | null) => {
      node?.setCustomValidity(required && blank ? ts("This field is required.") : "");
    },
  };
}

/** The input types Field renders a control for; others show the "Not supported" note. */
export const INPUT_TYPES: ReadonlySet<string> = new Set([
  ...Object.keys(TEXT_TYPES),
  "TextArea",
  "Date",
  "Select",
  "Radio",
  "CheckBox",
  "DisplayOnly",
  "EntityRef",
  "ChainSelect",
  "Toggle",
  "RichTextEditor",
  "File",
  "Range",
  "Location",
]);

export function inputTypeNote(defn: FieldDefn): string {
  const label = defn.label === false ? undefined : (defn.label ?? defn.name);
  return `field type ${defn.input_type} (${label ?? defn.name})`;
}

/** The classes afField adds to its element: af-field-type-<kebab input type>, plus -multiple. */
export function fieldClasses(defn: FieldDefn): string {
  const type = `af-field-type-${defn.input_type.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}`;
  return defn.input_attrs?.multiple ? `${type} af-field-type-multiple` : type;
}

/** Option IDs keep their type (e.g. 2, not "2") so the submission matches Angular's. */
function optionById(options: FieldOption[], raw: string): FieldOption["id"] | undefined {
  return options.find((option) => String(option.id) === raw)?.id;
}

/** afField makes Boolean options truly boolean and supplies Yes/No when there are none. */
function fieldOptions(defn: FieldDefn): FieldOption[] {
  // Core sends false for a field without options.
  const options = defn.options === false ? undefined : defn.options;
  if (defn.data_type !== "Boolean") return options ?? [];
  return options
    ? options.map((option) => ({ ...option, id: Boolean(option.id) }))
    : [
        { id: true, label: ts("Yes") },
        { id: false, label: ts("No") },
      ];
}

/** "2026-09-29 14:30:00" <-> "2026-09-29T14:30" for datetime-local inputs. */
export function toLocalDateTime(value: unknown): string {
  return typeof value === "string" ? value.replace(" ", "T").slice(0, 16) : "";
}
export function fromLocalDateTime(value: string): string | null {
  return value ? `${value.replace("T", " ")}:00` : null;
}

/** crm.datepicker.js: "yy" is a year input, any other format without a day a month picker. */
function dateFormatKind(format: boolean | string | undefined): "year" | "month" | "date" {
  if (format === "yy") return "year";
  return typeof format === "string" && !format.toLowerCase().includes("d") ? "month" : "date";
}

/** The year ("1990") or month ("1990-05") of a stored "1990-05-17", or "" for anything else. */
function datePrefix(value: unknown, length: 4 | 7): string {
  const match = typeof value === "string" ? /^\d{4}-\d{2}/.exec(value) : null;
  return match ? match[0].slice(0, length) : "";
}

/** A list is a multi-value field shown as text; anything else but a scalar is a caller bug. */
function textValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(textValue).join(",");
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  throw new TypeError(`A field value must be a scalar or a list, got ${typeof value}`);
}

/** Radio.html offers to clear a value that is set, including false and 0. */
function hasValue(value: unknown): boolean {
  return !!value || value === false || value === 0;
}

function Marker() {
  return (
    <>
      {" "}
      <span className="crm-marker" title={ts("Required")} aria-hidden="true">
        *
      </span>
    </>
  );
}

/** Core's clear link, with the role and keys that make it reachable from the keyboard. */
export function ClearButton({
  onClear,
  hidden = false,
}: {
  onClear: () => void;
  hidden?: boolean;
}) {
  return (
    <a
      role="button"
      tabIndex={0}
      className="crm-hover-button"
      title={ts("Clear")}
      aria-label={ts("Clear")}
      // Date.html keeps the space of an unset date's clear link.
      style={hidden ? { visibility: "hidden" } : undefined}
      onClick={onClear}
      onKeyDown={onButtonKey(onClear)}
    >
      <i className="crm-i fa-times" aria-hidden="true" />
    </a>
  );
}

/** afCharacterCount.html: the length against the maximum, coloured from 70 % and 90 %. */
function CharacterCount({ id, length, max }: { id: string; length: number; max: number }) {
  const fraction = length / max;
  const status = fraction > 0.9 ? "text-danger" : fraction > 0.7 ? "text-warning" : "text-success";
  return (
    <div
      id={id}
      className={`af-character-count ${status}`}
      title={ts("Max characters allowed: %1", { 1: max })}
    >
      {length} / {max}
    </div>
  );
}

export function Field({ defn, value, onChange, disabled, operator }: FieldProps) {
  const id = useId();
  const helpId = `${id}-help`;
  const labelId = `${id}-label`;
  const label = defn.label === false ? undefined : (defn.label ?? defn.name);
  const required = defn.required === true;
  const describedBy = defn.help_post ? helpId : undefined;
  const common = {
    id,
    name: defn.name,
    disabled,
    required,
    "aria-describedby": describedBy,
  };
  const attrs = defn.input_attrs ?? {};
  const style = defn.input_style ?? undefined;
  // afField's isMultiple(): a non-Boolean checkbox is always a list.
  const grouped =
    defn.input_type === "Radio" || (defn.input_type === "CheckBox" && defn.data_type !== "Boolean");
  const booleanCheckbox = defn.input_type === "CheckBox" && !grouped;

  const ranged = !!defn.search_range && RANGE_TYPES.has(defn.input_type);
  // Controls in a group named by the label.
  const labelsGroup = grouped || ranged || defn.input_type === "Location";

  const trimmed = useTrimmedText(
    !ranged && (defn.input_type === "Text" || defn.input_type === "TextArea"),
    value,
    required,
    onChange,
  );

  const control = ((): ReactNode => {
    if (ranged) return <SearchRange {...{ id, labelId, defn, value, onChange, disabled }} />;
    const textType = TEXT_TYPES[defn.input_type];
    if (textType === "text") {
      return (
        <input
          {...common}
          {...trimmed}
          type="text"
          className={`form-control ${style ?? ""}`.trim()}
          placeholder={attrs.placeholder}
          maxLength={attrs.maxlength}
          minLength={attrs.minlength}
        />
      );
    }
    if (textType) {
      const numeric = textType === "number";
      return (
        <input
          {...common}
          type={textType}
          className={textType === "hidden" ? undefined : `form-control ${style ?? ""}`.trim()}
          value={textValue(value)}
          placeholder={attrs.placeholder}
          maxLength={attrs.maxlength}
          min={attrs.min}
          max={attrs.max}
          step={numeric ? (attrs.step ?? 1) : undefined}
          onChange={(event) => {
            const text = event.target.value;
            if (text === "") onChange(emptied(required, numeric));
            else onChange(numeric ? Number(text) : text);
          }}
        />
      );
    }
    switch (defn.input_type) {
      case "TextArea": {
        const text = textValue(value);
        const countId = `${id}-count`;
        return (
          <>
            <textarea
              {...common}
              // The count is read with the field, not announced on each keystroke.
              aria-describedby={
                [describedBy, attrs.maxlength && countId].filter(Boolean).join(" ") || undefined
              }
              className={`crm-form-textarea ${style ?? ""}`.trim()}
              rows={attrs.rows ?? 4}
              cols={attrs.cols ?? 60}
              maxLength={attrs.maxlength}
              minLength={attrs.minlength}
              {...trimmed}
            />
            {!!attrs.maxlength && (
              <CharacterCount id={countId} length={text.length} max={attrs.maxlength} />
            )}
          </>
        );
      }
      case "Date": {
        const kind = attrs.time ? "date" : dateFormatKind(attrs.date);
        return (
          <span className="crm-form-date-wrapper">
            {kind === "year" && (
              <YearInput common={common} style={style} value={value} onChange={onChange} />
            )}
            {kind === "month" && (
              <input
                {...common}
                type="month"
                className="form-control crm-form-text crm-form-date"
                value={datePrefix(value, 7)}
                onChange={(event) => {
                  const month = event.target.value;
                  onChange(month ? `${month}-01` : emptied(required, false));
                }}
              />
            )}
            {kind === "date" && attrs.time && (
              <input
                {...common}
                type="datetime-local"
                className="form-control crm-form-text crm-form-date"
                value={toLocalDateTime(value)}
                onChange={(event) => {
                  onChange(fromLocalDateTime(event.target.value) ?? emptied(required, false));
                }}
              />
            )}
            {kind === "date" && !attrs.time && (
              <input
                {...common}
                type="date"
                className="form-control crm-form-text crm-form-date"
                value={textValue(value)}
                onChange={(event) => {
                  onChange(event.target.value || emptied(required, false));
                }}
              />
            )}
            {/* crmDatepicker offers clearing only on a date that is not required. */}
            {!required && (
              <ClearButton
                onClear={() => {
                  onChange("");
                }}
                hidden={!value || disabled}
              />
            )}
          </span>
        );
      }
      case "Select": {
        const options = fieldOptions(defn);
        // Without a label, the placeholder or else Select.html's title names the select.
        const named = (title: string) =>
          label === undefined ? (attrs.placeholder ?? title) : undefined;
        const choices = options.map((option) => (
          <option key={String(option.id)} value={String(option.id)}>
            {option.label}
          </option>
        ));
        return (
          <div className={`form-group ${style ?? ""}`.trim()}>
            {/* Stands in for select2's container, which sizes the box at the surrounding font. */}
            <span className="afreact-select">
              {attrs.multiple ? (
                <select
                  {...common}
                  multiple
                  className="form-control"
                  title={ts("Select Values")}
                  aria-label={named(ts("Select Values"))}
                  value={Array.isArray(value) ? value.map(String) : []}
                  onChange={(event) => {
                    onChange(
                      [...event.target.selectedOptions].map((option) =>
                        optionById(options, option.value),
                      ),
                    );
                  }}
                >
                  {choices}
                </select>
              ) : (
                <select
                  {...common}
                  className="form-control"
                  title={ts("Select Value")}
                  aria-label={named(ts("Select Value"))}
                  value={textValue(value)}
                  onChange={(event) => {
                    onChange(
                      event.target.value === "" ? null : optionById(options, event.target.value),
                    );
                  }}
                >
                  <option value="">{attrs.placeholder ?? ""}</option>
                  {choices}
                </select>
              )}
            </span>
          </div>
        );
      }
      case "Radio":
        return (
          <RadioGroup
            defn={defn}
            value={value}
            onChange={onChange}
            disabled={disabled}
            labelId={labelId}
            helpId={describedBy}
          />
        );
      case "CheckBox":
        return grouped ? (
          <CheckboxList
            defn={defn}
            value={value}
            onChange={onChange}
            disabled={disabled}
            labelId={labelId}
            helpId={describedBy}
          />
        ) : (
          <label className={`crm-af-field-label ${style ?? ""}`.trim()}>
            <input
              {...common}
              type="checkbox"
              checked={value === true || value === 1 || value === "1"}
              onChange={(event) => {
                onChange(event.target.checked);
              }}
            />{" "}
            {label}
            {required && <Marker />}
          </label>
        );
      case "DisplayOnly":
        return (
          <DisplayOnly
            {...{ id, defn, value }}
            options={defn.options || defn.data_type === "Boolean" ? fieldOptions(defn) : null}
          />
        );
      case "EntityRef":
        return <EntityRef {...{ id, defn, value, onChange, disabled, describedBy }} />;
      case "ChainSelect":
        return <ChainSelect {...{ id, defn, value, onChange, disabled, describedBy }} />;
      case "Toggle":
        return (
          <Toggle
            {...{ id, defn, value, onChange, disabled, describedBy }}
            options={fieldOptions(defn)}
          />
        );
      case "RichTextEditor":
        return <RichTextEditor {...{ id, defn, value, onChange, disabled, describedBy }} />;
      case "File":
        return <FileField {...{ id, defn, value, onChange, disabled, describedBy }} />;
      case "Range":
        return <Range {...{ id, defn, value, onChange, disabled, describedBy }} />;
      case "Location":
        return <Location {...{ id, labelId, value, onChange, disabled, describedBy }} />;
      default:
        return null;
    }
  })();

  if (control === null) {
    return <Unsupported what={inputTypeNote(defn)} />;
  }
  return (
    <>
      {label && !booleanCheckbox && (
        <label
          className="crm-af-field-label"
          id={labelsGroup ? labelId : undefined}
          htmlFor={grouped ? undefined : id}
        >
          <Markup html={label} />
          {required && <Marker />}
        </label>
      )}
      {defn.help_pre && (
        <p className="crm-af-field-help-pre">
          <Markup html={defn.help_pre} />
        </p>
      )}
      {operator ? (
        <div className="input-group">
          {operator}
          <div className="crm-af-field">{control}</div>
        </div>
      ) : (
        <div className="crm-af-field">{control}</div>
      )}
      {defn.help_post && (
        <p id={helpId} className="crm-af-field-help-post">
          <Markup html={defn.help_post} />
        </p>
      )}
    </>
  );
}

/**
 * crm.datepicker.js's number input for the "yy" format: shows the year, stores January 1st. The
 * typed text stays while it is no full year, which stores no date.
 */
function YearInput({
  common,
  style,
  value,
  onChange,
}: {
  common: InputHTMLAttributes<HTMLInputElement>;
  style: string | undefined;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const [draft, setDraft] = useState(() => datePrefix(value, 4));
  const stored = (text: string) => (/^\d{4}$/.test(text) ? `${text}-01-01` : "");
  const current = value ? String(value) : "";
  return (
    <input
      {...common}
      type="number"
      className={`form-control crm-form-number ${style ?? ""}`.trim()}
      min={1000}
      max={4000}
      value={stored(draft) === current ? draft : datePrefix(value, 4)}
      onChange={(event) => {
        const text = event.target.value;
        setDraft(text);
        const next = stored(text);
        if (next !== current) onChange(next || emptied(common.required === true, false));
      }}
    />
  );
}

interface GroupProps extends FieldProps {
  labelId: string;
  helpId: string | undefined;
}

/** fields/Radio.html: one label per option, and a clear button while a value is set. */
function RadioGroup({ defn, value, onChange, disabled, labelId, helpId }: GroupProps) {
  const name = useId();
  return (
    <>
      <span role="radiogroup" aria-labelledby={labelId} aria-describedby={helpId}>
        {fieldOptions(defn).map((option) => {
          const id = `${name}-${String(option.id)}`;
          const checked = String(value) === String(option.id) && hasValue(value);
          return (
            <label
              key={String(option.id)}
              htmlFor={id}
              className={
                defn.input_style ? `${defn.input_style}${checked ? " active" : ""}` : "radio-inline"
              }
            >
              <input
                id={id}
                className="crm-form-radio"
                type="radio"
                name={name}
                disabled={disabled}
                required={defn.required === true}
                checked={checked}
                onChange={() => {
                  onChange(option.id);
                }}
              />{" "}
              {option.label}
            </label>
          );
        })}
      </span>
      {!defn.required && !disabled && hasValue(value) && (
        <ClearButton
          onClear={() => {
            onChange(null);
          }}
        />
      )}
    </>
  );
}

/** fields/CheckBox.html for multi-value fields: a list of checkboxes. */
function CheckboxList({ defn, value, onChange, disabled, labelId, helpId }: GroupProps) {
  const name = useId();
  const selected: unknown[] = Array.isArray(value) ? value : [];
  // As CheckBox.html, each box is required while none is checked.
  const required = defn.required === true && selected.length === 0;
  return (
    <ul
      className={`crm-checkbox-list ${defn.input_style ?? ""}`.trim()}
      aria-labelledby={labelId}
      aria-describedby={helpId}
    >
      {fieldOptions(defn).map((option) => {
        const id = `${name}-${String(option.id)}`;
        return (
          <li key={String(option.id)}>
            <input
              id={id}
              type="checkbox"
              disabled={disabled}
              required={required}
              checked={selected.some((item) => String(item) === String(option.id))}
              onChange={(event) => {
                onChange(
                  event.target.checked
                    ? [...selected, option.id]
                    : selected.filter((item) => String(item) !== String(option.id)),
                );
              }}
            />
            <label htmlFor={id}>{option.label}</label>
          </li>
        );
      })}
    </ul>
  );
}
