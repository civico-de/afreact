import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { api4, errorMessage } from "../api/civi";
import { debugAllowed } from "../debug/debug";
import { DebugSwitch } from "../debug/DebugSwitch";
import { loadDefinition } from "../afform/source";
import { layoutProblems, noteKind, rowConditionCautions, taskDisplays } from "../afform/support";
import type { NoteKind } from "../afform/support";
import type { LayoutNode } from "../afform/types";
import { parseTaskList, unsupportedTaskNotes } from "../search/searchTasks";

export interface SupportRow {
  name: string;
  title: string | null;
  "type:label": string | null;
  server_route: string | null;
  placement: unknown;
  "placement:label": unknown;
}

/** Blocks are left out: core only places them inside other forms, whose rows include them. */
function loadForms(): Promise<SupportRow[]> {
  return api4<SupportRow>("Afform", "get", {
    select: ["name", "title", "type:label", "server_route", "placement", "placement:label"],
    where: [["type", "!=", "block"]],
    orderBy: { title: "ASC" },
  });
}

/** The tasks the form's displays offer or link to that the renderer cannot run. */
async function taskProblems(layout: LayoutNode[]): Promise<string[]> {
  const notes = await Promise.all(
    taskDisplays(layout).map(async ({ search, display, referenced }) => {
      const list = await api4("SearchDisplay", "getSearchTasks", {
        savedSearch: search,
        display,
      });
      return unsupportedTaskNotes(parseTaskList(list).tasks, referenced);
    }),
  );
  return notes.flat();
}

/** The setting the button writes; the page reads it as the `listed` attribute. */
const SETTING = "afreact_forms";

/** Placements core renders with InlineAfform.tpl, which passes their options. */
const INLINE_PLACEMENTS = new Set([
  "contact_summary_tab",
  "contact_summary_block",
  "case_summary_block",
  "event_manage_tab",
]);

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];

const inlinePlaced = (row: SupportRow) =>
  strings(row.placement).some((placement) => INLINE_PLACEMENTS.has(placement));

/** Where core shows the form: its page and its placements. */
export function shownAt(row: SupportRow): string[] {
  return [...(row.server_route ? [row.server_route] : []), ...strings(row["placement:label"])];
}

/** A form core shows somewhere is checked as shown there: `options.x` names nothing or the placement's. */
export function checkedOptions(row: SupportRow): Record<string, unknown> | undefined {
  return takenOver(row) ? {} : undefined;
}

/** Whether a listed form is rendered by React somewhere: on its page, placed inline or as a dashlet. */
export function takenOver(row: SupportRow): boolean {
  return (
    !!row.server_route || inlinePlaced(row) || strings(row.placement).includes("dashboard_dashlet")
  );
}

interface AfreactSupportProps {
  /** Forms in the afreact_forms setting. */
  listed: string[];
  /** The settings page, where the list is edited. */
  settings: string;
}

/**
 * The support report: every form with the "Not supported" notes React would show,
 * from the same walk the renderer uses (layoutProblems).
 */
