import { api4 } from "../../api/civi";
import { createSqlName } from "./display/model";
import type { EditorDisplay } from "./editor";

/** A display before and after the edit; either side is missing for a new or removed display. */
export interface DisplayChange {
  original?: EditorDisplay;
  updated?: EditorDisplay;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** Pairs displays by id, unsaved ones in order, as core's confirmSave() does. */
export function displayChanges(
  original: EditorDisplay[],
  updated: EditorDisplay[],
): DisplayChange[] {
  const changes = new Map<string, DisplayChange>();
  let fresh = 0;
  const key = (display: EditorDisplay) =>
    display.id ? `id_${String(display.id)}` : `new_${String(fresh++)}`;
  for (const display of original) changes.set(key(display), { original: structuredClone(display) });
  for (const display of updated) {
    const k = key(display);
    changes.set(k, { ...changes.get(k), updated: structuredClone(display) });
  }
  return [...changes.values()];
}

const columnNames = (display: EditorDisplay) => {
  const columns =
    isRecord(display.settings) && Array.isArray(display.settings.columns)
      ? display.settings.columns.filter(isRecord)
      : [];
  return Object.fromEntries(
    columns.map((col) => {
      const key = typeof col.key === "string" ? col.key : "";
      const name = typeof col.name === "string" && col.name ? col.name : createSqlName(key);
      return [key, name];
    }),
  );
};

/** searchAdminDisplayEntity's findCriticalChanges: removing a DB entity or its columns. */
function entityCriticalChanges({ original, updated }: DisplayChange, messages: string[]) {
  if (original?.type !== "entity") return;
  const label = [updated?.label, updated?.name].find((text) => !!text) ?? ts("(Unnamed)");
  if (!updated || updated.trashed) {
    messages.push(ts('Remove DB entity "%1".', { 1: label }));
    return;
  }
  const before = columnNames(original);
  const after = columnNames(updated);
  for (const [key, name] of Object.entries(before)) {
    const next = after[key];
    if (next === undefined)
      messages.push(ts('In entity "%1", remove column "%2".', { 1: label, 2: name }));
    else if (next !== name)
      messages.push(
        ts('In entity "%1", rename column "%2" to "%3".', { 1: label, 2: name, 3: next }),
      );
  }
}

/** The messages to confirm before saving, from core's rule and from listeners of the event. */
export function findCriticalChanges(target: EventTarget, changes: DisplayChange[]): string[] {
  const messages: string[] = [];
  for (const change of changes) {
    entityCriticalChanges(change, messages);
    target.dispatchEvent(
      new CustomEvent("findCriticalChanges", {
        bubbles: true,
        composed: true,
        detail: { display: change, data: { messages } },
      }),
    );
  }
  return messages;
}

/** core's preSaveDisplay for DB entities: drop the preview's settings, save the refresh job. */
function entityPreSave(display: EditorDisplay, calls: Record<string, unknown[]>) {
  if (display.type !== "entity") return;
  if (isRecord(display.settings)) {
    delete display.settings.limit;
    delete display.settings.pager;
    delete display.settings.classes;
  }
  const job = display._job;
  if (!isRecord(job)) return;
  const name = display.name ?? "";
  Object.assign(job, {
    api_entity: `SK_${name}`,
    api_action: "refresh",
    name: ts("Refresh %1 Table", { 1: display.label }),
    description: ts("Refresh contents of the %1 SearchKit entity", { 1: display.label }),
  });
  calls[`job_${name}`] = [
    "Job",
    "save",
    { records: [job], match: ["api_entity", "api_action"] },
    0,
  ];
}

/** Lets core's rule and the event's listeners change displays and add calls before saving. */
export function preSaveDisplay(
  target: EventTarget,
  displays: EditorDisplay[],
  calls: Record<string, unknown[]>,
): void {
  for (const display of displays) {
    entityPreSave(display, calls);
    target.dispatchEvent(
      new CustomEvent("preSaveDisplay", {
        bubbles: true,
        composed: true,
        detail: { display, apiCalls: calls },
      }),
    );
  }
}

/** After saving: DB entities refresh their table, and the admin metadata reloads. */
export function postSaveDisplay(
  target: EventTarget,
  displays: EditorDisplay[],
  results: Record<string, unknown>,
): { reloadMetadata: boolean; refreshes: Promise<unknown>[] } {
  let reloadMetadata = false;
  const refreshes: Promise<unknown>[] = [];
  for (const display of displays) {
    if (display.type === "entity") {
      refreshes.push(api4(`SK_${display.name ?? ""}`, "refresh", {}));
      reloadMetadata = true;
    }
    const event = new CustomEvent("postSaveDisplay", {
      bubbles: true,
      composed: true,
      detail: { display, apiResults: results, reloadMetadata: false },
    });
    target.dispatchEvent(event);
    if (isRecord(event.detail) && event.detail.reloadMetadata) reloadMetadata = true;
  }
  return { reloadMetadata, refreshes };
}
