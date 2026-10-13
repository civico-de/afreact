import { useMutation, useQuery } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { useEffect, useEffectEvent, useId, useRef, useState, type FormEvent } from "react";
import { Unsupported } from "../afform/Unsupported";
import { api4, errorMessage } from "../api/civi";
import {
  columnName,
  isBatchRow,
  isInput,
  missingMessages,
  missingValues,
  newRow,
  tallyMismatches,
  tallyOf,
  targetOf,
  unreadFormulas,
  withFormulas,
  type BatchRow,
} from "./batchRows";
import { cellText } from "./Cell";
import { Input } from "./EditableCell";
import { editorFor, unsupportedEditors } from "./inlineEdit";
import { Icon } from "./LinkContent";
import { Menu } from "./Menu";
import { Pager } from "./Pager";
import { editableOf } from "./rows";
import type { Column, DisplaySettings, EditableInfo, Link } from "./types";
import { positiveInteger } from "./urlKeys";

interface BatchDisplayProps {
  search: string;
  display: string;
  settings: DisplaySettings;
  afform?: string;
  filters: Record<string, unknown> | unknown[];
  /** Settings the renderer does not read. */
  notes: string[];
}

/** crmSearchDisplayBatch: a new batch's form, or the rows of the batch the URL names. */
export function BatchDisplay(props: BatchDisplayProps) {
  // Core keeps the batch in `#?batch=`, unprefixed, as SearchDisplay.importBatch's links do.
  const [batch, setBatch] = useQueryState("batch", positiveInteger);
  return batch ? (
    <BatchEditor key={batch} {...props} batch={batch} onNew={() => void setBatch(null)} />
  ) : (
    <NewBatch {...props} onCreated={(id) => void setBatch(id)} />
  );
}

const ROW_CHOICES = [1, 5, 10, 25, 50, 100];
const AUTOSAVE_MS = 10_000;
/** The focus target after the last row is removed: the add rows button. */
const ADD_BUTTON = "add";

