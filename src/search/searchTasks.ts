import { decodeJs, rawProps } from "../afform/bundle";
import type { ApiResult } from "../api/civi";
import { editorFor } from "./inlineEdit";
import type { DisplaySettings, EditableInfo, EditOption, Row } from "./types";

/**
 * SearchKit's bulk actions as SearchDisplay.getSearchTasks returns them, and how the renderer
 * runs each kind (searchDisplayTasksTrait's doTask, crmSearchTaskApiBatch, crmSearchBatchRunner).
 */

export type Key = Row["key"];

export interface EntityInfo {
  name: string;
  title: string;
  title_plural: string;
  primary_key: string[];
}

export interface ApiBatch {
  entity?: string;
  action: string;
  params?: Record<string, unknown> | null;
  idField?: string;
  /** Values the user enters before the run (crm-search-input), e.g. a soft credit's contact. */
  fields?: UpdateField[];
  confirmMsg?: string;
  runMsg?: string;
  successMsg?: string;
  /** The success alert's title; the task's "… Complete" when unset. */
  successTitle?: string;
  /** The renderer's own dialogs word the result from the counts; takes the place of successMsg. */
  summary?: (counts: BatchCounts) => string;
  /** A delete the renderer's own dialog settled already runs without the forced question. */
  settled?: boolean;
  errorMsg?: string;
}

/** crmSearchBatchRunner's batchCount, countMatched and result rows over every batch. */
export interface BatchCounts {
  fetched: number;
  matched: number;
  rows: Record<string, unknown>[];
}

/** GetSearchTasks::getRelationshipTypes(): one entry per direction, keyed "<type>_<a>_<b>". */
export interface RelationshipType {
  id: string;
  text: string;
  description?: string | null;
  contact_type: string;
  contact_sub_type?: string | null;
}

/** Angular expressions over the task's data (ids, entity, …), as GetSearchTasks writes them. */
export interface TaskTarget {
  path: string;
  query?: string;
  data?: string;
  mode?: string;
}

export interface SearchTask {
  name: string;
  title: string;
  /** The search's entity, which GetSearchTasks writes on every task. */
  entity?: string;
  icon?: string;
  /** How many selected rows the task takes, e.g. "> 0", "=== 2", ">= 0". */
  number: string;
  apiBatch?: ApiBatch;
  crmPopup?: TaskTarget;
  redirect?: TaskTarget;
  uiDialog?: { templateUrl?: string };
  /** Values the update task starts with, set by hook_civicrm_searchKitTasks. */
  values?: Record<string, unknown> | unknown[];
  relationshipTypes?: RelationshipType[];
}

