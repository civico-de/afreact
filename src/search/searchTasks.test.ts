import {
  actionTitle,
  allows,
  BATCH_SIZE,
  batchCall,
  batches,
  evaluateTaskExpression,
  inlineEditCall,
  parseTaskList,
  referencedTasks,
  taskRun,
  unsupportedTaskNotes,
  type EntityInfo,
  type SearchTask,
} from "./searchTasks";

const contact: EntityInfo = {
  name: "Contact",
  title: "Contact",
  title_plural: "Contacts",
  primary_key: ["id"],
};

// As GetSearchTasks declares them on master.
const disable: SearchTask = {
  name: "disable",
  title: "Disable Contacts",
  icon: "fa-toggle-off",
  number: "> 0",
  apiBatch: {
    action: "update",
    params: { values: { is_active: false }, where: [["is_active", "=", true]] },
    confirmMsg: "Are you sure you want to disable %1 %2?",
  },
};
const download: SearchTask = {
  name: "download",
  title: "Download Spreadsheet",
  number: ">= 0",
  uiDialog: { templateUrl: "~/crmSearchTasks/crmSearchTaskDownload.html" },
};
const merge: SearchTask = {
  name: "contact.merge",
  title: "Dedupe - Merge 2 Contacts",
  number: "=== 2",
  crmPopup: {
    path: "'civicrm/contact/merge'",
    query: '{reset: 1, cid: ids[0], oid: ids[1], action: "update"}',
  },
};

describe("parseTaskList", () => {
  it("reads the tasks and the entity the result carries in editable", () => {
    const result = Object.assign([disable], { editable: { entityInfo: contact } });
    expect(parseTaskList(result)).toEqual({ tasks: [disable], entityInfo: contact });
  });

  it("fails without the entity rather than guessing it", () => {
    expect(() => parseTaskList([disable])).toThrow(/without the entity/);
  });

  it("fails on a task without a name", () => {
    const result = Object.assign([{ title: "X", number: "> 0" }], {
      editable: { entityInfo: contact },
    });
    expect(() => parseTaskList(result)).toThrow(/without name or title/);
  });
});

describe("allows", () => {
  it("compares the selected count as core's $eval of count + number", () => {
    expect(allows("> 0", 0)).toBe(false);
    expect(allows("> 0", 1)).toBe(true);
    expect(allows(">= 0", 0)).toBe(true);
    expect(allows("=== 2", 2)).toBe(true);
    expect(allows("=== 2", 3)).toBe(false);
    expect(allows("== 1", 1)).toBe(true);
    expect(allows("!== 1", 1)).toBe(false);
    expect(allows("!= 1", 2)).toBe(true);
    expect(allows("<= 3", 3)).toBe(true);
    expect(allows("< 3", 3)).toBe(false);
  });

  it("returns null for a number it cannot read", () => {
    expect(allows("> ids.length", 1)).toBeNull();
  });
});

describe("actionTitle", () => {
  it("names the count and entity, all rows without a selection, or the required number", () => {
    expect(actionTitle(disable, 1, contact)).toBe("Perform action on 1 Contact");
    expect(actionTitle(disable, 3, contact)).toBe("Perform action on 3 Contacts");
    expect(actionTitle(download, 0, contact)).toBe("Perform action on all Contacts");
    expect(actionTitle(merge, 3, contact)).toBe("Selected number must be  2");
  });
});

describe("evaluateTaskExpression", () => {
  const data = { ids: [4, 7], entity: "Contact" };

  it("evaluates the expressions core's tasks use", () => {
    expect(evaluateTaskExpression("'civicrm/contact/merge'", data)).toBe("civicrm/contact/merge");
    expect(evaluateTaskExpression(merge.crmPopup?.query ?? "", data)).toEqual({
      reset: 1,
      cid: 4,
      oid: 7,
      action: "update",
    });
    expect(
      evaluateTaskExpression("{id: ids.join(','), qfKey: 'abc', entity: entity}", data),
    ).toEqual({
      id: "4,7",
      qfKey: "abc",
      entity: "Contact",
    });
  });

  it("refuses names outside the task's data and other expressions", () => {
    expect(() => evaluateTaskExpression("displayCtrl.search", data)).toThrow(/Unknown name/);
    expect(() => evaluateTaskExpression("ids.length + 1", data)).toThrow(/Unsupported/);
    expect(() => evaluateTaskExpression("entity.join(',')", data)).toThrow(/Not a list/);
  });
});