function NewBatch({
  search,
  display,
  settings,
  onCreated,
}: BatchDisplayProps & { onCreated: (id: number) => void }) {
  const id = useId();
  const [label, setLabel] = useState("");
  const [rowCount, setRowCount] = useState("1");
  const [targets, setTargets] = useState<Record<string, string>>({});
  const targeted = settings.columns.filter((column) => column.tally?.target && column.key);
  // deviation:batch-create-import-failure
  const create = useMutation({
    mutationFn: async () => {
      const [job] = await api4<{ id: number }>("SearchDisplay", "createBatch", {
        savedSearch: search,
        display,
        rowCount: Number(rowCount),
        targets: Object.fromEntries(
          Object.entries(targets)
            .filter(([, value]) => value !== "")
            .map(([key, value]) => [key, Number(value)]),
        ),
        label: label || undefined,
      });
      if (!job) throw new Error(ts("No batch was created."));
      return job.id;
    },
    onSuccess: onCreated,
  });
  const links = [
    {
      title: ts("View My Import Batches"),
      href: window.CRM.url("civicrm/imports/my-listing#/?job_type=search_batch_import"),
      icon: "fa-user-tag",
    },
    ...(window.CRM.checkPerm("administer queues")
      ? [
          {
            title: ts("View All Import Batches"),
            href: window.CRM.url("civicrm/imports/all-imports#/?job_type=search_batch_import"),
            icon: "fa-list-alt",
          },
        ]
      : []),
  ];
  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };
  return (
    <div className="crm-search-display crm-search-display-batch">
      <ul className="list-group">
        <li className="list-group-item">
          <form onSubmit={submit}>
            <fieldset>
              <legend>{ts("New Batch")}</legend>
              <div className="form-inline" title={ts("Name of new batch")}>
                {/* deviation:batch-name-label */}
                <label htmlFor={`${id}-label`}>{ts("Name")}</label>{" "}
                <input
                  type="text"
                  className="form-control"
                  id={`${id}-label`}
                  value={label}
                  onChange={(event) => {
                    setLabel(event.target.value);
                  }}
                />
              </div>
              <div className="form-inline" title={ts("Initial row count for new batch")}>
                <label htmlFor={`${id}-rows`}>{ts("Rows")}</label>{" "}
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  className="form-control"
                  id={`${id}-rows`}
                  value={rowCount}
                  onChange={(event) => {
                    setRowCount(event.target.value);
                  }}
                />
              </div>
              {targeted.map((column, index) => {
                const key = column.key ?? "";
                return (
                  <div key={key} className="form-inline" title={ts("Target Total")}>
                    <label htmlFor={`${id}-target-${index}`}>{column.label}</label>{" "}
                    <input
                      type="number"
                      step="any"
                      className="form-control"
                      id={`${id}-target-${index}`}
                      value={targets[key] ?? ""}
                      onChange={(event) => {
                        setTargets({ ...targets, [key]: event.target.value });
                      }}
                    />
                  </div>
                );
              })}
              <button type="submit" className="btn btn-primary" disabled={create.isPending}>
                <Icon name={create.isPending ? "fa-spin fa-spinner" : "fa-plus"} />{" "}
                {ts("Start New Batch")}
              </button>
              {create.error && <Failure error={create.error} />}
            </fieldset>
          </form>
        </li>
        {links.map((link) => (
          <li key={link.href} className="list-group-item">
            <a href={link.href}>
              <Icon name={link.icon} /> {link.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Failure({ error }: { error: unknown }) {
  return (
    <p className="alert alert-danger" role="alert">
      {errorMessage(error)}
    </p>
  );
}

interface Loaded {
  rows: BatchRow[];
  editable: Record<string, EditableInfo>;
}

function BatchEditor({
  search,
  display,
  settings,
  afform,
  filters,
  notes: settingNotes,
  batch,
  onNew,
}: BatchDisplayProps & { batch: number; onNew: () => void }) {
  const id = useId();
  const apiName = `Import_${batch}`;
  const columns = settings.columns;
  const loaded = useQuery({
    queryKey: ["SearchDisplay", "runBatch", search, display, batch],
    queryFn: async (): Promise<Loaded> => {
      const result = await api4<{ data?: unknown }>("SearchDisplay", "runBatch", {
        savedSearch: search,
        display,
        afform,
        filters,
        userJobId: batch,
      });
      return {
        rows: result.flatMap((row) => (isBatchRow(row.data) ? [row.data] : [])),
        editable: editableOf(result),
      };
    },
    // The rows are edited here from the first load on, so they never load again.
    staleTime: Infinity,
    gcTime: 0,
  });
  const [rows, setRows] = useState<BatchRow[] | null>(null);
  if (loaded.data && rows === null) setRows(loaded.data.rows);
  const editable = loaded.data?.editable ?? {};
  const [unsaved, setUnsaved] = useState<ReadonlySet<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const pending = useRef<Promise<boolean> | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const [mismatches, setMismatches] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(settings.limit ?? 0);
  const [focus, setFocus] = useState<string | null>(null);

  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focus === null) return;
    // A radio group has no id of its own: its first radio takes the focus.
    const target =
      focus === ADD_BUTTON
        ? root.current?.querySelector<HTMLElement>(".dropdown-toggle")
        : (document.getElementById(focus) ??
          document.querySelector<HTMLElement>(`[aria-labelledby="${focus}-label"] input`));
    target?.focus();
    setFocus(null);
  }, [focus]);

  const all = rows ?? [];
  // The rows as last rendered, for work that resumes after a request.
  const latest = useRef(all);
  useEffect(() => {
    latest.current = all;
  });
  const current = page;
  const first = limit ? (current - 1) * limit : 0;
  const shown = limit ? all.slice(first, first + limit) : all;
  // deviation:batch-required-every-page
  const missingRows = missingValues(all, columns, editable);
  const valid = missingRows.length === 0;

  const markUnsaved = (ids: number[]) => {
    setUnsaved((before) => new Set([...before, ...ids]));
  };

  const saveRows = (): Promise<boolean> => {
    if (pending.current) return pending.current;
    const ids = [...unsaved];
    if (!ids.length) return Promise.resolve(true);
    const records = all.filter((row) => unsaved.has(row._id));
    // Changes made while the save runs count as unsaved again.
    setUnsaved((before) => new Set([...before].filter((rowId) => !ids.includes(rowId))));
    setSaving(true);
    const saved = api4(apiName, "save", { records }).then(
      () => {
        setFailure(null);
        return true;
      },
      (error: unknown) => {
        // deviation:batch-save-failure-keeps-rows
        markUnsaved(ids);
        setFailure(error);
        setImporting(false);
        return false;
      },
    );
    pending.current = saved;
    void saved.finally(() => {
      pending.current = null;
      setSaving(false);
    });
    return saved;
  };

  const autosave = useEffectEvent(() => {
    void saveRows();
  });
  useEffect(() => {
    const timer = setInterval(autosave, AUTOSAVE_MS);
    return () => {
      clearInterval(timer);
      autosave();
    };
  }, []);

  // deviation:batch-unsaved-on-leave
  // Leaving the page drops what the next autosave would have sent.
  const dirty = unsaved.size > 0;
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
    };
  }, [dirty]);

  const change = (rowId: number, name: string, value: unknown) => {
    setRows((before) =>
      (before ?? []).map((row) =>
        row._id === rowId
          ? (withFormulas([{ ...row, [name]: value }], columns, editable)[0] ?? row)
          : row,
      ),
    );
    markUnsaved([rowId]);
  };

  const appendRows = async (count: number) => {
    const saved = await api4<Record<string, unknown>>(apiName, "save", {
      records: Array.from({ length: count }, () => ({})),
      reload: ["*"],
    });
    setRows((before) => [...(before ?? []), ...saved.flatMap((row) => newRow(row) ?? [])]);
  };

  const addRows = (count: number) => {
    setAdding(true);
    setFailure(null);
    return appendRows(count)
      .catch(setFailure)
      .finally(() => {
        setAdding(false);
      });
  };

  const deleteRow = async (rowId: number) => {
    // deviation:batch-delete-then-remove
    await api4(apiName, "delete", { where: [["_id", "=", rowId]] });
    // Rows may have been added while the delete ran.
    const list = latest.current;
    const index = list.findIndex((row) => row._id === rowId);
    setRows((before) => (before ?? []).filter((row) => row._id !== rowId));
    setUnsaved((before) => new Set([...before].filter((other) => other !== rowId)));
    // A removed row may empty the last page: core goes back a page.
    if (limit)
      setPage((before) => Math.min(before, Math.max(1, Math.ceil((list.length - 1) / limit))));
    // The focus moves to the row taking the removed one's place, or the one before.
    const next = list[index + 1] ?? list[index - 1];
    setFocus(next ? `${id}-remove-${next._id}` : ADD_BUTTON);
  };

  const removeRow = (rowId: number) => {
    setRemoving(rowId);
    setFailure(null);
    return deleteRow(rowId)
      .catch(setFailure)
      .finally(() => {
        setRemoving(null);
      });
  };

  // deviation:batch-copy-recomputes-formulas
  /** copyCol(): the first row's value into every row, recomputing the formulas it feeds. */
  const copyColumn = (column: Column) => {
    const name = columnName(column);
    const [top, ...rest] = all;
    if (!name || !top) return;
    setRows(
      withFormulas([top, ...rest.map((row) => ({ ...row, [name]: top[name] }))], columns, editable),
    );
    markUnsaved(rest.map((row) => row._id));
  };

  const startQueue = async () => {
    const [result] = await api4<{ url?: string }>("SearchDisplay", "importBatch", {
      savedSearch: search,
      display,
      userJobId: batch,
    });
    if (!result?.url) throw new Error(ts("The import did not start."));
    window.location.assign(result.url);
  };

  // deviation:batch-import-after-last-save
  // The import saves until no edit is left, including those made during a running save.
  const queued = useRef(false);
  const continueImport = useEffectEvent(() => {
    if (queued.current) return;
    if (unsaved.size) {
      void saveRows();
      return;
    }
    queued.current = true;
    // deviation:batch-create-import-failure
    startQueue().catch((error: unknown) => {
      queued.current = false;
      setFailure(error);
      setImporting(false);
    });
  });
  useEffect(() => {
    if (importing && !saving) continueImport();
  }, [importing, saving, unsaved]);

  const runImport = () => {
    setFailure(null);
    setImporting(true);
  };

  const startImport = () => {
    setChecked(true);
    setMissing(missingMessages(missingRows));
    const [firstMissing] = missingRows;
    if (firstMissing) {
      const rowIndex = firstMissing.row - 1;
      const row = all[rowIndex];
      const column = columns.findIndex((col) => isMissing(row, col, editable));
      if (limit) setPage(Math.floor(rowIndex / limit) + 1);
      if (row) setFocus(`${id}-${row._id}-${column}`);
      return;
    }
    const found = tallyMismatches(all, columns, editable);
    if (found.length) setMismatches(found);
    else runImport();
  };

  const notes = [
    ...settingNotes,
    ...unsupportedEditors(editable),
    ...unreadFormulas(columns, editable),
  ];
  const addLinks: { count: number; link: Link }[] = ROW_CHOICES.map((count) => ({
    count,
    link: { text: count === 1 ? ts("Add 1 Row") : ts("Add %1 Rows", { 1: count }) },
  }));

  return (
    <div className="crm-search-display crm-search-display-batch" ref={root}>
      {notes.length > 0 && <Unsupported what={notes.join(", ")} />}
      {settings.description && (
        <div className="alert alert-info crm-search-display-description">
          {settings.description}
        </div>
      )}
      {loaded.error ? (
        <>
          {/* deviation:batch-load-error-new */}
          <Failure error={loaded.error} />
          <button type="button" className="btn btn-primary" onClick={onNew}>
            <Icon name="fa-plus" /> {ts("New Batch")}
          </button>
        </>
      ) : null}
      <table
        className={(settings.classes ?? []).join(" ")}
        hidden={!!loaded.error}
        // deviation:batch-import-inert
        inert={importing}
      >
        <thead>
          <tr>
            <th>
              <span className="sr-only">{ts("Row")}</span>
            </th>
            {columns.map((column, index) => {
              const info = column.key ? editable[column.key] : undefined;
              return (
                <th key={index}>
                  <span className="crm-search-display-table-column-label">
                    {column.label}
                    {column.required && (
                      <span className="crm-marker" aria-hidden="true">
                        *
                      </span>
                    )}
                  </span>
                  {isInput(info) && (
                    <>
                      {" "}
                      <button
                        type="button"
                        className="btn btn-xs"
                        title={ts("Copy value from first row to all rows")}
                        aria-label={ts("Copy %1 from the first row to all rows", {
                          1: column.label ?? "",
                        })}
                        disabled={!rows?.length}
                        onClick={() => {
                          copyColumn(column);
                        }}
                      >
                        <Icon name="fa-arrows-down-to-line" />
                      </button>
                    </>
                  )}
                </th>
              );
            })}
            <th>
              <span className="sr-only">{ts("Remove Row")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows === null ? (
            <tr>
              <td>1</td>
              {columns.map((_, index) => (
                <td key={index}>
                  <div className="crm-search-loading-placeholder" />
                </td>
              ))}
              <td />
            </tr>
          ) : (
            shown.map((row, rowIndex) => {
              const number = first + rowIndex + 1;
              return (
                <tr key={row._id}>
                  <td>{number}</td>
                  {columns.map((column, colIndex) => (
                    <BatchCell
                      key={colIndex}
                      id={`${id}-${row._id}-${colIndex}`}
                      row={row}
                      number={number}
                      column={column}
                      info={column.key ? editable[column.key] : undefined}
                      invalid={checked && isMissing(row, column, editable)}
                      onChange={(name, value) => {
                        change(row._id, name, value);
                      }}
                    />
                  ))}
                  <td>
                    <button
                      type="button"
                      id={`${id}-remove-${row._id}`}
                      className="btn btn-primary btn-xs"
                      disabled={removing !== null}
                      onClick={() => void removeRow(row._id)}
                    >
                      <Icon name={removing === row._id ? "fa-spin fa-spinner" : "fa-trash"} />
                      <span className="sr-only">
                        {ts("Remove Row")} {number}
                      </span>
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
        {rows !== null && settings.tally && (
          <tfoot>
            <tr>
              <td>
                <Icon name="fa-calculator" />
                <span className="sr-only">{ts("Totals")}</span>
              </td>
              {columns.map((column, index) => {
                const target = targetOf(column, editable);
                const tally = tallyOf(all, column);
                const state =
                  target === null ? "" : tally === target ? "text-success" : "text-danger";
                return (
                  <td key={index} className={`crm-search-batch-tally-total ${state}`}>
                    {column.tally?.label && <label>{column.tally.label}</label>}
                    {column.tally?.fn && (
                      <span>
                        {tally}
                        {target !== null && ` / ${target}`}
                      </span>
                    )}
                  </td>
                );
              })}
              <td />
            </tr>
          </tfoot>
        )}
      </table>
      {settings.pager && all.length > 0 && (
        <Pager
          settings={settings.pager}
          rowCount={all.length}
          page={current}
          limit={limit}
          onPage={setPage}
          onLimit={(next) => {
            setLimit(next);
            setPage(1);
          }}
        />
      )}
      {missing.length > 0 && (
        <div className="alert alert-danger" role="alert">
          <p>{ts("Please complete the following:")}</p>
          <ul>
            {missing.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}
      {failure ? <Failure error={failure} /> : null}
      {rows !== null && (
        <div>
          <Menu
            buttonClass="btn btn-primary dropdown-toggle"
            label={
              <>
                <Icon name={adding ? "fa-spin fa-spinner" : "fa-plus"} /> {ts("Add Rows...")}
              </>
            }
            links={addLinks.map(({ link }) => link)}
            alignRight={false}
            disabled={adding || importing}
            onLinkClick={(link, event) => {
              event.preventDefault();
              const choice = addLinks.find((entry) => entry.link === link);
              if (choice) void addRows(choice.count);
            }}
          />{" "}
          <button
            type="button"
            className="btn btn-primary"
            disabled={!unsaved.size || saving || importing}
            onClick={() => void saveRows()}
          >
            <Icon name={saving ? "fa-spin fa-spinner" : unsaved.size ? "fa-save" : "fa-check"} />{" "}
            {unsaved.size || saving ? ts("Save Changes") : ts("Changes Saved")}
          </button>{" "}
          <button
            type="button"
            className={`btn btn-${valid ? "success" : "warning"}`}
            disabled={importing}
            onClick={startImport}
          >
            <Icon name={importing ? "fa-spin fa-spinner" : "fa-download"} /> {ts("Run Import")}
          </button>
        </div>
      )}
      {/* deviation:batch-status-announced */}
      <p role="status" className="sr-only">
        {importing
          ? ts("Importing...")
          : saving
            ? ts("Saving...")
            : adding
              ? ts("Adding rows...")
              : ""}
      </p>
      {mismatches.length > 0 && (
        <MismatchDialog
          mismatches={mismatches}
          onClose={(run) => {
            setMismatches([]);
            if (run) runImport();
          }}
        />
      )}
    </div>
  );
}

function isMissing(
  row: BatchRow | undefined,
  column: Column,
  editable: Record<string, EditableInfo>,
): boolean {
  return !!row && missingValues([row], [column], editable).length > 0;
}

interface BatchCellProps {
  id: string;
  row: BatchRow;
  number: number;
  column: Column;
  info: EditableInfo | undefined;
  invalid: boolean;
  onChange: (name: string, value: unknown) => void;
}

/** crmSearchDisplayBatchBody.html: crm-search-input for an editable column, the value otherwise. */
function BatchCell({ id, row, number, column, info, invalid, onChange }: BatchCellProps) {
  const name = columnName(column);
  const editor = isInput(info) ? editorFor(info) : null;
  // deviation:batch-display-only-import-column
  if (!isInput(info) || !name || !editor || "unsupported" in editor)
    return (
      <td className={`crm-search-col-type-${column.type}`}>
        <span className="crm-search-field-value">
          {cellText(row[name ?? column.key ?? ""] ?? "")}
        </span>
      </td>
    );
  const label = ts("%1, %2", { 1: column.label ?? "", 2: ts("Row %1", { 1: number }) });
  return (
    <td
      className={`crm-search-col-type-${column.type} crm-search-field-editable crm-search-field-editing`}
    >
      <div className="form-inline">
        <label className="sr-only" id={`${id}-label`} htmlFor={id}>
          {label}
        </label>
        <Input
          kind={editor.kind}
          multiple={editor.multiple}
          info={info}
          row={{ key: row._id, columns: [], data: row }}
          value={row[name] ?? null}
          nullable={!info.required}
          labelId={`${id}-label`}
          common={{
            id,
            required: !!info.required,
            "aria-invalid": invalid || undefined,
            "aria-describedby": undefined,
          }}
          onChange={(value) => {
            onChange(name, value);
          }}
        />
      </div>
    </td>
  );
}

// deviation:batch-mismatch-dialog
/** CRM.confirm "Totals Mismatch" of doImport(): the import runs only when confirmed. */
function MismatchDialog({
  mismatches,
  onClose,
}: {
  mismatches: string[];
  onClose: (run: boolean) => void;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const run = useRef(false);
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="afreact-dialog"
      aria-labelledby={titleId}
      onClose={() => {
        onClose(run.current);
      }}
    >
      <h2 id={titleId} className="afreact-dialog-title">
        {ts("Totals Mismatch")}
      </h2>
      <div className="afreact-dialog-body">
        {mismatches.map((text) => (
          <p key={text}>
            <Icon name="fa-warning" /> {text}
          </p>
        ))}
        <p>{ts("Run import anyway?")}</p>
        <div className="afreact-dialog-buttons">
          <button type="button" className="btn btn-default" onClick={() => dialog.current?.close()}>
            {ts("Cancel")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              run.current = true;
              dialog.current?.close();
            }}
          >
            {ts("Run Import")}
          </button>
        </div>
      </div>
    </dialog>
  );
}
