import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createElement, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { api4, errorMessage } from "../api/civi";
import { filterValues } from "../search/filters";
import { Icon } from "../search/LinkContent";
import {
  compareDetails,
  differsFromSet,
  setDescription,
  setDetails,
  type CurrentParams,
  type SavedSet,
} from "./savedSets";
import { useSearchFieldset } from "./SearchFieldset";
import { PARAM_SETS_OUTSIDE_NOTE } from "./support";
import { Unsupported } from "./Unsupported";

type FieldsetValue = NonNullable<ReturnType<typeof useSearchFieldset>>;

function Details({ details }: { details: [string, ReactNode][] }) {
  return (
    <dl>
      {details.map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

interface ModalProps {
  className: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** One of core's `<dialog class="crm-dialog">`, shown modal while it is rendered. */
function Modal({ className, title, onClose, children }: ModalProps) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  });
  return (
    <dialog
      ref={dialog}
      className={`crm-dialog ${className}`}
      aria-labelledby={titleId}
      onClose={onClose}
    >
      <h2 id={titleId}>{title}</h2>
      {children}
    </dialog>
  );
}

function Saving() {
  return (
    <div className="crm-loading-spinner" role="status">
      <div className="sr-only">{ts("Saving...")}</div>
    </div>
  );
}

// deviation:param-sets-show-errors
function Failure({ error }: { error: unknown }) {
  return error ? (
    <p className="crm-error" role="alert">
      {errorMessage(error)}
    </p>
  ) : null;
}

/** A write's pending state and error, as the dialogs show them. */
function useWrite() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = async (write: () => Promise<void>) => {
    setPending(true);
    setError(null);
    await write()
      .catch((failure: unknown) => {
        setError(failure);
      })
      .finally(() => {
        setPending(false);
      });
  };
  return { pending, error, run };
}

function NameInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <div className="form-group">
      <label htmlFor={id}>{ts("Name")}</label>
      <input
        id={id}
        required
        placeholder={ts("New search")}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </div>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className="btn btn-warning" onClick={onClose}>
      <Icon name="fa-times" /> {ts("Close")}
    </button>
  );
}

interface SaveDialogProps {
  fieldset: FieldsetValue;
  current: CurrentParams;
  refresh: () => Promise<unknown>;
  onClose: () => void;
}

/** saveDialog: names the current filters and columns as a new set, then applies it. */
function SaveDialog({ fieldset, current, refresh, onClose }: SaveDialogProps) {
  const [label, setLabel] = useState("");
  const write = useWrite();
  const save = () =>
    write.run(async () => {
      const [created] = await api4<{ id: number }>("SearchParamSet", "create", {
        values: {
          afform_name: fieldset.formName,
          filters: current.filters,
          columns: current.columns,
          label,
          created_by: window.CRM.config?.cid,
        },
      });
      await refresh();
      if (created) fieldset.select(created.id);
      onClose();
    });
  return (
    <Modal className="af-search-param-set-new" title={ts("Save new search")} onClose={onClose}>
      {write.pending && <Saving />}
      <div hidden={write.pending}>
        <NameInput value={label} onChange={setLabel} />
        <Details details={Object.entries(setDetails(current, fieldset.fields))} />
        <Failure error={write.error} />
        <div className="crm-buttons crm-flex-justify-end">
          <button
            type="button"
            className="btn btn-primary"
            disabled={write.pending || !label}
            onClick={() => void save()}
          >
            <Icon name="fa-save" /> {ts("Save")}
          </button>
          <CloseButton onClose={onClose} />
        </div>
      </div>
    </Modal>
  );
}

interface UpdateDialogProps {
  fieldset: FieldsetValue;
  set: SavedSet;
  current: CurrentParams;
  refresh: () => Promise<unknown>;
  onClose: () => void;
}

/** updateDialog: the selected set takes the current filters and columns, and maybe a new name. */
function UpdateDialog({ fieldset, set, current, refresh, onClose }: UpdateDialogProps) {
  const client = useQueryClient();
  const [label, setLabel] = useState(set.label);
  const [comparison] = useState(() =>
    compareDetails(setDetails(set, fieldset.fields), setDetails(current, fieldset.fields)),
  );
  const write = useWrite();
  const update = () =>
    write.run(async () => {
      await api4("SearchParamSet", "update", {
        where: [["id", "=", set.id]],
        values: { label, filters: current.filters, columns: current.columns },
      });
      await Promise.all([
        refresh(),
        // The fieldset's copy of the set, which its URL writes compare with.
        client.invalidateQueries({
          queryKey: ["SearchParamSet", "get", fieldset.formName, String(set.id)],
        }),
      ]);
      onClose();
    });
  return (
    <Modal
      className="af-search-param-set-update"
      title={ts("Updating %1", { 1: set.label })}
      onClose={onClose}
    >
      {write.pending && <Saving />}
      <div hidden={write.pending}>
        <NameInput value={label} onChange={setLabel} />
        <Details
          details={comparison.map(([key, values]) => [
            key,
            values.length === 2 ? `${values[0] ?? ""} => ${values[1] ?? ""}` : values[0],
          ])}
        />
        <Failure error={write.error} />
        <div className="crm-buttons crm-flex-justify-end">
          <button
            type="button"
            className="btn btn-primary"
            disabled={write.pending || !label}
            onClick={() => void update()}
          >
            <Icon name="fa-save" /> {ts("Save changes")}
          </button>
          <CloseButton onClose={onClose} />
        </div>
      </div>
    </Modal>
  );
}

