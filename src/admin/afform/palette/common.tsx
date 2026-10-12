import {
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { usePaletteItem } from "../canvas/dnd";
import type { PaletteItem } from "./lists";

/** One palette entry, dragged onto the canvas; a disabled one stays put, as core's `.disabled`. */
function PaletteEntry({
  item,
  entity,
  disabled,
}: {
  item: PaletteItem;
  entity: string | null;
  disabled: boolean;
}) {
  const drag = usePaletteItem(
    `${entity ?? ""}:${item.key}`,
    { kind: "new", node: item.node, entity, label: item.title },
    disabled,
  );
  return (
    <div className={disabled ? "disabled" : undefined}>
      <div
        ref={drag.ref}
        className={drag.dragging ? "af-gui-palette-item afreact-dragging" : "af-gui-palette-item"}
        {...drag.props}
        aria-disabled={disabled || undefined}
      >
        {item.title}
      </div>
    </div>
  );
}

/** A labelled list of palette entries; nothing where it is empty. */
export function PaletteList({
  label,
  items,
  entity,
  inUse,
}: {
  label: string;
  items: PaletteItem[];
  /** The data-entity the entries may be dropped into; null for anywhere. */
  entity: string | null;
  inUse?: (item: PaletteItem) => boolean;
}) {
  if (!items.length) return null;
  return (
    <div role="group" aria-label={label}>
      <span className="afreact-palette-label">{label}</span>
      {/* core's afGuiEditor.css indents and highlights the entries under [ui-sortable] */}
      <div ui-sortable="">
        {items.map((item) => (
          <PaletteEntry
            key={item.key}
            item={item}
            entity={entity}
            disabled={inUse?.(item) ?? false}
          />
        ))}
      </div>
    </div>
  );
}

/** The palette's search box beside its legend. */
export function PaletteSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
      }}
      className="form-control"
      type="search"
      placeholder="&#x1f50d;"
      title={ts("Search fields")}
      aria-label={ts("Search fields")}
    />
  );
}

/** The palette's add list: legend with search, then the lists. */
export function PaletteFieldset({
  legend,
  search,
  onSearch,
  children,
}: {
  legend: string;
  search: string;
  onSearch: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <fieldset className="af-gui-entity-palette">
      <legend className="form-inline">
        {legend} <PaletteSearch value={search} onChange={onSearch} />
      </legend>
      <div className="af-gui-entity-palette-select-list">{children}</div>
    </fieldset>
  );
}

/**
 * Core's debounceMode: typing is kept locally and committed after two idle seconds or on blur;
 * otherwise the input shows the value, so undo and redo reach it.
 */
export function useDebounced(value: string, commit: (value: string) => void) {
  const [draft, setDraft] = useState<{ text: string; pending: boolean } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(commit);
  useEffect(() => {
    latest.current = commit;
  });
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
    },
    [],
  );
  const flush = (text: string) => {
    window.clearTimeout(timer.current);
    setDraft(null);
    latest.current(text);
  };
  return {
    value: draft?.text ?? value,
    onChange: (text: string) => {
      setDraft({ text, pending: true });
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        flush(text);
      }, 2000);
    },
    /** Commits the typing, or `replace` in its place; shows the value again. */
    onBlur: (replace?: string) => {
      if (draft?.pending) flush(replace ?? draft.text);
      else setDraft(null);
    },
    /** Shows `text` without committing it. */
    show: (text: string) => {
      setDraft({ text, pending: false });
    },
  };
}

/** A text input in core's debounceMode. */
export function DebouncedInput({
  value,
  onCommit,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "onBlur"> & {
  value: string;
  onCommit: (value: string) => void;
}) {
  const field = useDebounced(value, onCommit);
  return (
    <input
      {...props}
      value={field.value}
      onChange={(event) => {
        field.onChange(event.target.value);
      }}
      onBlur={() => {
        field.onBlur();
      }}
    />
  );
}

/** A textarea in core's debounceMode. */
export function DebouncedTextarea({
  value,
  onCommit,
  ...props
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange" | "onBlur"> & {
  value: string;
  onCommit: (value: string) => void;
}) {
  const field = useDebounced(value, onCommit);
  return (
    <textarea
      {...props}
      value={field.value}
      onChange={(event) => {
        field.onChange(event.target.value);
      }}
      onBlur={() => {
        field.onBlur();
      }}
    />
  );
}

/** crm-ui-help's link, whose "?" the theme's `helpicon` draws, opening the FormBuilder's help. */
export function HelpLink({ id, title }: { id: string; title: string }) {
  return (
    <a
      href="#"
      className="helpicon"
      title={ts("%1 Help", { 1: title })}
      aria-label={ts("%1 Help", { 1: title })}
      onClick={(event) => {
        event.preventDefault();
        window.CRM.help?.(title, { id, file: "CRM/AfformAdmin/afformBuilder" });
      }}
    />
  );
}
