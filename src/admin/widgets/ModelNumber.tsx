import { useState, type InputHTMLAttributes } from "react";

type Attributes = Pick<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "className" | "placeholder" | "aria-label"
>;

/**
 * A number input bound as core's `type="number"` ngModel binds one: emptied is null, a number
 * below `min` or off a whole `step` from it is undefined, and the typed text stays on show.
 */
export function ModelNumber({
  value,
  onChange,
  min,
  step,
  ...attributes
}: Attributes & {
  value: number | null | undefined;
  onChange: (value: number | null | undefined) => void;
  min?: number;
  step?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const valid = (number: number) =>
    Number.isFinite(number) &&
    (min === undefined || number >= min) &&
    (step === undefined || Number.isInteger((number - (min ?? 0)) / step));
  return (
    <input
      {...attributes}
      type="number"
      min={min}
      step={step}
      value={draft ?? value ?? ""}
      onChange={(event) => {
        const { value: text, valueAsNumber, validity } = event.target;
        setDraft(text);
        if (text === "" && !validity.badInput) onChange(null);
        else onChange(valid(valueAsNumber) ? valueAsNumber : undefined);
      }}
      onBlur={() => {
        setDraft(null);
      }}
    />
  );
}
