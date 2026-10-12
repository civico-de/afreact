import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";

interface IconList {
  icons: string[];
  aliases: Record<string, string[]>;
}

/** The icon classes of core's Font Awesome stylesheet, read as jquery.crmIconPicker does. */
export function parseIcons(css: string): IconList {
  const icons: string[] = [];
  const aliases: Record<string, string[]> = {};
  let prev: string | undefined;
  let last: string | undefined;
  for (const match of css.matchAll(/\.(fa-[-a-zA-Z0-9]+):+before\s*\{\s*content:\s*"([^"]+)"/g)) {
    const [, name = "", content] = match;
    if (content !== prev) {
      icons.push(name);
      last = name;
    } else if (last) (aliases[last] ??= []).push(name.replace(/-/g, ""));
    prev = content;
  }
  return { icons, aliases };
}

export function matchIcons(list: IconList, search: string): string[] {
  const term = search.replace(/-/g, "").toLowerCase();
  if (!term) return list.icons;
  return list.icons.filter(
    (icon) =>
      icon.replace(/-/g, "").includes(term) ||
      (list.aliases[icon] ?? []).some((alias) => alias.includes(term)),
  );
}

const transforms = (): Record<string, string> => ({
  "fa-rotate-90": ts("Rotate right"),
  "fa-rotate-270": ts("Rotate left"),
  "fa-rotate-180": ts("Rotate 180"),
  "fa-flip-horizontal": ts("Flip horizontal"),
  "fa-flip-vertical": ts("Flip vertical"),
});

function useIcons(enabled: boolean) {
  return useQuery({
    queryKey: ["afreact-admin", "icons"],
    queryFn: async () => {
      const base = window.CRM.config?.resourceBase;
      if (!base) throw new Error("CRM.config.resourceBase is not set.");
      const response = await fetch(`${base}bower_components/font-awesome/css/all.css`);
      if (!response.ok) throw new Error(`Icons: HTTP ${String(response.status)}`);
      return parseIcons(await response.text());
    },
    enabled,
    staleTime: Infinity,
  });
}

interface IconPickerProps {
  /** The icon class with an optional transform, e.g. "fa-star fa-rotate-90". */
  value: string;
  onChange: (value: string) => void;
  label: string;
  required?: boolean;
}

/** crm-ui-icon-picker: a button naming the icon, opening a searchable grid of all icons. */
export function IconPicker({ value, onChange, label, required = false }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [icon = "", transform = ""] = value.replace(/^(crm-i|fa) /, "").split(" ");
  return (
    <span className="afreact-icon-picker">
      <button
        type="button"
        className="btn btn-sm btn-default"
        aria-label={`${label}: ${icon || ts("None")}`}
        onClick={() => {
          setOpen(true);
        }}
      >
        <i className={`crm-i ${icon || "fa-"} ${transform}`} role="img" aria-hidden="true" />{" "}
        {icon || ts("None")}
      </button>
      {open && (
        <IconDialog
          label={label}
          transform={transform}
          required={required}
          onPick={(next) => {
            setOpen(false);
            onChange(next);
          }}
          onCancel={() => {
            setOpen(false);
          }}
        />
      )}
    </span>
  );
}

interface IconDialogProps {
  label: string;
  transform: string;
  required: boolean;
  onPick: (value: string) => void;
  onCancel: () => void;
}

export function IconDialog({
  label,
  transform: initial,
  required,
  onPick,
  onCancel,
}: IconDialogProps) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [search, setSearch] = useState("");
  const [transform, setTransform] = useState(initial);
  const icons = useIcons(true);
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  });
  const matches = icons.data ? matchIcons(icons.data, search) : [];
  return (
    <dialog
      ref={dialog}
      className="afreact-dialog afreact-dialog-wide"
      aria-labelledby={`${id}-title`}
      onClose={onCancel}
    >
      <h2 id={`${id}-title`} className="afreact-dialog-title">
        {label}
      </h2>
      <div className="afreact-dialog-body">
        <div className="form-inline">
          <label htmlFor={`${id}-search`} className="sr-only">
            {ts("Search icons")}
          </label>
          <input
            id={`${id}-search`}
            type="search"
            className="form-control"
            placeholder={ts("Search icons")}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />{" "}
          <label htmlFor={`${id}-transform`} className="sr-only">
            {ts("Transform")}
          </label>
          <select
            id={`${id}-transform`}
            className="form-control"
            value={transform}
            onChange={(event) => {
              setTransform(event.target.value);
            }}
          >
            <option value="">{ts("Normal")}</option>
            {Object.entries(transforms()).map(([key, text]) => (
              <option key={key} value={key}>
                {text}
              </option>
            ))}
          </select>{" "}
          {!required && (
            <button
              type="button"
              className="btn btn-sm btn-default"
              onClick={() => {
                onPick("");
              }}
            >
              <i className="crm-i fa-ban" role="img" aria-hidden="true" /> {ts("No icon")}
            </button>
          )}
        </div>
        {icons.error && (
          <p className="crm-error" role="alert">
            {icons.error.message}
          </p>
        )}
        <p className="sr-only" role="status">
          {icons.data ? ts("%1 icons", { 1: matches.length }) : ts("Loading…")}
        </p>
        <div className="afreact-icon-grid">
          {matches.map((name) => (
            <button
              key={name}
              type="button"
              className="btn btn-default"
              title={name}
              aria-label={name}
              onClick={() => {
                onPick(transform ? `${name} ${transform}` : name);
              }}
            >
              <i className={`crm-i ${name} ${transform}`} role="img" aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
      <div className="afreact-dialog-buttons">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          {ts("Cancel")}
        </button>
      </div>
    </dialog>
  );
}
