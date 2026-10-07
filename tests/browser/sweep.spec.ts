/**
 * Every form of the site but blocks, rendered by both renderers on civicrm/afreact/render: the
 * same texts, fields, buttons and table rows, and no axe finding on React that Angular does not
 * share as theme contrast. Forms the support report finds nothing unsupported in must pass; the
 * others are reported. Nothing is submitted. SWEEP_FORMS=name1,name2 sweeps only those forms.
 * The result goes to test-results/sweep.json and sweep.md and is attached to the report.
 */
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { entityDeclarations } from "../../src/afform/model";
import {
  isElement,
  type ElementNode,
  type FormDefinition,
  type LayoutNode,
} from "../../src/afform/types";
import { parseFiltersAttribute, routeKeys } from "../../src/search/displayFilters";
import { checkedOptions, type SupportRow } from "../../src/support/AfreactSupport";
import { api, axeFindings, ownFindings, type Renderer } from "./harness";

const SCOPE = ".afreact-render";
const LOAD_MS = 30_000;
const NOTE_PREFIX = "Not supported by the React renderer: ";

interface Field {
  name: string;
  shown: boolean;
  label: string;
  help: string[];
  /** As the user meets it: text, email, number, choice, date, radio, checkboxes, display, … */
  kind: string;
  options: string[];
  value: string[];
  required: boolean;
  disabled: boolean;
}

interface Display {
  headers: string[];
  rows: { id: string | null; cells: string[] }[];
}

interface Observed {
  texts: string[];
  alerts: string[];
  fields: Field[];
  buttons: string[];
  displays: Display[];
  notes: string[];
}

/** Demo forms whose list, grid and tree always hold items: equal must not mean unread. */
const FILLED = ["afsearchAfreactDemoList", "afsearchAfreactDemoGrid", "afsearchAfreactDemoTree"];

type Status = "identical" | "differs" | "unsupported note" | "error";

interface Result {
  name: string;
  title: string | null;
  /** The support report found nothing React cannot show; such a form must pass. */
  supported: boolean;
  reported: string[];
  status: Status;
  urls: Record<Renderer, string>;
  /** What the form would read from the URL or its placement, left empty here. */
  renderedEmpty: string[];
  differences: string[];
  notes: string[];
  axe: { react: string[]; angular: string[]; reactOnly: string[]; excused: string[] };
  errors: string[];
  /** Why the gate fails this form; empty for forms it passes or does not gate. */
  failures: string[];
  /** Rows and items the React page's displays show; proves the comparison read them. */
  items: number;
}

/** AngularJS on the Angular page. */
declare const angular: {
  getTestability: (element: Element) => { whenStable: (callback: () => void) => void };
  element: (element: Element) => { controller: (name: string) => unknown };
};

/** React has loaded the layout, the prefill and every table page, count and label. */
function reactReady(scope: string): boolean {
  const root = document.querySelector(scope);
  const host = root?.querySelector("afreact-form > div");
  return (
    host?.getAttribute("aria-busy") === "false" &&
    !root?.querySelector(
      "[aria-busy=true], .crm-search-loading-placeholder, .crm-search-display > .form-inline > span:not(:has(label))",
    )
  );
}

/**
 * Angular has compiled the form and each outer SearchKit display holds its first
 * results (or waits for its search button): SearchKit's 600 ms filter debounce is a plain
 * timeout that Angular's testability does not see. A display in a hidden af-tab runs only once
 * shown (searchDisplayBaseTrait's visibility check), as on React. afTabset selects its first
 * tab in a timeout, so until then every panel is hidden and no display has started.
 */
