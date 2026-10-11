import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { errorMessage } from "../../api/civi";
import { exportOutput, loadExport, typeLabel, type ExportType } from "./exchange";
import type { ListedSearch } from "./listing";
import { searchAdminSettings } from "./meta";

interface ExportDialogProps {
  search: Pick<
    ListedSearch,
    "id" | "name" | "label" | "api_entity" | "api_params" | "display_name"
  >;
  onClose: () => void;
}

/** crmSearchAdminExport: the search, its displays, smart group and forms as API calls to copy. */
export function ExportDialog({ search, onClose }: ExportDialogProps) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const afformEnabled = "org.civicrm.afform" in searchAdminSettings().modules;
  const loaded = useQuery({
    queryKey: ["SavedSearch", "export", search.id],
    queryFn: () => loadExport(search, afformEnabled),
    gcTime: 0,
  });
  const [types, setTypes] = useState<ExportType[] | null>(null);
  const [copied, setCopied] = useState<boolean | null>(null);
  const shown = types ?? loaded.data ?? null;
  const output = shown ? exportOutput(shown) : "";

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  });

  const params = new URLSearchParams({
    _format: "php_ts",
    cleanup: "always",
    id: String(search.id),
  });
  const simpleLink = window.CRM.url(
    `civicrm/admin/search#/create/${search.api_entity}?params=${encodeURIComponent(JSON.stringify(search.api_params))}`,
  );
  const explorer = window.CRM.url(`civicrm/api4#/explorer/SavedSearch/export?${params.toString()}`);

  async function copy() {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="afreact-dialog afreact-dialog-wide"
      aria-labelledby={titleId}
      onClose={onClose}
    >
      <h2 id={titleId} className="afreact-dialog-title">
        {ts("Export %1", { 1: search.label })}
      </h2>
      <div className="afreact-dialog-body">
        <div className="alert alert-info">
          <p>
            <i className="crm-i fa-info-circle" role="img" aria-hidden="true" />{" "}
            {ts(
              'Search configuration can be copied from here, then pasted into "Import" to e.g. transfer between sites.',
            )}
          </p>
          <p>
            <i className="crm-i fa-link" role="img" aria-hidden="true" /> {ts("Copyable link:")}{" "}
            <a href={simpleLink} target="_blank" rel="noreferrer">
              {ts("Saved Search Criteria")}
            </a>
          </p>
          <p>
            <i className="crm-i fa-suitcase" role="img" aria-hidden="true" />{" "}
            {ts("To package for distribution in an extension, use")}{" "}
            <a
              href="https://docs.civicrm.org/dev/en/latest/extensions/civix/#export"
              target="_blank"
              rel="noreferrer"
            >
              {ts("Civix Export")}
            </a>{" "}
            {ts("or")}{" "}
            <a href={explorer} target="_blank" rel="noreferrer">
              {ts("API Explorer")}
            </a>
          </p>
        </div>
        <fieldset>
          <legend className="h4">{ts("Include in output")}</legend>
          {loaded.error ? (
            <p className="crm-error" role="alert">
              {errorMessage(loaded.error)}
            </p>
          ) : !shown ? (
            <p role="status">{ts("Loading...")}</p>
          ) : (
            shown.map((type, index) => (
              <div key={type.entity} className="checkbox">
                <label className={type.values.length ? undefined : "disabled"}>
                  <input
                    type="checkbox"
                    disabled={!type.values.length}
                    checked={type.enabled}
                    onChange={(event) => {
                      setTypes(
                        shown.map((t, i) =>
                          i === index ? { ...t, enabled: event.target.checked } : t,
                        ),
                      );
                      setCopied(null);
                    }}
                  />{" "}
                  {typeLabel(type)}
                </label>
              </div>
            ))
          )}
        </fieldset>
        <label htmlFor={`${titleId}-output`} className="sr-only">
          {ts("Export")}
        </label>
        <textarea
          id={`${titleId}-output`}
          className="form-control"
          readOnly
          rows={8}
          value={output}
        />
        <p role="status">
          {copied === false && ts("Copying failed; select the text and copy it by hand.")}
        </p>
      </div>
      <div className="afreact-dialog-buttons">
        <button
          type="button"
          className={`btn ${copied ? "btn-success" : "btn-primary"}`}
          disabled={!output}
          onClick={() => void copy()}
        >
          <i
            className={`crm-i ${copied ? "fa-check" : "fa-clipboard"}`}
            role="img"
            aria-hidden="true"
          />{" "}
          {copied ? ts("Copied to clipboard") : ts("Copy to clipboard")}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          {ts("Close")}
        </button>
      </div>
    </dialog>
  );
}
