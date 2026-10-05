import type { ReactNode } from "react";
import { ClearButton, fromLocalDateTime, toLocalDateTime } from "../Field";
import type { FieldDefn, FieldOption } from "../types";

/** The input types whose afField templates have a `search_range` branch. */
export const RANGE_TYPES: ReadonlySet<string> = new Set([
  "Text",
  "Email",
  "Url",
  "Number",
  "Date",
  "Select",
]);

/** FormBuilder's "Choose Date Range" option of a date field shown as a select of relative dates. */
const CHOOSE_DATES = "{}";

type Bound = ">=" | "<=";
type Range = Partial<Record<Bound, unknown>>;

interface SearchRangeProps {
  id: string;
  labelId: string;
  defn: FieldDefn;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled: boolean;
}

const isRange = (value: unknown): value is Range =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function boundText(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

/**
 * The `search_range` branches of fields/Text, Email, Url, Number, Date and Select.html: a low
 * and a high input writing `{">=": …, "<=": …}`, each named "… from" and "… to".
 */
export function SearchRange({ id, labelId, defn, value, onChange, disabled }: SearchRangeProps) {
  const label = defn.label === false ? defn.name : (defn.label ?? defn.name);
  const attrs = defn.input_attrs ?? {};
  const range = isRange(value) ? value : {};
  const set = (bound: Bound, next: unknown) => {
    onChange({ ...range, [bound]: next });
  };
  const input = (bound: Bound) => {
    const first = bound === ">=";
    return {
      id: first ? id : `${id}2`,
      disabled,
      "aria-label": first ? ts("%1 from", { 1: label }) : ts("%1 to", { 1: label }),
    };
  };
  const pair = (render: (bound: Bound) => ReactNode) => (
    <div
      className={`form-inline ${defn.input_style ?? ""}`.trim()}
      role="group"
      aria-labelledby={labelId}
    >
      {render(">=")}{" "}
      <span className="af-field-range-sep" aria-hidden="true">
        -
      </span>{" "}
      {render("<=")}
    </div>
  );

  if (defn.input_type === "Select" && defn.is_date) {
    return <RelativeDate {...{ id, labelId, defn, value, onChange, disabled }} />;
  }
  if (defn.input_type === "Select") {
    const options = Array.isArray(defn.options) ? defn.options : [];
    return pair((bound) => (
      <span className="afreact-select">
        <select
          {...input(bound)}
          className="form-control"
          value={boundText(range[bound])}
          onChange={(event) => {
            set(bound, optionById(options, event.target.value));
          }}
        >
          <option value="">
            {bound === "<=" ? (attrs.placeholder2 ?? attrs.placeholder) : attrs.placeholder}
          </option>
          {options.map((option) => (
            <option key={String(option.id)} value={String(option.id)}>
              {option.label}
            </option>
          ))}
        </select>
      </span>
    ));
  }
  if (defn.input_type === "Date") {
    return pair((bound) => (
      <DateBound
        {...input(bound)}
        time={!!attrs.time}
        value={range[bound]}
        onChange={(next) => {
          set(bound, next);
        }}
      />
    ));
  }
  const numeric = defn.input_type === "Number";
  return pair((bound) => (
    <input
      {...input(bound)}
      className="form-control"
      type={numeric ? "number" : defn.input_type.toLowerCase()}
      step={numeric ? (attrs.step ?? 1) : undefined}
      min={numeric ? attrs.min : undefined}
      max={numeric ? attrs.max : undefined}
      placeholder={bound === "<=" ? attrs.placeholder2 : attrs.placeholder}
      value={boundText(range[bound])}
      onChange={(event) => {
        const text = event.target.value;
        // ngModel: an emptied number input is null, an emptied text input "".
        set(bound, numeric ? (text === "" ? null : Number(text)) : text);
      }}
    />
  ));
}

function optionById(options: FieldOption[], raw: string): FieldOption["id"] | null {
  return options.find((option) => String(option.id) === raw)?.id ?? null;
}

interface DateBoundProps {
  id: string;
  disabled: boolean;
  "aria-label": string;
  time: boolean;
  value: unknown;
  onChange: (value: string | null) => void;
}

/** One datepicker of fields/Date.html's range, in the markup of Field's Date input. */
function DateBound({ time, value, onChange, ...input }: DateBoundProps) {
  return (
    <span className="crm-form-date-wrapper">
      <input
        {...input}
        type={time ? "datetime-local" : "date"}
        className="form-control crm-form-text crm-form-date"
        value={time ? toLocalDateTime(value) : boundText(value)}
        onChange={(event) => {
          const text = event.target.value;
          onChange(time ? fromLocalDateTime(text) : text || null);
        }}
      />
      <ClearButton
        onClear={() => {
          onChange(null);
        }}
        hidden={!value || input.disabled}
      />
    </span>
  );
}

/**
 * A date field shown as a select of relative dates (AfformMetadataInjector): a choice is sent as
 * its name ("this.month"); "Choose Date Range" keeps an object and shows the two dates.
 */
function RelativeDate({ id, labelId, defn, value, onChange, disabled }: SearchRangeProps) {
  const options = Array.isArray(defn.options) ? defn.options : [];
  const chosen = isRange(value) ? CHOOSE_DATES : boundText(value);
  const title = ts("Select Value");
  return (
    <div className={`form-inline ${defn.input_style ?? ""}`.trim()}>
      <span className="afreact-select">
        <select
          id={id}
          title={title}
          // Without a label, the placeholder or else Select.html's title names the select.
          aria-label={defn.label === false ? (defn.input_attrs?.placeholder ?? title) : undefined}
          className="form-control"
          disabled={disabled}
          required={defn.required === true}
          value={chosen}
          onChange={(event) => {
            const next = event.target.value;
            if (next === CHOOSE_DATES) onChange(isRange(value) ? value : {});
            else onChange(next === "" ? null : next);
          }}
        >
          <option value="">{defn.input_attrs?.placeholder ?? ""}</option>
          {options.map((option) => (
            <option key={String(option.id)} value={String(option.id)}>
              {option.label}
            </option>
          ))}
        </select>
      </span>
      {chosen === CHOOSE_DATES && (
        <div className="form-group">
          <SearchRange
            id={`${id}-dates`}
            labelId={labelId}
            defn={{ ...defn, input_type: "Date", is_date: false, input_style: null }}
            value={value}
            onChange={onChange}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}
