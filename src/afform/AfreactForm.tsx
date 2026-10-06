import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { api4, errorMessage, isApiError } from "../api/civi";
import { RouteOptionsContext } from "../search/displayFilters";
import type { ExpressionContext } from "./expressions";
import { DisplayCountContext } from "../url/UrlState";
import { uploadAll, UploadsContext, type Uploads, type UploadsState } from "./fields/upload";
import { FormContext, Nodes, type DraftStatus, type FormState } from "./Layout";
import {
  applyPrefill,
  emptyData,
  entityDeclarations,
  findElements,
  routeArgs,
  routeParams,
  submission,
  type PrefillItem,
  type Submission,
} from "./model";
import { replacePageTitle, titleWithLabels } from "./pageTitle";
import { announceSaved } from "./popup";
import { countDisplays } from "./SearchFieldset";
import { loadDefinition, type LayoutSource } from "./source";
import { initialiseData, joinOffsets } from "./structure";
import type { FormData, FormDefinition } from "./types";

interface SubmitResponse {
  redirect?: string;
  message?: string;
  /** Authorises the file uploads for the saved records (Afform.submitFile). */
  token?: string;
}

interface SubmitRequest {
  values: Submission;
  /** The response of a submit whose uploads failed: the retry only uploads. */
  saved?: SubmitResponse[];
}

interface DraftRequest {
  values: Submission;
  /** The form's data and file choices when the save started. */
  snapshot: string;
  /** Saved by autosave rather than a button. */
  background: boolean;
}

/** afForm's postProcess(): a redirect path, also one starting with "//", stays on this site. */
export function redirectUrl(redirect: string): string {
  if (redirect.startsWith("civicrm/")) return window.CRM.url(redirect);
  if (!redirect.startsWith("/")) return redirect;
  return `${window.location.protocol}//${window.location.host}${redirect}`;
}

interface AfreactFormProps {
  name: string;
  source?: LayoutSource;
  /** Source of route arguments; defaults to the page URL like Afform's routeParams. */
  location?: { search: string; hash: string };
  /**
   * Arguments of the placement (contact summary tab or block, case block), over the route's;
   * search displays filter by them. Undefined outside a placement.
   */
  options?: Record<string, unknown>;
  /** The form is the page, as on core's Afform page: filter labels go into the page title. */
  pageTitle?: boolean;
}

interface Prefilled {
  initial: FormData;
  /** Why Afform.prefill refused the form, e.g. closed for submissions; afForm then disables it. */
  closed: string | null;
}

interface Loaded extends Prefilled {
  form: FormDefinition;
  args: Record<string, unknown>;
  /** afCore's routeParams, which fill empty fields. */
  params: Record<string, string>;
}

/** afForm.loadData(): Angular prefills every af-form on load; search pages have none. */
async function prefillForm(
  name: string,
  form: FormDefinition,
  args: Record<string, unknown>,
  params: Record<string, string>,
): Promise<Prefilled> {
  const entities = entityDeclarations(form.layout);
  const prefilled = (prefill: PrefillItem[]) =>
    applyPrefill(emptyData(Object.keys(entities)), prefill, entities);
  const initial = (prefill: PrefillItem[]) =>
    initialiseData(form.layout, prefilled(prefill), params);
  if (!isForm(form)) return { initial: initial([]), closed: null };
  try {
    const prefill = await api4<PrefillItem>("Afform", "prefill", { name, args, fillMode: "form" });
    return { initial: initial(prefill), closed: null };
  } catch (error) {
    return { initial: initial([]), closed: errorMessage(error) };
  }
}

async function loadForm(
  name: string,
  source: LayoutSource,
  location: { search: string; hash: string },
  options: Record<string, unknown> | undefined,
  client: QueryClient,
): Promise<Loaded> {
  const form = await loadDefinition(name, source, client);
  const args = routeArgs(location, Object.keys(entityDeclarations(form.layout)), options);
  const params = routeParams(location);
  return { form, args, params, ...(await prefillForm(name, form, args, params)) };
}

/** ts() looks up the form's own translations first, then CiviCRM's page-wide strings; crmUrl() is CRM.url. */
export function formExpressions(strings: FormDefinition["strings"]): ExpressionContext {
  const own = new Map(Array.isArray(strings) ? [] : Object.entries(strings));
  return {
    translate: (text) => own.get(text) ?? ts(text),
    url: (path, query) => window.CRM.url(path, query),
  };
}

function isForm(form: FormDefinition): boolean {
  return findElements(form.layout, "af-form").length > 0;
}

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** ngMinlength: the minlength a set value falls short of, else 0. Browsers flag only typed values. */
function shortOf(control: Control): number {
  if (!("minLength" in control) || control.minLength <= 0) return 0;
  const { length } = control.value;
  return length > 0 && length < control.minLength ? control.minLength : 0;
}