function angularReady(scope: string): boolean {
  const root = document.querySelector(scope);
  if (!root?.querySelector("form > *")?.firstElementChild) return false;
  if (root.querySelector(".crm-search-loading-placeholder")) return false;
  const panels = [...root.querySelectorAll("af-tab > [role=tabpanel]")];
  if (panels.length && panels.every((panel) => panel.classList.contains("ng-hide"))) return false;
  const tags = ["table", "grid", "list", "tree"].map((type) => `crm-search-display-${type}`);
  const selector = tags.join(", ");
  return [...root.querySelectorAll(selector)]
    .filter((display) => !display.parentElement?.closest(selector))
    .filter((display) => !display.closest("af-tab > .ng-hide"))
    .every((display) => {
      const name = display.localName.replace(/-([a-z])/g, (_, letter: string) =>
        letter.toUpperCase(),
      );
      const ctrl = angular.element(display).controller(name);
      if (typeof ctrl !== "object" || ctrl === null) return false;
      const settings: unknown = Reflect.get(ctrl, "settings");
      const button =
        typeof settings === "object" && !!settings && !!Reflect.get(settings, "button");
      return (
        !Reflect.get(ctrl, "loading") && (Reflect.get(ctrl, "results") !== undefined || button)
      );
    });
}

/**
 * What a user meets in `scope`, read the same way on both renderers. Widgets that differ by
 * design (docs/comparison.md, "Differences by design") are read for what they show.
 */
