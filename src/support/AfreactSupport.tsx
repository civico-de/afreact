import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { api4, errorMessage } from "../api/civi";
import { loadDefinition } from "../afform/source";
import { layoutProblems, taskDisplays } from "../afform/support";
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
      const list = await api4("SearchDisplay", "getSearchTasks", { savedSearch: search, display });
      return unsupportedTaskNotes(parseTaskList(list).tasks, referenced);
    }),
  );
  return notes.flat();
}

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

/** A form shown only inline gets its placement's options; its page, where it has one, gets none. */
export function checkedOptions(row: SupportRow): Record<string, unknown> | undefined {
  return !row.server_route && inlinePlaced(row) ? {} : undefined;
}

/** Whether a listed form is rendered by React somewhere: on its page or placed inline. */
export function takenOver(row: SupportRow): boolean {
  return !!row.server_route || inlinePlaced(row);
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
  const forms = useQuery({ queryKey: ["afreact-support-forms"], queryFn: loadForms });
  const rows = forms.data ?? [];
  const checks = useQueries({
    queries: rows.map((row) => ({
      queryKey: ["afreact-support", row.name],
      queryFn: async () => {
        const { layout } = await loadDefinition(row.name, "api", client);
        return [...layoutProblems(layout, checkedOptions(row)), ...(await taskProblems(layout))];
      },
    })),
  });
  const known = new Set(rows.map((row) => row.name));
  const missing = forms.isSuccess ? listed.filter((name) => !known.has(name)) : [];
  const done = checks.filter((check) => !check.isPending).length;
  const gaps = checks.filter((check) => check.data?.length).length;
  const failed = checks.filter((check) => check.isError).length;
  const busy = forms.isPending || done < rows.length;

  return (
    <div className="afreact-support">
      <p>{ts("React renders the forms listed in its settings; all others stay with Angular.")}</p>
      <p>
        <a href={settings}>{ts("Choose the forms React renders")}</a>
      </p>
      {forms.isError && (
        <div className="alert alert-danger" role="alert">
          {errorMessage(forms.error)}
        </div>
      )}
      {missing.length > 0 && (
        <div className="alert alert-warning" role="alert">
          {ts("Listed in the settings but not found: %1", { 1: missing.join(", ") })}
        </div>
      )}
      <p role="status">
        {forms.isSuccess && !busy
          ? ts("Checked %1 forms: %2 with parts React cannot show yet, %3 not loaded.", {
              1: rows.length,
              2: gaps,
              3: failed,
            })
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
              <th scope="col">{ts("What React cannot show yet")}</th>
              <th scope="col">{ts("Preview")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <SupportRowView
                key={row.name}
                row={row}
                listed={listed.includes(row.name)}
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
  data?: string[];
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
      <td>{shownAt(row).join(", ")}</td>
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
  const problems = check?.data;
  if (!problems) return <>{ts("Checking…")}</>;
  if (!problems.length) return <>{ts("Nothing")}</>;
  return (
    <ul className="afreact-support-problems">
      {[...new Set(problems)].map((problem) => (
        <li key={problem}>{problem}</li>
      ))}
    </ul>
  );
}
