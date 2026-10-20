import { useEffect, useState, type ChangeEvent, type InputHTMLAttributes } from "react";

type Attributes = Pick<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "className" | "placeholder" | "title" | "required" | "pattern" | "aria-describedby"
>;

/**
 * A text input bound as core's ngModel binds one: the typed text stays on show, and the value
 * takes it, trimmed unless `trim` is off, on leaving the input or, `live`, with every keystroke.
 * Text not yet taken makes unloading the page ask first, as closing a tab leaves no blur.
 */
export function ModelText({
  value,
  onChange,
  live = false,
  trim = true,
  multiline = false,
  ...attributes
}: Attributes & {
  value: string;
  onChange: (value: string) => void;
  live?: boolean;
  /** ngTrim: off for an input with `ng-trim="false"`. */
  trim?: boolean;
  /** A two-row textarea. */
  multiline?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const parse = (text: string) => (trim ? text.trim() : text);
  const pending = draft !== null && parse(draft) !== value;
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (pending) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
    };
  }, [pending]);
  const bound = {
    ...attributes,
    value: draft ?? value,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const text = event.target.value;
      setDraft(text);
      if (live && parse(text) !== value) onChange(parse(text));
    },
    onBlur: () => {
      if (pending) onChange(parse(draft));
      setDraft(null);
    },
  };
  return multiline ? <textarea rows={2} {...bound} /> : <input type="text" {...bound} />;
}
