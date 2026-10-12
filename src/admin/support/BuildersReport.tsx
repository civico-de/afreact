import {
  behaviorEditable,
  elementEditable,
  entityOptionsEditable,
  inputTypeEditable,
} from "../afform/editable";
import { hasIslandEditor } from "../search/display/AngularIsland";
import { hasDisplayEditor } from "../search/display/DisplayEditor";
import { hasPluginEditor } from "../search/display/PluginDisplayEditor";
import { usePageLoaded } from "../pageLoaded";

/** What SupportPage hands the report: display types by stored value, and BuilderReport's findings. */
export interface BuilderFindings {
  displayTypes: Record<string, string>;
  modules: string[];
  partials: string[];
  /** Modules and ChangeSets other extensions' builder panels replace. */
  replaced: string[];
}

const strings = (value: unknown, what: string): string[] => {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string"))
    throw new TypeError(`The builders report's ${what} are not a list of names.`);
  return value;
};

export function parseFindings(json: string): BuilderFindings {
  const value: unknown = JSON.parse(json);
  if (typeof value !== "object" || value === null)
    throw new TypeError("The builders report is not an object.");
  const types: unknown = Reflect.get(value, "displayTypes");
  if (typeof types !== "object" || types === null)
    throw new TypeError("The builders report's display types are not a map of labels.");
  // PHP encodes an empty map as an empty list, which has no entries either.
  const entries: [string, unknown][] = Object.entries(types);
  if (entries.some(([, label]) => typeof label !== "string"))
    throw new TypeError("The builders report's display types are not a map of labels.");
  return {
    displayTypes: Object.fromEntries(entries.map(([key, label]) => [key, String(label)])),
    modules: strings(Reflect.get(value, "modules"), "modules"),
    partials: strings(Reflect.get(value, "partials"), "partials"),
    replaced: strings(Reflect.get(value, "replaced"), "replaced parts"),
  };
}

/** A FormBuilder part that brings its own admin template: name, label and template. */
export interface FormPart {
  name: string;
  label: string;
  template: string | null;
}

/** What SupportPage hands the report for FormBuilder: the parts with templates, and BuilderReport's findings. */
export interface FormFindings {
  elements: FormPart[];
  inputTypes: FormPart[];
  entities: FormPart[];
  behaviors: FormPart[];
  modules: string[];
  partials: string[];
  /** Modules and ChangeSets other extensions' builder panels replace. */
  replaced: string[];
}

const parts = (value: unknown, what: string): FormPart[] => {
  const isPart = (item: unknown): item is FormPart =>
    typeof item === "object" &&
    item !== null &&
    typeof Reflect.get(item, "name") === "string" &&
    typeof Reflect.get(item, "label") === "string" &&
    ["string", "object"].includes(typeof Reflect.get(item, "template"));
  if (!Array.isArray(value) || !value.every(isPart))
    throw new TypeError(`The FormBuilder report's ${what} are not a list of parts.`);
  return value;
};

/** The FormBuilder report, or null while FormBuilder (afform_admin) is not enabled. */
export function parseFormFindings(json: string): FormFindings | null {
  const value: unknown = JSON.parse(json);
  if (value === null) return null;
  if (typeof value !== "object") throw new TypeError("The FormBuilder report is not an object.");
  const get = (key: string): unknown => Reflect.get(value, key);
  return {
    elements: parts(get("elements"), "elements"),
    inputTypes: parts(get("inputTypes"), "input types"),
    entities: parts(get("entities"), "entities"),
    behaviors: parts(get("behaviors"), "behaviors"),
    modules: strings(get("modules"), "modules"),
    partials: strings(get("partials"), "partials"),
    replaced: strings(get("replaced"), "replaced parts"),
  };
}