interface ManageDialogProps {
  fieldset: FieldsetValue;
  sets: SavedSet[];
  refresh: () => Promise<unknown>;
  onClose: () => void;
}

/** manageDialog: each set with its details, to open or delete. */
function ManageDialog({ fieldset, sets, refresh, onClose }: ManageDialogProps) {
  const client = useQueryClient();
  const write = useWrite();
  return (
    <Modal className="af-search-param-sets-manage" title={ts("Saved searches")} onClose={onClose}>
      {sets.length ? (
        <ul>
          {sets.map((set) => (
            <li key={set.id}>
              <details className="crm-accordion-bold">
                <summary>
                  {set.label} <span className="description">{setDescription(set)}</span>
                </summary>
                <div className="crm-accordion-body">
                  <Details details={Object.entries(setDetails(set, fieldset.fields))} />
                  <div className="crm-buttons crm-flex-justify-end">
                    <button
                      type="button"
                      className="btn btn-primary btn-xs"
                      onClick={() => {
                        onClose();
                        fieldset.select(set.id);
                      }}
                    >
                      <Icon name="fa-eye" /> {ts("Open")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-xs"
                      disabled={write.pending}
                      onClick={() =>
                        void write.run(async () => {
                          await api4("SearchParamSet", "delete", { where: [["id", "=", set.id]] });
                          await client.invalidateQueries({
                            queryKey: ["SearchParamSet", "get", fieldset.formName, String(set.id)],
                          });
                          if (String(set.id) === fieldset.setId) fieldset.select(0);
                          await refresh();
                        })
                      }
                    >
                      <Icon name="fa-trash" /> {ts("Delete")}
                    </button>
                  </div>
                </div>
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <div className="status status-warning">
          {ts("No filter sets have been created for this form.")}
        </div>
      )}
      <Failure error={write.error} />
      <div className="crm-buttons crm-flex-justify-end">
        <CloseButton onClose={onClose} />
      </div>
    </Modal>
  );
}

function listSets(formName: string): Promise<SavedSet[]> {
  return api4<SavedSet>("SearchParamSet", "get", {
    select: ["label", "filters", "columns", "created_by.display_name", "created_date"],
    where: [["afform_name", "=", formName]],
    orderBy: { label: "ASC" },
  });
}

/** af-search-param-sets: picks, saves, updates and deletes a search form's saved filter sets. */
export function ParamSets() {
  const fieldset = useSearchFieldset();
  if (!fieldset) return <Unsupported what={PARAM_SETS_OUTSIDE_NOTE} />;
  return <Picker fieldset={fieldset} />;
}

function Picker({ fieldset }: { fieldset: FieldsetValue }) {
  const client = useQueryClient();
  const listKey = ["SearchParamSet", "list", fieldset.formName];
  const list = useQuery({ queryKey: listKey, queryFn: () => listSets(fieldset.formName) });
  const [dialog, setDialog] = useState<"new" | "update" | "manage" | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: listKey });
  const sets = list.data ?? [];
  const selected = sets.find((set) => String(set.id) === fieldset.setId);
  const current: CurrentParams = {
    filters: filterValues(fieldset.state.values),
    columns: fieldset.toggled,
  };
  const canSave =
    Object.keys(current.filters).length > 0 || Object.keys(current.columns).length > 0;
  const close = () => {
    setDialog(null);
  };
  return createElement(
    "af-search-param-sets",
    null,
    list.isError && (
      <p className="crm-error" role="alert">
        {errorMessage(list.error)}
      </p>
    ),
    // deviation:param-sets-select-label
    sets.length > 0 && (
      <select
        aria-label={ts("Saved searches")}
        value={selected ? String(selected.id) : ""}
        onChange={(event) => {
          fieldset.select(Number(event.target.value) || 0);
        }}
      >
        <option value="">- {ts("Saved searches")} - </option>
        {sets.map((set) => (
          <option key={set.id} value={String(set.id)}>
            {set.label}
          </option>
        ))}
      </select>
    ),
    <div className="crm-buttons">
      {selected && (
        <button
          type="button"
          className="btn btn-secondary"
          aria-label={ts("Clear saved search")}
          onClick={() => {
            fieldset.select(0);
          }}
        >
          <Icon name="fa-times" />
        </button>
      )}
      {sets.length > 0 && (
        <button
          type="button"
          className="btn btn-secondary"
          aria-label={ts("Manage")}
          onClick={() => {
            setDialog("manage");
          }}
        >
          <Icon name="fa-gear" />
        </button>
      )}
      {selected && differsFromSet(selected, current) && (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setDialog("update");
          }}
        >
          <Icon name="fa-save" /> {ts("Save changes")}
        </button>
      )}
      <button
        type="button"
        className="btn btn-primary"
        disabled={!canSave}
        onClick={() => {
          setDialog("new");
        }}
      >
        <Icon name="fa-plus" /> {sets.length ? ts("Save new") : ts("Save this search")}
      </button>
    </div>,
    dialog === "new" && (
      <SaveDialog fieldset={fieldset} current={current} refresh={refresh} onClose={close} />
    ),
    dialog === "update" && selected && (
      <UpdateDialog
        fieldset={fieldset}
        set={selected}
        current={current}
        refresh={refresh}
        onClose={close}
      />
    ),
    dialog === "manage" && (
      <ManageDialog fieldset={fieldset} sets={sets} refresh={refresh} onClose={close} />
    ),
  );
}