export interface TaskList {
  tasks: SearchTask[];
  entityInfo: EntityInfo;
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === "string";

const isIndexable = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

function isEntityInfo(value: unknown): value is EntityInfo {
  return (
    isRecord(value) &&
    isString(value.name) &&
    isString(value.title) &&
    isString(value.title_plural) &&
    Array.isArray(value.primary_key) &&
    value.primary_key.every(isString)
  );
}

const isField = (value: unknown) =>
  isRecord(value) && isString(value.name) && isString(value.label) && isString(value.data_type);

function isTask(value: unknown): value is SearchTask {
  if (!isRecord(value) || !isString(value.name) || !isString(value.title)) return false;
  if (!isString(value.number)) return false;
  const fields = isRecord(value.apiBatch) ? value.apiBatch.fields : undefined;
  return fields === undefined || (Array.isArray(fields) && fields.every(isField));
}

/** getSearchTasks' answer: the tasks, and the entity the result object carries in `editable`. */
export function parseTaskList(result: ApiResult<unknown>): TaskList {
  const editable: unknown = Object.getOwnPropertyDescriptor(result, "editable")?.value;
  const entityInfo = isRecord(editable) ? editable.entityInfo : undefined;
  if (!isEntityInfo(entityInfo))
    throw new Error("SearchDisplay.getSearchTasks answered without the entity of the search.");
  const tasks = [...result];
  if (!tasks.every(isTask))
    throw new Error("SearchDisplay.getSearchTasks answered with a task without name or title.");
  return { tasks, entityInfo };
}

const NUMBER = /^\s*(===|==|!==|!=|>=|<=|>|<)\s*(\d+)\s*$/;

/** isActionAllowed(): the selected count against the task's `number`; null when unreadable. */
export function allows(number: string, count: number): boolean | null {
  const match = NUMBER.exec(number);
  if (!match) return null;
  const limit = Number(match[2]);
  switch (match[1]) {
    case "===":
    case "==":
      return count === limit;
    case "!==":
    case "!=":
      return count !== limit;
    case ">=":
      return count >= limit;
    case "<=":
      return count <= limit;
    case ">":
      return count > limit;
    default:
      return count < limit;
  }
}

/** getActionTitle() of crmSearchTasksMenu. */
export function actionTitle(task: SearchTask, count: number, entity: EntityInfo): string {
  if (!allows(task.number, count))
    return ts("Selected number must be %1", { 1: task.number.replace("===", "") });
  return count
    ? ts("Perform action on %1 %2", {
        1: count,
        2: count === 1 ? entity.title : entity.title_plural,
      })
    : ts("Perform action on all %1", { 1: entity.title_plural });
}

const PATH = /^[A-Za-z_$][\w$]*(?:\[\d+\]|\.[A-Za-z_$][\w$]*)*$/;
const SEGMENT = /\[(\d+)\]|\.?([A-Za-z_$][\w$]*)/g;
const JOIN = /^([A-Za-z_$][\w$]*)\.join\(\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*\)$/;
const LITERAL = /^(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?|true|false|null)$/;

function lookup(path: string, data: Record<string, unknown>): unknown {
  let value: unknown = data;
  for (const [index, match] of [...path.matchAll(SEGMENT)].entries()) {
    const key = match[1] ?? match[2] ?? "";
    if (index === 0 && !(key in data)) throw new Error(`Unknown name in task expression: ${key}`);
    value = isIndexable(value) ? value[key] : undefined;
  }
  return value;
}

/**
 * The Angular expressions tasks use for crmPopup and redirect: literals, object literals,
 * paths into the data (`ids[0]`) and `ids.join(',')`. Anything else throws.
 */
export function evaluateTaskExpression(expression: string, data: Record<string, unknown>): unknown {
  const text = expression.trim();
  if (text.startsWith("{") && text.endsWith("}"))
    return Object.fromEntries(
      rawProps(text).map(([key, value]) => [String(key), evaluateTaskExpression(value, data)]),
    );
  if (LITERAL.test(text)) return decodeJs(text);
  const join = JOIN.exec(text);
  if (join) {
    const list = lookup(join[1] ?? "", data);
    if (!Array.isArray(list)) throw new Error(`Not a list in task expression: ${text}`);
    return list.join(String(decodeJs(join[2] ?? "")));
  }
  if (PATH.test(text)) return lookup(text, data);
  throw new Error(`Unsupported task expression: ${text}`);
}

export type TaskRun =
  | { kind: "batch"; apiBatch: ApiBatch }
  | { kind: "popup" | "redirect"; target: TaskTarget }
  | { kind: "download" }
  | { kind: "update" }
  | { kind: "tag" }
  | { kind: "relationship" }
  | { kind: "unsupported"; reason: string };

/** The core task dialogs the renderer replaces with its own. */
const DOWNLOAD_DIALOG = "~/crmSearchTasks/crmSearchTaskDownload.html";
const UPDATE_DIALOG = "~/crmSearchTasks/crmSearchTaskUpdate.html";
const TAG_DIALOG = "~/crmSearchTasks/crmSearchTaskTag.html";
const RELATIONSHIP_DIALOG = "~/crmSearchTasks/crmSearchTaskRelationship.html";

/** A field the update task may set, as searchTaskFieldsTrait and GetSearchTasks read getFields. */
export interface UpdateField {
  name: string;
  label: string;
  description?: string | null;
  input_type: string | null;
  data_type: string;
  serialize?: number | boolean | null;
  options?: EditOption[] | false | null;
  fk_entity?: string | null;
  nullable?: boolean;
  required?: boolean;
  default_value?: unknown;
}

/** searchTaskFieldsTrait's getFields call: the writable, current fields with their options. */
export function updateFieldsCall(entity: string): ApiCall {
  return [
    entity,
    "getFields",
    {
      action: "update",
      select: [
        "name",
        "label",
        "description",
        "input_type",
        "data_type",
        "serialize",
        "options",
        "fk_entity",
        "nullable",
        "required",
        "default_value",
      ],
      loadOptions: ["id", "name", "label", "description", "color", "icon"],
      where: [
        ["deprecated", "=", false],
        ["readonly", "=", false],
      ],
    },
  ];
}

/** searchTaskFieldsTrait.addField(): the value a field starts with when added to the update. */
export function initialUpdateValue(field: UpdateField): unknown {
  if (field.serialize || field.data_type === "Array") return [];
  if (field.data_type === "Boolean") return true;
  if (field.default_value) return field.default_value;
  const options = field.options || [];
  return options.length ? options[0]?.id : "";
}

/** crmSearchTaskApiBatch's start values: a set default first, even an empty one. */
export function initialBatchValue(field: UpdateField): unknown {
  if ("default_value" in field) return field.default_value;
  if (field.serialize || field.data_type === "Array") return [];
  if (field.data_type === "Boolean") return true;
  const options = field.options || [];
  return options.length ? options[0]?.id : "";
}

/** What Input needs to know about a task's field, as the server describes an editable column. */
export function fieldEditableInfo(entity: string, field: UpdateField): EditableInfo {
  return {
    entity,
    input_type: field.input_type,
    input_attrs: null,
    data_type: field.data_type,
    options: field.options || false,
    serialize: !!field.serialize,
    nullable: !!field.nullable,
    fk_entity: field.fk_entity ?? null,
    value_key: field.name,
    value_path: field.name,
    id_key: "id",
    id_path: "id",
    explicit_join: null,
    control_field: null,
    grouping_fields: [],
  };
}

/** The first of a batch's input fields the in-place editors cannot show, or nothing. */
export function unsupportedBatchField(task: SearchTask, batch: ApiBatch): string | undefined {
  for (const field of batch.fields ?? []) {
    const editor = editorFor(fieldEditableInfo(batch.entity ?? task.entity ?? "", field));
    if ("unsupported" in editor) return `input field ${field.name} (${editor.unsupported})`;
  }
  return undefined;
}

/** crmSearchTaskUpdate's batch: one update of every id with the chosen values, core's messages. */
export function updateBatch(values: Record<string, unknown>): ApiBatch {
  return {
    action: "update",
    params: { values },
    runMsg: "Updating %1 %2...",
    successMsg: "Successfully updated %1 %2.",
    successTitle: "Saved",
    errorMsg: "An error occurred while attempting to update %1 %2.",
  };
}

/** A tag's row of Tag.get as the tag dialog reads it. */
export interface TagRow {
  id: number;
  label: string;
  color?: string | null;
  description?: string | null;
  is_selectable?: boolean;
  parent_id?: number | null;
}

export interface Tagset {
  id: number;
  name: string;
  label: string;
}

/** Tags are used for "Contact", whatever contact type a search lists (see comparison.md). */
export function tagEntity(entity: string): string {
  return ["Individual", "Organization", "Household"].includes(entity) ? "Contact" : entity;
}

/** crmSearchTaskTag's two queries: the plain tags in a hierarchy, and the tagsets. */
export function tagCalls(entity: string): { tags: ApiCall; tagsets: ApiCall } {
  const usedFor = ["used_for:name", "CONTAINS", tagEntity(entity)];
  return {
    tags: [
      "Tag",
      "get",
      {
        select: ["id", "label", "color", "description", "is_selectable", "parent_id"],
        where: [
          ["is_tagset", "=", false],
          usedFor,
          ["OR", [["parent_id", "IS NULL"], ["parent_id.is_tagset", "=", false]]],
        ],
        orderBy: { label: "ASC" },
      },
    ],
    tagsets: [
      "Tag",
      "get",
      { select: ["id", "name", "label"], where: [["is_tagset", "=", true], usedFor] },
    ],
  };
}

/** sortTagsForSelect2(): the tags in a tree, each with its depth, children under their parent. */
export function tagTree(tags: TagRow[]): { tag: TagRow; depth: number }[] {
  const byParent = new Map<number | null, TagRow[]>();
  const known = new Set(tags.map((tag) => tag.id));
  for (const tag of tags) {
    const parent = tag.parent_id != null && known.has(tag.parent_id) ? tag.parent_id : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), tag]);
  }
  const walk = (parent: number | null, depth: number): { tag: TagRow; depth: number }[] =>
    (byParent.get(parent) ?? []).flatMap((tag) => [{ tag, depth }, ...walk(tag.id, depth + 1)]);
  return walk(null, 0);
}

