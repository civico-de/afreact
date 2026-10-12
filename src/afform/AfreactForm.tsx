import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api4, errorMessage, isApiError } from "../api/civi";
import { DebugFacts, debugMode, DebugSection } from "../debug/debug";
import { asHtml } from "../html";
import { RouteOptionsContext } from "../search/displayFilters";
import type { ExpressionContext } from "./expressions";
import { DisplayCountContext } from "../url/UrlState";
import { uploadAll, UploadsContext, type Uploads, type UploadsState } from "./fields/upload";
import { FormContext, Nodes, type DraftStatus, type FormState } from "./Layout";
import {
  applyPrefill,
  draftValues,
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
  /** False while Afform.prefill is still out: the form shows, blocked, as afForm shows it. */
  prefilled: boolean;
}

interface Loaded extends Prefilled {
  form: FormDefinition;
  args: Record<string, unknown>;
  /** afCore's routeParams, which fill empty fields. */
  params: Record<string, string>;
}

/** Afform.prefill's records merged over `data`, then the layout's items and defaults ensured. */
function prefilledData(
  form: FormDefinition,
  data: FormData,
  prefill: PrefillItem[],
  params: Record<string, string>,
): FormData {
  const entities = entityDeclarations(form.layout);
  return initialiseData(form.layout, applyPrefill(data, prefill, entities), params);
}

/** afForm.loadData(): Angular prefills every af-form on load; search pages have none. */
async function prefillForm(
  name: string,
  form: FormDefinition,
  args: Record<string, unknown>,
  params: Record<string, string>,
): Promise<Prefilled> {
  // deviation:reset-refills-route-values
  const { initial } = unfilled(form, params);
  if (!isForm(form)) return { initial, closed: null, prefilled: true };
  try {
    const prefill = await api4<PrefillItem>("Afform", "prefill", { name, args, fillMode: "form" });
    return {
      initial: prefilledData(form, initial, prefill, params),
      closed: null,
      prefilled: true,
    };
  } catch (error) {
    return { initial, closed: errorMessage(error), prefilled: true };
  }
}

/** The form before its prefill: route values and defaults in place, nothing loaded yet. */
function unfilled(form: FormDefinition, params: Record<string, string>): Prefilled {
  const entities = entityDeclarations(form.layout);
  const initial = initialiseData(form.layout, emptyData(Object.keys(entities)), params);
  return { initial, closed: null, prefilled: !isForm(form) };
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
  return { form, args, params, ...unfilled(form, params) };
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
  const { length } = control.value.trim();
  return length > 0 && length < control.minLength ? control.minLength : 0;
}

/** The text of the control's label, without afField's required marker. */
function labelText(control: Control): string {
  const label = control.labels?.[0]?.cloneNode(true);
  if (!(label instanceof HTMLElement)) return "";
  // deviation:minlength-message-without-marker
  label.querySelector(".crm-marker")?.remove();
  return label.textContent.trim();
}

/** Required fields marked invalid by the renderer: an autocomplete without a value, only spaces. */
const MISSING_MESSAGES = [ts("Please select a value."), ts("This field is required.")];

function missingChoice(control: Control): boolean {
  return control.validity.customError && MISSING_MESSAGES.includes(control.validationMessage);
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
  return (
    <DebugSection value={ts("Form %1", { 1: name })}>
      {debugMode() && (
        <FormDebug name={name} source={source} options={options} location={location} />
      )}
      {loaded.isSuccess ? (
        <RouteOptionsContext.Provider value={options}>
          {/* A reset loads the form afresh, so every part of it starts over. */}
          <LoadedForm
            // deviation:reset-reloads-form
            key={loaded.dataUpdatedAt}
            name={name}
            pageTitle={pageTitle}
            onReset={(fresh) => {
              client.setQueryData<Loaded>(queryKey, { ...loaded.data, ...fresh });
            }}
            {...loaded.data}
          />
        </RouteOptionsContext.Provider>
      ) : (
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
      )}
    </DebugSection>
  );
}

/** Query parameters the Angular link leaves out: the render page's own, and tokens and modes bound to this page. */
const NOT_CARRIED = new Set(["q", "name", "renderer", "options", "_aff", "_authx", "snippet"]);

/** The form's facts in the debug panel, with the same form on the render page under Angular. */
function FormDebug({
  name,
  source,
  options,
  location,
}: {
  name: string;
  source: LayoutSource;
  options: Record<string, unknown> | undefined;
  location: { search: string; hash: string };
}) {
  const json = options ? JSON.stringify(options) : null;
  const query = new URLSearchParams(
    [...new URLSearchParams(location.search)].filter(([key]) => !NOT_CARRIED.has(key)),
  );
  // The same arguments React loads the form with; "{}" keeps the render page from picking any.
  query.set("name", name);
  query.set("renderer", "angular");
  query.set("options", json ?? "{}");
  const angular = `${window.CRM.url("civicrm/afreact/render", query.toString())}${location.hash}`;
  return (
    <DebugFacts
      facts={{
        [ts("Layout source")]: source,
        [ts("Placement arguments")]: json ?? [],
      }}
      links={[
        {
          label: json ? ts("Open with Angular, options %1", { 1: json }) : ts("Open with Angular"),
          href: angular,
        },
      ]}
    />
  );
}

