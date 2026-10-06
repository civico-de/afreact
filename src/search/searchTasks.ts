import { decodeJs, rawProps } from "../afform/bundle";
import type { ApiResult } from "../api/civi";
import type { DisplaySettings, Row } from "./types";

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
  fields?: unknown[];
  confirmMsg?: string;
  runMsg?: string;
  successMsg?: string;
  errorMsg?: string;
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
  icon?: string;
  /** How many selected rows the task takes, e.g. "> 0", "=== 2", ">= 0". */
  number: string;
  apiBatch?: ApiBatch;
  crmPopup?: TaskTarget;
  redirect?: TaskTarget;
  uiDialog?: { templateUrl?: string };
}

export interface TaskList {
  tasks: SearchTask[];
  entityInfo: EntityInfo;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
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

function isTask(value: unknown): value is SearchTask {
  return isRecord(value) && isString(value.name) && isString(value.title) && isString(value.number);
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
  | { kind: "unsupported"; reason: string };

/** The download task's dialog, which the renderer replaces with its own. */
const DOWNLOAD_DIALOG = "~/crmSearchTasks/crmSearchTaskDownload.html";

/** The spreadsheet formats SearchDisplay.download writes, labelled as crmSearchTaskDownload.html. */
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
  if (template) return { kind: "unsupported", reason: `Angular dialog ${template}` };
  const batch = task.apiBatch;
  if (!isRecord(batch) || !isString(batch.action))
    return { kind: "unsupported", reason: "no apiBatch, crmPopup or redirect" };
  if (batch.fields?.length) return { kind: "unsupported", reason: "input fields" };
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