/** saveTags(): an EntityTag per record and tag, or the chosen tags' removal; core's messages. */
export function tagBatch(action: "save" | "delete", entity: string, tagIds: number[]): ApiBatch {
  const table = tagEntity(entity);
  const summary = ({ fetched, matched }: BatchCounts) => {
    if (action === "delete")
      return ts("1 tag removed.", { plural: "%count tags removed.", count: fetched });
    const added = ts("1 tag added", { plural: "%count tags added.", count: fetched - matched });
    const existing = ts("1 tag already exists and was not added.", {
      plural: "%count tags already exist and were not added.",
      count: matched,
    });
    return matched > 0 ? `${added} ${existing}` : added;
  };
  return {
    entity: "EntityTag",
    action,
    idField: "entity_id",
    params:
      action === "save"
        ? {
            defaults: { "entity_table:name": table },
            records: tagIds.map((tag_id) => ({ tag_id })),
            match: ["entity_id", "tag_id", "entity_table"],
          }
        : { where: [["entity_table:name", "=", table], ["tag_id", "IN", tagIds]] },
    runMsg: action === "save" ? "Adding tags..." : "Removing tags...",
    successTitle: "Saved",
    summary,
    settled: true,
    errorMsg: "An error occurred while updating tags.",
  };
}

/** crmSearchTaskRelationship's onChangeRelationship(): a relationship type's editable fields. */
export function relationshipFieldsCall(typeId: string): ApiCall {
  return [
    "Relationship",
    "getFields",
    {
      action: "create",
      values: { relationship_type_id: typeId },
      loadOptions: ["id", "name", "label", "description", "color", "icon"],
      select: [
        "name",
        "label",
        "description",
        "input_type",
        "data_type",
        "serialize",
        "options",
        "fk_entity",
        "nullable",
        "required",
      ],
      where: [
        ["readonly", "=", false],
        [
          "OR",
          [["type", "=", "Custom"], ["name", "IN", ["description", "start_date", "end_date"]]],
        ],
      ],
    },
  ];
}

