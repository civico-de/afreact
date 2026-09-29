/** The listed attribute of <afreact-support>: the afreact_forms setting as a JSON list of names. */
export function listedForms(json: string): string[] {
  const names: unknown = JSON.parse(json);
  if (!Array.isArray(names) || !names.every((name) => typeof name === "string"))
    throw new Error(`<afreact-support> needs listed as a JSON list of form names, got ${json}`);
  return names;
}
