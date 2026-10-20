import { useEffect, useState, type ChangeEvent, type InputHTMLAttributes } from "react";

type Attributes = Pick<
  InputHTMLAttributes<HTMLInputElement>,
  | "id"
  | "className"
  | "placeholder"
  | "title"
  | "required"
  | "disabled"
  | "pattern"
  | "autoComplete"
  | "aria-label"
  | "aria-describedby"
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
  rows = 2,
  ...attributes
}: Attributes & {
  value: string;
  onChange: (value: string) => void;
  live?: boolean;
  /** ngTrim: off for an input with `ng-trim="false"`. */
  trim?: boolean;
  /** A textarea, of two rows unless `rows` says otherwise. */
  multiline?: boolean;
  rows?: number;
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
  return multiline ? <textarea rows={rows} {...bound} /> : <input type="text" {...bound} />;
}