/**
 * crmSearchTaskRelationship's submit(): one relationship of the chosen type between every
 * selected contact (side a) and the chosen one (side b); core's messages.
 */
export function relationshipBatch(
  type: string,
  contactId: number,
  values: Record<string, unknown>,
): ApiBatch {
  const [typeId, a, b] = type.split("_");
  if (!typeId || !a || !b) throw new Error(`Unexpected relationship type key: ${type}`);
  const summary = ({ rows }: BatchCounts) => {
    const duplicate = rows.filter((row) => !!row.duplicate_id).length;
    const added = ts("1 relationship added.", {
      plural: "%count relationships added.",
      count: rows.length - duplicate,
    });
    const existing = ts("1 relationship already exists.", {
      plural: "%count relationships already exist.",
      count: duplicate,
    });
    return duplicate > 0 ? `${added} ${existing}` : added;
  };
  return {
    entity: "Relationship",
    action: "save",
    idField: `contact_id_${a}`,
    params: {
      defaults: { ...values, relationship_type_id: typeId, [`contact_id_${b}`]: contactId },
    },
    runMsg: "Adding relationships...",
    successTitle: "Saved",
    summary,
  };
}

/** searchTaskFieldsTrait: the clauses a hook preset for the update task; a list presets none. */
export function presetValues(task: SearchTask): [string, unknown][] {
  const values = task.values;
  return values && !Array.isArray(values) ? Object.entries(values) : [];
}

