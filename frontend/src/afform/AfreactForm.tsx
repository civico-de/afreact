import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createElement, useMemo, useRef, useState } from "react";
import { api4, errorMessage } from "../api/civi";
import { FormContext, Nodes, type FormState } from "./Layout";
import {
  applyPrefill,
  emptyData,
  entityDeclarations,
  findElements,
  routeArgs,
  type PrefillItem,
} from "./model";
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
  client: QueryClient,
): Promise<Loaded> {
  const form = await loadDefinition(name, source, client);
  const entities = entityDeclarations(form.layout);
  const names = Object.keys(entities);
  const args = routeArgs(location, names);
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

function isForm(form: FormDefinition): boolean {
  return findElements(form.layout, "af-form").length > 0;
}

export function AfreactForm({
  name,
  source = "api",
  location = window.location,
}: AfreactFormProps) {
  const { search, hash } = location;
  const client = useQueryClient();
  const loaded = useQuery({
    queryKey: ["Afreact", "form", name, source, search, hash],
    queryFn: () => loadForm(name, source, { search, hash }, client),
  });
  if (loaded.isSuccess) return <LoadedForm name={name} {...loaded.data} />;
  return (
    <div className="afreact-form" aria-busy={loaded.isPending}>
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
  const save = useMutation({
    mutationFn: async (values: FormData) =>
      (await api4<SubmitResponse>("Afform", "submit", { name, args, values }))[0] ?? {},
    onSuccess: ({ redirect }) => {
      if (redirect)
        window.location.href = redirect.startsWith("civicrm/")
          ? window.CRM.url(redirect)
          : redirect;
    },
  });
  const offsets = useMemo(() => joinOffsets(form.layout), [form]);
  const entities = useMemo(() => entityDeclarations(form.layout), [form]);
  // A redirect keeps the form busy until the browser leaves the page.
  const busy = save.isPending || !!save.data?.redirect;
  const root = useRef<HTMLFormElement>(null);
  const state: FormState = {
    data,
    update: (change) => setData(change),
    disabled: busy,
    joinOffsets: offsets,
    entities,
    formName: name,
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

  if (save.data?.message) {
    // HTML as in afForm; core substitutes submitted values into it unescaped (see docs/comparison.md).
    return (
      <div
        className="afform-confirmation"
        role="status"
        dangerouslySetInnerHTML={{ __html: save.data.message }}
      />
    );
  }
  const failure = incomplete
    ? ts("Please fill all required fields.")
    : save.isError
      ? errorMessage(save.error)
      : null;
  return (
    <div className="afreact-form" aria-busy={busy}>
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
      </FormContext.Provider>
    </div>
  );
}
