import { api4 } from "../api/civi";
import type { QueryClient } from "@tanstack/react-query";
import { compileBundle, type BundleVars, type ModuleFile } from "./bundle";
import type { FormDefinition } from "./types";

/**
 * Where <facade-form source="…"> takes its layout from: the Facade.getForm API (default),
 * the page (Civi\Facade\Assets::layouts), or the compiled Angular module file.
 */
export type LayoutSource = "api" | "page" | "bundle";

export function layoutSource(value: string | null): LayoutSource {
  if (value === null || value === "api") return "api";
  if (value === "page" || value === "bundle") return value;
  throw new Error(`Unknown layout source "${value}"`);
}

interface FacadeVars {
  layouts?: Record<string, FormDefinition>;
  bundle?: BundleVars;
}

function vars(): FacadeVars {
  return (window.CRM.vars?.facade ?? {}) as FacadeVars;
}

function notProvided(source: LayoutSource): Error {
  return new Error(
    `The page provides no layouts for source="${source}" (Civi\\Facade\\Assets::layouts).`,
  );
}

function forbidden(name: string): Error {
  return new Error(ts('Form "%1" does not exist or you may not open it.', { 1: name }));
}

async function moduleFile(url: string): Promise<ModuleFile> {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error(ts("Loading %1 failed: %2", { 1: url, 2: response.status }));
  return (await response.json()) as ModuleFile;
}

export async function loadDefinition(
  name: string,
  source: LayoutSource,
  client: QueryClient,
): Promise<FormDefinition> {
  if (source === "page") {
    const layouts = vars().layouts;
    if (!layouts) throw notProvided(source);
    const layout = layouts[name];
    if (!layout) throw forbidden(name);
    return layout;
  }
  if (source === "bundle") {
    const bundle = vars().bundle;
    if (!bundle) throw notProvided(source);
    const { url } = bundle;
    if (url === null || !bundle.forms[name]) throw forbidden(name);
    // Every form on the page shares one file and one request.
    const file = await client.fetchQuery({
      queryKey: ["facade-bundle", url],
      queryFn: () => moduleFile(url),
    });
    return compileBundle(bundle, file, name);
  }
  const [form] = await api4<FormDefinition>("Facade", "getForm", { name });
  if (!form) throw new Error(ts("Form %1 was not returned.", { 1: name }));
  return form;
}