function observe(scope: string): Observed {
  const root = document.querySelector(scope);
  if (!root) throw new Error(`No ${scope} on the page`);
  const visible = (el: Element) => el.getClientRects().length > 0;
  const text = (el: Element | null | undefined): string => {
    if (!el) return "";
    const copy = el.cloneNode(true);
    if (!(copy instanceof Element)) return "";
    for (const hidden of copy.querySelectorAll(
      ".sr-only, .dropdown-menu, .ng-hide, [hidden], [style*='visibility: hidden'], .select2-drop",
    ))
      hidden.remove();
    return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
  };
  const isControl = (
    el: Element | null,
  ): el is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
    el instanceof HTMLInputElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement;
  const flags = (control: Element | null) => ({
    required:
      (isControl(control) && control.required) || control?.getAttribute("aria-required") === "true",
    disabled: isControl(control) && control.disabled,
  });
  // The option's own label; the field label may point at a lone option too (is_primary).
  const optionText = (input: HTMLInputElement) =>
    text([...(input.labels ?? [])].find((label) => !label.matches(".crm-af-field-label"))) ||
    (input.getAttribute("aria-label") ?? "");
  const group = (kind: string, inputs: HTMLInputElement[]): Partial<Field> => ({
    kind,
    options: inputs.map(optionText),
    value: inputs.filter((input) => input.checked).map(optionText),
    ...flags(inputs[0] ?? null),
  });

  // Select, EntityRef and ChainSelect: select2 on Angular, native select or combobox on React.
  const choice = (widget: Element): Partial<Field> => {
    // select2 hides the input it replaces and names its container s2id_<input id>.
    const replaced = widget.id.startsWith("s2id_")
      ? document.getElementById(widget.id.slice("s2id_".length))
      : null;
    const model =
      replaced ?? (widget instanceof HTMLSelectElement ? widget : widget.querySelector("input"));
    let value: string[];
    if (widget instanceof HTMLSelectElement)
      value = [...widget.selectedOptions].filter((o) => o.value !== "").map((o) => text(o));
    else {
      const items = [...widget.querySelectorAll(".select2-search-choice > div")].map(text);
      const chosen = widget.querySelector(".select2-choice:not(.select2-default) .select2-chosen");
      // A single React combobox shows the chosen label in its input.
      const input = widget.querySelector("input.select2-input:not(.select2-default)");
      const typed = input instanceof HTMLInputElement ? input.value : "";
      value = items.length ? items : chosen ? [text(chosen)] : [typed];
    }
    return { kind: "choice", value: value.filter(Boolean), ...flags(model) };
  };

  const control = (field: Element): Partial<Field> => {
    const note = field.querySelector(".afreact-unsupported");
    if (note) return { kind: "unsupported", value: [text(note)] };
    const widget = field.querySelector(".select2-container, select");
    if (widget) return choice(widget);
    // Date fields: jQuery's datepicker keeps the ISO value in the input it hides; React's native
    // input holds it with a "T" before the time (comparison.md, "Date fields").
    const date = field.querySelector(
      "input[crm-ui-datepicker], input[type=date], input[type=datetime-local]",
    );
    if (date instanceof HTMLInputElement)
      return { kind: "date", value: [date.value.replace("T", " ").slice(0, 16)], ...flags(date) };
    const radios = [...field.querySelectorAll<HTMLInputElement>("input[type=radio]")];
    if (radios.length) return group("radio", radios);
    const boxes = [...field.querySelectorAll<HTMLInputElement>(".crm-checkbox-list input")];
    if (boxes.length) return group("checkboxes", boxes);
    const box = field.querySelector("input[type=checkbox]");
    if (box instanceof HTMLInputElement)
      return { kind: "checkbox", value: [String(box.checked)], ...flags(box) };
    const inputs = [...field.querySelectorAll("textarea, input")].filter(isControl);
    const first = inputs[0] ?? null;
    if (first)
      return {
        kind: first instanceof HTMLInputElement ? first.type : "textarea",
        value: inputs.map((input) => input.value),
        ...flags(first),
      };
    return { kind: "display", value: [text(field.querySelector(".crm-af-field"))] };
  };

  const fields = [...root.querySelectorAll("af-field")].map(
    (field): Field => ({
      name: field.getAttribute("name") ?? "",
      shown: visible(field),
      label: text(field.querySelector("label.crm-af-field-label")),
      help: [...field.querySelectorAll(".crm-af-field-help-pre, .crm-af-field-help-post")].map(
        text,
      ),
      kind: "",
      options: [],
      value: [],
      required: false,
      disabled: false,
      ...control(field),
    }),
  );

  // Fields, tables and notes are read on their own; admin gear menus are Angular-only.
  const elsewhere =
    "af-field, table, .afreact-unsupported, .crm-admin-block-context-dropdown, .select2-container";
  const texts = [...root.querySelectorAll("h1, h2, h3, h4, h5, h6, legend, summary, p")]
    .filter((el) => visible(el) && !el.closest(elsewhere))
    .map(text)
    .filter(Boolean);
  const alerts = [...root.querySelectorAll("[role=alert], .alert")]
    .filter((el) => visible(el) && !el.closest(elsewhere))
    .map(text);
  // Clear links are not buttons on Angular (comparison.md, "Clear links"); they sit in fields.
  const buttons = [
    ...root.querySelectorAll("button, a.btn, input[type=submit], input[type=button]"),
  ]
    .filter((el) => visible(el) && !el.closest(`${elsewhere}, .dropdown-menu`))
    .map((el) => {
      const label =
        [text(el), el.getAttribute("title"), el.getAttribute("aria-label")].find(Boolean) ?? "";
      const off = el instanceof HTMLButtonElement && el.disabled ? " (disabled)" : "";
      return `${label || (el instanceof HTMLInputElement ? el.value : "")}${off}`;
    });
  const displays = [...root.querySelectorAll(".crm-search-display")]
    .filter((display) => !display.parentElement?.closest(".crm-search-display"))
    .map((display): Display => {
      const table = display.querySelector(":scope > table");
      // Core up to 6.19 puts a space before the comma of linked lists (comparison.md,
      // "A space before the comma in linked lists"); React writes the fixed markup.
      const cell = (el: Element) => text(el).replace(/\s+,/g, ",");
      if (!table) {
        // List, grid and tree items are rows, their columns cells. Angular's tree items carry no
        // id (comparison.md, "Tree items"), so items are compared by position.
        const items = display.querySelectorAll(
          [
            ":scope > .crm-search-display-list-container > *",
            ":scope > .crm-search-display-grid-container > *",
            ":scope > ul.crm-search-display-tree-branch > li:not([aria-hidden])",
            ":scope > crm-search-display-tree-branch > ul > li:not([aria-hidden])",
          ].join(", "),
        );
        return {
          headers: [],
          rows: [...items].map((item) => ({
            id: null,
            cells: [...item.querySelectorAll(":scope > div[class*='crm-search-col-type-']")].map(
              cell,
            ),
          })),
        };
      }
      return {
        headers: [...table.querySelectorAll(":scope > thead > tr:first-child > th")].map(text),
        rows: [...table.querySelectorAll(":scope > tbody > tr")].map((tr) => ({
          id: tr.getAttribute("data-entity-id"),
          cells: [...tr.querySelectorAll(":scope > td")].map(cell),
        })),
      };
    });
  const notes = [...root.querySelectorAll(".afreact-unsupported")].map(text);
  return { texts, alerts, fields, buttons, displays, notes };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const listed = (what: string, react: string[], ng: string[]) =>
  same(react, ng) ? [] : [`${what}: React ${JSON.stringify(react)}, Angular ${JSON.stringify(ng)}`];
/** Values and cells may hold contact data, so only their shape goes into the report. */
const shape = (values: string[]) =>
  values.length ? values.map((value) => `${value.length} chars`).join(", ") : "empty";

function fieldDifferences(react: Field[], ng: Field[]): string[] {
  const keyed = (fields: Field[]) => {
    const seen = new Map<string, number>();
    return new Map(
      fields.map((field) => {
        const n = (seen.get(field.name) ?? 0) + 1;
        seen.set(field.name, n);
        return [n > 1 ? `${field.name} #${n}` : field.name, field];
      }),
    );
  };
  const [r, a] = [keyed(react), keyed(ng)];
  return [...new Set([...r.keys(), ...a.keys()])].flatMap((key) => {
    const [mine, theirs] = [r.get(key), a.get(key)];
    if (!mine || !theirs) return [`field ${key}: only on ${mine ? "React" : "Angular"}`];
    const found: string[] = [];
    for (const aspect of [
      "shown",
      "label",
      "help",
      "kind",
      "options",
      "required",
      "disabled",
    ] as const)
      if (!same(mine[aspect], theirs[aspect]))
        found.push(
          `field ${key} ${aspect}: React ${JSON.stringify(mine[aspect])}, Angular ${JSON.stringify(theirs[aspect])}`,
        );
    if (!same(mine.value, theirs.value))
      found.push(`field ${key} value: React ${shape(mine.value)}, Angular ${shape(theirs.value)}`);
    return found;
  });
}

const MAX_ROW_LINES = 20;

function displayDifferences(react: Display[], ng: Display[]): string[] {
  if (react.length !== ng.length)
    return [`search displays: ${react.length} on React, ${ng.length} on Angular`];
  return react.flatMap((mine, index) => {
    const theirs = ng[index]!;
    const where = `display ${index + 1}`;
    const found = listed(`${where} headers`, mine.headers, theirs.headers);
    if (mine.rows.length !== theirs.rows.length)
      found.push(`${where}: ${mine.rows.length} rows on React, ${theirs.rows.length} on Angular`);
    const rows = mine.rows.flatMap((row, n) => {
      const other = theirs.rows[n];
      if (!other) return [];
      const at = `${where} row ${n + 1}`;
      if (row.id !== other.id) return [`${at}: id ${row.id} on React, ${other.id} on Angular`];
      if (row.cells.length !== other.cells.length)
        return [`${at}: ${row.cells.length} cells on React, ${other.cells.length} on Angular`];
      return row.cells.flatMap((cell, k) =>
        cell === other.cells[k]
          ? []
          : [
              `${at} (id ${row.id}) column "${mine.headers[k] ?? k + 1}": React ${shape([cell])}, Angular ${shape([other.cells[k] ?? ""])}`,
            ],
      );
    });
    const more = rows.length - MAX_ROW_LINES;
    return [
      ...found,
      ...rows.slice(0, MAX_ROW_LINES),
      ...(more > 0 ? [`${where}: ${more} more`] : []),
    ];
  });
}

type SweptRow = SupportRow & { submit_currently_open: boolean | null };

/** Afform/AbstractProcessor's refusals, which React shows above a closed form. */
const CLOSED_ALERTS = [
  "This form is not currently open for submissions.",
  "You have reached the maximum number of submissions for this form.",
];

/**
 * On a form closed for submissions React shows the reason and disables every control, where
 * Angular only disables the submit button (docs/comparison.md); that difference is expected.
 */
function differences(react: Observed, ng: Observed, closed: boolean): string[] {
  const alerts = closed
    ? react.alerts.filter((alert) => !CLOSED_ALERTS.includes(alert))
    : react.alerts;
  const byName = new Map(ng.fields.map((field) => [field.name, field.disabled]));
  const fields = closed
    ? react.fields.map((field) => ({
        ...field,
        disabled: byName.get(field.name) ?? field.disabled,
      }))
    : react.fields;
  return [
    ...listed("texts", react.texts, ng.texts),
    ...listed("alerts", alerts, ng.alerts),
    ...fieldDifferences(fields, ng.fields),
    ...listed("buttons", react.buttons, ng.buttons),
    ...displayDifferences(react.displays, ng.displays),
  ];
}

const render = (name: string, renderer: Renderer, options?: Record<string, unknown>) =>
  `/civicrm/afreact/render?name=${encodeURIComponent(name)}&renderer=${renderer}${
    options ? `&options=${encodeURIComponent(JSON.stringify(options))}` : ""
  }`;

const message = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).split("\n")[0] ?? "";