export function AfreactSupport({ listed, settings }: AfreactSupportProps) {
  const client = useQueryClient();
  // The setting as last saved; the page's own save updates it.
  const [current, setCurrent] = useState(listed);
  const forms = useQuery({
    queryKey: ["afreact-support-forms"],
    queryFn: loadForms,
  });
  const rows = forms.data ?? [];
  const checks = useQueries({
    queries: rows.map((row) => ({
      queryKey: ["afreact-support", row.name],
      queryFn: async () => {
        const { layout } = await loadDefinition(row.name, "api", client);
        const problems = [
          ...layoutProblems(layout, checkedOptions(row)),
          ...(await taskProblems(layout)),
        ];
        return { problems, cautions: rowConditionCautions(layout) };
      },
    })),
  });
  const known = new Set(rows.map((row) => row.name));
  const missing = forms.isSuccess ? current.filter((name) => !known.has(name)) : [];
  const done = checks.filter((check) => !check.isPending).length;
  const withNotes = (kind: NoteKind) =>
    checks.filter((check) => check.data?.problems.some((note) => noteKind(note) === kind)).length;
  const gaps = withNotes("react");
  const angular = withNotes("angular");
  const nowhere = rows.filter((row) => shownAt(row).length === 0).length;
  const failed = checks.filter((check) => check.isError).length;
  const busy = forms.isPending || done < rows.length;

  // What the button saves: every form without a problem; a listed form that is missing or whose
  // check failed keeps its state.
  const supported = [
    ...rows
      .filter(
        (row, index) =>
          checks[index]?.data?.problems.length === 0 ||
          (checks[index]?.isError && current.includes(row.name)),
      )
      .map((row) => row.name),
    ...missing,
  ];
  const added = supported.filter((name) => !current.includes(name)).length;
  const dropped = current.filter((name) => !supported.includes(name)).length;
  const outcome = useRef<HTMLSpanElement>(null);
  const apply = useMutation({
    mutationFn: (names: string[]) => api4("Setting", "set", { values: { [SETTING]: names } }),
    onSuccess: (_, names) => {
      setCurrent(names);
    },
    // The disabled button loses the focus; the outcome takes it.
    onSettled: () => {
      outcome.current?.focus();
    },
  });

  return (
    <div className="afreact-support">
      <p>{ts("React renders the forms listed in its settings; all others stay with Angular.")}</p>
      <p>
        <a href={settings}>{ts("Choose the forms React renders")}</a>
      </p>
      {debugAllowed() && <DebugSwitch />}
      {forms.isError && (
        <div className="alert alert-danger" role="alert">
          {errorMessage(forms.error)}
        </div>
      )}
      {forms.isSuccess && !busy && (
        <p className="afreact-support-apply">
          <button
            type="button"
            className="btn btn-primary"
            disabled={apply.isPending || added + dropped === 0}
            onClick={() => {
              apply.mutate(supported);
            }}
          >
            {ts("Render every supported form with React")}
          </button>{" "}
          <span role="status" tabIndex={-1} ref={outcome}>
            {added + dropped === 0
              ? ts("The settings list every supported form.")
              : ts("Lists %1 more forms and drops %2 with parts React cannot show.", {
                  1: added,
                  2: dropped,
                })}
          </span>
        </p>
      )}
      {apply.isError && (
        <div className="alert alert-danger" role="alert">
          {errorMessage(apply.error)}
        </div>
      )}
      {missing.length > 0 && (
        <div className="alert alert-warning" role="alert">
          {ts("Listed in the settings but not found: %1", {
            1: missing.join(", "),
          })}
        </div>
      )}
      <p role="status">
        {forms.isSuccess && !busy
          ? ts(
              "Checked %1 forms: %2 with parts not yet in React, %3 needing Angular code, %4 shown nowhere by core, %5 not loaded.",
              { 1: rows.length, 2: gaps, 3: angular, 4: nowhere, 5: failed },
            )
          : ""}
      </p>
      {busy && !forms.isError && (
        <label className="afreact-support-progress">
          {ts("Checking forms")} <progress value={done} max={rows.length || undefined} />
        </label>
      )}
      {forms.isSuccess && (
        <table className="table" aria-busy={busy}>
          <caption className="sr-only">{ts("React renderer support by form")}</caption>
          <thead>
            <tr>
              <th scope="col">{ts("Form")}</th>
              <th scope="col">{ts("Type")}</th>
              <th scope="col">{ts("Shown at")}</th>
              <th scope="col">{ts("Rendered by")}</th>
              <th scope="col">{ts("Notes")}</th>
              <th scope="col">{ts("Preview")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <SupportRowView
                key={row.name}
                row={row}
                listed={current.includes(row.name)}
                check={checks[index]}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

interface Check {
  data?: { problems: string[]; cautions: string[] };
  error: unknown;
  isError: boolean;
}

function SupportRowView({
  row,
  listed,
  check,
}: {
  row: SupportRow;
  listed: boolean;
  check?: Check;
}) {
  const preview = (renderer: string) =>
    window.CRM.url("civicrm/afreact/render", { name: row.name, renderer });
  return (
    <tr>
      <th scope="row">
        {row.title && (
          <>
            {row.title}
            <br />
          </>
        )}
        <code>{row.name}</code>
      </th>
      <td>{row["type:label"]}</td>
      <td>{shownAt(row).join(", ") || ts("Nowhere")}</td>
      <td>{listed && takenOver(row) ? "React" : "Angular"}</td>
      <td>
        <Problems check={check} />
      </td>
      <td>
        <a href={preview("react")}>React</a> · <a href={preview("angular")}>Angular</a>
      </td>
    </tr>
  );
}

function Problems({ check }: { check?: Check }) {
  if (check?.isError) return <span className="text-danger">{errorMessage(check.error)}</span>;
  if (!check?.data) return <>{ts("Checking…")}</>;
  const { problems, cautions } = check.data;
  if (!problems.length && !cautions.length) return <>{ts("Nothing")}</>;
  const unique = [...new Set(problems)];
  const list = (kind: NoteKind, heading: string) => {
    const notes = unique.filter((note) => noteKind(note) === kind);
    return (
      notes.length > 0 && (
        <>
          <p className="afreact-support-kind">{heading}</p>
          <ul className="afreact-support-problems">
            {notes.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </>
      )
    );
  };
  return (
    <>
      {list("react", ts("Not yet in React"))}
      {list("angular", ts("Uses Angular code, which only the Angular application runs"))}
      {list("placement", ts("Shown as meant only where placed, which gives it its arguments"))}
      {cautions.length > 0 && (
        <>
          <p className="afreact-support-kind">{ts("Shown as meant only by React")}</p>
          <ul className="afreact-support-problems">
            {[...new Set(cautions)].map((caution) => (
              <li key={caution}>{caution}</li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