/** The spreadsheet formats SearchDisplay.download writes, labelled as in crmSearchTaskDownload. */
export const DOWNLOAD_FORMATS = ["csv", "xlsx", "ods", "pdf"] as const;
export type DownloadFormat = (typeof DOWNLOAD_FORMATS)[number];

/** crmSearchTaskDownload's request: the run's parameters without a page, filtered to the ids. */
export function downloadParams(
  runParams: Record<string, unknown>,
  ids: Key[],
  format: DownloadFormat,
): Record<string, unknown> {
  const { return: _return, limit: _limit, ...params } = runParams;
  const filters = isRecord(params.filters) ? params.filters : {};
  return { ...params, filters: { ...filters, id: ids }, format };
}

/** The file name in a Content-Disposition header, as crmSearchTaskDownload reads it. */
export function dispositionFileName(header: string | null): string | null {
  const utf8 = /filename\*=utf-8''([\w%\-.]+)(?:; ?|$)/i.exec(header ?? "");
  if (utf8?.[1]) return decodeURIComponent(utf8[1]);
  const ascii = /filename=(["']?)(.*?[^\\])\1(?:; ?|$)/.exec(header ?? "");
  return ascii?.[2] || null;
}

/** The data doTask() hands to a task's expressions. */
export function taskData(
  task: SearchTask,
  ids: Key[],
  list: TaskList | null,
  names: { search: string; display: string },
  isLink: boolean,
): Record<string, unknown> {
  return {
    ids,
    entity: list?.entityInfo.name,
    entityInfo: list?.entityInfo,
    search: names.search,
    display: names.display,
    isLink,
    task,
  };
}

function checkTarget(kind: "popup" | "redirect", target: TaskTarget, task: SearchTask): TaskRun {
  const data = taskData(task, [], null, { search: "", display: "" }, false);
  try {
    if (!isString(evaluateTaskExpression(target.path, data)))
      return { kind: "unsupported", reason: `path ${target.path}` };
    for (const expression of [target.query, target.data])
      if (expression) evaluateTaskExpression(expression, data);
  } catch (error) {
    return { kind: "unsupported", reason: error instanceof Error ? error.message : String(error) };
  }
  return { kind, target };
}

/** doTask()'s choice: a popup form, a new window, an Angular dialog, or crmSearchTaskApiBatch. */
export function taskRun(task: SearchTask): TaskRun {
  if (allows(task.number, 0) === null)
    return { kind: "unsupported", reason: `number ${task.number}` };
  if (isRecord(task.crmPopup) && isString(task.crmPopup.path))
    return checkTarget("popup", task.crmPopup, task);
  if (isRecord(task.redirect) && isString(task.redirect.path))
    return checkTarget("redirect", task.redirect, task);
  const template = task.uiDialog?.templateUrl;
  if (template === DOWNLOAD_DIALOG) return { kind: "download" };
  if (template === UPDATE_DIALOG) return { kind: "update" };
  if (template === TAG_DIALOG) return { kind: "tag" };
  if (template === RELATIONSHIP_DIALOG) return { kind: "relationship" };
  if (template) return { kind: "unsupported", reason: `Angular dialog ${template}` };
  const batch = task.apiBatch;
  if (!isRecord(batch) || !isString(batch.action))
    return { kind: "unsupported", reason: "no apiBatch, crmPopup or redirect" };
  const field = unsupportedBatchField(task, batch);
  if (field) return { kind: "unsupported", reason: field };
  return { kind: "batch", apiBatch: batch };
}

/** The tasks a display offers or links to: its `actions` (all for true) and its row links' tasks. */
export function referencedTasks(settings: DisplaySettings): "all" | Set<string> {
  if (settings.actions === true) return "all";
  const names = new Set(Array.isArray(settings.actions) ? settings.actions : []);
  // Column links as configured; SearchDisplay.run applies them, so the type leaves them out.
  for (const column of settings.columns) {
    const links = "links" in column && Array.isArray(column.links) ? column.links : [];
    for (const link of links) if (isRecord(link) && isString(link.task)) names.add(link.task);
  }
  return names;
}

/** Notes for the tasks the renderer cannot run, among those the display refers to. */
export function unsupportedTaskNotes(
  tasks: SearchTask[],
  referenced: "all" | Set<string>,
): string[] {
  return tasks.flatMap((task) => {
    if (referenced !== "all" && !referenced.has(task.name)) return [];
    const run = taskRun(task);
    return run.kind === "unsupported" ? [`task ${task.name} (${run.reason})`] : [];
  });
}

/** Number of records per call, as crmSearchBatchRunner. */
export const BATCH_SIZE = 500;

export type ApiCall = [entity: string, action: string, params: Record<string, unknown>];

/**
 * crmSearchBatchRunner's runBatch(): save copies the values onto a record per id; every other
 * action gets the ids in its where clause.
 */
export function batchCall(batch: ApiBatch, entity: EntityInfo, ids: Key[]): ApiCall {
  const idField = batch.idField ?? entity.primary_key[0];
  if (!idField) throw new Error(`Entity ${entity.name} has no primary key.`);
  const params: Record<string, unknown> = structuredClone(batch.params ?? {});
  const target = batch.entity ?? entity.name;
  if (batch.action === "save" || batch.action === "create") {
    const records = "values" in params ? [params.values] : (params.records ?? [{}]);
    delete params.values;
    params.records = ids.flatMap((id) =>
      (Array.isArray(records) ? records : [records]).map((record: unknown) => ({
        ...(isRecord(record) ? record : {}),
        [idField]: id,
      })),
    );
    return [target, "save", params];
  }
  const where = Array.isArray(params.where) ? params.where : [];
  return [target, batch.action, { ...params, where: [...where, [idField, "IN", ids]] }];
}

/**
 * A row link updating one row runs SearchDisplay.inlineEdit, as crmSearchBatchRunner does, so
 * the display's permissions (acl_bypass) apply as in core.
 */
export function inlineEditCall(
  batch: ApiBatch,
  display: Record<string, unknown>,
  rowKey: Key,
): ApiCall {
  const params: Record<string, unknown> = { ...structuredClone(batch.params ?? {}), ...display };
  delete params.where;
  return ["SearchDisplay", "inlineEdit", { ...params, return: null, rowKey }];
}

/** The batches of `ids`; one call even without ids, as core runs one. */
export function batches(ids: Key[]): { first: number; last: number }[] {
  const ranges = [];
  for (let first = 0; first === 0 || first < ids.length; first += BATCH_SIZE)
    ranges.push({ first, last: Math.min(first + BATCH_SIZE, ids.length) });
  return ranges;
}