describe("taskRun", () => {
  it("runs API batches, popups and windows, as doTask() chooses", () => {
    expect(taskRun(disable)).toEqual({ kind: "batch", apiBatch: disable.apiBatch });
    expect(taskRun(merge)).toEqual({ kind: "popup", target: merge.crmPopup });
    const label: SearchTask = { ...merge, crmPopup: undefined, redirect: merge.crmPopup };
    expect(taskRun(label)).toEqual({ kind: "redirect", target: merge.crmPopup });
  });

  it("names why it cannot run Angular dialogs, input fields and the rest", () => {
    expect(taskRun(download)).toEqual({
      kind: "unsupported",
      reason: "Angular dialog ~/crmSearchTasks/crmSearchTaskDownload.html",
    });
    const fields = { ...disable, apiBatch: { action: "save", fields: [{ name: "contact_id" }] } };
    expect(taskRun(fields)).toEqual({ kind: "unsupported", reason: "input fields" });
    expect(taskRun({ name: "x", title: "X", number: "> 0" })).toEqual({
      kind: "unsupported",
      reason: "no apiBatch, crmPopup or redirect",
    });
    expect(taskRun({ ...disable, number: "> count" })).toEqual({
      kind: "unsupported",
      reason: "number > count",
    });
    const reading = { ...merge, crmPopup: { path: "displayCtrl.path" } };
    expect(taskRun(reading)).toEqual({
      kind: "unsupported",
      reason: "Unknown name in task expression: displayCtrl",
    });
    const numeric = { ...merge, crmPopup: { path: "1" } };
    expect(taskRun(numeric)).toEqual({ kind: "unsupported", reason: "path 1" });
  });
});

describe("referencedTasks and unsupportedTaskNotes", () => {
  const columns = [{ type: "menu", links: [{ task: "download" }, { path: "civicrm/x" }] }];

  it("collects the enabled tasks and the tasks the row links name", () => {
    expect(referencedTasks({ columns: [], actions: true })).toBe("all");
    expect(referencedTasks({ columns, actions: ["disable"] })).toEqual(
      new Set(["disable", "download"]),
    );
    expect(referencedTasks({ columns: [] })).toEqual(new Set());
  });

  it("notes only the referenced tasks the renderer cannot run", () => {
    const tasks = [disable, download, merge];
    expect(unsupportedTaskNotes(tasks, "all")).toEqual([
      "task download (Angular dialog ~/crmSearchTasks/crmSearchTaskDownload.html)",
    ]);
    expect(unsupportedTaskNotes(tasks, new Set(["disable"]))).toEqual([]);
  });
});

describe("batchCall", () => {
  it("adds the ids to the task's where clause, leaving the task as it was", () => {
    expect(batchCall(disable.apiBatch!, contact, [1, 2])).toEqual([
      "Contact",
      "update",
      {
        values: { is_active: false },
        where: [
          ["is_active", "=", true],
          ["id", "IN", [1, 2]],
        ],
      },
    ]);
    expect(disable.apiBatch?.params?.where).toHaveLength(1);
    expect(batchCall({ action: "delete", params: null }, contact, [3])).toEqual([
      "Contact",
      "delete",
      { where: [["id", "IN", [3]]] },
    ]);
  });

  it("saves one record per id for save and create, on the task's entity and id field", () => {
    const soft = { entity: "ContributionSoft", action: "create", idField: "contribution_id" };
    expect(batchCall({ ...soft, params: { values: { amount: 5 } } }, contact, [8, 9])).toEqual([
      "ContributionSoft",
      "save",
      {
        records: [
          { amount: 5, contribution_id: 8 },
          { amount: 5, contribution_id: 9 },
        ],
      },
    ]);
    expect(
      batchCall({ action: "save", params: { records: [{ a: 1 }, { b: 2 }] } }, contact, [4]),
    ).toEqual([
      "Contact",
      "save",
      {
        records: [
          { a: 1, id: 4 },
          { b: 2, id: 4 },
        ],
      },
    ]);
    expect(batchCall({ action: "save" }, contact, [4])).toEqual([
      "Contact",
      "save",
      { records: [{ id: 4 }] },
    ]);
  });

  it("fails for an entity without primary key", () => {
    expect(() => batchCall({ action: "delete" }, { ...contact, primary_key: [] }, [1])).toThrow(
      /no primary key/,
    );
  });
});

describe("inlineEditCall", () => {
  it("runs the row's update through SearchDisplay.inlineEdit without the where clause", () => {
    const display = { savedSearch: "S", display: "D", filters: {}, sort: [], limit: 50 };
    expect(inlineEditCall(disable.apiBatch!, display, 5)).toEqual([
      "SearchDisplay",
      "inlineEdit",
      { values: { is_active: false }, ...display, return: null, rowKey: 5 },
    ]);
  });
});

describe("batches", () => {
  it("splits ids into batches of 500, with one call for no ids", () => {
    expect(BATCH_SIZE).toBe(500);
    expect(batches([])).toEqual([{ first: 0, last: 0 }]);
    const ids = Array.from({ length: 1001 }, (_, index) => index);
    expect(batches(ids)).toEqual([
      { first: 0, last: 500 },
      { first: 500, last: 1000 },
      { first: 1000, last: 1001 },
    ]);
  });
});