/** The FormBuilder parts React neither builds nor finds a plugin element for, as the editor decides. */
export function formPartsLeft(findings: FormFindings): string[] {
  const left = (items: FormPart[], kind: string, editable: (part: FormPart) => boolean) =>
    items.filter((part) => !editable(part)).map((part) => `${kind}: ${part.label} (${part.name})`);
  return [
    ...left(findings.elements, ts("Element"), (part) =>
      elementEditable(part.name, part.template ?? undefined),
    ),
    ...left(findings.inputTypes, ts("Input type"), (part) =>
      inputTypeEditable(part.name, part.template ?? undefined),
    ),
    ...left(findings.behaviors, ts("Behavior"), (part) =>
      behaviorEditable(part.name, part.template),
    ),
    ...left(findings.entities, ts("Entity options"), (part) =>
      entityOptionsEditable(part.name, part.template ?? undefined),
    ),
  ];
}

/** Display types whose editor runs as an Angular island, and those React has no editor for. */
export function displayTypeSupport(types: Record<string, string>) {
  const entries = Object.entries(types);
  const react = (type: string) => hasDisplayEditor(type) || hasPluginEditor(type);
  return {
    islands: entries.filter(([type]) => !react(type) && hasIslandEditor(type)),
    classic: entries.filter(([type]) => !react(type) && !hasIslandEditor(type)),
  };
}

function Names({ items, none }: { items: string[]; none: string }) {
  if (!items.length) return <p>{none}</p>;
  return (
    <ul>
      {items.map((item) => (
        <li key={item}>
          <code>{item}</code>
        </li>
      ))}
    </ul>
  );
}

/** What other extensions' builder panels stand in for, which neither loads nor stops saving. */
function Replaced({ items }: { items: string[] }) {
  return (
    <>
      <h3>{ts("Modules and template changes other extensions' builder panels replace")}</h3>
      <Names items={items} none={ts("None")} />
    </>
  );
}

/** The FormBuilder section's findings. */
function FormBuilderFindings({ form }: { form: FormFindings }) {
  return (
    <>
      <h3>{ts("Parts React leaves to the classic builder")}</h3>
      <Names items={formPartsLeft(form)} none={ts("None")} />
      <h3>{ts("Angular modules on the classic builder that React does not know")}</h3>
      {form.modules.length > 0 && (
        <p>
          {ts(
            "React edits their parts through plugin elements where they define them, and stops saving while one of them decorates the builder; anything else they change in the classic builder is missing in React.",
          )}
        </p>
      )}
      <Names items={form.modules} none={ts("None")} />
      <h3>{ts("Builder templates changed on this site")}</h3>
      <Names items={form.partials} none={ts("None")} />
      <Replaced items={form.replaced} />
    </>
  );
}

/** The support report's builders sections for SearchKit and FormBuilder. */
export function BuildersReport({
  findings,
  form,
}: {
  findings: BuilderFindings;
  form: FormFindings | null;
}) {
  const loaded = usePageLoaded();
  if (!loaded) return <p role="status">{ts("Loading…")}</p>;
  const { islands, classic } = displayTypeSupport(findings.displayTypes);
  const label = ([type, text]: [string, string]) => `${text} (${type})`;
  return (
    <div className="afreact-builders-report">
      <section aria-labelledby="afreact-builders-report-title">
        <h2 id="afreact-builders-report-title">{ts("SearchKit builder")}</h2>
        <h3>{ts("Display types whose Angular editor runs in the React builder")}</h3>
        <Names items={islands.map(label)} none={ts("None")} />
        <h3>{ts("Display types React leaves to the classic builder")}</h3>
        <Names items={classic.map(label)} none={ts("None")} />
        <h3>{ts("Angular modules on the classic builder that React does not know")}</h3>
        {findings.modules.length > 0 && (
          <p>
            {ts(
              "React runs their display type editors as islands, and stops saving while one of them decorates the builder; anything else they change in the classic builder is missing in React.",
            )}
          </p>
        )}
        <Names items={findings.modules} none={ts("None")} />
        <h3>{ts("Builder templates changed on this site")}</h3>
        <Names items={findings.partials} none={ts("None")} />
        <Replaced items={findings.replaced} />
      </section>
      <section aria-labelledby="afreact-builders-report-form">
        <h2 id="afreact-builders-report-form">{ts("FormBuilder")}</h2>
        {form ? <FormBuilderFindings form={form} /> : <p>{ts("FormBuilder is not enabled.")}</p>}
      </section>
    </div>
  );
}
