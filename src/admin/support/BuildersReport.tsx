import { useEffect, useState } from "react";
import { hasIslandEditor } from "../search/display/AngularIsland";
import { hasDisplayEditor } from "../search/display/DisplayEditor";
import { hasPluginEditor } from "../search/display/PluginDisplayEditor";

/** What SupportPage hands the report: display types by stored value, and BuilderReport's findings. */
export interface BuilderFindings {
  displayTypes: Record<string, string>;
  modules: string[];
  partials: string[];
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
  };
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

/** Plugins define their editor elements in scripts that have all run once the page loaded. */
function usePageLoaded() {
  const [loaded, setLoaded] = useState(document.readyState === "complete");
  useEffect(() => {
    const done = () => {
      setLoaded(true);
    };
    window.addEventListener("load", done, { once: true });
    return () => {
      window.removeEventListener("load", done);
    };
  }, []);
  return loaded;
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

/** The support report's builders section for SearchKit. */
export function BuildersReport({ findings }: { findings: BuilderFindings }) {
  const loaded = usePageLoaded();
  if (!loaded) return <p role="status">{ts("Loading…")}</p>;
  const { islands, classic } = displayTypeSupport(findings.displayTypes);
  const label = ([type, text]: [string, string]) => `${text} (${type})`;
  return (
    <section className="afreact-builders-report" aria-labelledby="afreact-builders-report-title">
      <h2 id="afreact-builders-report-title">{ts("SearchKit builder")}</h2>
      <h3>{ts("Display types whose Angular editor runs in the React builder")}</h3>
      <Names items={islands.map(label)} none={ts("None")} />
      <h3>{ts("Display types React leaves to the classic builder")}</h3>
      <Names items={classic.map(label)} none={ts("None")} />
      <h3>{ts("Angular modules on the classic builder that React does not know")}</h3>
      {findings.modules.length > 0 && (
        <p>
          {ts(
            "React runs their display type editors as islands; anything else they change in the classic builder is missing in React.",
          )}
        </p>
      )}
      <Names items={findings.modules} none={ts("None")} />
      <h3>{ts("Builder templates changed on this site")}</h3>
      <Names items={findings.partials} none={ts("None")} />
    </section>
  );
}
