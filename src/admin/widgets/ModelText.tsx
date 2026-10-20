import { useState, type ChangeEvent, type InputHTMLAttributes } from "react";

type Attributes = Pick<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "className" | "placeholder" | "title" | "required" | "pattern" | "aria-describedby"
>;

/**
 * A text input bound as core's ngModel binds one: the typed text stays on show, and the value
 * takes it on leaving the input or, `live`, with every keystroke.
 */
export function ModelText({
  value,
  onChange,
  live = false,
  multiline = false,
  ...attributes
}: Attributes & {
  value: string;
  onChange: (value: string) => void;
  live?: boolean;
  /** A two-row textarea. */
  multiline?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const bound = {
    ...attributes,
    value: draft ?? value,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const text = event.target.value;
      setDraft(text);
      if (live && text !== value) onChange(text);
    },
    onBlur: () => {
      if (draft !== null && draft !== value) onChange(draft);
      setDraft(null);
    },
  };
  return multiline ? <textarea rows={2} {...bound} /> : <input type="text" {...bound} />;
}
