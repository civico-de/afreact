import { useEffect, useId, useRef, useState } from "react";
import { errorMessage } from "../../api/civi";
import { parseImport, previewImport, runImport, type ImportCheck } from "./exchange";
import { searchAdminSettings, useRefreshSearchMetadata } from "./meta";
import { useReturnFocus } from "../widgets/Dialog";

/** crmSearchAdminImport's debounce. */
const CHECK_DELAY_MS = 500;

type State =
  | { kind: "empty" }
  | { kind: "checking" }
  | { kind: "error"; message: string }
  | { kind: "ready"; check: ImportCheck; preview: string }
  | { kind: "running"; check: ImportCheck };

/** crmSearchAdminImport: pasted export output, checked against existing records, then saved. */
export function ImportDialog({ onClose }: { onClose: (imported: boolean) => void }) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState("");
  const [state, setState] = useState<State>({ kind: "empty" });
  const afformEnabled = "org.civicrm.afform" in searchAdminSettings().modules;
  const refreshMetadata = useRefreshSearchMetadata();

  // deviation:dialog-return-focus
  useReturnFocus();
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  });

  useEffect(() => {
    if (!text.trim()) {
      setState({ kind: "empty" });
      return undefined;
    }
    setState({ kind: "checking" });
    let current = true;
    const timer = setTimeout(() => {
      const check = (() => {
        try {
          return parseImport(text, afformEnabled);
        } catch (error) {
          setState({ kind: "error", message: errorMessage(error) });
          return null;
        }
      })();
      if (!check) return;
      previewImport(check).then(
        ({ error, preview }) => {
          if (current)
            setState(error ? { kind: "error", message: error } : { kind: "ready", check, preview });
        },
        (error: unknown) => {
          if (current) setState({ kind: "error", message: errorMessage(error) });
        },
      );
    }, CHECK_DELAY_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [text, afformEnabled]);

  async function run(check: ImportCheck) {
    setState({ kind: "running", check });
    try {
      const count = await runImport(check);
      window.CRM.alert(
        ts("1 record successfully imported.", {
          plural: "%count records successfully imported.",
          count,
        }),
        ts("Saved"),
        "success",
      );
      await refreshMetadata();
      onClose(true);
    } catch (error) {
      setState({ kind: "error", message: `${ts("Processing Error:")} ${errorMessage(error)}` });
    }
  }

  const running = state.kind === "running";
  return (
    <dialog
      ref={dialog}
      className="afreact-dialog afreact-dialog-wide"
      aria-labelledby={titleId}
      onClose={() => {
        if (!running) onClose(false);
      }}
      onCancel={(event) => {
        if (running) event.preventDefault();
      }}
    >
      <h2 id={titleId} className="afreact-dialog-title">
        {ts("Import")}
      </h2>
      <div className="afreact-dialog-body">
        <div role="status">
          {state.kind === "empty" && (
            <div className="alert alert-info">
              <i className="crm-i fa-info-circle" role="img" aria-hidden="true" />{" "}
              {ts('Search configuration copied from the "Export" action can be pasted here.')}
            </div>
          )}
          {(state.kind === "checking" || running) && (
            <div className="alert alert-info">
              <i className="crm-i fa-spinner fa-spin" role="img" aria-hidden="true" />{" "}
              {running ? ts("Importing Saved Search...") : ts("Checking input...")}
            </div>
          )}
          {state.kind === "ready" && (
            <div className="alert alert-success">
              <i className="crm-i fa-check-circle-o" role="img" aria-hidden="true" />{" "}
              {state.preview}
            </div>
          )}
        </div>
        {state.kind === "error" && (
          <div className="alert alert-danger" role="alert">
            <i className="crm-i fa-exclamation-triangle" role="img" aria-hidden="true" />{" "}
            {state.message}
          </div>
        )}
        <label htmlFor={`${titleId}-input`} className="sr-only">
          {ts("Import")}
        </label>
        <textarea
          id={`${titleId}-input`}
          className="form-control"
          rows={15}
          value={text}
          disabled={running}
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
      </div>
      <div className="afreact-dialog-buttons">
        <button
          type="button"
          className="btn btn-primary"
          disabled={state.kind !== "ready"}
          onClick={() => {
            if (state.kind === "ready") void run(state.check);
          }}
        >
          <i
            className={`crm-i ${running ? "fa-spinner fa-spin" : "fa-save"}`}
            role="img"
            aria-hidden="true"
          />{" "}
          {ts("Import")}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={running}
          onClick={() => {
            onClose(false);
          }}
        >
          <i className="crm-i fa-times" role="img" aria-hidden="true" /> {ts("Cancel")}
        </button>
      </div>
    </dialog>
  );
}