interface Loaded {
  observed: Observed | null;
  axe: string[];
  errors: string[];
}

async function load(page: Page, url: string, renderer: Renderer): Promise<Loaded> {
  const errors: string[] = [];
  const onError = (error: Error) => errors.push(`${renderer} page error: ${message(error)}`);
  page.on("pageerror", onError);
  try {
    // Every wait is bounded, so a form that never settles fails alone.
    const response = await page.goto(url, { timeout: LOAD_MS });
    if (!response?.ok()) throw new Error(`HTTP ${response?.status() ?? "without response"}`);
    await page.waitForFunction(renderer === "react" ? reactReady : angularReady, SCOPE, {
      timeout: LOAD_MS,
    });
    if (renderer === "angular")
      await page.evaluate(
        ([scope, ms]) =>
          new Promise<void>((resolve, reject) => {
            setTimeout(() => {
              reject(new Error(`Angular not stable after ${ms} ms`));
            }, ms);
            angular.getTestability(document.querySelector(scope)!).whenStable(resolve);
          }),
        [SCOPE, LOAD_MS] as const,
      );
    await page.waitForLoadState("networkidle", { timeout: LOAD_MS });
    return {
      observed: await page.evaluate(observe, SCOPE),
      axe: await axeFindings(page, SCOPE),
      errors,
    };
  } catch (error) {
    return { observed: null, axe: [], errors: [...errors, `${renderer}: ${message(error)}`] };
  } finally {
    page.off("pageerror", onError);
  }
}

