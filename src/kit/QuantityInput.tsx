import { useState } from "react";
import { Select } from "./Select";

export type QuantityOp = ">=" | "<=" | "=";

/** How many: an operator and a whole number, `n` null while the box holds no whole number. */
export interface Quantity {
  op: QuantityOp;
  n: number | null;
}

interface QuantityInputProps {
  /** The number box's id; the operator's is `<id>-op`. */
  id: string;
  value: Quantity;
  /** `invalid` is true when the box holds text that is no whole number of 0 or more. */
  onChange: (value: Quantity, state: { invalid: boolean }) => void;
  /** Names the operator select, e.g. "How many". */
  operatorLabel: string;
  /** Names the number box, e.g. "Number of records". */
  numberLabel: string;
  /** Names both with sr-only labels, for a quantity inside a sentence. */
  hiddenLabel?: boolean;
  /** The operators' texts; "at least", "at most" and "exactly" by default. */
  operatorText?: Partial<Record<QuantityOp, string>>;
  /** Marks both inputs as invalid (`aria-invalid`); the box also marks itself while its text is invalid. */
  invalid?: boolean;
  /** The id of the text that describes both inputs, such as their error (`aria-describedby`). */
  describedBy?: string;
}

const OPS: QuantityOp[] = [">=", "<=", "="];
const isOp = (value: unknown): value is QuantityOp => OPS.some((op) => op === value);
const WHOLE = /^\d+$/;

/** An operator and a whole number of 0 or more; a box without one reports `n` null, never 0. */
export function QuantityInput({
  id,
  value,
  onChange,
  operatorLabel,
  numberLabel,
  hiddenLabel = false,
  operatorText = {},
  invalid,
  describedBy,
}: QuantityInputProps) {
  // What the box shows while `n` is null: an empty box or text that is no whole number.
  const [draft, setDraft] = useState({ text: "", invalid: false });
  const texts: Record<QuantityOp, string> = {
    ">=": operatorText[">="] ?? ts("at least"),
    "<=": operatorText["<="] ?? ts("at most"),
    "=": operatorText["="] ?? ts("exactly"),
  };
  const shown = value.n === null ? draft : { text: String(value.n), invalid: false };
  return (
    <span className="afreact-quantity">
      <Select
        id={`${id}-op`}
        label={operatorLabel}
        hiddenLabel={hiddenLabel}
        options={OPS.map((op) => ({ id: op, label: texts[op] }))}
        value={value.op}
        invalid={invalid}
        describedBy={describedBy}
        onChange={(op) => {
          if (isOp(op)) onChange({ ...value, op }, { invalid: shown.invalid });
        }}
      />
      <label htmlFor={id} className={hiddenLabel ? "sr-only" : undefined}>
        {numberLabel}
      </label>{" "}
      <input
        id={id}
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        className="form-control afreact-quantity-number"
        aria-invalid={invalid === true || shown.invalid ? true : undefined}
        aria-describedby={describedBy}
        value={shown.text}
        onChange={(event) => {
          const text = event.target.value;
          // A number box holds "" for text it cannot read, such as a lone "-".
          const bad = event.target.validity.badInput || (text !== "" && !WHOLE.test(text));
          const n = text !== "" && !bad ? Number(text) : null;
          setDraft({ text, invalid: bad });
          onChange({ ...value, n }, { invalid: bad });
        }}
      />
    </span>
  );
}
