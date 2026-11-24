import { FieldErrorsContext, useInvalid } from "./fields/env";
import { useContext, useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { onButtonKey } from "../keys";
import { ChainSelect } from "./fields/ChainSelect";
import { CheckoutBlock } from "./fields/CheckoutBlock";
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
import { fromLocalDateTime, showsTime, toLocalDateTime } from "./fields/dateTime";

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
  minlength: number | undefined,
  onChange: (value: unknown) => void,
) {
  const model = enabled ? textValue(value) : "";
  const [shown, setShown] = useState(model);
  if (shown.trim() !== model.trim()) setShown(model);
  const blank = shown !== "" && shown.trim() === "";
  const trimmedLength = shown.trim().length;
  const short = !!minlength && trimmedLength > 0 && trimmedLength < minlength;
  return {
    value: shown,
    onChange: (event: { target: { value: string } }) => {
      const text = event.target.value;
      setShown(text);
      // deviation:search-filter-minlength
      onChange(text.trim() === "" ? emptied(required, false) : text.trim());
    },
    // deviation:blank-required-validity
    // The browser checks the raw text; ngModel's required and minlength see the trimmed one.
    ref: (node: HTMLInputElement | HTMLTextAreaElement | null) => {
      const tooShort = ts("Enter at least %1 characters.", { 1: minlength });
      const message = required && blank ? ts("This field is required.") : short ? tooShort : "";
      node?.setCustomValidity(message);
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
  "CheckoutBlock",
]);

function noteLabel(defn: FieldDefn): string {
  return defn.label === false ? defn.name : (defn.label ?? defn.name);
}

export function inputTypeNote(defn: FieldDefn): string {
  return `field type ${defn.input_type} (${noteLabel(defn)})`;
}

/** The template core registers for an input type; CheckoutBlock's comes from civi_contribute. */
function ownTemplate(type: string): string {
  return type === "CheckoutBlock"
    ? "~/afCheckout/inputType/CheckoutBlock.html"
    : `~/af/fields/${type}.html`;
}

/** afField ng-includes defn.template; one other than the input type's own is Angular markup. */
export function templateNote(defn: FieldDefn): string | null {
  if (defn.template === undefined || defn.template === ownTemplate(defn.input_type)) return null;
  return `field template ${String(defn.template)} (${noteLabel(defn)})`;
}

/** The classes afField adds to its element: af-field-type-<kebab input type>, plus -multiple. */
export function fieldClasses(defn: FieldDefn): string {
  const type = `af-field-type-${defn.input_type.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}`;
  return defn.input_attrs?.multiple ? `${type} af-field-type-multiple` : type;
}

/** afField's getSetSelect(): a chosen option is typed by the field's data type, not the option ID. */
function selectValue(defn: FieldDefn, raw: string): string | number | boolean {
  if (defn.data_type === "Boolean") return raw === "true";
  if (defn.data_type === "Integer" || defn.data_type === "Float") return Number(raw);
  return raw;
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

/** crm.datepicker.js: "yy" is a year input, any other format without a day a month picker. */
// deviation:native-date-inputs
function dateFormatKind(format: boolean | string | undefined): "year" | "month" | "date" {
  if (format === "yy") return "year";
  return typeof format === "string" && !format.toLowerCase().includes("d") ? "month" : "date";
}

/** The year, month or day ("1990-05-17") of a stored date or datetime, or "" for anything else. */
function datePrefix(value: unknown, length: 4 | 7 | 10): string {
  const match = typeof value === "string" ? /^\d{4}-\d{2}(-\d{2})?/.exec(value) : null;
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
// deviation:clear-link-button
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
  const errorId = `${id}-error`;
  const label = defn.label === false ? undefined : (defn.label ?? defn.name);
  const required = defn.required === true;
  // deviation:field-error-text
  // A field with error text is also marked aria-invalid.
  const error = useContext(FieldErrorsContext).get(id);
  const invalid = useInvalid(id);
  const describedBy =
    [error !== undefined && errorId, defn.help_post && helpId].filter(Boolean).join(" ") ||
    undefined;
  // deviation:url-input-disabled
  const common = {
    id,
    name: defn.name,
    disabled,
    required,
    "aria-invalid": invalid,
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
  const labelsGroup =
    grouped || ranged || defn.input_type === "Location" || defn.input_type === "CheckoutBlock";

  const trimmed = useTrimmedText(
    !ranged && (defn.input_type === "Text" || defn.input_type === "TextArea"),
    value,
    required,
    defn.input_attrs?.minlength,
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
      // deviation:number-bound-zero
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
          step={
            numeric
              ? (attrs.step ??
                (defn.data_type === "Float" || defn.data_type === "Money" ? "any" : 1))
              : undefined
          }
          onChange={(event) => {
            // deviation:invalid-input-kept
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
                // deviation:textarea-count-describes
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
        const time = showsTime(attrs.time, defn.data_type);
        const kind = time ? "date" : dateFormatKind(attrs.date);
        return (
          <span className="crm-form-date-wrapper">
            {kind === "year" && (
              <YearInput
                common={{ ...common, placeholder: attrs.placeholder }}
                style={style}
                value={value}
                onChange={onChange}
              />
            )}
            {kind === "month" && (
              <input
                {...common}
                type="month"
                className="form-control crm-form-text crm-form-date"
                placeholder={attrs.placeholder}
                value={datePrefix(value, 7)}
                onChange={(event) => {
                  const month = event.target.value;
                  // deviation:month-date-any-format
                  // A browser without a month picker hands over text, stored only as yyyy-mm.
                  event.target.setCustomValidity(
                    month && !/^\d{4}-\d{2}$/.test(month) ? ts("Enter a month as yyyy-mm.") : "",
                  );
                  onChange(/^\d{4}-\d{2}$/.test(month) ? `${month}-01` : emptied(required, false));
                }}
              />
            )}
            {kind === "date" && time && (
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
            {kind === "date" && !time && (
              <input
                {...common}
                type="date"
                className="form-control crm-form-text crm-form-date"
                // The datepicker shows the date part of a datetime.
                value={datePrefix(value, 10)}
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
        // deviation:native-select-fields
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
                        selectValue(defn, option.value),
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
                  value={textValue(
                    defn.data_type === "Boolean"
                      ? value === 1 || value === "1" || value === "true"
                        ? true
                        : value === 0 || value === "0" || value === "false"
                          ? false
                          : value
                      : value,
                  )}
                  onChange={(event) => {
                    onChange(
                      // deviation:boolean-select-cleared-null
                      event.target.value === "" ? null : selectValue(defn, event.target.value),
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
            labelId={label ? labelId : undefined}
            helpId={describedBy}
            invalid={invalid}
          />
        );
      case "CheckBox":
        return grouped ? (
          <CheckboxList
            defn={defn}
            value={value}
            onChange={onChange}
            disabled={disabled}
            labelId={label ? labelId : undefined}
            helpId={describedBy}
            invalid={invalid}
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
        return (
          <Location
            {...{ id, labelId, value, onChange, disabled, describedBy }}
            required={defn.required === true}
          />
        );
      case "CheckoutBlock":
        return (
          <CheckoutBlock
            {...{ value, onChange, disabled, describedBy }}
            labelId={label ? labelId : undefined}
          />
        );
      default:
        return null;
    }
  })();

  const note = control === null ? inputTypeNote(defn) : templateNote(defn);
  if (note !== null) return <Unsupported what={note} />;
  return (
    <>
      {label && !booleanCheckbox && (
        <label
          className="crm-af-field-label"
          id={labelsGroup ? labelId : undefined}
          htmlFor={grouped || defn.input_type === "CheckoutBlock" ? undefined : id}
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
          <div className="crm-af-field" data-afreact-field={id}>
            {control}
          </div>
        </div>
      ) : (
        <div className="crm-af-field" data-afreact-field={id}>
          {control}
        </div>
      )}
      {error !== undefined && (
        <p id={errorId} className="afreact-field-error">
          {error}
        </p>
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
  const current = typeof value === "string" ? value : "";
  return (
    <input
      {...common}
      type="number"
      className={`form-control crm-form-number ${style ?? ""}`.trim()}
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
  labelId: string | undefined;
  helpId: string | undefined;
  invalid?: true;
}

/**
 * fields/Radio.html: one label per option, and a clear button while a value is set. The radios
 * form a group named by the field's label. deviation:radio-group-named
 */
function RadioGroup({ defn, value, onChange, disabled, labelId, helpId, invalid }: GroupProps) {
  const name = useId();
  return (
    <>
      <span
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={helpId}
        aria-invalid={invalid}
      >
        {fieldOptions(defn).map((option) => {
          const id = `${name}-${String(option.id)}`;
          const normalized =
            defn.data_type === "Boolean"
              ? value === 1 || value === "1" || value === "true"
                ? true
                : value === 0 || value === "0" || value === "false"
                  ? false
                  : value
              : value;
          const checked = String(normalized) === String(option.id) && hasValue(normalized);
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
function CheckboxList({ defn, value, onChange, disabled, labelId, helpId, invalid }: GroupProps) {
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
              aria-invalid={invalid}
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
