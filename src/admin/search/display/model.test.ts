import { describe, expect, it } from "vitest";
import { metadata as meta } from "../../../test/searchMetadata";
import {
  addCol,
  addCssRule,
  changeLimit,
  getColumnIndex,
  initColumns,
  initPager,
  initPlaceholder,
  initTable,
  initTasks,
  initToolbar,
  removeCol,
  setColumnMode,
  taskEnabled,
  toggleActions,
  toggleColumn,
  toggleEmptyVal,
  toggleItem,
  togglePager,
  toggleRewrite,
  toggleTask,
  toggleTally,
  type DisplayContext,
  type Draft,
} from "./model";

const ctx: DisplayContext = {
  meta,
  search: { api_entity: "Contact", api_params: { version: 4, select: ["id", "display_name"] } },
  defaultPagerSize: 50,
};
const table = (settings: Draft["settings"] = {}): Draft => ({
  label: "T",
  type: "table",
  settings,
});

describe("table init", () => {
  it("gives a new table the site default settings with automatic columns", () => {
    const draft = table();
    initTable(ctx, draft);
    initPlaceholder(draft.settings);
    initPager(ctx, draft.settings);
    expect(draft.settings).toMatchObject({
      columnMode: "auto",
      classes: ["table", "table-striped"],
      pager: {},
      placeholder: 5,
      limit: 50,
    });
    expect(draft.settings.columns).toBeUndefined();
  });

  it("keeps stored columns in custom mode and drops those no longer selected", () => {
    const draft = table({
      columns: [
        { type: "field", key: "id" },
        { type: "field", key: "gone" },
        { type: "links", links: [] },
      ],
    });
    initTable(ctx, draft);
    expect(draft.settings.columnMode).toBe("custom");
    expect(draft.settings.columns?.map((c) => c.key ?? c.type)).toEqual(["id", "links"]);
  });

  it("builds one column per selected field when switching to custom", () => {
    const draft = table();
    setColumnMode(ctx, draft, "custom");
    expect(draft.settings.columns?.map((c) => c.key)).toEqual(["id", "display_name"]);
    setColumnMode(ctx, draft, "auto");
    expect(draft.settings.columns).toBeUndefined();
  });

  it("turns a legacy pager flag and add button into their current forms", () => {
    const settings: Draft["settings"] = {
      pager: true,
      addButton: { path: "civicrm/new", text: "New" },
    };
    initPager(ctx, settings);
    initToolbar(settings);
    expect(settings.pager).toEqual({ show_count: false, expose_limit: false });
    expect(settings.toolbar).toEqual([{ path: "civicrm/new", text: "New", style: "primary" }]);
    expect(settings.addButton).toBeUndefined();
  });
});

describe("columns", () => {
  it("adds, finds, toggles and removes columns", () => {
    const draft = table({ columns: [] });
    toggleColumn(ctx, draft, "id", { label: true });
    expect(getColumnIndex(draft.settings, "id")).toBe(0);
    addCol(draft, "links");
    expect(draft.settings.columns?.[1]).toMatchObject({ type: "links", alignment: "text-right" });
    toggleColumn(ctx, draft, "id", { label: true });
    expect(getColumnIndex(draft.settings, "id")).toBe(-1);
    removeCol(draft.settings, 0);
    expect(draft.settings.columns).toEqual([]);
  });

  it("refuses an unknown column type rather than adding an empty one", () => {
    expect(() => {
      addCol(table(), "nope");
    }).toThrow("nope");
  });

  it("fills missing defaults of stored columns without overwriting set values", () => {
    const draft = table({ columns: [{ type: "field", key: "id", label: "Kept" }] });
    initColumns(ctx, draft, { label: true });
    expect(draft.settings.columns?.[0]?.label).toBe("Kept");
  });

  it("toggles empty values and rewrites", () => {
    const col = { type: "field", key: "id" };
    toggleEmptyVal(col);
    expect(col).toMatchObject({ empty_value: "None" });
    toggleEmptyVal(col);
    expect(col).not.toHaveProperty("empty_value");
    toggleRewrite(col);
    expect(col).toMatchObject({ rewrite: "[id]" });
  });
});

describe("pager and tasks", () => {
  it("drops the pager when the limit goes to zero", () => {
    const settings: Draft["settings"] = { pager: { show_count: true } };
    changeLimit(settings, 0);
    expect(settings).toMatchObject({ limit: 0, pager: false });
    togglePager(ctx, settings);
    expect(settings).toMatchObject({ limit: 50, pager: { show_count: false } });
  });

  it("stores all tasks as true and a subset as names", () => {
    const settings: Draft["settings"] = {};
    toggleActions(settings);
    initTasks(settings);
    expect(settings).toMatchObject({ actions: true, actions_display_mode: "menu" });
    toggleTask(settings, "delete", ["delete", "export"]);
    expect(settings.actions).toEqual(["export"]);
    expect(taskEnabled(settings, "delete")).toBe(false);
    toggleTask(settings, "delete", ["delete", "export"]);
    expect(settings.actions).toBe(true);
    toggleActions(settings);
    expect(settings).not.toHaveProperty("actions_display_mode");
  });
});

describe("tally", () => {
  it("switches to custom columns on first use and removes itself when both ends are off", () => {
    const draft = table();
    toggleTally(ctx, draft, "footer");
    expect(draft.settings).toMatchObject({ columnMode: "custom", tally: { footer: true } });
    toggleTally(ctx, draft, "footer");
    expect(draft.settings.tally).toBeUndefined();
    expect(draft.settings.columns?.some((c) => "tally" in c)).toBe(false);
  });
});

describe("helpers", () => {
  it("toggles an item in a list", () => {
    expect(toggleItem(["a", "b"], "a")).toEqual(["b"]);
    expect(toggleItem(["b"], "a")).toEqual(["b", "a"]);
  });

  it("starts a css rule on a known field, otherwise as always-on", () => {
    const item: { cssRules?: unknown[][] } = {};
    addCssRule(ctx, item, "bg-danger", "id");
    addCssRule(ctx, item, "bg-info", "no_such_field");
    expect(item.cssRules).toEqual([["bg-danger", "id", "="], ["bg-info"]]);
  });
});
