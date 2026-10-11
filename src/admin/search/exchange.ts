import { api4 } from "../../api/civi";

/** A record group of the export: one `save` call per entity. */
export interface ExportType {
  entity: string;
  /** Text for one record, and for several with %1 as the count. */
  title: string;
  plural: string;
  values: Record<string, unknown>[];
  match?: string[];
  enabled: boolean;
}

interface ExportItem {
  entity: string;
  params: { values: Record<string, unknown>; match?: string[] };
}

/** crmSearchAdminExport's load: SavedSearch.export, plus the forms embedding the search. */
export async function loadExport(
  search: { id: number; name: string; display_name: string[] | null },
  afformEnabled: boolean,
): Promise<ExportType[]> {
  const exported = await api4<ExportItem>("SavedSearch", "export", { id: search.id });
  const types: ExportType[] = [
    { entity: "SavedSearch", title: ts("Saved Search"), plural: ts("Saved Search") },
    { entity: "SearchDisplay", title: ts("1 Display"), plural: ts("%1 Displays") },
    { entity: "Group", title: ts("Smart Group"), plural: ts("%1 Smart Groups") },
  ].map((type) => {
    const params = exported
      .filter((item) => item.entity === type.entity)
      .map((item) => item.params);
    return {
      ...type,
      values: params.map((param) => param.values),
      match: params[0]?.match,
      enabled: params.length > 0,
    };
  });
  if (!afformEnabled) return types;
  const find = [
    ["search_displays", "CONTAINS", search.name],
    ...(search.display_name ?? []).map((name) => [
      "search_displays",
      "CONTAINS",
      `${search.name}.${name}`,
    ]),
  ];
  const [fields, afforms] = await Promise.all([
    api4<{ name: string }>("Afform", "getFields", {
      action: "create",
      select: ["name"],
      where: [
        ["readonly", "=", false],
        ["type", "=", "Field"],
      ],
    }),
    api4<Record<string, unknown>>("Afform", "get", {
      layoutFormat: "html",
      where: [
        ["type", "=", "search"],
        ["OR", find],
      ],
    }),
  ]);
  // Only writable fields with a value go into the save call.
  const writable = fields.map((field) => field.name);
  const values = afforms.map((afform) =>
    Object.fromEntries(
      writable.flatMap((key) =>
        afform[key] !== null && afform[key] !== undefined ? [[key, afform[key]]] : [],
      ),
    ),
  );
  types.push({
    entity: "Afform",
    title: ts("1 Form"),
    plural: ts("%1 Forms"),
    values,
    enabled: values.length > 0,
  });
  return types;
}

/** refreshOutput: the enabled groups as a JSON list of API calls. */
export function exportOutput(types: ExportType[]): string {
  const calls = types
    .filter((type) => type.enabled)
    .map((type) => [
      type.entity,
      "save",
      type.match?.length ? { records: type.values, match: type.match } : { records: type.values },
    ]);
  return JSON.stringify(calls, null, 2);
}

export const typeLabel = (type: ExportType) =>
  type.values.length === 1 ? type.title : type.plural.replace("%1", String(type.values.length));

type SaveCall = [
  string,
  string,
  { records?: Record<string, unknown>[]; match?: string[]; chain?: unknown },
];

export interface ImportCheck {
  calls: SaveCall[];
  /** The count query per entity, and the names it looks for. */
  counts: Record<string, { names: string[]; params: object }>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function isSaveCall(value: unknown): value is SaveCall {
  return (
    Array.isArray(value) &&
    typeof value[0] === "string" &&
    typeof value[1] === "string" &&
    isRecord(value[2])
  );
}

/** crmSearchAdminImport's checkInput: only `save` calls on the allowed entities, each once. */
export function parseImport(text: string, afformEnabled: boolean): ImportCheck {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(ts("The input is not valid JSON."));
  }
  if (!Array.isArray(parsed)) throw new Error(ts("No records to import."));
  const allowed = ["SavedSearch", "SearchDisplay", "Group", ...(afformEnabled ? ["Afform"] : [])];
  const calls: SaveCall[] = [];
  const counts: ImportCheck["counts"] = {};
  for (const call of parsed) {
    if (!isSaveCall(call)) throw new Error(ts('Unsupported API action: only "save" is allowed.'));
    const [entity, action, params] = call;
    const chain = params.chain;
    if (action !== "save" || (isRecord(chain) && Object.keys(chain).length))
      throw new Error(ts('Unsupported API action: only "save" is allowed.'));
    if (!allowed.includes(entity))
      throw new Error(ts('Unsupported API entity "%1".', { 1: entity }));
    if (calls.some(([seen]) => seen === entity))
      throw new Error(ts('Duplicate API entity "%1".', { 1: entity }));
    calls.push(call);
    const records = Array.isArray(params.records) ? params.records : [];
    const names = records.flatMap((record) =>
      typeof record.name === "string" ? [record.name] : [],
    );
    if (!names.length) continue;
    const where: unknown[][] = [["name", "IN", names]];
    if (entity === "SearchDisplay") {
      const searches = [...new Set(records.map((record) => record["saved_search_id.name"]))];
      where.push(["saved_search_id.name", "IN", searches]);
    }
    counts[entity] = { names, params: { select: ["row_count"], where } };
  }
  if (!Object.keys(counts).length) throw new Error(ts("No records to import."));
  return { calls, counts };
}

export interface ImportPreview {
  error: string;
  preview: string;
}

/** The import's outcome per entity: what gets updated and created, or why it cannot run. */
export async function previewImport(check: ImportCheck): Promise<ImportPreview> {
  const entities = Object.keys(check.counts);
  const [info, ...existing] = await Promise.all([
    api4<{ name: string; title: string; title_plural: string }>("Entity", "get", {
      select: ["name", "title", "title_plural"],
      where: [["name", "IN", entities]],
    }),
    ...entities.map((entity) => api4(entity, "get", check.counts[entity]?.params ?? {})),
  ]);
  const errors: string[] = [];
  const previews: string[] = [];
  for (const [index, entity] of entities.entries()) {
    const titles = info.find((row) => row.name === entity);
    const name = (n: number) =>
      n === 1 ? (titles?.title ?? entity) : (titles?.title_plural ?? entity);
    const count = check.counts[entity]?.names.length ?? 0;
    const found = existing[index]?.countMatched ?? existing[index]?.count ?? 0;
    const call = check.calls.find(([e]) => e === entity);
    if (found && entity !== "Afform" && !call?.[2].match?.length) {
      errors.push(
        ts("Cannot create %1 %2 because an existing one with the same name already exists.", {
          1: found,
          2: name(found),
        }),
        ts('To update existing records, include "match" in the API params.'),
      );
    } else if (found)
      previews.push(ts("%1 existing %2 will be updated.", { 1: found, 2: name(found) }));
    if (found < count)
      previews.push(ts("%1 new %2 will be created.", { 1: count - found, 2: name(count - found) }));
  }
  return { error: errors.join(" "), preview: previews.join(" ") };
}

/** Runs the calls in order, as crmApi4 with a list; resolves to the number of saved records. */
export async function runImport(check: ImportCheck): Promise<number> {
  let saved = 0;
  for (const [entity, action, params] of check.calls)
    saved += (await api4(entity, action, params)).length;
  return saved;
}