/** Elements of embedded search displays, of any display type. */
const displayElements = (nodes: LayoutNode[]): ElementNode[] =>
  nodes
    .filter(isElement)
    .flatMap((node) => [
      ...(node["#tag"].startsWith("crm-search-display-") ? [node] : []),
      ...displayElements(node["#children"] ?? []),
    ]);

/** What the form reads from the URL or its placement, none of which the sweep sets. */
async function readsArguments(
  page: Page,
  name: string,
  options: Record<string, unknown> | undefined,
): Promise<string[]> {
  const [form] = await api<FormDefinition>(page, "Afreact", "getForm", { name });
  if (!form) throw new Error(`Afreact.getForm returned no ${name}`);
  const updateOnly = Object.entries(entityDeclarations(form.layout))
    .filter(([, entity]) => entity.actions.create === false)
    .map(([entity]) => `${entity} id (update only)`);
  const keys = displayElements(form.layout).flatMap((node) => {
    const parsed = parseFiltersAttribute(node.filters);
    return "filters" in parsed ? routeKeys(parsed.filters) : [];
  });
  return [
    ...updateOnly,
    ...[...new Set(keys)].map((key) => `routeParams.${key}`),
    ...(options ? ["placement options (rendered with none)"] : []),
  ];
}

type Reported = { problems: string[] } | { error: string };

/** The support report's verdict per form, as civicrm/admin/afreact shows it. */
async function supportReport(page: Page): Promise<Map<string, Reported>> {
  await page.goto("/civicrm/admin/afreact");
  await expect(page.locator(".afreact-support p[role=status]")).toHaveText(/^Checked \d+ forms/, {
    timeout: 180_000,
  });
  const rows = await page.locator(".afreact-support tbody tr").evaluateAll((trs) =>
    trs.map((tr) => ({
      name: tr.querySelector("th code")?.textContent.trim() ?? "",
      error: tr.querySelector(".text-danger")?.textContent.trim() ?? null,
      problems: [...tr.querySelectorAll(".afreact-support-problems li")].map((li) =>
        li.textContent.trim(),
      ),
    })),
  );
  return new Map(
    rows.map(({ name, error, problems }) => [name, error === null ? { problems } : { error }]),
  );
}

