import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createElement, useMemo, useRef, useState } from "react";
import { api4, errorMessage } from "../api/civi";
import { RouteOptionsContext } from "../search/displayFilters";
import type { ExpressionContext } from "./expressions";
import { DisplayCountContext } from "../url/UrlState";
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
  const [incomplete, setIncomplete] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const save = useMutation({
    mutationFn: async (values: FormData) => {
      const response = await api4<SubmitResponse>("Afform", "submit", { name, args, values });
      return { values, response };
    },
    onSuccess: ({ values, response }) => {
      const { redirect, message } = response[0] ?? {};
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
  const saved = save.data?.response[0];
  const offsets = useMemo(() => joinOffsets(form.layout), [form]);
  const entities = useMemo(() => entityDeclarations(form.layout), [form]);
  // A redirect keeps the form busy until the browser leaves the page.
  const busy = save.isPending || !!saved?.redirect;
  const root = useRef<HTMLFormElement>(null);
  const expressions = useMemo(() => formExpressions(form.strings), [form]);
  const displays = useMemo(() => countDisplays(form.layout), [form]);
  const state: FormState = {
    data,
    update: setData,
    disabled: busy,
    joinOffsets: offsets,
    entities,
    formName: name,
    showSubmitButton: !args.sid,
    expressions,
  };

  function submit() {
    const controls = root.current?.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("input, select, textarea");
    const invalid = [...(controls ?? [])].find((control) => !control.checkValidity());
    setIncomplete(!!invalid);
    if (invalid) {
      invalid.focus();
      invalid.reportValidity();
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
  const failure = incomplete
    ? ts("Please fill all required fields.")
    : save.isError
      ? errorMessage(save.error)
      : null;
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
        {busy ? ts("Saving…") : save.isSuccess ? ts("Saved") : ""}
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
                submit();
              }}
            >
              {createElement("af-form", null, <Nodes nodes={form.layout} />)}
            </form>
          ) : (
            <Nodes nodes={form.layout} />
          )}
        </DisplayCountContext.Provider>
      </FormContext.Provider>
    </div>
  );
}
