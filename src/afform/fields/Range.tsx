import { useEffect, useRef } from "react";
import type { FieldDefn } from "../types";
import { useInvalid } from "./env";

interface RangeProps {
  id: string;
  defn: FieldDefn;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled: boolean;
  describedBy: string | undefined;
}

/**
 * The value ngModel's range input holds: a stored number, else the position the browser shows,
 * the middle of min and max (defaults 0 and 100) on the nearest step, the higher one on a tie.
 */
export function rangeValue(defn: FieldDefn, value: unknown): number {
  const stored = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof stored === "number" && !Number.isNaN(stored)) return stored;
  const attrs = defn.input_attrs ?? {};
  const min = Number(attrs.min ?? 0);
  const max = Number(attrs.max ?? 100);
  const step = Number(attrs.step ?? 1);
  if (max < min) return min;
  const middle = min + Math.round((max - min) / 2 / step) * step;
  return middle > max ? middle - step : middle;
}

/**
 * fields/Range.html: a slider over the field's options, with the chosen option's label beside
 * it; the server sets min, max and step from the option ids (AfformMetadataInjector).
 * deviation:range-slider-disabled
 */
export function Range({ id, defn, value, onChange, disabled, describedBy }: RangeProps) {
  const invalid = useInvalid(id);
  const input = useRef<HTMLInputElement>(null);
  const options = Array.isArray(defn.options) ? defn.options : [];
  const attrs = defn.input_attrs ?? {};
  const shown = typeof value === "number" || typeof value === "string" ? String(value) : "";
  const label = options.find((option) => String(option.id) === shown)?.label;

  // A search filter, which nothing initialises, filters by the position the browser shows.
  useEffect(() => {
    if (typeof value !== "number" && input.current) onChange(Number(input.current.value));
  }, [value, onChange]);

  return (
    <>
      <label className="crm-af-field-label">
        <input
          ref={input}
          type="range"
          id={id}
          name={defn.name}
          step={attrs.step ?? 1}
          min={attrs.min}
          max={attrs.max}
          list={`${id}-list`}
          disabled={disabled}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          aria-valuetext={label}
          value={shown}
          onChange={(event) => {
            onChange(Number(event.target.value));
          }}
        />
        {/* Already the slider's value text; read once. */}
        <span aria-hidden="true">{options.length ? label : shown}</span>
      </label>
      <datalist id={`${id}-list`}>
        {options.map((option) => (
          <option key={String(option.id)} value={String(option.id)} />
        ))}
      </datalist>
    </>
  );
}
