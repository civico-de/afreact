import { useQuery } from "@tanstack/react-query";
import {
  createElement,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { api4, errorMessage } from "../api/civi";
import { cellText } from "./Cell";
import { EntityRefInput } from "./EntityRefInput";
import { ListInput } from "./ListInput";
import {
  editorFor,
  initialValue,
  isChanged,
  isNullable,
  type CellTarget,
  type EditorKind,
  type InlineEdit,
} from "./inlineEdit";
import type { Column, DisplaySettings, EditableInfo, EditOption, Row } from "./types";

interface EditableCellProps {
  edit: InlineEdit | null;
  row: Row;
  column: Column | undefined;
  colIndex: number;
  settings: DisplaySettings;
  /** The cell as shown read-only. */
  children: ReactNode;
}

/** The class the cell's <td> takes while its editor is open. */
export function editingClass(edit: InlineEdit | null, target: CellTarget): string {
  return edit?.isEditing(target) ? "crm-search-field-editing" : "";
}

/** A name for the row in the editor's label: its first other field with a value. */
export function rowLabel(row: Row, settings: DisplaySettings, colIndex: number): string {
  for (const [index, column] of settings.columns.entries()) {
    if (index === colIndex || column.type !== "field") continue;
    const value = row.columns[index]?.val;
    const text = Array.isArray(value) ? value.map(cellText).join(", ") : cellText(value);
    if (text) return text;
  }
  return ts("ID %1", { 1: row.key });
}

/** colType/editable.html: a cell the server marked editable opens an editor on activation. */
export function EditableCell(props: EditableCellProps) {
  const { edit, row, column, colIndex, settings, children } = props;
  const key = column?.key;
  const info = edit && key && row.columns[colIndex]?.edit ? edit.editable[key] : undefined;
  if (!edit || !key || !info) return children;
  const editor = editorFor(info);
  if ("unsupported" in editor) return children;
  const label = column.label || `[${key}]`;
  return (
    <EditableValue
      edit={edit}
      row={row}
      colKey={key}
      colIndex={colIndex}
      info={info}
      kind={editor.kind}
      multiple={editor.multiple}
      columnLabel={label}
      rowLabel={rowLabel(row, settings, colIndex)}
    >
      {children}
    </EditableValue>
  );
}

interface EditableValueProps {
  edit: InlineEdit;
  row: Row;
  colKey: string;
  colIndex: number;
  info: EditableInfo;
  kind: EditorKind;
  multiple: boolean;
  columnLabel: string;
  rowLabel: string;
  children: ReactNode;
}

/** Keys that open the editor; F2 as in spreadsheets, Enter and Space as on a button. */
const OPEN_KEYS = new Set(["Enter", " ", "F2"]);

function EditableValue(props: EditableValueProps) {
  const { edit, row, colIndex, columnLabel, children } = props;
  const target = { rowKey: row.key, colIndex };
  const control = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    // Only a focus the closed editor dropped comes back; one the user moved on stays.
    const dropped = !document.activeElement || document.activeElement === document.body;
    if (edit.takeFocus(target) && dropped) control.current?.focus();
  });
  if (edit.isSaving(target)) return <span className="crm-search-loading-placeholder" />;
  if (edit.isEditing(target)) return <CellEditor {...props} />;
  const start = () => {
    edit.start(target);
  };
  return (
    <span
      ref={control}
      className={edit.editing ? "crm-editable-disabled" : "crm-editable-enabled"}
      role="button"
      aria-disabled={edit.editing ? true : undefined}
      tabIndex={0}
      onClick={start}
      onKeyDown={(event) => {
        if (!OPEN_KEYS.has(event.key)) return;
        event.preventDefault();
        start();
      }}
    >
      <span className="sr-only">{ts("Edit %1", { 1: columnLabel })}</span> {children}
    </span>
  );
}

