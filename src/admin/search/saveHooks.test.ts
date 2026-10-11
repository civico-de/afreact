import { describe, expect, it, vi } from "vitest";
import type { EditorDisplay } from "./editor";
import { displayChanges, findCriticalChanges, postSaveDisplay, preSaveDisplay } from "./saveHooks";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const entity = (over: Partial<EditorDisplay> = {}): EditorDisplay => ({
  id: 4,
  name: "Members",
  label: "Members",
  type: "entity",
  settings: { columns: [{ key: "id" }, { key: "display_name", name: "full_name" }] },
  ...over,
});

describe("findCriticalChanges", () => {
  it("names removed and renamed columns of a DB entity", () => {
    const updated = entity({ settings: { columns: [{ key: "id", name: "contact" }] } });
    const messages = findCriticalChanges(new EventTarget(), displayChanges([entity()], [updated]));
    expect(messages).toEqual([
      'In entity "Members", rename column "id" to "contact".',
      'In entity "Members", remove column "full_name".',
    ]);
  });

  it("names a removed DB entity and stays quiet for an unchanged one or other types", () => {
    const target = new EventTarget();
    expect(
      findCriticalChanges(target, displayChanges([entity()], [entity({ trashed: true })])),
    ).toEqual(['Remove DB entity "Members".']);
    expect(findCriticalChanges(target, displayChanges([entity()], [entity()]))).toEqual([]);
    const table = entity({ type: "table" });
    expect(
      findCriticalChanges(target, displayChanges([table], [{ ...table, settings: {} }])),
    ).toEqual([]);
  });

  it("lets listeners add messages through the event", () => {
    const target = new EventTarget();
    target.addEventListener("findCriticalChanges", (event) => {
      const detail: unknown = event instanceof CustomEvent ? event.detail : null;
      if (isRecord(detail) && isRecord(detail.data) && Array.isArray(detail.data.messages))
        detail.data.messages.push("Plugin says no");
    });
    expect(findCriticalChanges(target, displayChanges([], [entity({ id: undefined })]))).toEqual([
      "Plugin says no",
    ]);
  });

  it("pairs unsaved displays in order and saved ones by id", () => {
    const pairs = displayChanges(
      [entity({ id: 1, label: "A" }), entity({ id: 2, label: "B" })],
      [entity({ id: 2, label: "B2" }), entity({ id: undefined, label: "New" })],
    );
    expect(pairs.map((p) => [p.original?.label, p.updated?.label])).toEqual([
      ["A", undefined],
      ["B", "B2"],
      [undefined, "New"],
    ]);
  });
});

describe("preSaveDisplay", () => {
  it("drops the preview's settings and saves the refresh job before the search", () => {
    const display = entity({
      settings: { limit: 50, pager: {}, classes: ["table"], sort: [] },
      _job: { is_active: true, run_frequency: "Daily" },
    });
    const calls: Record<string, unknown[]> = {};
    preSaveDisplay(new EventTarget(), [display], calls);
    expect(display.settings).toEqual({ sort: [] });
    expect(calls.job_Members).toEqual([
      "Job",
      "save",
      {
        records: [
          {
            is_active: true,
            run_frequency: "Daily",
            api_entity: "SK_Members",
            api_action: "refresh",
            name: "Refresh Members Table",
            description: "Refresh contents of the Members SearchKit entity",
          },
        ],
        match: ["api_entity", "api_action"],
      },
      0,
    ]);
  });

  it("leaves other display types alone", () => {
    const display = entity({ type: "table", settings: { limit: 5 } });
    const calls: Record<string, unknown[]> = {};
    preSaveDisplay(new EventTarget(), [display], calls);
    expect(display.settings).toEqual({ limit: 5 });
    expect(calls).toEqual({});
  });
});

describe("postSaveDisplay", () => {
  it("refreshes DB entities and asks for fresh metadata", async () => {
    vi.mocked(window.CRM.api4).mockResolvedValue([]);
    const after = postSaveDisplay(new EventTarget(), [entity()], {});
    expect(after.reloadMetadata).toBe(true);
    await Promise.all(after.refreshes);
    expect(window.CRM.api4).toHaveBeenCalledWith("SK_Members", "refresh", {});
  });

  it("reloads metadata when a listener asks for it", () => {
    const target = new EventTarget();
    target.addEventListener("postSaveDisplay", (event) => {
      const detail: unknown = event instanceof CustomEvent ? event.detail : null;
      if (isRecord(detail)) detail.reloadMetadata = true;
    });
    expect(postSaveDisplay(target, [entity({ type: "table" })], {})).toEqual({
      reloadMetadata: true,
      refreshes: [],
    });
  });
});
