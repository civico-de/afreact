import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { api4, errorMessage } from "../api/civi";
import { Icon } from "./LinkContent";
import type { Key, SearchTask } from "./searchTasks";

interface Language {
  name: string;
  label: string;
  /** No translation into it exists yet. */
  allowed: boolean;
  /** Already used for some template, or a language of the interface: offered first. */
  encouraged: boolean;
}

const isLabels = (value: unknown): value is Record<string, string> =>
  typeof value === "object" &&
  value !== null &&
  Object.values(value).every((label) => typeof label === "string");

const languagesOf = (rows: { language?: unknown }[]) =>
  rows.flatMap((row) => (typeof row.language === "string" ? [row.language] : []));

const byLabel = (a: Language, b: Language) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0);

/** AddTranslation.js's lookups: the template's title, its languages, those in use, the settings. */
async function loadLanguages(templateId: Key) {
  const [template, existing, inUse, settings] = await Promise.all([
    api4<{ msg_title?: string }>("MessageTemplate", "get", {
      select: ["msg_title"],
      where: [["id", "=", templateId]],
    }),
    api4<{ language?: unknown }>("Translation", "get", {
      select: ["language"],
      where: [
        ["entity_table", "=", "civicrm_msg_template"],
        ["entity_id", "=", templateId],
      ],
      groupBy: ["language"],
    }),
    api4<{ language?: unknown }>("Translation", "get", {
      select: ["language"],
      where: [["entity_table", "=", "civicrm_msg_template"]],
      groupBy: ["language"],
    }),
    api4<{ allLanguages?: unknown; uiLanguages?: unknown }>("Afreact", "getTaskSettings", {
      module: "crmMsgadmTasks",
    }),
  ]);
  const { allLanguages, uiLanguages } = settings[0] ?? {};
  if (!isLabels(allLanguages) || !isLabels(uiLanguages))
    throw new Error("Afreact.getTaskSettings returned no languages for crmMsgadmTasks.");
  const taken = languagesOf(existing);
  const used = languagesOf(inUse);
  const languages = Object.entries(allLanguages)
    .map(([name, label]) => ({
      name,
      label,
      allowed: !taken.includes(name),
      encouraged: used.includes(name) || name in uiLanguages,
    }))
    .sort(byLabel);
  return { title: template[0]?.msg_title ?? "", languages };
}

interface TranslationDialogProps {
  task: SearchTask;
  /** The one selected template; the task allows no other number. */
  ids: Key[];
  onCancel: () => void;
}

/**
 * AddTranslation.html: the language of a new translation of one message template, the ones in use
 * first, then the editor opened for it, which creates the translation.
 */
export function TranslationDialog({ task, ids, onCancel }: TranslationDialogProps) {
  const titleId = useId();
  const templateField = useId();
  const localeId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const templateId = ids[0];
  const [selected, setSelected] = useState<string | null>(null);
  const [other, setOther] = useState("");
  const loaded = useQuery({
    queryKey: ["addTranslation", templateId],
    queryFn: () => {
      if (ids.length !== 1 || templateId === undefined)
        throw new Error(ts("Select exactly one message template."));
      return loadLanguages(templateId);
    },
    gcTime: 0,
  });
  const languages = loaded.data?.languages ?? [];
  const encouraged = languages.filter((language) => language.encouraged);

  // The first language offered first that has no translation yet, as core preselects.
  const preset = encouraged.find((language) => language.allowed)?.name;
  useEffect(() => {
    if (preset !== undefined && selected === null) setSelected(preset);
  }, [preset, selected]);

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  });

  const language = selected === "other" ? other : selected;
  const add = () => {
    if (!language || templateId === undefined) return;
    window.location.assign(
      window.CRM.url("civicrm/admin/messageTemplates/edit", { reset: 1 }) +
        `#/edit?id=${encodeURIComponent(String(templateId))}&lang=${encodeURIComponent(language)}`,
    );
  };
  const radio = (value: string, disabled: boolean) => (
    <input
      type="radio"
      name={`${localeId}-lang`}
      value={value}
      checked={selected === value}
      disabled={disabled}
      onChange={() => {
        setSelected(value);
      }}
    />
  );

  return (
    <dialog
      ref={dialog}
      className="crm-search-task-dialog afreact-dialog"
      aria-labelledby={titleId}
      onClose={onCancel}
    >
      <h2 id={titleId} className="afreact-dialog-title">
        {task.title}
      </h2>
      <form
        className="afreact-dialog-body"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        {loaded.isPending && (
          <p role="status">
            <Icon name="fa-spinner fa-spin" />
            <span className="sr-only">{ts("Loading…")}</span>
          </p>
        )}
        {/* deviation:translation-dialog-labels-errors */}
        {loaded.isError && (
          <p className="alert alert-danger" role="alert">
            {errorMessage(loaded.error)}
          </p>
        )}
        {loaded.data && (
          <>
            <div className="form-group">
              <label htmlFor={templateField}>{ts("Message Template")}</label>
              <input
                id={templateField}
                className="form-control"
                value={loaded.data.title}
                disabled
              />
            </div>
            <div role="radiogroup" aria-labelledby={localeId} aria-required="true">
              <span id={localeId} className="control-label">
                {ts("Locale")} <span className="crm-marker">*</span>
              </span>
              {encouraged.map((each) => (
                <div className="radio" key={each.name}>
                  <label className={each.allowed ? undefined : "disabled"}>
                    {radio(each.name, !each.allowed)} {each.label}
                    {!each.allowed && (
                      <>
                        {" "}
                        <em>({ts("existing")})</em>
                      </>
                    )}
                  </label>
                </div>
              ))}
              {languages.length > 0 && (
                <div className="radio">
                  <label>
                    {radio("other", false)}
                    <span className="sr-only">{ts("Other")}</span>
                  </label>{" "}
                  <select
                    className="form-control"
                    aria-label={ts("Other")}
                    style={{ minWidth: 200 }}
                    value={other}
                    onChange={(event) => {
                      setOther(event.target.value);
                      setSelected("other");
                    }}
                  >
                    <option value="">{ts("Other")}</option>
                    {languages.map((each) => (
                      <option key={each.name} value={each.name} disabled={!each.allowed}>
                        {each.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </>
        )}
        <hr />
        <div className="afreact-dialog-buttons">
          <button type="button" className="btn btn-default" onClick={() => dialog.current?.close()}>
            <Icon name="fa-times" /> {ts("Cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!language}>
            <Icon name="fa-plus" /> {ts("Add")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
