import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createElement, useMemo, useRef, useState } from "react";
import { api4, errorMessage } from "../api/civi";
import { RouteOptionsContext } from "../search/displayFilters";
import type { ExpressionContext } from "./expressions";
import { DisplayCountContext } from "../url/UrlState";
import { uploadAll, UploadsContext, type Uploads } from "./fields/upload";
import { FormContext, Nodes, type FormState } from "./Layout";
import {
  applyPrefill,
  emptyData,
  entityDeclarations,
  findElements,
  routeArgs,
  type PrefillItem,
} from "./model";
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
}

interface Loaded {
  form: FormDefinition;
  args: Record<string, unknown>;
  initial: FormData;
}

async function loadForm(
  name: string,
  source: LayoutSource,
  location: { search: string; hash: string },
  options: Record<string, unknown> | undefined,
  client: QueryClient,
): Promise<Loaded> {
  const form = await loadDefinition(name, source, client);
  const entities = entityDeclarations(form.layout);
  const names = Object.keys(entities);
  const args = routeArgs(location, names, options);
  // Angular prefills every af-form on load, which also rejects closed forms; search pages have none.
  const prefill = isForm(form)
    ? await api4<PrefillItem>("Afform", "prefill", { name, args, fillMode: "form" })
    : [];
  return {
    form,
    args,
    initial: initialiseData(form.layout, applyPrefill(emptyData(names), prefill, entities)),
  };
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

/** afForm's message for the first invalid input: a missing value, a too short text, or else. */
function invalidMessage(control: Control): string {
  if (control.validity.valueMissing) return ts("Please fill all required fields.");
  const minLength = shortOf(control);
  if (minLength) {
    const label = labelText(control);
    return label
      ? ts("%1 must be at least %2 characters.", { 1: label, 2: minLength })
      : ts("One or more fields must have at least %1 characters.", { 1: minLength });
  }
  return ts("Please check all answers are valid.");
}

export function AfreactForm({
  name,
  source = "api",
  location = window.location,
  options,
}: AfreactFormProps) {
  const { search, hash } = location;
  const client = useQueryClient();
  const loaded = useQuery({
    queryKey: ["Afreact", "form", name, source, search, hash, options],
    queryFn: () => loadForm(name, source, { search, hash }, options, client),
  });
  if (loaded.isSuccess)
    return (
      <RouteOptionsContext.Provider value={options}>
        <LoadedForm name={name} {...loaded.data} />
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

function LoadedForm({ name, form, args, initial }: Loaded & { name: string }) {
  const [data, setData] = useState(initial);
  const [invalid, setInvalid] = useState<string | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const [uploads] = useState<Uploads>(() => new Map());
  const [uploading, setUploading] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async (values: FormData) => {
      const response = await api4<SubmitResponse>("Afform", "submit", { name, args, values });
      // afForm uploads the chosen files once the records exist, then finishes the submit.
      const failed = await uploadAll(name, response[0]?.token, uploads, setUploading);
      return { values, response, failed };
    },
    onSuccess: ({ values, response, failed }) => {
      // A failed upload keeps the form with its error, instead of a confirmation or redirect.
      const { redirect, message } = failed.length ? {} : (response[0] ?? {});
      if (host.current) {
        const detail = {
          afform: { name, title: form.title },
          data: values,
          submissionResponse: [...response],
        };
        announceSaved(host.current, detail, !redirect && !message);
      }
      if (redirect)
        window.location.href = redirect.startsWith("civicrm/")
          ? window.CRM.url(redirect)
          : redirect;
    },
  });
  const saved = save.data?.failed.length ? undefined : save.data?.response[0];
  const offsets = useMemo(() => joinOffsets(form.layout), [form]);
  const entities = useMemo(() => entityDeclarations(form.layout), [form]);
  // A redirect keeps the form busy until the browser leaves the page.
  const busy = save.isPending || !!saved?.redirect;
  const root = useRef<HTMLFormElement>(null);
  const expressions = useMemo(() => formExpressions(form.strings), [form]);
  const displays = useMemo(() => countDisplays(form.layout), [form]);
  const [itemKeys] = useState(() => new Map<string, number[]>());
  const state: FormState = {
    data,
    update: setData,
    disabled: busy,
    joinOffsets: offsets,
    entities,
    formName: name,
    showSubmitButton: !args.sid,
    expressions,
    itemKeys,
  };

  function submit() {
    const controls = root.current?.querySelectorAll<Control>("input, select, textarea");
    const first = [...(controls ?? [])].find(
      (control) => !control.checkValidity() || shortOf(control) > 0,
    );
    setInvalid(first ? invalidMessage(first) : null);
    if (first) {
      first.focus();
      first.reportValidity();
      return;
    }
    save.mutate(data);
  }

  if (saved?.message) {
    // The admin's HTML, with submitted values escaped by the server (Civi/Afreact/ConfirmationMessage.php).
    return (
      <div
        className="afform-confirmation"
        role="status"
        dangerouslySetInnerHTML={{ __html: saved.message }}
      />
    );
  }
  const failure =
    invalid ?? (save.isError ? errorMessage(save.error) : save.data?.failed.join(" ") || null);
  // afCore marks every form element afform-directive; theme rules anchor dropdowns and toolbars on it.
  return (
    <div className="afreact-form afform-directive" aria-busy={busy} ref={host}>
      {failure && (
        <div className="alert alert-danger" role="alert">
          {failure}
        </div>
      )}
      <p role="status" className="afreact-status">
        {/* Without a confirmation message Angular keeps the filled form and shows a "Saved" status. */}
        {uploading
          ? ts("Uploading %1", { 1: uploading })
          : busy
            ? ts("Saving…")
            : save.isSuccess
              ? ts("Saved")
              : ""}
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
              <UploadsContext.Provider value={uploads}>
                {createElement("af-form", null, <Nodes nodes={form.layout} />)}
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
