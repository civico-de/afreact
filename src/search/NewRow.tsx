import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Input, listOpen } from "./EditableCell";
import { editorFor, type InlineEdit } from "./inlineEdit";
import type { DisplaySettings, EditableInfo } from "./types";

interface NewRowProps {
  settings: DisplaySettings;
  edit: InlineEdit;
  hidden: ReadonlySet<number>;
}

/** The inputs of the row: one per editable, shown column, keyed by the column key. */
function inputs(settings: DisplaySettings, edit: InlineEdit, hidden: ReadonlySet<number>) {
  return settings.columns.flatMap((column, index) => {
    const info = column.key ? edit.editable[column.key] : undefined;
    if (hidden.has(index) || !info) return [];
    const editor = editorFor(info);
    return "unsupported" in editor ? [] : [{ index, key: column.key ?? "", info, editor }];
  });
}

/** A required column without an editor leaves every save failing, so the row stays closed. */
const blocked = (editable: Record<string, EditableInfo>) =>
  Object.values(editable).some((info) => !info.nullable && "unsupported" in editorFor(info));

/**
 * crmSearchDisplayTableCreateNew.html: a button that turns into a row of inputs for the editable
 * columns; Enter or the check saves the record through inlineEdit, Escape cancels.
 */
export function NewRow({ settings, edit, hidden }: NewRowProps) {
  const id = useId();
  const row = useRef<HTMLTableRowElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const creating = edit.newRow;
  const [values, setValues] = useState<Record<string, unknown>>({});
  const fields = inputs(settings, edit, hidden);
  const returnFocus = useRef(false);
  const label = (settings.editableRow && settings.editableRow.createLabel) || ts("Add");
  const unusable = blocked(edit.editable);

  // The inputs start empty (or with a failed save's values); the first one takes the focus.
  // Once the row closes, the button that opened it gets the focus back.
  const open = !!creating;
  const failed = creating?.values;
  useEffect(() => {
    if (open) {
      setValues(failed ?? {});
      row.current?.querySelector<HTMLElement>("input, select, textarea")?.focus();
    } else if (returnFocus.current) {
      button.current?.focus();
    }
    returnFocus.current = false;
  }, [open, failed]);

  const finish = (save: boolean) => {
    returnFocus.current = true;
    if (save) void edit.saveNew(values);
    else edit.cancelCreating();
  };
  // The inputs sit in cells outside the form, so each one reports for itself.
  const commit = () => {
    const controls = [
      ...(row.current?.querySelectorAll<HTMLInputElement>("input, select, textarea") ?? []),
    ];
    const invalid = controls.find((control) => !control.reportValidity());
    if (!invalid) finish(true);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // An open autocomplete list takes Escape; an input that handled Enter keeps it (pick, chip).
    if (event.key === "Escape" && !listOpen(event.target)) {
      event.preventDefault();
      finish(false);
    } else if (
      event.key === "Enter" &&
      !event.defaultPrevented &&
      !(event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLButtonElement)
    ) {
      event.preventDefault();
      commit();
    }
  };
  if (!creating)
    return (
      <tr className="crm-search-add-new-column">
        <td className="crm-search-ctrl-column">
          {!edit.editing && !unusable && (
            <div className="btn-group">
              <button
                ref={button}
                type="button"
                className="btn btn-sm btn-default"
                onClick={edit.startCreating}
              >
                <i className="crm-i fa-plus" role="img" aria-hidden="true" /> {label}
              </button>
            </div>
          )}
        </td>
        {settings.columns.map((column, index) =>
          hidden.has(index) ? null : <td key={index} data-field-name={column.key} />,
        )}
      </tr>
    );

  const errorId = `${id}-error`;
  return (
    <tr ref={row} className="crm-search-add-new-column" aria-label={label} onKeyDown={onKeyDown}>
      <td className="crm-search-ctrl-column">
        <div className="btn-group" aria-busy={creating.busy}>
          <button
            type="button"
            className="btn btn-sm btn-success"
            disabled={creating.busy}
            onClick={commit}
          >
            <span className="sr-only">{ts("Save")}</span>
            <i className="crm-i fa-check" role="img" aria-hidden="true" />
          </button>{" "}
          <button
            type="button"
            className="btn btn-sm btn-danger"
            disabled={creating.busy}
            onClick={() => {
              finish(false);
            }}
          >
            <span className="sr-only">{ts("Cancel")}</span>
            <i className="crm-i fa-times" role="img" aria-hidden="true" />
          </button>
        </div>
        {creating.error && (
          <p id={errorId} className="alert alert-danger">
            {creating.error}
          </p>
        )}
      </td>
      {settings.columns.map((column, index) => {
        if (hidden.has(index)) return null;
        const field = fields.find((input) => input.index === index);
        if (!field) return <td key={index} data-field-name={column.key} />;
        return (
          <td key={index} data-field-name={column.key} className="crm-search-field-editing">
            <NewCell
              id={`${id}-${String(index)}`}
              label={column.label || field.key}
              info={field.info}
              kind={field.editor.kind}
              multiple={field.editor.multiple}
              value={values[field.key]}
              disabled={creating.busy}
              errorId={creating.error ? errorId : undefined}
              onChange={(value) => {
                setValues({ ...values, [field.key]: value });
              }}
            />
          </td>
        );
      })}
    </tr>
  );
}

interface NewCellProps {
  id: string;
  label: string;
  info: EditableInfo;
  kind: Parameters<typeof Input>[0]["kind"];
  multiple: boolean;
  value: unknown;
  disabled: boolean;
  errorId: string | undefined;
  onChange: (value: unknown) => void;
}

/** One input of the new row, labelled by its column; a field that allows null may stay empty. */
function NewCell(props: NewCellProps) {
  const { id, label, info, kind, multiple, value, disabled, errorId, onChange } = props;
  return (
    <div className="form-inline crm-search-display-editable-editing">
      <div className="form-group">
        <label className="sr-only" id={`${id}-label`} htmlFor={`${id}-input`}>
          {label}
        </label>
        <fieldset disabled={disabled} className="afreact-new-row-field">
          <Input
            kind={kind}
            multiple={multiple}
            info={info}
            row={{ key: "", columns: [] }}
            value={value}
            nullable={false}
            labelId={`${id}-label`}
            common={{
              id: `${id}-input`,
              required: !info.nullable,
              "aria-invalid": errorId ? true : undefined,
              "aria-describedby": errorId,
            }}
            onChange={onChange}
          />
        </fieldset>
      </div>
    </div>
  );
}
