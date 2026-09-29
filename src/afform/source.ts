import { api4 } from "../api/civi";
import type { QueryClient } from "@tanstack/react-query";
import { compileBundle, isModuleFile, type BundleVars, type ModuleFile } from "./bundle";
import type { FormDefinition } from "./types";

/**
 * Where <afreact-form source="…"> takes its layout from: the Afreact.getForm API (default),
 * the page (Civi\Afreact\Assets::layouts), or the compiled Angular module file.
 */
export type LayoutSource = "api" | "page" | "bundle";

export function layoutSource(value: string | null): LayoutSource {
  if (value === null || value === "api") return "api";
  if (value === "page" || value === "bundle") return value;
  throw new Error(`Unknown layout source "${value}"`);
}

export interface AfreactVars {
  layouts?: Record<string, FormDefinition>;
  bundle?: BundleVars;
}

function vars(): AfreactVars {
  return window.CRM.vars?.afreact ?? {};
}

function notProvided(source: LayoutSource): Error {
  return new Error(
    `The page provides no layouts for source="${source}" (Civi\\Afreact\\Assets::layouts).`,
  );
}

function forbidden(name: string): Error {
  return new Error(ts('Form "%1" does not exist or you may not open it.', { 1: name }));
}

async function moduleFile(url: string): Promise<ModuleFile> {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error(ts("Loading %1 failed: %2", { 1: url, 2: response.status }));
  const file: unknown = await response.json();
  if (!isModuleFile(file)) throw new Error(ts("%1 is no Angular module file.", { 1: url }));
  return file;
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
      queryKey: ["afreact-bundle", url],
      queryFn: () => moduleFile(url),
    });
    return compileBundle(bundle, file, name);
  }
  const [form] = await api4<FormDefinition>("Afreact", "getForm", { name });
  if (!form) throw new Error(ts("Form %1 was not returned.", { 1: name }));
  return form;
}