/**
 * axe rules a form's own layout or display settings break on both renderers, which React renders
 * as written (comparison.md, upstream bugs). Per form and rule, React may have as many findings as
 * Angular; an entry that excuses nothing fails.
 */
const SHARED_CONTENT: Record<string, { rule: string; reason: string }[]> = {
  ...Object.fromEntries(
    ["afformTabMember", "afsearchTabMember", "afsearchTabRel"].map((name) => [
      name,
      [{ rule: "heading-order", reason: "the layout's h3 follows the page's h1" }],
    ]),
  ),
  ...Object.fromEntries(
    ["afsearchAdministerUserAccounts", "afsearchProfiles"].map((name) => [
      name,
      [{ rule: "heading-order", reason: "afTitle's h4 on a div follows the page's h1" }],
    ]),
  ),
  afsearchSettingsDatePreferences: [
    { rule: "link-name", reason: "the display's edit link has an icon and neither text nor title" },
  ],
};

const ruleOf = (finding: string) => finding.slice(0, finding.indexOf(":"));

function sharedContent(name: string, reactOnly: string[], ng: string[]) {
  const rules = new Map<string, string>();
  const stale: string[] = [];
  for (const { rule, reason } of SHARED_CONTENT[name] ?? []) {
    const count = (findings: string[]) => findings.filter((f) => ruleOf(f) === rule).length;
    if (!count(reactOnly)) stale.push(rule);
    else if (count(reactOnly) <= count(ng)) rules.set(rule, reason);
  }
  const excused = reactOnly.flatMap((finding) => {
    const reason = rules.get(ruleOf(finding));
    return reason ? [`${finding} (${reason})`] : [];
  });
  return { reactOnly: reactOnly.filter((f) => !rules.has(ruleOf(f))), excused, stale };
}

async function sweepForm(
  page: Page,
  row: SweptRow,
  reported: Reported | undefined,
): Promise<Result> {
  const options = checkedOptions(row);
  const urls = {
    react: render(row.name, "react", options),
    angular: render(row.name, "angular", options),
  };
  const react = await load(page, urls.react, "react");
  let renderedEmpty: string[] = [];
  const errors = [...react.errors];
  if (react.observed)
    try {
      renderedEmpty = await readsArguments(page, row.name, options);
    } catch (error) {
      errors.push(`react: ${message(error)}`);
    }
  const angularLoad = await load(page, urls.angular, "angular");
  errors.push(...angularLoad.errors);
  if (!reported) errors.push("missing from the support report");
  else if ("error" in reported) errors.push(`support report: ${reported.error}`);
  const supported = !!reported && "problems" in reported && reported.problems.length === 0;
  const notes = (react.observed?.notes ?? []).map((note) => note.replace(NOTE_PREFIX, ""));
  const found =
    react.observed && angularLoad.observed
      ? differences(react.observed, angularLoad.observed, row.submit_currently_open === false)
      : [];
  const shared =
    react.observed && angularLoad.observed
      ? sharedContent(row.name, ownFindings(react.axe, angularLoad.axe), angularLoad.axe)
      : { reactOnly: [], excused: [], stale: [] };
  const { reactOnly, stale } = shared;
  const status: Status = errors.length
    ? "error"
    : notes.length
      ? "unsupported note"
      : found.length
        ? "differs"
        : "identical";
  const failures = [
    ...(supported
      ? [
          ...errors,
          ...notes.map((note) => `"Not supported" note: ${note}`),
          ...found,
          ...reactOnly.map((finding) => `axe on React only: ${finding}`),
        ]
      : []),
    ...stale.map((rule) => `SHARED_CONTENT excuses no ${rule} finding any more`),
  ];
  return {
    name: row.name,
    title: row.title,
    supported,
    reported: reported && "problems" in reported ? [...new Set(reported.problems)] : [],
    status,
    items: (react.observed?.displays ?? []).reduce((sum, shown) => sum + shown.rows.length, 0),
    urls,
    renderedEmpty,
    differences: found,
    notes: [...new Set(notes)],
    axe: { react: react.axe, angular: angularLoad.axe, reactOnly, excused: shared.excused },
    errors,
    failures,
  };
}

