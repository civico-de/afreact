import { describe, expect, it } from "vitest";
import { metadata as meta } from "../../../test/searchMetadata";
import {
  addCol,
  addCssRule,
  changeLimit,
  getColumnIndex,
  createSqlName,
  initAutocomplete,
  initBatch,
  setBatchTallyFn,
  toggleBatchTally,
  toggleDefault,
  initColumns,
  initEntity,
  isFkColumn,
  pascalCase,
  setEntityPermission,
  initGrid,
  initLinkGroups,
  initList,
  initTree,
  initPager,
  initPlaceholder,
  initTable,
  initTasks,
  initToolbar,
  removeCol,
  setColumnMode,
  setSectionGroupBy,
  taskEnabled,
  toggleActions,
  toggleColumn,
  toggleEmptyVal,
  toggleItem,
  togglePager,
  toggleRewrite,
  toggleTask,
  toggleTally,
  type AdminColumn,
  type DisplayContext,
  type Draft,
} from "./model";

const ctx: DisplayContext = {
  meta,
  search: { api_entity: "Contact", api_params: { version: 4, select: ["id", "display_name"] } },
  defaultPagerSize: 50,
  entityIndex: true,
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

describe("list, grid and tree init", () => {
  it("gives new lists and grids their defaults and one field per selected column", () => {
    const list = table();
    list.type = "list";
    initList(ctx, list);
    expect(list.settings).toMatchObject({ style: "ul", limit: 50, pager: {} });
    expect(list.settings.columns?.map((c) => c.key)).toEqual(["id", "display_name"]);
    const grid = table();
    grid.type = "grid";
    initGrid(ctx, grid);
    expect(grid.settings).toMatchObject({ colno: "3", limit: 50, pager: {} });
  });

  it("starts a tree collapsed, without a pager and with fields on one line", () => {
    const tree = table();
    tree.type = "tree";
    initTree(ctx, tree);
    expect(tree.settings).toMatchObject({ collapsible: "closed" });
    expect(tree.settings).not.toHaveProperty("pager");
    expect(tree.settings.columns?.[0]).toMatchObject({ break: false });
  });

  it("keeps a stored list as it is apart from a missing header tag", () => {
    const list = table({ style: "ol", section_group_by: "id", columns: [] });
    list.type = "list";
    initList(ctx, list);
    expect(list.settings).toMatchObject({ style: "ol", header_tag: "h4", columns: [] });
  });

  it("puts the grouping field first in the sort and turns the pager off", () => {
    const settings: Draft["settings"] = {
      sort: [
        ["display_name", "DESC"],
        ["id", "ASC"],
      ],
      pager: { show_count: true },
    };
    setSectionGroupBy(settings, "id");
    expect(settings).toMatchObject({
      sort: [
        ["id", "ASC"],
        ["display_name", "DESC"],
      ],
      pager: false,
      header_tag: "h4",
    });
    setSectionGroupBy(settings, "");
    expect(settings.sort).toEqual([
      ["id", "ASC"],
      ["display_name", "DESC"],
    ]);
  });
});

describe("autocomplete and DB entity init", () => {
  // deviation:autocomplete-search-fields
  it("shows the entity's search fields and searches by id and them", () => {
    const draft = table();
    draft.type = "autocomplete";
    initAutocomplete(ctx, draft);
    expect(draft.settings.columns?.map((c) => c.key)).toEqual(["display_name"]);
    expect(draft.settings.searchFields).toEqual(["id", "display_name"]);
  });

  it("keeps stored search fields, without duplicates", () => {
    const draft = table({ searchFields: ["display_name", "display_name"], columns: [] });
    initAutocomplete(ctx, draft);
    expect(draft.settings.searchFields).toEqual(["display_name"]);
  });

  it("always bypasses ACLs, names itself from the label and indexes key columns", () => {
    const draft: Draft = { label: "my members", type: "entity", settings: {} };
    initEntity(ctx, draft);
    expect(draft).toMatchObject({
      acl_bypass: true,
      name: "MyMembers",
      _job: { parameters: "version=4", is_active: false, run_frequency: "Hourly" },
    });
    expect(draft.settings.columns).toEqual([
      expect.objectContaining({ key: "id", index: true, label: "Contact ID" }),
      expect.objectContaining({ key: "display_name", index: true }),
    ]);
  });

  it("leaves the index out on a core without it", () => {
    const draft: Draft = { label: "L", type: "entity", settings: {} };
    initEntity({ ...ctx, entityIndex: false }, draft);
    expect(draft.settings.columns?.map((col) => "index" in col)).toEqual([false, false]);
  });

  it("forces the index on key columns and drops pseudo fields", () => {
    const draft: Draft = {
      id: 3,
      name: "Kept",
      label: "L",
      type: "entity",
      settings: {
        columns: [
          { type: "field", key: "id", index: false },
          { type: "field", key: "display_name", index: false },
          { type: "field", key: "result_row_num" },
        ],
      },
    };
    initEntity(ctx, draft);
    expect(draft.name).toBe("Kept");
    expect(draft._job).toBeUndefined();
    expect(draft.settings.columns?.map((c) => [c.key, c.index])).toEqual([
      ["id", true],
      ["display_name", false],
    ]);
    expect(isFkColumn(ctx, { type: "field", key: "display_name" })).toBe(false);
  });

  it("previews SQL names as core does, hashing long keys", () => {
    expect(createSqlName("Contact_Email.email:label")).toBe("Contact_Email_email");
    const long = "a".repeat(60);
    expect(createSqlName(long)).toMatch(/^a{42}[0-9a-f]{16}$/);
  });

  // deviation:db-entity-pascal-case
  it("pascal-cases names as core's master does, folding accents", () => {
    expect(pascalCase("my members")).toBe("MyMembers");
    expect(pascalCase("contribution_recur")).toBe("ContributionRecur");
    expect(pascalCase("LKvt Übersicht")).toBe("LkVtUbersicht");
    expect(pascalCase("Straße 2")).toBe("Strasse2");
  });

  it("needs an operator only for several permissions", () => {
    const settings: Draft["settings"] = {};
    setEntityPermission(settings, ["a", "b"]);
    expect(settings.entity_permission_operator).toBe("AND");
    setEntityPermission(settings, ["a"]);
    expect(settings).not.toHaveProperty("entity_permission_operator");
  });
});

describe("data entry display", () => {
  it("starts with core's classes, a pager and totals for numbers", () => {
    const draft: Draft = { label: "D", type: "batch", settings: {} };
    initBatch(ctx, draft);
    expect(draft.settings).toMatchObject({
      classes: ["table", "table-striped", "table-bordered", "crm-sticky-header"],
      limit: 50,
      pager: { hide_single: true },
      tally: {},
    });
    expect(draft.settings.columns?.map((col) => col.tally)).toEqual([{ fn: "SUM" }, undefined]);
  });

  it("drops every column's totals with the footer", () => {
    const draft: Draft = { label: "D", type: "batch", settings: {} };
    initBatch(ctx, draft);
    toggleBatchTally(ctx, draft.settings);
    expect(draft.settings.tally).toBeUndefined();
    expect(draft.settings.columns?.some((col) => "tally" in col)).toBe(false);
  });

  it("stores each default as its field's data type, as core's input does on render", () => {
    const columns: AdminColumn[] = [
      { type: "field", key: "gender_id:label", default: "1" },
      { type: "field", key: "employer_id", default: "abc" },
      { type: "field", key: "display_name", default: "1" },
      { type: "field", key: "id", default: null },
    ];
    const draft: Draft = { label: "D", type: "batch", settings: { columns } };
    const select = ["gender_id:label", "employer_id", "display_name", "id"];
    initBatch({ ...ctx, search: { ...ctx.search, api_params: { version: 4, select } } }, draft);
    expect(draft.settings.columns?.map((col) => col.default)).toEqual([1, "abc", "1", null]);
  });

  it("keeps a target only for sums and toggles a default value", () => {
    const col: AdminColumn = { type: "field", key: "id", tally: { fn: "SUM", target: true } };
    setBatchTallyFn(col, "AVG");
    expect(col.tally).toEqual({ fn: "AVG" });
    toggleDefault(col);
    expect(col).toHaveProperty("default", null);
    toggleDefault(col);
    expect(col).not.toHaveProperty("default");
  });
});

describe("link groups on open", () => {
  it("gives every link of a links, buttons or menu column and the toolbar core's keys", () => {
    const draft = table({
      columns: [
        {
          type: "menu",
          links: [{ entity: "Contact", action: "update", text: "Edit", condition: [] }],
        },
        { type: "buttons", links: [{ task: "delete", text: "Delete", condition: ["id", "=", 1] }] },
        { type: "field", key: "id", link: { path: "civicrm/x" } },
      ],
      toolbar: [{ path: "civicrm/new", text: "New" }],
    });
    initLinkGroups(ctx, draft);
    const keys = (link: object) => Object.keys(link).sort();
    const all = [
      "action",
      "conditions",
      "entity",
      "icon",
      "join",
      "path",
      "style",
      "target",
      "task",
      "text",
    ];
    const [menu, buttons, field] = draft.settings.columns ?? [];
    // An empty legacy condition stays beside the new conditions, as in core.
    expect(keys(menu?.links?.[0] ?? {})).toEqual([...all, "condition"].sort());
    expect(buttons?.links?.[0]).toMatchObject({ conditions: [["id", "=", 1]], task: "delete" });
    expect(buttons?.links?.[0]).not.toHaveProperty("condition");
    expect(field).toEqual({ type: "field", key: "id", link: { path: "civicrm/x" } });
    expect(keys(draft.settings.toolbar?.[0] ?? {})).toEqual(all);
  });
});