interface LoadedFormProps extends Loaded {
  name: string;
  pageTitle: boolean;
  onReset: (fresh: Prefilled) => void;
}

function LoadedForm(props: LoadedFormProps) {
  const { name, form, args, params, initial, pageTitle, onReset } = props;
  const [data, setData] = useState(initial);
  const [edits, setEdits] = useState(0);
  // What the form holds by the time the prefill lands, for the async callback below.
  const latest = useRef(data);
  useEffect(() => {
    latest.current = data;
  });
  const [closed, setClosed] = useState(props.closed);
  const [prefilled, setPrefilled] = useState(props.prefilled);
  /** The message above the form; the summary takes focus for what the server rejected. */
  const [failure, setFailure] = useState<{
    message: string;
    focus: boolean;
    /** From a draft save, whose next success takes it away. */
    draft?: boolean;
  } | null>(null);
  // deviation:form-events-on-wrapper
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
  /** crm-recaptcha2's response, and the failed submissions after which it is void. */
  const recaptchaResponse = useRef<string | null>(null);
  const [submitFailures, setSubmitFailures] = useState(0);
  const respondRecaptcha = useCallback((response: string | null) => {
    recaptchaResponse.current = response;
  }, []);
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
      // deviation:failed-upload-retry
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
    onError: (error, { values, saved }) => {
      // Only a response Afform.submit received is used up; an upload retry sends none.
      if (!saved) setSubmitFailures((count) => count + 1);
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
  // deviation:prefill-without-overlay
  // The form shows before its prefill; the loaded records land over what it holds by then.
  const prefill = useMutation({
    mutationFn: () => api4<PrefillItem>("Afform", "prefill", { name, args, fillMode: "form" }),
    onSuccess: (records) => {
      const filled = prefilledData(form, latest.current, records, params);
      setData(filled);
      setEdits((count) => count + 1);
      setDraftSaved(JSON.stringify([filled, 0]));
      setPrefilled(true);
    },
    onError: (error) => {
      setClosed(errorMessage(error));
      setPrefilled(true);
    },
  });
  const { mutate: loadPrefill } = prefill;
  useEffect(() => {
    if (!props.prefilled) loadPrefill();
  }, [props.prefilled, loadPrefill]);
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
  // deviation:draft-pristine-label
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
    edit: (change) => {
      setData(change);
      setEdits((count) => count + 1);
    },
    edits,
    // deviation:closed-form-locked
    disabled: busy || closed !== null || reset.isPending || !!retry,
    // deviation:draft-save-holds-submit
    // A submit waits for a running draft save, whose files and late answer would cross it.
    submitDisabled: busy || closed !== null || reset.isPending || !prefilled || draft.isPending,
    joinOffsets: offsets,
    routeParams: params,
    entities,
    formName: name,
    showSubmitButton,
    prefilled,
    expressions,
    itemKeys,
    ...(isForm(form) && {
      reset: () => {
        reset.mutate();
      },
      draft: {
        status: draftStatus,
        save: () => {
          draft.mutate({ values: draftValues(data), snapshot, background: false });
        },
      },
      recaptcha: { respond: respondRecaptcha, failures: submitFailures },
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
    if (!autosave || draftStatus !== "unsaved" || submitted || snapshot === draftFailed) {
      return undefined;
    }
    const timer = setTimeout(() => {
      saveDraft({ values: draftValues(data), snapshot, background: true });
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
    // deviation:submit-error-summary
    if (failure?.focus) summary.current?.focus();
  }, [failure]);

  // deviation:title-labels-cleared
  const title = titleWithLabels(form.title ?? "", labels) || "CiviCRM";
  const shownTitle = useRef((form.title ?? "") || "CiviCRM");
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
    setEdits((count) => count + 1);
    const response = recaptchaResponse.current;
    save.mutate({
      values: submission(data, response === null ? {} : { recaptcha2: response }),
      saved: retry?.response,
    });
  }

  if (saved?.message) {
    // The admin's HTML, with submitted values escaped by the server (Civi/Afreact/ConfirmationMessage.php).
    // deviation:confirmation-takes-focus
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
    : !prefilled
      ? ts("Loading…")
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
    <div className="afreact-form afform-directive" aria-busy={busy || !prefilled} ref={host}>
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
                // deviation:case-summary-own-form
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
      {/* Below the form, the status comes and goes without moving it. */}
      {/* deviation:form-status-below */}
      <p role="status" className="afreact-status">
        {/* Without a confirmation message Angular keeps the filled form and shows a "Saved" status. */}
        {status}
      </p>
    </div>
  );
}