const bullets = (items: string[]) => items.map((item) => `- ${item}`).join("\n");

function markdown(results: Result[], total: number): string {
  const count = (status: Status) => results.filter((result) => result.status === status).length;
  const failing = results.filter((result) => result.failures.length);
  const lines = [
    "# Parity sweep",
    "",
    `${results.length} of ${total} forms swept: ${count("identical")} identical, ${count("differs")} differ, ${count("unsupported note")} with a "Not supported" note, ${count("error")} with errors.`,
    `${results.filter((result) => result.supported).length} the support report calls supported, ${failing.length} of them failing.`,
    "",
    "| Form | Supported | Status | Differences | Notes | axe on React only |",
    "|---|---|---|---|---|---|",
    ...results.map(
      (result) =>
        `| \`${result.name}\` | ${result.supported ? "yes" : "no"} | ${result.status} | ${result.differences.length} | ${result.notes.length} | ${result.axe.reactOnly.length} |`,
    ),
  ];
  // Gate failures first, then the rest by name.
  for (const result of [...failing, ...results.filter((entry) => !entry.failures.length)]) {
    lines.push(
      "",
      `## ${result.name}${result.title ? ` (${result.title})` : ""}: ${result.status}`,
      "",
    );
    lines.push(`[React](${result.urls.react}) · [Angular](${result.urls.angular})`);
    const sections: [string, string[]][] = [
      ["Fails the gate", result.failures],
      ["Rendered without", result.renderedEmpty],
      ["Errors", result.errors],
      ["Differences (React against Angular)", result.differences],
      ['"Not supported" notes shown', result.notes],
      ["The support report lists", result.reported],
      ["axe on React only", result.axe.reactOnly],
      ["axe excused as the form's own content (SHARED_CONTENT)", result.axe.excused],
    ];
    for (const [heading, items] of sections)
      if (items.length) lines.push("", `${heading}:`, "", bullets(items));
  }
  return `${lines.join("\n")}\n`;
}

async function write(testInfo: TestInfo, results: Result[], total: number) {
  const dir = testInfo.project.outputDir;
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "sweep.json"), `${JSON.stringify(results, null, 2)}\n`);
  await writeFile(path.join(dir, "sweep.md"), markdown(results, total));
}

test("every form renders alike on both renderers", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  const reported = await supportReport(page);
  const forms = await api<SweptRow>(page, "Afform", "get", {
    select: [
      "name",
      "title",
      "type:label",
      "server_route",
      "placement",
      "placement:label",
      "submit_currently_open",
    ],
    // Core places blocks only inside other forms, which render them.
    where: [["type", "!=", "block"]],
    orderBy: { name: "ASC" },
  });
  const only = (process.env.SWEEP_FORMS ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const unknown = only.filter((name) => !forms.some((form) => form.name === name));
  expect(unknown, "names in SWEEP_FORMS that are no form or a block").toEqual([]);
  const gone = Object.keys(SHARED_CONTENT).filter((name) => !forms.some((f) => f.name === name));
  expect(gone, "forms in SHARED_CONTENT that are no form or a block").toEqual([]);
  const swept = only.length ? forms.filter((form) => only.includes(form.name)) : forms;
  expect(swept.length, "forms to sweep").toBeGreaterThan(0);
  test.setTimeout(300_000 + swept.length * 4 * LOAD_MS);

  const results: Result[] = [];
  for (const row of swept)
    await test.step(row.name, async () => {
      const result = await sweepForm(page, row, reported.get(row.name));
      results.push(result);
      await write(testInfo, results, forms.length);
      expect
        .soft(result.failures, `${row.name}, which the support report calls supported`)
        .toEqual([]);
      if (FILLED.includes(row.name))
        expect.soft(result.items, `items read from ${row.name}`).toBeGreaterThan(0);
    });

  const dir = testInfo.project.outputDir;
  await testInfo.attach("sweep.md", {
    path: path.join(dir, "sweep.md"),
    contentType: "text/markdown",
  });
  await testInfo.attach("sweep.json", {
    path: path.join(dir, "sweep.json"),
    contentType: "application/json",
  });
});