/** The text of the control's label, without afField's required marker. */
function labelText(control: Control): string {
  const label = control.labels?.[0]?.cloneNode(true);
  if (!(label instanceof HTMLElement)) return "";
  label.querySelector(".crm-marker")?.remove();
  return label.textContent.trim();
}

/** A required autocomplete without a value: its input is marked invalid, not empty. */
function missingChoice(control: Control): boolean {
  return control.validity.customError && control.validationMessage === ts("Please select a value.");
}

/** afForm's message for the first invalid input: a missing value, a too short text, or else. */
function invalidMessage(control: Control): string {
  if (control.validity.valueMissing || missingChoice(control)) {
    return ts("Please fill all required fields.");
  }
  const minLength = shortOf(control);
  if (minLength) {
    const label = labelText(control);
    return label
      ? ts("%1 must be at least %2 characters.", { 1: label, 2: minLength })
      : ts("One or more fields must have at least %1 characters.", { 1: minLength });
  }
  return ts("Please check all answers are valid.");
}

/** CRM.alert() takes HTML; the server's messages are text. */
function asHtml(text: string): string {
  const element = document.createElement("div");
  element.textContent = text;
  return element.innerHTML;
}

/** afForm's handleError(): validation messages as a warning, anything else as an error. */
function alertFailure(error: unknown): void {
  if (isApiError(error) && error.error_code !== "1")
    window.CRM.alert(asHtml(error.error_message), ts("Please resolve these issues"), "warning");
  else window.CRM.alert(asHtml(errorMessage(error)), ts("There is a problem"), "error");
}

/** crmStatus(): CRM.status's box follows the call. */
async function withStatus<T>(
  options: Parameters<Window["CRM"]["status"]>[0],
  call: Promise<T>,
): Promise<T> {
  const box = window.CRM.status(options);
  try {
    const result = await call;
    box.resolve();
    return result;
  } catch (error) {
    box.reject();
    throw error;
  }
}

/** afForm saves drafts by itself every ten seconds after a change, for users it knows. */
const AUTOSAVE_MS = 10_000;

const focus = (element: HTMLElement | null) => {
  element?.focus();
};

export function AfreactForm({
  name,
  source = "api",
  location = window.location,
  options,
  pageTitle = false,
}: AfreactFormProps) {
  const { search, hash } = location;
  const client = useQueryClient();
  const queryKey = ["Afreact", "form", name, source, search, hash, options];
  const loaded = useQuery({
    queryKey,
    queryFn: () => loadForm(name, source, { search, hash }, options, client),
  });
  if (loaded.isSuccess)
    return (
      <RouteOptionsContext.Provider value={options}>
        {/* A reset loads the form afresh, so every part of it starts over. */}
        <LoadedForm
          key={loaded.dataUpdatedAt}
          name={name}
          pageTitle={pageTitle}
          onReset={(fresh) => client.setQueryData<Loaded>(queryKey, { ...loaded.data, ...fresh })}
          {...loaded.data}
        />
      </RouteOptionsContext.Provider>
    );
  return (
    <div className="afreact-form afform-directive" aria-busy={loaded.isPending}>
      {loaded.isError && (
        <div className="alert alert-danger" role="alert">
          {errorMessage(loaded.error)}
        </div>
      )}
      <p role="status" className="afreact-status">
        {loaded.isPending ? ts("Loading…") : ""}
      </p>
    </div>
  );
}

interface LoadedFormProps extends Loaded {
  name: string;
  pageTitle: boolean;
  onReset: (fresh: Prefilled) => void;
}

