import { useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { cellText } from "./cellText";
import type { InputProps } from "./EditableCell";

export type ListKind = "text" | "integer" | "float" | "date";

const items = (value: unknown): (string | number)[] =>
  Array.isArray(value)
    ? value.filter((item): item is string | number => typeof item !== "object" || item === null)
    : [];

/** The entered text as the list's next value, or nothing when the kind cannot take it. */
function parse(kind: ListKind, text: string): string | number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (kind === "integer" || kind === "float") {
    const number = Number(trimmed);
    if (Number.isNaN(number) || (kind === "integer" && !Number.isInteger(number))) return null;
    return number;
  }
  return trimmed;
}

/**
 * The multi-value text, number and date inputs of crmSearchInput (select2 tags with a comma
 * separator, crm-multi-select-date): each entry a chip, the input adds one with Enter or a
 * comma and keeps a date out twice.
 */
// deviation:inplace-list-chips
export function ListInput({
  kind,
  value,
  common,
  onChange,
}: Pick<InputProps, "value" | "common" | "onChange"> & { kind: ListKind }) {
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  // Parseable typed text already counts as the value's last entry, so every way of saving keeps it.
  const pending = kind === "date" ? null : parse(kind, text);
  const all = items(value);
  const list = pending !== null && all.at(-1) === pending ? all.slice(0, -1) : all;
  const emit = (entries: (string | number)[], typed: string) => {
    const next = kind === "date" ? null : parse(kind, typed);
    setText(typed);
    onChange(next === null ? entries : [...entries, next]);
  };
  const addDate = (entry: string | number | null) => {
    if (entry !== null && !list.includes(entry)) onChange([...list, entry]);
  };
  const removeAt = (index: number) => (event: KeyboardEvent | MouseEvent) => {
    if ("key" in event && event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    emit(
      list.filter((_, at) => at !== index),
      text,
    );
    input.current?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (kind !== "date" && (event.key === "Enter" || event.key === ",")) {
      // Enter with text adds it and stays with the input; without text it reaches the editor.
      if (text.trim() === "" && event.key === "Enter") return;
      event.preventDefault();
      if (pending !== null) setText("");
    } else if (event.key === "Backspace" && text === "" && list.length) {
      onChange(list.slice(0, -1));
    }
  };
  return (
    <div className="select2-container select2-container-multi form-control afreact-list-input">
      <ul className="select2-choices">
        {list.map((entry, index) => (
          <li key={`${String(index)}-${String(entry)}`} className="select2-search-choice">
            <div>{cellText(entry)}</div>
            <a
              role="button"
              tabIndex={0}
              className="select2-search-choice-close"
              aria-label={ts("Remove %1", { 1: cellText(entry) })}
              onClick={removeAt(index)}
              onKeyDown={removeAt(index)}
            />
          </li>
        ))}
        <li className="select2-search-field">
          <input
            {...common}
            ref={input}
            type={kind === "date" ? "date" : "text"}
            inputMode={kind === "integer" || kind === "float" ? "decimal" : undefined}
            pattern={
              kind === "integer" ? "-?\\d+" : kind === "float" ? "-?\\d*\\.?\\d+" : undefined
            }
            className="select2-input"
            required={common.required && list.length === 0}
            value={text}
            onChange={(event) => {
              if (kind === "date") addDate(parse(kind, event.target.value));
              else emit(list, event.target.value);
            }}
            onKeyDown={onKeyDown}
            onBlur={() => {
              if (pending !== null) setText("");
            }}
          />
        </li>
      </ul>
    </div>
  );
}
