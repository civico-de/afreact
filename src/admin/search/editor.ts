import { getEntity, type ApiParams, type SearchInfo } from "./expr";
import type { SearchAdminMetadata } from "./meta";

export interface SmartGroup {
  id?: number;
  title: string;
  description: string;
  visibility: string;
  /** APIv4 may answer with numbers or numeric strings. */
  group_type: (string | number)[];
  [key: string]: unknown;
}

export interface EditorDisplay {
  id?: number;
  name?: string;
  label: string;
  type: string;
  settings?: Record<string, unknown>;
  acl_bypass?: boolean;
  trashed?: boolean;
  [key: string]: unknown;
}

export interface EditorSearch extends SearchInfo {
  id?: number;
  name?: string;
  label: string;
  description?: string | null;
  is_template: boolean;
  expires_date?: string | null;
  timeout?: number | null;
  form_values: { join: Record<string, string>; [key: string]: unknown };
  tag_id: number[];
  groups: SmartGroup[];
  displays: EditorDisplay[];
}

const TAG_JOIN = [
  "EntityTag AS entity_tag",
  "LEFT",
  ["entity_tag.entity_table", "=", '"civicrm_saved_search"'],
  ["id", "=", "entity_tag.entity_id"],
];

/** The SavedSearch.get core's edit and clone routes resolve, with groups and displays chained. */
export function loadParams(id: number, mode: "edit" | "clone"): object {
  const base = [
    "label",
    "description",
    "api_entity",
    "api_params",
    "form_values",
    "is_template",
    "expires_date",
    "timeout",
  ];
  const tags = "GROUP_CONCAT(DISTINCT entity_tag.tag_id) AS tag_id";
  const where = [["saved_search_id", "=", "$id"]];
  return {
    select: mode === "edit" ? ["id", "name", ...base, tags] : [...base, tags],
    where: [["id", "=", id]],
    join: [TAG_JOIN],
    groupBy: ["id"],
    chain:
      mode === "edit"
        ? {
            groups: [
              "Group",
              "get",
              {
                select: ["id", "title", "description", "visibility", "group_type", "custom.*"],
                where,
              },
            ],
            displays: ["SearchDisplay", "get", { select: ["*", "is_autocomplete_default"], where }],
          }
        : { displays: ["SearchDisplay", "get", { select: ["label", "type", "settings"], where }] },
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isApiParams = (value: unknown): value is ApiParams =>
  isRecord(value) &&
  Array.isArray(value.select) &&
  value.select.every((col) => typeof col === "string");
const isDisplay = (value: unknown): value is EditorDisplay =>
  isRecord(value) && typeof value.type === "string" && typeof value.label === "string";
const isGroup = (value: unknown): value is SmartGroup =>
  isRecord(value) && typeof value.title === "string";

/** $onInit: missing lists become empty, and PHP's `[]` for an empty pager becomes `{}` again. */
export function normalize(raw: Record<string, unknown>): EditorSearch {
  const record = structuredClone(raw);
  const apiEntity = record.api_entity;
  const apiParams = record.api_params;
  if (typeof apiEntity !== "string" || !isApiParams(apiParams))
    throw new Error(ts("The saved search has no entity or no select clause."));
  const formValues = isRecord(record.form_values) ? record.form_values : {};
  const join = isRecord(formValues.join) ? formValues.join : {};
  // Dropping a malformed display would delete it on save, so it stops the load instead.
  const displays = (Array.isArray(record.displays) ? record.displays : []).map((display, index) => {
    if (!isDisplay(display))
      throw new Error(ts("Display %1 of the saved search is malformed.", { 1: index + 1 }));
    const settings = display.settings;
    if (settings && Array.isArray(settings.pager)) settings.pager = {};
    return display;
  });
  const tags = Array.isArray(record.tag_id) ? record.tag_id.map(Number) : [];
  return {
    ...record,
    api_entity: apiEntity,
    api_params: apiParams,
    label: typeof record.label === "string" ? record.label : "",
    is_template: record.is_template === true,
    form_values: {
      ...formValues,
      join: Object.fromEntries(Object.entries(join).map(([k, v]) => [k, String(v)])),
    },
    tag_id: tags,
    groups: (Array.isArray(record.groups) ? record.groups : []).map((group) => {
      if (!isGroup(group)) throw new Error(ts("The smart group of the saved search is malformed."));
      return group;
    }),
    displays,
  };
}

/** searchCreate plus $onInit's create defaults; URL params and label take precedence. */
export function newSearch(
  meta: SearchAdminMetadata,
  entityName: string,
  options: { isTemplate?: boolean; params?: ApiParams; label?: string } = {},
): EditorSearch {
  const entity = getEntity(meta, entityName);
  if (!entity) throw new Error(ts("Unknown entity %1.", { 1: entityName }));
  const defaults: ApiParams = {
    version: 4,
    select: [...(entity.default_columns ?? [])],
    orderBy: {},
    where: [],
  };
  for (const param of ["groupBy", "join", "having"])
    if (entity.params?.includes(param)) defaults[param] = [];
  return {
    api_entity: entityName,
    api_params: options.params ?? defaults,
    label: options.label ?? "",
    is_template: options.isTemplate ?? false,
    form_values: { join: {} },
    tag_id: [],
    groups: [],
    displays: [],
  };
}

/** searchClone: a copy keeps its kind with "(copy)"; a search from a template starts unnamed. */
export function cloneSearch(source: EditorSearch, makeTemplate: boolean): EditorSearch {
  const sameKind = source.is_template === makeTemplate;
  const { id: _id, name: _name, ...rest } = structuredClone(source);
  const copy = ts("(copy)");
  return {
    ...rest,
    label: sameKind ? `${source.label} ${copy}` : makeTemplate ? source.label : "",
    is_template: makeTemplate,
    groups: [],
    displays: rest.displays.map(({ id: _did, ...display }) => ({
      ...display,
      acl_bypass: false,
      label: sameKind ? `${display.label} ${copy}` : display.label,
    })),
  };
}

export interface EditorError {
  message: string;
  tab?: string;
}

export function validate(search: EditorSearch, groupExists: boolean): EditorError[] {
  const required = (label: string) => ts("%1 is a required field.", { 1: label });
  const errors: EditorError[] = [];
  if (!search.label) errors.push({ message: required(ts("Search Label")) });
  if (groupExists && !search.groups[0]?.title)
    errors.push({ message: required(ts("Group Title")), tab: "group" });
  search.displays.forEach((display, index) => {
    if (!display.trashed && !display.label)
      errors.push({ message: required(ts("Display Label")), tab: `display_${String(index)}` });
  });
  return errors;
}

/** save(): the API calls core sends, keyed as in its batch. */
export function savePayload(search: EditorSearch, groupExists: boolean): Record<string, unknown[]> {
  const { groups, displays, tag_id: tags, ...record } = structuredClone(search);
  const calls: Record<string, unknown[]> = {};
  const chain: Record<string, unknown[]> = {};
  if (groupExists)
    chain.groups = ["Group", "save", { defaults: { saved_search_id: "$id" }, records: groups }];
  else if (record.id)
    calls.deleteGroup = ["Group", "delete", { where: [["saved_search_id", "=", record.id]] }];
  const kept = displays.filter((display) => !display.trashed);
  if (kept.length)
    chain.displays = [
      "SearchDisplay",
      "replace",
      {
        where: [["saved_search_id", "=", "$id"]],
        records: kept,
        reload: ["*", "is_autocomplete_default"],
      },
    ];
  else if (record.id)
    calls.deleteDisplays = [
      "SearchDisplay",
      "delete",
      { where: [["saved_search_id", "=", record.id]] },
    ];
  const tagWhere = [
    ["entity_id", "=", "$id"],
    ["entity_table", "=", "civicrm_saved_search"],
  ];
  if (tags.length)
    chain.tag_id = [
      "EntityTag",
      "replace",
      {
        where: tagWhere,
        match: ["entity_id", "entity_table", "tag_id"],
        records: tags.map((id) => ({ tag_id: id })),
      },
    ];
  else if (record.id) chain.tag_id = ["EntityTag", "delete", { where: tagWhere }];
  calls.saved = ["SavedSearch", "save", { records: [record], chain }, 0];
  return calls;
}

const clauseUsesField = (clause: unknown, field: string): boolean =>
  Array.isArray(clause) &&
  (clause[0] === field ||
    (Array.isArray(clause[1]) && clause[1].some((sub: unknown) => clauseUsesField(sub, field))));

/** onChangeSelect: a removed column leaves orderBy and having with it, and columns stay unique. */
export function withSelect(params: ApiParams, select: string[]): ApiParams {
  const unique = [...new Set(select)];
  const gone = params.select
    .filter((col) => !unique.includes(col))
    .map((col) => col.split(" AS ").at(-1) ?? col);
  if (!gone.length) return { ...params, select: unique };
  const orderBy = Object.fromEntries(
    Object.entries(params.orderBy ?? {}).filter(([key]) => !gone.includes(key)),
  );
  return {
    ...params,
    select: unique,
    ...(params.orderBy ? { orderBy } : {}),
    ...(params.having
      ? {
          having: params.having.filter(
            (clause) => !gone.some((col) => clauseUsesField(clause, col)),
          ),
        }
      : {}),
  };
}

export function addDisplay(
  meta: SearchAdminMetadata,
  search: EditorSearch,
  type: string,
): EditorDisplay[] {
  const typeLabel = meta.displayTypes.find((t) => t.name === type)?.label;
  if (!typeLabel) throw new Error(ts("Unknown display type %1.", { 1: type }));
  const count = search.displays.filter((d) => d.type === type).length;
  const searchLabel =
    search.label || (getEntity(meta, search.api_entity)?.title_plural ?? search.api_entity);
  return [...search.displays, { type, label: `${searchLabel} ${typeLabel} ${String(count + 1)}` }];
}

/** removeDisplay: a saved display is marked and can come back; an unsaved one goes at once. */
export function removeDisplay(displays: EditorDisplay[], index: number): EditorDisplay[] {
  const display = displays[index];
  if (!display) return displays;
  return display.id
    ? displays.map((d, i) => (i === index ? { ...d, trashed: !d.trashed } : d))
    : displays.filter((_, i) => i !== index);
}

export function cloneDisplay(displays: EditorDisplay[], index: number): EditorDisplay[] {
  const source = displays[index];
  if (!source) return displays;
  const { id: _id, name: _name, trashed: _trashed, ...copy } = structuredClone(source);
  return [...displays, { ...copy, label: `${source.label} ${ts("(copy)")}` }];
}

export const newGroup = (): SmartGroup => ({
  title: "",
  description: "",
  visibility: "User and User Admin Only",
  group_type: [],
});

/** toggleEntitySet: the search becomes the first set of a union, or the first set becomes the search. */
export function toggleEntitySet(search: SearchInfo): SearchInfo {
  if (search.api_entity === "EntitySet") {
    const first = search.api_params.sets?.[0];
    const entity = first?.[1];
    const params = first?.[3];
    if (typeof entity !== "string" || !isApiParams(params))
      throw new Error(ts("The search has no set to restore."));
    return {
      ...search,
      api_entity: entity,
      api_params: { ...structuredClone(params), version: 4 },
    };
  }
  const { version: _version, having: _having, ...params } = structuredClone(search.api_params);
  return {
    ...search,
    api_entity: "EntitySet",
    api_params: {
      version: 4,
      select: params.select.map((field) => field.split(" AS ").at(-1) ?? field),
      sets: [["UNION ALL", search.api_entity, "get", params]],
    },
  };
}
