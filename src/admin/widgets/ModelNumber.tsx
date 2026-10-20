import { useState, type InputHTMLAttributes } from "react";

type Attributes = Pick<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "className" | "placeholder" | "aria-label"
>;

/**
 * A number input bound as core's `type="number"` ngModel binds one: emptied is null, a number
 * below `min` or off a whole `step` from it is undefined, and the typed text stays on show, also
 * once the input is left.
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
  // The typed text, on show while the value is the one it made.
  const [draft, setDraft] = useState<{ text: string; at: number | null | undefined } | null>(null);
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
      value={draft && (draft.at ?? null) === (value ?? null) ? draft.text : (value ?? "")}
      onChange={(event) => {
        const { value: text, valueAsNumber, validity } = event.target;
        const next =
          text === "" && !validity.badInput
            ? null
            : valid(valueAsNumber)
              ? valueAsNumber
              : undefined;
        setDraft({ text, at: next });
        onChange(next);
      }}
    />
  );
}