/** crmSearchDisplayEditable.html: the input crmSearchInput picks, with save and cancel buttons. */
function CellEditor({
  edit,
  row,
  colKey,
  colIndex,
  info,
  kind,
  multiple,
  columnLabel,
  rowLabel,
}: EditableValueProps) {
  const initial = initialValue(row, info);
  const failed = edit.editing?.error;
  const [value, setValue] = useState(() => (failed ? edit.editing?.value : initial));
  const form = useRef<HTMLFormElement>(null);
  const closed = useRef(false);
  const id = useId();
  useEffect(() => {
    const first = (selector: string) => form.current?.querySelector<HTMLElement>(selector);
    // Options still loading leave no input to focus; a button keeps Escape and blur working.
    const input = first("input:checked") ?? first("input, select:enabled, textarea");
    (input ?? first("button"))?.focus();
  }, []);

  const finish = (save: boolean) => {
    closed.current = true;
    if (save) edit.save(row, colIndex, colKey, value);
    else edit.cancel();
  };
  const commit = () => {
    if (!isChanged(value, initial)) finish(false);
    else if (form.current?.reportValidity() !== false) finish(true);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    const target = event.target;
    // An open autocomplete list takes Escape; an input that handled Enter keeps it (pick, chip).
    if (event.key === "Escape" && !listOpen(target)) {
      event.preventDefault();
      finish(false);
    }
    if (
      event.key === "Enter" &&
      !event.defaultPrevented &&
      !(target instanceof HTMLTextAreaElement || target instanceof HTMLButtonElement)
    ) {
      event.preventDefault();
      commit();
    }
  };
  // Leaving the editor saves a valid change; switching windows leaves it open.
  const onBlur = (event: FocusEvent<HTMLFormElement>) => {
    const next = event.relatedTarget;
    if (closed.current || (next instanceof Node && form.current?.contains(next))) return;
    if (!document.hasFocus()) return;
    if (!isChanged(value, initial)) finish(false);
    else if (form.current?.checkValidity()) finish(true);
  };

  const nullable = isNullable(row, info);
  const inputId = `${id}-input`;
  const errorId = `${id}-error`;
  const common = {
    id: inputId,
    required: !nullable,
    "aria-invalid": failed ? true : undefined,
    "aria-describedby": failed ? errorId : undefined,
  };
  const label = ts("%1, %2", { 1: columnLabel, 2: rowLabel });
  // Keeps the focus in the input, so a click on the buttons does not count as leaving.
  const keepFocus = (event: { preventDefault: () => void }) => {
    event.preventDefault();
  };
  return createElement(
    "crm-search-display-editable",
    null,
    <form ref={form} noValidate onKeyDown={onKeyDown} onBlur={onBlur} onSubmit={keepFocus}>
      <div className="form-inline crm-search-display-editable-editing">
        <div className="form-group">
          <label className="sr-only" id={`${id}-label`} htmlFor={inputId}>
            {label}
          </label>
          <Input
            kind={kind}
            multiple={multiple}
            info={info}
            row={row}
            value={value}
            nullable={nullable}
            labelId={`${id}-label`}
            common={common}
            focusWhenLoaded
            onChange={setValue}
          />
        </div>
      </div>
      {failed && (
        <p id={errorId} className="alert alert-danger">
          {failed}
        </p>
      )}
      <div className="form-inline crm-search-display-editable-buttons">
        <button
          type="submit"
          className="btn btn-xs btn-success"
          onMouseDown={keepFocus}
          onClick={commit}
        >
          <span className="sr-only">{ts("Save")}</span>
          <i className="crm-i fa-check" role="img" aria-hidden="true" />
        </button>{" "}
        <button
          type="button"
          className="btn btn-xs btn-danger"
          onMouseDown={keepFocus}
          onClick={() => {
            finish(false);
          }}
        >
          <span className="sr-only">{ts("Cancel")}</span>
          <i className="crm-i fa-times" role="img" aria-hidden="true" />
        </button>
      </div>
    </form>,
  );
}

/** Whether the key went to a combobox input with its list open. */
export const listOpen = (target: EventTarget | null) =>
  target instanceof Element && target.getAttribute("aria-expanded") === "true";

export interface InputProps {
  kind: EditorKind;
  multiple: boolean;
  info: EditableInfo;
  row: Row;
  value: unknown;
  nullable: boolean;
  labelId: string;
  common: {
    id: string;
    required: boolean;
    "aria-invalid": boolean | undefined;
    "aria-describedby": string | undefined;
  };
  /** Options that load after the input opened take the focus when they arrive. */
  focusWhenLoaded?: boolean;
  onChange: (value: unknown) => void;
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : cellText(value);
}

/** "2026-09-29 14:30:00" <-> "2026-09-29T14:30" for datetime-local inputs. */
const toLocalDateTime = (value: unknown) => text(value).replace(" ", "T").slice(0, 16);
const fromLocalDateTime = (value: string) => (value ? `${value.replace("T", " ")}:00` : null);

