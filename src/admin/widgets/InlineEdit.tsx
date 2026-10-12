import { useLayoutEffect, useRef } from "react";

interface InlineEditProps {
  value: string;
  onChange: (value: string) => void;
  /** Its accessible name. */
  label: string;
  /** Shown and taken when the text is emptied, as crm-ui-editable's default-value. */
  defaultValue?: string;
  placeholder?: string;
  className?: string;
}

/**
 * crm-ui-editable: text edited in place. Enter keeps the edit, Escape restores the text; the
 * value changes once, on leaving the text.
 */
export function InlineEdit({
  value,
  onChange,
  label,
  defaultValue = "",
  placeholder,
  className,
}: InlineEditProps) {
  const span = useRef<HTMLSpanElement>(null);
  const shown = value || defaultValue;

  useLayoutEffect(() => {
    const element = span.current;
    if (element && document.activeElement !== element) element.textContent = shown;
  }, [shown]);

  return (
    <span
      ref={span}
      className={className}
      crm-ui-editable=""
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      role="textbox"
      aria-label={label}
      tabIndex={0}
      data-placeholder={placeholder}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.textContent = shown;
          event.currentTarget.blur();
        }
      }}
      onBlur={(event) => {
        let text = event.currentTarget.textContent;
        if (!text) {
          text = defaultValue;
          event.currentTarget.textContent = text;
        }
        if (text !== value) onChange(text);
      }}
    />
  );
}
