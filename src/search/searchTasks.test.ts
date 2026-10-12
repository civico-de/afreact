import {
  actionTitle,
  allows,
  BATCH_SIZE,
  batchCall,
  batches,
  caseBatch,
  caseRoleBatch,
  caseRoleReplaceCall,
  caseRolesCall,
  caseFieldsCall,
  dispositionFileName,
  downloadParams,
  grantBatch,
  grantFieldsCall,
  grantsCall,
  presetValues,
  evaluateTaskExpression,
  initialUpdateValue,
  initialCreateFields,
  inlineEditCall,
  parseTaskList,
  referencedTasks,
  mailingBatch,
  mailingCalls,
  mailingGroupCall,
  openCasesCall,
  relationshipBatch,
  relationshipFieldsCall,
  tagBatch,
  tagCalls,
  tagEntity,
  tagTree,
  taskRun,
  unsupportedTaskNotes,
  updateBatch,
  taskFieldsCall,
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
const tag: SearchTask = {
  name: "tag",
  title: "Tag - Add/Remove Tags",
  number: "> 0",
  uiDialog: { templateUrl: "~/crmSearchTasks/crmSearchTaskTag.html" },
};
const relationship: SearchTask = {
  name: "contact.relationship",
  title: "Add Relationship",
  number: "> 0",
  uiDialog: { templateUrl: "~/crmSearchTasks/crmSearchTaskRelationship.html" },
};
const mailing: SearchTask = {
  name: "contact.mailing",
  title: "Email - schedule/send via CiviMail",
  number: "> 0",
  uiDialog: { templateUrl: "~/crmSearchTasks/crmSearchTaskMailing.html" },
};
const openCase: SearchTask = {
  name: "contact.addCase",
  title: "Case - Open New Case",
  number: "> 0",
  uiDialog: { templateUrl: "~/civiCaseTasks/civiCaseTaskOpenCase.html" },
  values: [],
  allowMultipleClients: true,
};
const caseRole: SearchTask = {
  name: "case.addRole",
  title: "Case - Assign Role",
  number: "> 0",
  uiDialog: { templateUrl: "~/civiCaseTasks/civiCaseTaskCaseRole.html" },
  values: [],
  relationshipTypes: [],
};
const addGrant: SearchTask = {
  name: "contact.addGrant",
  title: "Grant - Add New Grant",
  number: "> 0",
  uiDialog: { templateUrl: "~/civiGrantTasks/civiGrantTaskAddGrant.html" },
  values: [],
};
const foreign: SearchTask = {
  name: "contact.foreign",
  title: "Foreign dialog",
  number: "> 0",
  uiDialog: { templateUrl: "~/myext/myDialog.html" },
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

  it("runs the download, update, tag, relationship and mailing tasks itself", () => {
    expect(taskRun(download)).toEqual({ kind: "download" });
    const update = {
      ...tag,
      uiDialog: { templateUrl: "~/crmSearchTasks/crmSearchTaskUpdate.html" },
    };
    expect(taskRun(update)).toEqual({ kind: "update" });
    expect(taskRun(tag)).toEqual({ kind: "tag" });
    expect(taskRun(relationship)).toEqual({ kind: "relationship" });
    expect(taskRun(mailing)).toEqual({ kind: "mailing" });
    expect(taskRun(openCase)).toEqual({ kind: "case" });
    expect(taskRun(caseRole)).toEqual({ kind: "caseRole" });
    expect(taskRun(addGrant)).toEqual({ kind: "grant" });
    const dialog = (templateUrl: string) => ({ ...addGrant, uiDialog: { templateUrl } });
    expect(taskRun(dialog("~/crmSearchTasks/crmSearchTaskTagMerge.html"))).toEqual({
      kind: "tagMerge",
    });
    expect(taskRun(dialog("~/crmMsgadmTasks/AddTranslation.html"))).toEqual({
      kind: "translation",
    });
  });

  it("names why it cannot run Angular dialogs, input fields and the rest", () => {
    expect(taskRun(foreign)).toEqual({
      kind: "unsupported",
      reason: "Angular dialog ~/myext/myDialog.html",
    });
    const where = { name: "geo", label: "Where", input_type: "Location", data_type: "String" };
    const located = { ...disable, apiBatch: { action: "save", fields: [where] } };
    expect(taskRun(located)).toEqual({
      kind: "unsupported",
      reason: "input field geo (Location)",
    });
    const note = { name: "note", label: "Note", input_type: "TextArea", data_type: "String" };
    const typed = { ...disable, apiBatch: { action: "save", fields: [note] } };
    expect(taskRun(typed)).toEqual({ kind: "batch", apiBatch: typed.apiBatch });
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
    const tasks = [
      disable,
      download,
      tag,
      relationship,
      mailing,
      openCase,
      caseRole,
      foreign,
      merge,
    ];
    expect(unsupportedTaskNotes(tasks, "all")).toEqual([
      "task contact.foreign (Angular dialog ~/myext/myDialog.html)",
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

describe("downloadParams", () => {
  it("drops the page and filters to the ids, as crmSearchTaskDownload does", () => {
    const run = { savedSearch: "S", display: "D", return: "page:1", limit: 20, filters: { a: 1 } };
    expect(downloadParams(run, [3, 4], "xlsx")).toEqual({
      savedSearch: "S",
      display: "D",
      filters: { a: 1, id: [3, 4] },
      format: "xlsx",
    });
    expect(downloadParams({ savedSearch: "S" }, [], "csv").filters).toEqual({ id: [] });
  });
});

describe("dispositionFileName", () => {
  it("prefers the UTF-8 name, then the quoted one, else nothing", () => {
    expect(dispositionFileName('attachment; filename="Contacts.csv"')).toBe("Contacts.csv");
    expect(
      dispositionFileName("attachment; filename=\"Kontakte.csv\"; filename*=utf-8''K%C3%B6pfe.csv"),
    ).toBe("Köpfe.csv");
    expect(dispositionFileName("inline")).toBeNull();
    expect(dispositionFileName(null)).toBeNull();
  });
});

describe("update task", () => {
  const field = { name: "f", label: "F", input_type: "Text", data_type: "String" };

  it("starts a field with the value searchTaskFieldsTrait.addField() picks", () => {
    expect(initialUpdateValue(field)).toBe("");
    expect(initialUpdateValue({ ...field, serialize: 1 })).toEqual([]);
    expect(initialUpdateValue({ ...field, data_type: "Array" })).toEqual([]);
    expect(initialUpdateValue({ ...field, data_type: "Boolean" })).toBe(true);
    expect(initialUpdateValue({ ...field, default_value: "x" })).toBe("x");
    expect(initialUpdateValue({ ...field, options: [{ id: 2, label: "Two" }] })).toBe(2);
    expect(initialUpdateValue({ ...field, options: false })).toBe("");
  });

  it("asks getFields for the writable fields and runs one update batch with core's messages", () => {
    const [entity, action, params] = taskFieldsCall("Contact");
    expect([entity, action]).toEqual(["Contact", "getFields"]);
    expect(params).toMatchObject({
      action: "update",
      where: [
        ["deprecated", "=", false],
        ["readonly", "=", false],
      ],
    });
    expect(updateBatch({ job_title: "Pilot" })).toEqual({
      action: "update",
      params: { values: { job_title: "Pilot" } },
      successTitle: "Saved",
      runMsg: "Updating %1 %2...",
      successMsg: "Successfully updated %1 %2.",
      errorMsg: "An error occurred while attempting to update %1 %2.",
    });
    expect(batchCall(updateBatch({ job_title: "Pilot" }), contact, [1, 2])).toEqual([
      "Contact",
      "update",
      { values: { job_title: "Pilot" }, where: [["id", "IN", [1, 2]]] },
    ]);
  });

  it("starts from the values a hook preset on the task, ignoring a list", () => {
    const task = { name: "update", title: "Update", number: "> 0" };
    expect(presetValues(task)).toEqual([]);
    const preset = { ...task, values: { is_deceased: true } };
    expect(presetValues(preset)).toEqual([["is_deceased", true]]);
    expect(presetValues({ ...task, values: [1] })).toEqual([]);
  });
});

describe("tag task", () => {
  // deviation:tag-task-contact-types
  it("looks tags up for Contact whatever contact type the search lists", () => {
    expect(tagEntity("Individual")).toBe("Contact");
    expect(tagEntity("Household")).toBe("Contact");
    expect(tagEntity("Activity")).toBe("Activity");
    const { tags, tagsets } = tagCalls("Organization");
    expect(tags[2].where).toContainEqual(["used_for:name", "CONTAINS", "Contact"]);
    expect(tagsets).toEqual([
      "Tag",
      "get",
      {
        select: ["id", "name", "label"],
        where: [
          ["is_tagset", "=", true],
          ["used_for:name", "CONTAINS", "Contact"],
        ],
      },
    ]);
  });

  it("nests the tags under their parents in order, a missing parent counting as none", () => {
    const tags = [
      { id: 1, label: "A" },
      { id: 2, label: "A1", parent_id: 1 },
      { id: 3, label: "B" },
      { id: 4, label: "A1a", parent_id: 2 },
      { id: 5, label: "Orphan", parent_id: 9 },
    ];
    expect(tagTree(tags).map(({ tag: node, depth }) => `${String(depth)}:${node.label}`)).toEqual([
      "0:A",
      "1:A1",
      "2:A1a",
      "0:B",
      "0:Orphan",
    ]);
  });

  it("adds tags as EntityTag rows per record and removes them by tag", () => {
    const add = tagBatch("save", "Individual", [3, 4]);
    expect(batchCall(add, { ...contact, name: "Individual" }, [1, 2])).toEqual([
      "EntityTag",
      "save",
      {
        defaults: { "entity_table:name": "Contact" },
        records: [
          { tag_id: 3, entity_id: 1 },
          { tag_id: 4, entity_id: 1 },
          { tag_id: 3, entity_id: 2 },
          { tag_id: 4, entity_id: 2 },
        ],
        match: ["entity_id", "tag_id", "entity_table"],
      },
    ]);
    expect(add).toMatchObject({ runMsg: "Adding tags...", successTitle: "Saved" });
    expect(add.summary?.({ fetched: 4, matched: 0, rows: [] })).toBe("4 tags added.");
    expect(add.summary?.({ fetched: 4, matched: 3, rows: [] })).toBe(
      "1 tag added 3 tags already exist and were not added.",
    );
    const remove = tagBatch("delete", "Activity", [3]);
    expect(batchCall(remove, { ...contact, name: "Activity" }, [1])).toEqual([
      "EntityTag",
      "delete",
      {
        where: [
          ["entity_table:name", "=", "Activity"],
          ["tag_id", "IN", [3]],
          ["entity_id", "IN", [1]],
        ],
      },
    ]);
    expect(remove.summary?.({ fetched: 1, matched: 1, rows: [] })).toBe("1 tag removed.");
    expect(remove.summary?.({ fetched: 2, matched: 2, rows: [] })).toBe("2 tags removed.");
  });
});

describe("relationship task", () => {
  it("asks for the type's editable fields as the dialog does", () => {
    const [entity, action, params] = relationshipFieldsCall("5");
    expect(entity).toBe("Relationship");
    expect(action).toBe("getFields");
    expect(params).toMatchObject({
      action: "create",
      values: { relationship_type_id: "5" },
      where: [
        ["readonly", "=", false],
        [
          "OR",
          [
            ["type", "=", "Custom"],
            ["name", "IN", ["description", "start_date", "end_date"]],
          ],
        ],
      ],
    });
  });

  it("relates every selected contact on side a to the chosen one on side b", () => {
    const batch = relationshipBatch("5_a_b", 42, { description: "Met at the fair" });
    expect(batchCall(batch, contact, [1, 2])).toEqual([
      "Relationship",
      "save",
      {
        defaults: { description: "Met at the fair", relationship_type_id: "5", contact_id_b: 42 },
        records: [{ contact_id_a: 1 }, { contact_id_a: 2 }],
      },
    ]);
    expect(batch).toMatchObject({ runMsg: "Adding relationships...", successTitle: "Saved" });
    const reverse = relationshipBatch("5_b_a", 42, {});
    expect(batchCall(reverse, contact, [1])).toEqual([
      "Relationship",
      "save",
      { defaults: { relationship_type_id: "5", contact_id_a: 42 }, records: [{ contact_id_b: 1 }] },
    ]);
    expect(() => relationshipBatch("5", 42, {})).toThrow("Unexpected relationship type key: 5");
  });

  it("counts the duplicates the server reports in the summary", () => {
    const { summary } = relationshipBatch("5_a_b", 42, {});
    const counts = (rows: Record<string, unknown>[]) => ({ fetched: 0, matched: 0, rows });
    expect(summary?.(counts([{ id: 1 }, { id: 2 }]))).toBe("2 relationships added.");
    expect(summary?.(counts([{ id: 1 }, { id: 2, duplicate_id: 7 }]))).toBe(
      "1 relationship added. 1 relationship already exists.",
    );
  });
});

describe("mailing task", () => {
  it("looks up the mailing types and the contacts that can be mailed", () => {
    const calls = mailingCalls([1, 2]);
    expect(calls.templateTypes).toEqual([
      "Mailing",
      "getFields",
      { loadOptions: ["id", "label", "description"], where: [["name", "=", "template_type"]] },
    ]);
    expect(calls.recipientCount[0]).toBe("Contact");
    expect(calls.recipientCount[2]).toMatchObject({
      select: ["row_count"],
      where: [
        ["id", "IN", [1, 2]],
        ["do_not_email", "!=", true],
        ["is_opt_out", "!=", true],
        ["email.on_hold", "=", 0],
      ],
    });
  });

  it("creates the hidden group with the mailing and its include group chained", () => {
    const [entity, action, params] = mailingGroupCall({ name: "News", template_type: "mosaico" });
    expect(entity).toBe("Group");
    expect(action).toBe("create");
    expect(params.values).toMatchObject({ is_hidden: true, "group_type:name": ["Mailing List"] });
    expect(params.chain).toEqual({
      mailing: ["Mailing", "create", { values: { name: "News", template_type: "mosaico" } }, 0],
      mailingGroup: [
        "MailingGroup",
        "create",
        {
          values: {
            group_type: "Include",
            "entity_table:name": "Group",
            entity_id: "$id",
            mailing_id: "$mailing.id",
          },
        },
        0,
      ],
    });
  });

  it("adds the contacts to the group, then opens the mailing", () => {
    const batch = mailingBatch(7, 9);
    expect(batchCall(batch, contact, [1, 2])).toEqual([
      "GroupContact",
      "save",
      { defaults: { group_id: 7 }, records: [{ contact_id: 1 }, { contact_id: 2 }] },
    ]);
    expect(batch).toMatchObject({
      runMsg: "Adding contacts...",
      successUrl: "civicrm/a#/mailing/9",
      errorMsg: "An error occurred while attempting to create mailing.",
    });
  });
});

describe("case task", () => {
  const field = (name: string, extra: Record<string, unknown> = {}) => ({
    name,
    label: name,
    input_type: "Text",
    data_type: "String",
    ...extra,
  });

  it("asks getFields for a new case's fields without the client and the flag", () => {
    const [entity, action, params] = caseFieldsCall();
    expect([entity, action]).toEqual(["Case", "getFields"]);
    expect(params).toMatchObject({
      action: "create",
      where: [
        ["name", "NOT IN", ["contact_id", "is_deleted"]],
        ["deprecated", "=", false],
        ["readonly", "=", false],
      ],
    });
  });

  it("starts with the required fields without a default, then the dialog's own, each once", () => {
    const fields = [
      field("case_type_id", { required: true }),
      field("status_id", { required: true, default_value: 1 }),
      field("subject"),
      field("details"),
    ];
    expect(initialCreateFields(fields, ["subject"])).toEqual(["case_type_id", "subject"]);
    expect(initialCreateFields(fields, ["case_type_id", "gone"])).toEqual(["case_type_id"]);
    expect(initialCreateFields([], ["subject"])).toEqual([]);
  });

  it("looks up the selected contacts whose cases are not closed", () => {
    expect(openCasesCall([1, 2])).toEqual([
      "CaseContact",
      "get",
      {
        select: ["contact_id"],
        where: [
          ["contact_id", "IN", [1, 2]],
          ["case_id.status_id:name", "!=", "Closed"],
        ],
      },
    ]);
  });

  it("saves a case per contact and counts the cases opened", () => {
    const batch = caseBatch({ subject: "Help" });
    expect(batchCall(batch, contact, [1, 2])).toEqual([
      "Case",
      "save",
      {
        records: [
          { subject: "Help", contact_id: 1 },
          { subject: "Help", contact_id: 2 },
        ],
      },
    ]);
    expect([batch.runMsg, batch.runMsgPlural]).toEqual([
      "Opening case...",
      "Opening %count cases...",
    ]);
    expect(batch.successTitle).toBe("Saved");
    expect(batch.summary?.({ fetched: 2, matched: 2, rows: [{ id: 5 }, { id: 6 }] })).toBe(
      "Successfully opened 2 cases.",
    );
    expect(batch.summary?.({ fetched: 1, matched: 1, rows: [{ id: 5 }] })).toBe(
      "Successfully opened 1 case.",
    );
  });
});

describe("add grant task", () => {
  it("asks for a new grant's fields and the selected contacts' grants", () => {
    const [entity, action, params] = grantFieldsCall();
    expect([entity, action]).toEqual(["Grant", "getFields"]);
    expect(params).toMatchObject({
      action: "create",
      where: [
        ["name", "NOT IN", ["contact_id", "is_deleted"]],
        ["deprecated", "=", false],
        ["readonly", "=", false],
      ],
    });
    expect(grantsCall([1, 2])).toEqual([
      "Grant",
      "get",
      { select: ["contact_id"], where: [["contact_id", "IN", [1, 2]]] },
    ]);
  });

  it("saves a grant per contact and counts the grants added", () => {
    const batch = grantBatch({ amount_total: 10 });
    expect(batchCall(batch, contact, [1, 2])).toEqual([
      "Grant",
      "save",
      {
        records: [
          { amount_total: 10, contact_id: 1 },
          { amount_total: 10, contact_id: 2 },
        ],
      },
    ]);
    expect([batch.runMsg, batch.runMsgPlural]).toEqual([
      "Adding grant...",
      "Adding %count grants...",
    ]);
    expect(batch.summary?.({ fetched: 2, matched: 2, rows: [{ id: 5 }, { id: 6 }] })).toBe(
      "Successfully added 2 grants.",
    );
    expect(batch.summary?.({ fetched: 1, matched: 1, rows: [{ id: 5 }] })).toBe(
      "Successfully added 1 grant.",
    );
  });
});

describe("case role task", () => {
  it("counts the selected cases holding the role, by its type id", () => {
    expect(caseRolesCall([1, 2], "9_b_a")).toEqual([
      "Relationship",
      "get",
      {
        select: ["row_count"],
        where: [
          ["case_id", "IN", [1, 2]],
          ["is_current", "=", true],
          ["relationship_type_id", "=", "9"],
        ],
        groupBy: ["case_id"],
      },
    ]);
    expect(() => caseRolesCall([1], "9")).toThrow("Unexpected relationship type key: 9");
  });

  it("ends the role's other holders on the type's side b when replacing", () => {
    expect(caseRoleReplaceCall([1, 2], "9_b_a", 7)).toEqual([
      "Relationship",
      "update",
      {
        values: { end_date: "now", is_active: false },
        where: [
          ["case_id", "IN", [1, 2]],
          ["is_current", "=", true],
          ["relationship_type_id", "=", "9"],
          ["contact_id_a", "!=", 7],
        ],
      },
    ]);
  });

  it("chains a relationship per case client onto the cases and counts the roles added", () => {
    const batch = caseRoleBatch("9_a_b", 7);
    expect(batchCall(batch, contact, [1, 2])).toEqual([
      "CaseContact",
      "get",
      {
        chain: {
          relationship: [
            "Relationship",
            "create",
            {
              values: {
                case_id: "$case_id",
                relationship_type_id: "9",
                start_date: "now",
                contact_id_a: "$contact_id",
                contact_id_b: 7,
              },
            },
          ],
        },
        where: [["case_id", "IN", [1, 2]]],
      },
    ]);
    expect(batch.runMsg).toBe("Adding roles...");
    expect(batch.successTitle).toBe("Saved");
    const rows = [
      { case_id: 1, relationship: [{ id: 3 }, { id: 4 }] },
      { case_id: 2, relationship: [{ id: 5, duplicate_id: 5 }] },
    ];
    expect(batch.summary?.({ fetched: 2, matched: 2, rows })).toBe(
      "2 case roles added. 1 case role already occupied by the selected contact.",
    );
    expect(batch.summary?.({ fetched: 1, matched: 1, rows: [rows[0] ?? {}] })).toBe(
      "2 case roles added.",
    );
  });
});