/** The input crmSearchInput shows for a field: in a cell, and in the update task's dialog. */
export function Input(props: InputProps) {
  const { kind, value, nullable, common, onChange } = props;
  if (
    props.multiple &&
    (kind === "text" || kind === "integer" || kind === "float" || kind === "date")
  )
    return <ListInput {...props} kind={kind} />;
  // An emptied input clears the value where the record allows it; otherwise `required` holds.
  const typed = (next: string) => {
    onChange(next === "" && nullable ? null : next);
  };
  const number = (next: string) => {
    onChange(next === "" ? null : Number(next));
  };
  switch (kind) {
    case "text":
    case "email":
      return (
        <input
          {...common}
          type={kind}
          className="form-control"
          value={text(value)}
          onChange={(event) => {
            typed(event.target.value);
          }}
        />
      );
    case "integer":
    case "float":
      return (
        <input
          {...common}
          type="number"
          step={kind === "integer" ? 1 : "any"}
          className="form-control"
          value={text(value)}
          onChange={(event) => {
            number(event.target.value);
          }}
        />
      );
    case "textarea":
      return (
        <textarea
          {...common}
          className="form-control"
          value={text(value)}
          onChange={(event) => {
            typed(event.target.value);
          }}
        />
      );
    case "date":
      return (
        <input
          {...common}
          type="date"
          className="form-control"
          value={text(value).slice(0, 10)}
          onChange={(event) => {
            onChange(event.target.value || null);
          }}
        />
      );
    case "datetime":
      return (
        <input
          {...common}
          type="datetime-local"
          className="form-control"
          value={toLocalDateTime(value)}
          onChange={(event) => {
            onChange(fromLocalDateTime(event.target.value));
          }}
        />
      );
    case "color":
      return (
        <>
          <input
            {...common}
            type="color"
            value={text(value) || "#000000"}
            onChange={(event) => {
              onChange(event.target.value);
            }}
          />
          <input
            type="text"
            className="form-control"
            aria-labelledby={props.labelId}
            placeholder="#rrggbb"
            pattern="^#[0-9a-fA-F]{6}$"
            required={common.required}
            value={text(value)}
            onChange={(event) => {
              typed(event.target.value);
            }}
          />
        </>
      );
    case "boolean":
      return <BooleanInput {...props} />;
    case "select":
      return props.info.options === true ? <LoadedSelect {...props} /> : <Select {...props} />;
    case "entityref":
      return <EntityRefInput {...props} />;
  }
}

/** boolean.html: Yes and No, without a way back to empty, as in core; a list takes both. */
function BooleanInput({ value, labelId, common, onChange, multiple }: InputProps) {
  const name = useId();
  const choices: [boolean, string][] = [
    [true, ts("Yes")],
    [false, ts("No")],
  ];
  if (multiple) {
    const chosen = Array.isArray(value) ? value.filter((v) => typeof v === "boolean") : [];
    return (
      <div className="form-group" role="group" aria-labelledby={labelId}>
        {choices.map(([choice, text]) => (
          <label key={text} className="checkbox-inline">
            <input
              type="checkbox"
              checked={chosen.includes(choice)}
              onChange={(event) => {
                const rest = chosen.filter((v) => v !== choice);
                onChange(event.target.checked ? [...rest, choice] : rest);
              }}
            />{" "}
            {text}
          </label>
        ))}
      </div>
    );
  }
  return (
    <div
      className="form-group"
      role="radiogroup"
      aria-labelledby={labelId}
      aria-describedby={common["aria-describedby"]}
    >
      {choices.map(([choice, text]) => (
        <label key={text} className="radio-inline">
          <input
            type="radio"
            name={name}
            required={common.required}
            checked={value === choice}
            onChange={() => {
              onChange(choice);
            }}
          />{" "}
          {text}
        </label>
      ))}
    </div>
  );
}

/** Options that depend on the row's other values, as crmSearchDisplayEditable.loadOptions(). */
function LoadedSelect(props: InputProps) {
  const { info, row } = props;
  const loaded = useQuery({
    queryKey: ["SearchDisplay", "editOptions", info.entity, info.value_key, row.key],
    queryFn: async () => {
      const [field] = await api4<{ options?: EditOption[] | false }>(info.entity, "getFields", {
        action: "update",
        select: ["options"],
        values: row.data,
        loadOptions: ["id", "name", "label", "description", "color", "icon"],
        where: [["name", "=", info.value_key]],
      });
      return field?.options || [];
    },
    // The options follow the row's values, so each opening loads them, as in core.
    gcTime: 0,
  });
  if (loaded.error)
    return (
      <p className="alert alert-danger" role="alert">
        {errorMessage(loaded.error)}
      </p>
    );
  if (!loaded.data)
    return <select {...props.common} disabled className="form-control loading" aria-busy />;
  return <Select {...props} options={loaded.data} autoFocus={props.focusWhenLoaded} />;
}

/** select.html: one value with a "None" or "Select" choice, or several. */
function Select({
  info,
  multiple,
  value,
  nullable,
  common,
  onChange,
  options = Array.isArray(info.options) ? info.options : [],
  autoFocus,
}: InputProps & { options?: EditOption[]; autoFocus?: boolean }) {
  // Option IDs keep their type (2, not "2"), as the API sent them.
  const byId = (raw: string) => options.find((option) => String(option.id) === raw)?.id;
  const choices = options.map((option) => (
    <option key={String(option.id)} value={String(option.id)}>
      {option.label}
    </option>
  ));
  if (multiple)
    return (
      <select
        {...common}
        multiple
        autoFocus={autoFocus}
        className="form-control"
        value={Array.isArray(value) ? value.map(String) : []}
        onChange={(event) => {
          onChange([...event.target.selectedOptions].map((option) => byId(option.value)));
        }}
      >
        {choices}
      </select>
    );
  return (
    <select
      {...common}
      autoFocus={autoFocus}
      className="form-control"
      value={text(value)}
      onChange={(event) => {
        onChange(event.target.value === "" ? null : byId(event.target.value));
      }}
    >
      <option value="">{nullable ? ts("None") : ts("Select")}</option>
      {choices}
    </select>
  );
}