function LoadedForm(props: LoadedFormProps) {
  const { name, form, args, params, initial, closed, pageTitle, onReset } = props;
  const [data, setData] = useState(initial);
  /** The message above the form; the summary takes focus for what the server rejected. */
  const [failure, setFailure] = useState<{
    message: string;
    focus: boolean;
    /** From a draft save, whose next success takes it away. */
    draft?: boolean;
  } | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const summary = useRef<HTMLDivElement>(null);
  const announceFailure = (error: unknown) => {
    alertFailure(error);
    setFailure({ message: errorMessage(error), focus: true });
  };
  const [uploads] = useState<Uploads>(() => new Map());
  const [uploading, setUploading] = useState<string | null>(null);
  /** Counts the files chosen or removed, which change the form without changing its data. */
  const [fileChanges, setFileChanges] = useState(0);
  /** afForm's submissionResponse: the last response Afform.submit returned. */
  const submissionResponse = useRef<SubmitResponse[] | undefined>(undefined);
  const save = useMutation({
    mutationFn: async ({ values, saved }: SubmitRequest) => {
      const response =
        saved ??
        (await withStatus(
          { error: ts("Not Saved") },
          api4<SubmitResponse>("Afform", "submit", { name, args, values }),
        ));
      submissionResponse.current = response;
      const token = response[0]?.token;
      if (uploads.size && typeof token !== "string")
        throw new Error("Afform.submit returned no token for the files.");
      // afForm uploads the chosen files once the records exist, then finishes the submit.
      const failed = await uploadAll(name, token ?? null, uploads, setUploading);
      return { values, response, failed, retry: new Set(uploads.keys()) };
    },
    onSuccess: ({ values, response, failed }) => {
      // The records exist: a failed upload leaves only the files to retry, without an announcement.
      if (failed.length) {
        const retry = ts(
          "The form is saved, except for these files. Choose them again or remove them, then save.",
        );
        setFailure({ message: [retry, ...failed].join("\n"), focus: true });
        return;
      }
      setFailure(null);
      const { redirect, message } = response[0] ?? {};
      if (host.current) {
        const detail = {
          afform: form.meta,
          data: values,
          submissionResponse: [...response],
        };
        announceSaved(host.current, detail, !redirect && !message);
      }
      if (redirect) window.location.href = redirectUrl(redirect);
    },
    onError: (error, { values }) => {
      announceFailure(error);
      if (host.current)
        window.CRM.$(host.current).trigger("crmFormError", {
          afform: form.meta,
          data: values,
          submissionResponse: submissionResponse.current,
          error,
        });
    },
  });
  const snapshot = useMemo(() => JSON.stringify([data, fileChanges]), [data, fileChanges]);
  const [draftSaved, setDraftSaved] = useState(() => JSON.stringify([initial, 0]));
  /** The form as a draft failed to save it; autosave waits for a further change. */
  const [draftFailed, setDraftFailed] = useState<string | null>(null);
  const draft = useMutation({
    mutationFn: async ({ values }: DraftRequest) => {
      await withStatus(
        { start: ts("Saving Draft"), success: ts("Draft Saved"), error: ts("Not Saved") },
        api4("Afform", "submitDraft", { name, args, values }),
      );
      // afForm uploads the chosen files into the saved draft, without a token.
      const failed = await uploadAll(name, null, uploads, setUploading);
      if (failed.length) throw new Error(failed.join("\n"));
    },
    onSuccess: (_, { snapshot: saved }) => {
      setDraftSaved(saved);
      setFailure((current) => (current?.draft ? null : current));
    },
    // As afForm's handleError(), a background save only alerts and leaves the focus alone.
    onError: (error, { snapshot: failed, background }) => {
      alertFailure(error);
      setFailure({ message: errorMessage(error), focus: !background, draft: true });
      setDraftFailed(failed);
    },
  });
  const reset = useMutation({
    mutationFn: () => prefillForm(name, form, args, params),
    onSuccess: onReset,
  });
  const saved = save.data?.failed.length ? undefined : save.data?.response[0];
  const retry = save.data?.failed.length ? save.data : undefined;
  const uploadsState = useMemo<UploadsState>(
    () => ({
      pending: uploads,
      retry: retry?.retry ?? null,
      changed: () => {
        setFileChanges((count) => count + 1);
      },
    }),
    [uploads, retry],
  );
  const offsets = useMemo(() => joinOffsets(form.layout), [form]);
  const entities = useMemo(() => entityDeclarations(form.layout), [form]);
  // A redirect keeps the form busy until the browser leaves the page.
  const busy = save.isPending || !!saved?.redirect;
  const root = useRef<HTMLFormElement>(null);
  const expressions = useMemo(() => formExpressions(form.strings), [form]);
  const displays = useMemo(() => countDisplays(form.layout), [form]);
  const [itemKeys] = useState(() => new Map<string, number[]>());
  const [labels, setLabels] = useState<string[]>([]);
  const changed = snapshot !== draftSaved;
  const draftStatus: DraftStatus = draft.isPending
    ? "saving"
    : changed
      ? "unsaved"
      : draft.isSuccess
        ? "saved"
        : "pristine";
  const showSubmitButton = !args.sid;
  const state: FormState = {
    data,
    update: setData,
    disabled: busy || closed !== null || reset.isPending || !!retry,
    // A submit waits for a running draft save, whose files and late answer would cross it.
    submitDisabled: busy || closed !== null || reset.isPending || draft.isPending,
    joinOffsets: offsets,
    routeParams: params,
    entities,
    formName: name,
    showSubmitButton,
    expressions,
    itemKeys,
    ...(isForm(form) && {
      reset: () => {
        reset.mutate();
      },
      draft: {
        status: draftStatus,
        save: () => {
          draft.mutate({ values: submission(data), snapshot, background: false });
        },
      },
    }),
    addTitle: setLabels,
  };

  // Drafts save themselves only before the form is submitted and where the server keeps them.
  const { mutate: saveDraft } = draft;
  const autosave =
    !!form.autosave_draft &&
    showSubmitButton &&
    closed === null &&
    (!!window.CRM.config?.cid || new URLSearchParams(window.location.search).has("_aff"));
  const submitted = save.isPending || save.isSuccess;
  useEffect(() => {
    if (!autosave || draftStatus !== "unsaved" || submitted || snapshot === draftFailed) return;
    const timer = setTimeout(() => {
      saveDraft({ values: submission(data), snapshot, background: true });
    }, AUTOSAVE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [autosave, draftStatus, submitted, snapshot, draftFailed, data, saveDraft]);

  // afForm.disableForm() tells why the form cannot be submitted.
  useEffect(() => {
    if (closed !== null) window.CRM.alert(asHtml(closed), ts("Sorry"), "error");
  }, [closed]);

  useEffect(() => {
    if (failure?.focus) summary.current?.focus();
  }, [failure]);

  const title = titleWithLabels(form.title ?? "", labels) || "CiviCRM";
  const shownTitle = useRef(form.title || "CiviCRM");
  useEffect(() => {
    if (!pageTitle || !host.current || shownTitle.current === title) return;
    replacePageTitle(host.current, shownTitle.current, title);
    shownTitle.current = title;
  }, [pageTitle, title]);

  function submit() {
    const controls = root.current?.querySelectorAll<Control>("input, select, textarea");
    const first = [...(controls ?? [])].find(
      (control) => !control.checkValidity() || shortOf(control) > 0,
    );
    if (first) {
      const message = invalidMessage(first);
      setFailure({ message, focus: false });
      // As afForm: on CiviCRM screens a notification too, elsewhere only the browser's own.
      if (document.getElementById("crm-notification-container"))
        window.CRM.alert(asHtml(message), ts("Form Error"));
      // Only the browser's own checks fire `invalid`, which shows the control's tab.
      if (first.validity.valid) first.dispatchEvent(new Event("invalid", { cancelable: true }));
      first.focus();
      first.reportValidity();
      return;
    }
    setFailure(null);
    save.mutate({ values: submission(data), saved: retry?.response });
  }

  if (saved?.message) {
    // The admin's HTML, with submitted values escaped by the server (Civi/Afreact/ConfirmationMessage.php).
    // It takes the focus of the submit button it replaces.
    return (
      <div
        className="afform-confirmation"
        role="status"
        tabIndex={-1}
        ref={focus}
        dangerouslySetInnerHTML={{ __html: saved.message }}
      />
    );
  }
  const lines = failure?.message.split("\n") ?? [];
  const status = uploading
    ? ts("Uploading %1", { 1: uploading })
    : busy
      ? ts("Saving…")
      : draftStatus === "saving"
        ? ts("Saving Draft")
        : save.isSuccess
          ? ts("Saved")
          : draftStatus === "saved"
            ? ts("Draft Saved")
            : "";
  // afCore marks every form element afform-directive; theme rules anchor dropdowns and toolbars on it.
  return (
    <div className="afreact-form afform-directive" aria-busy={busy} ref={host}>
      {closed !== null && (
        <div className="alert alert-danger" role="alert">
          {closed}
        </div>
      )}
      {failure && (
        <div className="alert alert-danger" role="alert" tabIndex={-1} ref={summary}>
          {/* Afform.submit joins its validation messages with line breaks. */}
          {lines.length > 1 ? (
            <ul>
              {lines.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          ) : (
            failure.message
          )}
        </div>
      )}
      <p role="status" className="afreact-status">
        {/* Without a confirmation message Angular keeps the filled form and shows a "Saved" status. */}
        {status}
      </p>
      <FormContext.Provider value={state}>
        <DisplayCountContext.Provider value={displays}>
          {isForm(form) ? (
            // A form around af-form as on core's Afform page, so Enter submits and af-form theme rules apply.
            <form
              ref={root}
              noValidate
              aria-label={form.title ?? undefined}
              onSubmit={(event) => {
                event.preventDefault();
                // Placed in a page's own <form> (the case summary), the submit must not reach it.
                event.stopPropagation();
                submit();
              }}
            >
              <UploadsContext.Provider value={uploadsState}>
                {createElement(
                  "af-form",
                  closed === null ? null : { className: "disabled" },
                  <Nodes nodes={form.layout} />,
                )}
              </UploadsContext.Provider>
            </form>
          ) : (
            <Nodes nodes={form.layout} />
          )}
        </DisplayCountContext.Provider>
      </FormContext.Provider>
    </div>
  );
}
