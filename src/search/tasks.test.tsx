import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, type Mock } from "vitest";
import { events } from "../test/jquery";
import { apiError, listParam, mockApi, renderWithQuery } from "../test/render";
import { onCiviScreen } from "../test/notifications";
import { AfreactSearch } from "./AfreactSearch";
import type { SearchTask } from "./searchTasks";
import type { DisplaySettings, Row } from "./types";

const row = (key: number, extra: Partial<Row> = {}): Row => ({
  key,
  columns: [{ val: `Name ${String(key)}` }],
  ...extra,
});

const entityInfo = {
  name: "Contact",
  title: "Contact",
  title_plural: "Contacts",
  primary_key: ["id"],
};

// The tasks as GetSearchTasks declares them on master.
const enable: SearchTask = {
  name: "enable",
  title: "Enable Contacts",
  icon: "fa-toggle-on",
  number: "> 0",
  apiBatch: {
    action: "update",
    params: { values: { is_active: true }, where: [["is_active", "=", false]] },
    runMsg: "Enabling %1 %2...",
    successMsg: "Successfully enabled %1 %2.",
    errorMsg: "An error occurred while attempting to enable %1 %2.",
  },
};
const remove: SearchTask = {
  name: "delete",
  title: "Delete Contacts",
  icon: "fa-trash",
  number: "> 0",
  apiBatch: {
    action: "delete",
    params: null,
    confirmMsg: "Are you sure you want to delete %1 %2?",
    runMsg: "Deleting %1 %2...",
    successMsg: "Successfully deleted %1 %2.",
    errorMsg: "An error occurred while attempting to delete %1 %2.",
  },
};
const merge: SearchTask = {
  name: "contact.merge",
  title: "Dedupe - Merge 2 Contacts",
  icon: "fa-compress",
  number: "=== 2",
  crmPopup: {
    path: "'civicrm/contact/merge'",
    query: "{reset: 1, cid: ids[0], oid: ids[1], action: 'update'}",
  },
};
const download: SearchTask = {
  name: "download",
  title: "Download Spreadsheet",
  icon: "fa-download",
  number: ">= 0",
  uiDialog: { templateUrl: "~/crmSearchTasks/crmSearchTaskDownload.html" },
};
const update: SearchTask = {
  name: "update",
  title: "Update Contacts",
  icon: "fa-pencil",
  number: "> 0",
  uiDialog: { templateUrl: "~/crmSearchTasks/crmSearchTaskUpdate.html" },
};
const tag: SearchTask = {
  name: "tag",
  title: "Tag - Add/Remove Tags",
  icon: "fa-tags",
  number: "> 0",
  uiDialog: { templateUrl: "~/crmSearchTasks/crmSearchTaskTag.html" },
};
const relationship: SearchTask = {
  name: "contact.relationship",
  title: "Add Relationship",
  icon: "fa-handshake-o",
  number: "> 0",
  uiDialog: { templateUrl: "~/crmSearchTasks/crmSearchTaskRelationship.html" },
  values: [],
  relationshipTypes: [
    { id: "4_a_b", text: "Employee of", description: null, contact_type: "Organization" },
    { id: "4_b_a", text: "Employer of", description: null, contact_type: "Individual" },
    {
      id: "9_a_b",
      text: "Parent of",
      description: "A guardian",
      contact_type: "Individual",
      contact_sub_type: "Student",
    },
  ],
};
const mailing: SearchTask = {
  name: "contact.mailing",
  title: "Email - schedule/send via CiviMail",
  icon: "fa-paper-plane",
  number: "> 0",
  uiDialog: { templateUrl: "~/crmSearchTasks/crmSearchTaskMailing.html" },
};
const openCase: SearchTask = {
  name: "contact.addCase",
  title: "Case - Open New Case",
  icon: "fa-folder-plus",
  number: "> 0",
  uiDialog: { templateUrl: "~/civiCaseTasks/civiCaseTaskOpenCase.html" },
  values: [],
  allowMultipleClients: true,
};
const addGrant: SearchTask = {
  name: "contact.addGrant",
  title: "Grant - Add New Grant",
  icon: "fa-money",
  number: "> 0",
  uiDialog: { templateUrl: "~/civiGrantTasks/civiGrantTaskAddGrant.html" },
  values: [],
};
const tagMerge: SearchTask = {
  name: "merge_tags",
  title: "Merge Tags",
  icon: "fa-compress",
  number: ">= 2",
  uiDialog: { templateUrl: "~/crmSearchTasks/crmSearchTaskTagMerge.html" },
};
const addTranslation: SearchTask = {
  name: "add_translation",
  title: "Add Translation",
  icon: "fa-language",
  number: "=== 1",
  uiDialog: { templateUrl: "~/crmMsgadmTasks/AddTranslation.html" },
};
const caseRole: SearchTask = {
  name: "case.addRole",
  title: "Case - Assign Role",
  icon: "fa-user-plus",
  number: "> 0",
  uiDialog: { templateUrl: "~/civiCaseTasks/civiCaseTaskCaseRole.html" },
  values: [],
  relationshipTypes: [
    { id: "4_a_b", text: "Case Coordinator is", description: null, contact_type: "Individual" },
    {
      id: "9_b_a",
      text: "Benefits Specialist is",
      description: "Handles claims",
      contact_type: "Individual",
      contact_sub_type: "Staff",
    },
  ],
};
const foreign: SearchTask = {
  name: "contact.foreign",
  title: "Foreign dialog",
  icon: "fa-puzzle-piece",
  number: "> 0",
  uiDialog: { templateUrl: "~/myext/myDialog.html" },
};
const label: SearchTask = {
  name: "contact.label",
  title: "Mailing labels - print",
  number: "> 0",
  redirect: {
    path: "'civicrm/task/print-labels'",
    query: "{reset: 1}",
    data: "{id: ids.join(',')}",
  },
};

type Handler = (params: Record<string, unknown>) => unknown;

interface Setup {
  rows?: Row[];
  count?: number;
  tasks?: SearchTask[];
  handlers?: Record<string, Handler>;
}

/** A display of `rows` whose count is `count`, with `tasks` on offer. */
function serve({ rows = [row(1), row(2), row(3)], count = rows.length, tasks, handlers }: Setup) {
  return mockApi({
    "SearchDisplay.run": (params) => {
      if (params.return === "row_count") return Object.assign([], { count });
      if (params.return === "id") return Array.from({ length: count }, (_, index) => index + 1);
      const page = Number(String(params.return).replace("page:", ""));
      const limit = Number(params.limit) || rows.length;
      return rows.slice((page - 1) * limit, page * limit);
    },
    "SearchDisplay.getSearchTasks": () =>
      Object.assign(tasks ?? [enable, remove, merge], { editable: { entityInfo } }),
    ...handlers,
  });
}

const counted = (count: number) => Object.assign([], { countFetched: count });

const columns = [{ type: "field" as const, key: "display_name", label: "Name" }];
// A links column as configured; the run type leaves the configured links out.
const linksColumn = (links: unknown[]) =>
  Object.assign({ type: "links" as const, label: "Links" }, { links });
const settings: DisplaySettings = { columns, actions: true, headerCount: true };

type Calls = { call: string; params: Record<string, unknown> }[];

const named = (calls: Calls, call: string) => calls.filter((entry) => entry.call === call);
const pageRuns = (calls: Calls) =>
  calls.filter(({ call, params }) => call === "SearchDisplay.run" && params.return === "page:1");

const checkbox = (name: string) => screen.getByRole("checkbox", { name: `Select ${name}` });
const selectAll = () => screen.getByRole("checkbox", { name: "Select all" });
const actionButton = () => screen.getByRole("button", { name: /Action/ });
// The display's last live region announces selections and task results.
const status = () => screen.getAllByRole("status").at(-1);

async function openActions() {
  await userEvent.click(actionButton());
  await screen.findByRole("menuitem", { name: /Enable Contacts/, hidden: true });
}

async function selectRows(...names: string[]) {
  for (const name of names) await userEvent.click(checkbox(name));
}

describe("AfreactSearch bulk actions", () => {
  // deviation:row-checkbox-label
  // deviation:select-all-checkbox-role
  // deviation:selection-count-announced
  it("labels row checkboxes and selects this page or none from the select-all control", async () => {
    serve({});
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
    await screen.findByText("Name 1");
    expect(checkbox("Name 1")).toHaveClass("crm-search-ctrl-select-row");
    expect(selectAll()).toHaveAttribute("aria-checked", "false");

    await userEvent.click(checkbox("Name 2"));
    expect(selectAll()).toHaveAttribute("aria-checked", "mixed");
    expect(screen.getAllByText("1 selected of 3 results")).toHaveLength(2);
    expect(status()).toHaveTextContent("1 selected of 3 results");

    await userEvent.click(selectAll());
    expect(selectAll()).toHaveAttribute("aria-checked", "false");
    // One page holds every row, so select-all takes the page without asking the server.
    await userEvent.click(selectAll());
    expect(selectAll()).toHaveAttribute("aria-checked", "true");
    for (const box of screen.getAllByRole("checkbox", { name: /^Select Name/ }))
      expect(box).toBeChecked();
    expect(status()).toHaveTextContent("3 selected of 3 results");

    await userEvent.click(
      screen.getByRole("button", { name: "Select All rows or this pages rows" }),
    );
    const group = selectAll().closest<HTMLElement>(".btn-group");
    if (!group) throw new Error("The select-all control has no group.");
    expect(
      within(group)
        .getAllByRole("menuitem", { hidden: true })
        .map((item) => item.textContent?.trim()),
    ).toEqual(["All", "None"]);
    await userEvent.click(screen.getByRole("menuitem", { name: "None", hidden: true }));
    expect(selectAll()).toHaveAttribute("aria-checked", "false");
  });

  it("selects every page through the server, keeps the selection across pages and drops it with new filters", async () => {
    const rows = [row(1), row(2), row(3), row(4), row(5)];
    const calls = serve({ rows });
    const view = (filters: Record<string, unknown>) => (
      <AfreactSearch
        search="S"
        display="D"
        settings={{ ...settings, limit: 2, pager: { show_count: true } }}
        filters={filters}
      />
    );
    const { rerender } = renderWithQuery(view({}));
    await screen.findByText("Name 1");

    await userEvent.click(selectAll());
    await waitFor(() => {
      expect(selectAll()).toHaveAttribute("aria-checked", "true");
    });
    const all = named(calls, "SearchDisplay.run").find(({ params }) => params.return === "id");
    expect(all?.params).toMatchObject({ savedSearch: "S", display: "D", limit: 2, sort: [] });
    // The header, the pager and the live region.
    expect(screen.getAllByText("5 selected of 5 results")).toHaveLength(3);

    await userEvent.click(
      screen.getByRole("button", { name: "Select All rows or this pages rows" }),
    );
    await userEvent.click(screen.getByRole("menuitem", { name: "This Page", hidden: true }));
    expect(selectAll()).toHaveAttribute("aria-checked", "mixed");
    await userEvent.click(await screen.findByRole("link", { name: "Next" }));
    await screen.findByText("Name 3");
    expect(checkbox("Name 3")).not.toBeChecked();
    await userEvent.click(checkbox("Name 3"));
    await userEvent.click(screen.getByRole("link", { name: "Previous" }));
    await screen.findByText("Name 1");
    expect(checkbox("Name 1")).toBeChecked();
    expect(screen.getAllByText("3 selected of 5 results")).toHaveLength(3);
    expect(status()).toHaveTextContent("3 selected of 5 results");

    rerender(view({ display_name: "Name" }));
    await screen.findByText("Name 1");
    expect(checkbox("Name 1")).not.toBeChecked();
    expect(selectAll()).toHaveAttribute("aria-checked", "false");

    await userEvent.click(
      screen.getByRole("button", { name: "Select All rows or this pages rows" }),
    );
    await userEvent.click(screen.getByRole("menuitem", { name: "All", hidden: true }));
    await waitFor(() => {
      expect(selectAll()).toHaveAttribute("aria-checked", "true");
    });
    expect(named(calls, "SearchDisplay.run").at(-1)?.params).toMatchObject({
      filters: { display_name: "Name" },
      return: "id",
    });
  });

  it("keeps the selection new filters cleared when the old filters come back", async () => {
    serve({});
    const view = (filters: Record<string, unknown>) => (
      <AfreactSearch search="S" display="D" settings={settings} filters={filters} />
    );
    const { rerender } = renderWithQuery(view({}));
    await screen.findByText("Name 1");
    await selectRows("Name 1");
    rerender(view({ display_name: "Name" }));
    await screen.findByText("Name 1");
    rerender(view({}));
    await screen.findByText("Name 1");
    expect(checkbox("Name 1")).not.toBeChecked();
    expect(selectAll()).toHaveAttribute("aria-checked", "false");
  });

  // deviation:select-all-latest-choice
  it("drops the ids of a select-all that a later None overtook", async () => {
    let answer: (ids: number[]) => void = () => undefined;
    serve({
      rows: [row(1), row(2), row(3)],
      count: 3,
      handlers: {
        "SearchDisplay.run": (params) => {
          if (params.return === "row_count") return Object.assign([], { count: 3 });
          if (params.return === "id")
            return new Promise<number[]>((resolve) => {
              answer = resolve;
            });
          return [row(1), row(2)];
        },
      },
    });
    renderWithQuery(
      <AfreactSearch search="S" display="D" settings={{ ...settings, limit: 2, pager: {} }} />,
    );
    await screen.findByText("Name 1");
    await userEvent.click(selectAll());
    await userEvent.click(
      screen.getByRole("button", { name: "Select All rows or this pages rows" }),
    );
    await userEvent.click(screen.getByRole("menuitem", { name: "None", hidden: true }));
    answer([1, 2, 3]);
    await waitFor(() => {
      expect(selectAll()).toBeEnabled();
    });
    expect(selectAll()).toHaveAttribute("aria-checked", "false");
    expect(checkbox("Name 1")).not.toBeChecked();
  });

  it("waits for the latest select-all and drops a voided one's failure", async () => {
    const answers: { resolve: (ids: number[]) => void; reject: (error: Error) => void }[] = [];
    serve({
      handlers: {
        "SearchDisplay.run": (params) => {
          if (params.return === "row_count") return Object.assign([], { count: 3 });
          if (params.return === "id")
            return new Promise<number[]>((resolve, reject) => {
              answers.push({ resolve, reject });
            });
          return [row(1), row(2)];
        },
      },
    });
    renderWithQuery(
      <AfreactSearch search="S" display="D" settings={{ ...settings, limit: 2, pager: {} }} />,
    );
    await screen.findByText("Name 1");
    const menu = async (item: string) => {
      await userEvent.click(
        screen.getByRole("button", { name: "Select All rows or this pages rows" }),
      );
      await userEvent.click(screen.getByRole("menuitem", { name: item, hidden: true }));
    };
    await menu("All");
    await menu("None");
    await menu("All");
    answers[0]?.reject(apiError("Timed out"));
    await waitFor(() => {
      expect(answers).toHaveLength(2);
    });
    expect(checkbox("Name 1")).toBeDisabled();
    expect(screen.queryByRole("alert")).toBeNull();
    answers[1]?.resolve([1, 2, 3]);
    await waitFor(() => {
      expect(selectAll()).toHaveAttribute("aria-checked", "true");
    });
    expect(checkbox("Name 1")).toBeEnabled();
  });

  it("selects the rows between two with Shift", async () => {
    serve({ rows: [row(1), row(2), row(3), row(4)] });
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
    await screen.findByText("Name 1");
    await userEvent.click(checkbox("Name 1"));
    const user = userEvent.setup();
    await user.keyboard("{Shift>}");
    await user.click(checkbox("Name 4"));
    await user.keyboard("{/Shift}");
    expect(selectAll()).toHaveAttribute("aria-checked", "true");
  });

  it("loads the tasks on the first selection and gates them by the selected number", async () => {
    const calls = serve({});
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
    await screen.findByText("Name 1");
    expect(named(calls, "SearchDisplay.getSearchTasks")).toHaveLength(0);
    expect(actionButton()).toHaveAttribute("title", "Perform action on selected items.");

    await userEvent.click(checkbox("Name 1"));
    await waitFor(() => {
      expect(named(calls, "SearchDisplay.getSearchTasks")).toHaveLength(1);
    });
    expect(named(calls, "SearchDisplay.getSearchTasks")[0]?.params).toEqual({
      savedSearch: "S",
      display: "D",
    });
    await openActions();
    const item = (name: RegExp) => screen.getByRole("menuitem", { name, hidden: true });
    expect(item(/Merge/)).toHaveAttribute("aria-disabled", "true");
    expect(item(/Merge/)).toHaveAttribute("title", "Selected number must be  2");
    expect(item(/Merge/).closest("li")).toHaveClass("disabled");
    expect(item(/Enable/)).not.toHaveAttribute("aria-disabled");
    expect(item(/Enable/)).toHaveAttribute("title", "Perform action on 1 Contact");
    await userEvent.click(item(/Merge/));
    expect(window.CRM.loadForm).not.toHaveBeenCalled();

    await userEvent.click(checkbox("Name 2"));
    await openActions();
    expect(item(/Merge/)).not.toHaveAttribute("aria-disabled");
    expect(item(/Enable/)).toHaveAttribute("title", "Perform action on 2 Contacts");
  });

  it("confirms a delete, runs it on the selected ids, then reloads and clears the selection", async () => {
    const calls = serve({ handlers: { "Contact.delete": () => counted(2) } });
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
    await screen.findByText("Name 1");
    await selectRows("Name 1", "Name 3");
    await openActions();
    await userEvent.click(screen.getByRole("menuitem", { name: /Delete Contacts/, hidden: true }));

    const dialog = screen.getByRole("dialog", { name: "Delete Contacts" });
    expect(dialog).toHaveTextContent("Are you sure you want to delete 2 Contacts?");
    expect(named(calls, "Contact.delete")).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete Contacts" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(named(calls, "Contact.delete").map(({ params }) => params)).toEqual([
      { where: [["id", "IN", [1, 3]]] },
    ]);
    expect(window.CRM.alert).toHaveBeenCalledWith(
      "Successfully deleted 2 Contacts.",
      "Delete Contacts Complete",
      "success",
    );
    expect(status()).toHaveTextContent("Successfully deleted 2 Contacts.");
    await waitFor(() => {
      expect(pageRuns(calls)).toHaveLength(2);
    });
    expect(checkbox("Name 1")).not.toBeChecked();
    expect(selectAll()).toHaveAttribute("aria-checked", "false");
    expect(actionButton()).toHaveFocus();
  });

  // deviation:delete-task-always-asks
  it("asks before a delete whose task carries no question", async () => {
    const quiet = { ...remove, apiBatch: { action: "delete", confirmMsg: "" } };
    const calls = serve({ tasks: [enable, quiet] });
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
    await screen.findByText("Name 1");
    await selectRows("Name 1");
    await openActions();
    await userEvent.click(screen.getByRole("menuitem", { name: /Delete Contacts/, hidden: true }));
    expect(screen.getByRole("dialog", { name: "Delete Contacts" })).toHaveTextContent(
      "Are you sure you want to delete 1 Contact?",
    );
    expect(named(calls, "Contact.delete")).toHaveLength(0);
  });

  // deviation:bulk-confirm-native-dialog
  it("leaves data, rows and selection alone when the confirmation is cancelled", async () => {
    const calls = serve({});
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
    await screen.findByText("Name 1");
    await selectRows("Name 2");
    await openActions();
    await userEvent.click(screen.getByRole("menuitem", { name: /Delete Contacts/, hidden: true }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(actionButton());
    await userEvent.click(screen.getByRole("menuitem", { name: /Delete Contacts/, hidden: true }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(pageRuns(calls)).toHaveLength(1);
    expect(checkbox("Name 2")).toBeChecked();
    expect(actionButton()).toHaveFocus();
  });

  it("runs a task without confirmation at once, in batches of 500 ids", async () => {
    const calls = serve({
      rows: [row(1), row(2)],
      count: 1001,
      handlers: {
        "Contact.update": (params) => {
          return counted(listParam(listParam(listParam(params.where)[1])[2]).length);
        },
      },
    });
    renderWithQuery(
      <AfreactSearch search="S" display="D" settings={{ ...settings, limit: 2, pager: {} }} />,
    );
    await screen.findByText("Name 1");
    await userEvent.click(selectAll());
    await waitFor(() => {
      expect(screen.getAllByText("1001 selected of 1001 results")).toHaveLength(2);
    });
    await openActions();
    await userEvent.click(screen.getByRole("menuitem", { name: /Enable Contacts/, hidden: true }));

    await waitFor(() => {
      expect(window.CRM.alert).toHaveBeenCalledWith(
        "Successfully enabled 1001 Contacts.",
        "Enable Contacts Complete",
        "success",
      );
    });
    const batches = named(calls, "Contact.update").map(({ params }) => params);
    expect(batches.map((params) => listParam(listParam(params.where)[1])[2])).toEqual([
      Array.from({ length: 500 }, (_, index) => index + 1),
      Array.from({ length: 500 }, (_, index) => index + 501),
      [1001],
    ]);
    expect(batches[0]).toMatchObject({
      values: { is_active: true },
      where: [
        ["is_active", "=", false],
        ["id", "IN", expect.any(Array)],
      ],
    });
    expect(selectAll()).toHaveAttribute("aria-checked", "false");
  });

  // deviation:task-fields-inplace-inputs
  it("asks for a task's input fields, started as core does, and saves them with every id", async () => {
    const credit: SearchTask = {
      name: "add_soft_credit",
      title: "Add Soft Credits",
      number: "> 0",
      apiBatch: {
        entity: "ContributionSoft",
        action: "save",
        runMsg: "Adding soft credits...",
        idField: "contribution_id",
        // The task's own values go along with the entered ones.
        params: { values: { is_current: true } },
        fields: [
          {
            name: "amount",
            label: "Amount",
            input_type: "Number",
            data_type: "Float",
            required: true,
          },
          {
            name: "contact_id",
            label: "Contact",
            input_type: "EntityRef",
            data_type: "Integer",
            fk_entity: "Contact",
            required: true,
          },
          {
            name: "soft_credit_type_id",
            label: "Soft Credit Type",
            input_type: "Select",
            data_type: "Integer",
            default_value: 2,
            options: [
              { id: 1, label: "In Honor of" },
              { id: 2, label: "In Memory of" },
            ],
          },
        ],
      },
    };
    const calls = serve({
      tasks: [enable, credit],
      handlers: {
        "ContributionSoft.save": (params) => counted(listParam(params.records).length),
        "Contact.autocomplete": () => Object.assign([{ id: 5, label: "Bob" }], { countMatched: 1 }),
      },
    });
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
    await screen.findByText("Name 1");
    await selectRows("Name 1", "Name 3");
    await openActions();
    await userEvent.click(screen.getByRole("menuitem", { name: /Add Soft Credits/, hidden: true }));
    const dialog = await screen.findByRole("dialog", { name: "Add Soft Credits" });
    // Nothing runs until the fields are confirmed.
    expect(named(calls, "ContributionSoft.save")).toHaveLength(0);
    const type = within(dialog).getByRole("combobox", { name: "Soft Credit Type" });
    expect(type).toHaveValue("2");
    const amount = within(dialog).getByRole("spinbutton", { name: "Amount" });
    expect(amount).toBeRequired();
    await userEvent.click(within(dialog).getByRole("button", { name: "Add Soft Credits" }));
    expect(dialog).toBeInTheDocument();
    await userEvent.type(amount, "12.5");
    await userEvent.selectOptions(type, "1");
    // A contact reference searches the field's own autocomplete, as crm-autocomplete does.
    const contact = within(dialog).getByRole("combobox", { name: "Contact" });
    await userEvent.type(contact, "Bo");
    await userEvent.click(await screen.findByRole("option", { name: "Bob" }));
    expect(named(calls, "Contact.autocomplete")[0]?.params).toMatchObject({
      input: "Bo",
      fieldName: "ContributionSoft.contact_id",
    });
    await userEvent.click(within(dialog).getByRole("button", { name: "Add Soft Credits" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(named(calls, "ContributionSoft.save")[0]?.params).toEqual({
      records: [
        {
          amount: 12.5,
          contact_id: 5,
          soft_credit_type_id: 1,
          contribution_id: 1,
          is_current: true,
        },
        {
          amount: 12.5,
          contact_id: 5,
          soft_credit_type_id: 1,
          contribution_id: 3,
          is_current: true,
        },
      ],
    });
    expect(checkbox("Name 1")).not.toBeChecked();
  });

  // deviation:bulk-failed-batch-reloads
  it("shows the progress of a run and the error of a failed batch, then reloads what changed", async () => {
    let finish: (value: unknown) => void = () => undefined;
    let call = 0;
    const calls = serve({
      rows: [row(1), row(2)],
      count: 600,
      handlers: {
        "Contact.update": () => {
          call += 1;
          if (call === 1)
            return new Promise((resolve) => {
              finish = resolve;
            });
          throw apiError("DB Error: deadlock");
        },
      },
    });
    renderWithQuery(
      <AfreactSearch search="S" display="D" settings={{ ...settings, limit: 2, pager: {} }} />,
    );
    await screen.findByText("Name 1");
    await userEvent.click(selectAll());
    await waitFor(() => {
      expect(selectAll()).toHaveAttribute("aria-checked", "true");
    });
    await openActions();
    await userEvent.click(screen.getByRole("menuitem", { name: /Enable Contacts/, hidden: true }));

    const dialog = await screen.findByRole("dialog", { name: "Enable Contacts" });
    expect(
      within(dialog).getByRole("heading", { name: "Enabling 600 Contacts..." }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("progressbar", { name: "Enable Contacts" })).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    expect(dialog).toHaveTextContent("Processing records 1 - 500");
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(dialog).toHaveAttribute("open");

    finish(counted(500));
    await waitFor(() => {
      expect(window.CRM.alert).toHaveBeenCalledWith(
        "An error occurred while attempting to enable 600 Contacts. DB Error: deadlock",
        "Error",
        "error",
      );
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(status()).toHaveTextContent("DB Error: deadlock");
    // The first batch changed rows, so the table reloads although core leaves it as it was.
    await waitFor(() => {
      expect(pageRuns(calls)).toHaveLength(2);
    });
    expect(selectAll()).toHaveAttribute("aria-checked", "false");
  });

  // deviation:bulk-progress-per-batch
  it("moves the progress bar once per finished batch", async () => {
    const pending: ((value: unknown) => void)[] = [];
    serve({
      rows: [row(1), row(2)],
      count: 600,
      handlers: {
        "Contact.update": () =>
          new Promise((resolve) => {
            pending.push(resolve);
          }),
      },
    });
    renderWithQuery(
      <AfreactSearch search="S" display="D" settings={{ ...settings, limit: 2, pager: {} }} />,
    );
    await screen.findByText("Name 1");
    await userEvent.click(selectAll());
    await waitFor(() => {
      expect(selectAll()).toHaveAttribute("aria-checked", "true");
    });
    await openActions();
    await userEvent.click(screen.getByRole("menuitem", { name: /Enable Contacts/, hidden: true }));
    const dialog = await screen.findByRole("dialog", { name: "Enable Contacts" });
    const bar = within(dialog).getByRole("progressbar", { name: "Enable Contacts" });
    await waitFor(() => {
      expect(pending).toHaveLength(1);
    });
    expect(bar).toHaveAttribute("aria-valuenow", "0");
    pending[0]?.(counted(500));
    await waitFor(() => {
      expect(bar).toHaveAttribute("aria-valuenow", "50");
    });
    expect(dialog).toHaveTextContent("Processing records 501 - 600");
    pending[1]?.(counted(100));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  // deviation:bulk-error-both-messages
  it("fails a batch whose answer lacks the fetched count instead of reporting zero", async () => {
    serve({ handlers: { "Contact.update": () => [] } });
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
    await screen.findByText("Name 1");
    await selectRows("Name 1");
    await openActions();
    await userEvent.click(screen.getByRole("menuitem", { name: /Enable Contacts/, hidden: true }));
    await waitFor(() => {
      expect(window.CRM.alert).toHaveBeenCalledWith(
        "An error occurred while attempting to enable 1 Contact. Contact.update answered without countFetched.",
        "Error",
        "error",
      );
    });
  });

  it("fails a batch whose answer records failed items, naming each message once", async () => {
    const failed = (message: string) => ({ level: "error", message, title: "", code: 0 });
    serve({
      handlers: {
        "Contact.update": () =>
          Object.assign([], {
            countFetched: 1,
            is_blocking_error: true,
            errors: [failed("Not permitted"), failed("Locked"), failed("Not permitted")],
          }),
      },
    });
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
    await screen.findByText("Name 1");
    await selectRows("Name 1", "Name 2", "Name 3");
    await openActions();
    await userEvent.click(screen.getByRole("menuitem", { name: /Enable Contacts/, hidden: true }));
    await waitFor(() => {
      expect(window.CRM.alert).toHaveBeenCalled();
    });
    expect(vi.mocked(window.CRM.alert).mock.calls).toEqual([
      [
        "An error occurred while attempting to enable 3 Contacts. Not permitted Locked",
        "Error",
        "error",
      ],
    ]);
  });

  it("opens a popup task with the selected ids and reloads when its form succeeds", async () => {
    const calls = serve({});
    const popup = new EventTarget();
    vi.mocked(window.CRM.loadForm).mockReturnValueOnce(events(popup));
    const url = vi.spyOn(window.CRM, "url");
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
    await screen.findByText("Name 1");
    await selectRows("Name 1", "Name 2");
    await openActions();
    await userEvent.click(screen.getByRole("menuitem", { name: /Merge/, hidden: true }));

    expect(url).toHaveBeenCalledWith(
      "civicrm/contact/merge",
      { reset: 1, cid: 1, oid: 2, action: "update" },
      "back",
    );
    expect(window.CRM.loadForm).toHaveBeenCalledWith("/civicrm/contact/merge", { post: undefined });
    expect(pageRuns(calls)).toHaveLength(1);
    popup.dispatchEvent(new Event("crmFormSuccess"));
    await waitFor(() => {
      expect(pageRuns(calls)).toHaveLength(2);
    });
    expect(checkbox("Name 1")).not.toBeChecked();
    url.mockRestore();
  });

  // deviation:redirect-task-query-merged
  it("opens a redirect task in a new window with its query and data", async () => {
    serve({ tasks: [label] });
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const url = vi.spyOn(window.CRM, "url");
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
    await screen.findByText("Name 1");
    await selectRows("Name 1", "Name 3");
    await userEvent.click(actionButton());
    await userEvent.click(await screen.findByRole("menuitem", { name: /labels/, hidden: true }));
    expect(url).toHaveBeenCalledWith("civicrm/task/print-labels", { reset: 1, id: "1,3" }, "back");
    expect(open).toHaveBeenCalledWith("/civicrm/task/print-labels", "_blank");
    open.mockRestore();
    url.mockRestore();
  });

  it("names the tasks it cannot run and keeps them in the menu, disabled", async () => {
    const calls = serve({ tasks: [enable, foreign] });
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
    await screen.findByText("Name 1");
    await selectRows("Name 1");
    expect(
      await screen.findByText(
        "Not supported by the React renderer: task contact.foreign " +
          "(Angular dialog ~/myext/myDialog.html)",
      ),
    ).toHaveAttribute("role", "note");
    await openActions();
    const item = screen.getByRole("menuitem", { name: /Foreign dialog/, hidden: true });
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(item).toHaveAttribute(
      "title",
      "Not supported by the React renderer: task contact.foreign",
    );
    await userEvent.click(item);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(calls.map(({ call }) => call)).not.toContain("Contact.update");
  });

  it("names only the tasks a display offers among those it cannot run", async () => {
    serve({ tasks: [enable, tag] });
    renderWithQuery(
      <AfreactSearch search="S" display="D" settings={{ ...settings, actions: ["enable"] }} />,
    );
    await screen.findByText("Name 1");
    await selectRows("Name 1");
    await openActions();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  // deviation:bulk-task-list-error
  it("shows the error of a failed task list instead of an empty menu", async () => {
    mockApi({
      "SearchDisplay.run": () => [row(1)],
      "SearchDisplay.getSearchTasks": () => {
        throw apiError("Permission denied");
      },
    });
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
    await screen.findByText("Name 1");
    await selectRows("Name 1");
    expect(await screen.findByRole("alert")).toHaveTextContent("Permission denied");
  });

  // deviation:bulk-select-all-error
  it("shows the error of a failed select-all and lets the rows be selected again", async () => {
    mockApi({
      "SearchDisplay.run": (params) => {
        if (params.return === "id") throw apiError("Timed out");
        if (params.return === "row_count") return Object.assign([], { count: 9 });
        return [row(1), row(2)];
      },
    });
    renderWithQuery(
      <AfreactSearch search="S" display="D" settings={{ ...settings, limit: 2, pager: {} }} />,
    );
    await screen.findByText("Name 1");
    await userEvent.click(selectAll());
    expect(await screen.findByRole("alert")).toHaveTextContent("Timed out");
    expect(selectAll()).toBeEnabled();
    expect(checkbox("Name 1")).toBeEnabled();
    expect(selectAll()).toHaveAttribute("aria-checked", "false");
  });

  it("shows the tasks as buttons, loaded with the display", async () => {
    const calls = serve({ tasks: [enable, merge] });
    renderWithQuery(
      <AfreactSearch
        search="S"
        display="D"
        settings={{ ...settings, actions_display_mode: "buttons" }}
      />,
    );
    const button = await screen.findByRole("button", { name: /Enable Contacts/ });
    expect(named(calls, "SearchDisplay.getSearchTasks")).toHaveLength(1);
    expect(button).toHaveClass("btn btn-default crm-search-task-button disabled");
    expect(button).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(button);
    expect(named(calls, "Contact.update")).toHaveLength(0);
    await selectRows("Name 2");
    expect(button).not.toHaveAttribute("aria-disabled");
    expect(screen.getByRole("button", { name: /Merge/ })).toHaveAttribute(
      "title",
      "Selected number must be  2",
    );
  });

  // deviation:row-link-reloads-table
  it("runs a row's update link through inlineEdit and confirms with a status", async () => {
    const links = [{ task: "enable", text: "Enable", icon: "fa-toggle-on" }];
    const calls = serve({
      rows: [row(1), row(2, { columns: [{ val: "Name 2" }, { links }] })],
      handlers: { "SearchDisplay.inlineEdit": () => counted(1) },
    });
    const withLinks: DisplaySettings = {
      columns: [...columns, linksColumn(links)],
    };
    renderWithQuery(<AfreactSearch search="S" display="D" settings={withLinks} />);
    const link = await screen.findByRole("button", { name: "Enable" });
    // Rows that link to a task load the tasks with the rows.
    await waitFor(() => {
      expect(named(calls, "SearchDisplay.getSearchTasks")).toHaveLength(1);
    });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    link.focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => {
      expect(window.CRM.status).toHaveBeenCalledWith("Saved");
    });
    expect(named(calls, "SearchDisplay.inlineEdit")[0]?.params).toMatchObject({
      savedSearch: "S",
      display: "D",
      values: { is_active: true },
      rowKey: 2,
      return: null,
    });
    expect(named(calls, "SearchDisplay.inlineEdit")[0]?.params).not.toHaveProperty("where");
    await waitFor(() => {
      expect(pageRuns(calls)).toHaveLength(2);
    });
  });

  it("alerts for a row link to a task React cannot run", async () => {
    const links = [{ task: "contact.foreign", text: "Case" }];
    serve({ rows: [row(1, { columns: [{ val: "Name 1" }, { links }] })], tasks: [foreign] });
    renderWithQuery(
      <AfreactSearch
        search="S"
        display="D"
        settings={{ columns: [...columns, linksColumn(links)] }}
      />,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Case" }));
    await waitFor(() => {
      expect(window.CRM.alert).toHaveBeenCalledWith(
        "Not supported by the React renderer: task contact.foreign " +
          "(Angular dialog ~/myext/myDialog.html)",
        "Error",
        "error",
      );
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // deviation:row-link-task-not-offered
  it("alerts for a row link to a task the server does not offer", async () => {
    const links = [{ task: "gone", text: "Gone" }];
    serve({ rows: [row(1, { columns: [{ val: "Name 1" }, { links }] })] });
    renderWithQuery(
      <AfreactSearch
        search="S"
        display="D"
        settings={{ columns: [...columns, linksColumn(links)] }}
      />,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Gone" }));
    await waitFor(() => {
      expect(window.CRM.alert).toHaveBeenCalledWith(
        "Not supported by the React renderer: task gone (not offered for this display)",
        "Error",
        "error",
      );
    });
  });

  it("runs a task from the keyboard: arrow into the menu, Enter, then confirm in the dialog", async () => {
    const calls = serve({ handlers: { "Contact.delete": () => counted(1) } });
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
    await screen.findByText("Name 1");
    checkbox("Name 1").focus();
    await userEvent.keyboard(" ");
    expect(checkbox("Name 1")).toBeChecked();

    actionButton().focus();
    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: /Enable Contacts/, hidden: true })).toHaveFocus();
    });
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog", { name: "Delete Contacts" });
    within(dialog).getByRole("button", { name: "Delete Contacts" }).focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => {
      expect(named(calls, "Contact.delete")).toHaveLength(1);
    });
    await waitFor(() => {
      expect(actionButton()).toHaveFocus();
    });

    selectAll().focus();
    await userEvent.keyboard(" ");
    expect(selectAll()).toHaveAttribute("aria-checked", "true");
  });

  // deviation:row-menu-task-focus
  it("returns the focus to a row menu's button after its task's dialog", async () => {
    const links = [{ task: "delete", text: "Delete" }];
    serve({
      rows: [row(1, { columns: [{ val: "Name 1" }, { links }] })],
      handlers: { "Contact.delete": () => counted(1) },
    });
    const menuColumn = Object.assign({ type: "menu" as const, label: "Menu" }, { links });
    renderWithQuery(
      <AfreactSearch search="S" display="D" settings={{ columns: [...columns, menuColumn] }} />,
    );
    const toggle = await screen.findByRole("button", { name: "Row Actions" });
    toggle.focus();
    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: "Delete", hidden: true })).toHaveFocus();
    });
    await userEvent.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog", { name: "Delete Contacts" });
    within(dialog).getByRole("button", { name: "Delete Contacts" }).focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Row Actions" })).toHaveFocus();
    });
  });

  describe("download", () => {
    /** The URL and the `params` field of the download request. */
    function sentDownload(fetchMock: Mock<typeof fetch>) {
      const [url, init] = fetchMock.mock.calls[0] ?? [];
      const body = init?.body;
      if (!(body instanceof URLSearchParams)) throw new Error("No form body was sent.");
      return { url, params: JSON.parse(body.get("params") ?? "") as unknown };
    }

    function stubDownload(response: Response) {
      const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(response));
      vi.stubGlobal("fetch", fetchMock);
      const link = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      vi.stubGlobal(
        "URL",
        Object.assign(URL, { createObjectURL: () => "blob:1", revokeObjectURL: () => {} }),
      );
      return { fetchMock, link };
    }

    it("downloads the selected rows in the chosen format and names the file from the answer", async () => {
      const { fetchMock, link } = stubDownload(
        new Response("x", {
          headers: { "Content-Disposition": 'attachment; filename="Contacts.xlsx"' },
        }),
      );
      serve({ tasks: [enable, download] });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      await screen.findByText("Name 1");
      await selectRows("Name 1", "Name 2");
      await openActions();
      await userEvent.click(screen.getByRole("menuitem", { name: /Download/, hidden: true }));
      const dialog = await screen.findByRole("dialog", { name: "Download Spreadsheet" });
      expect(dialog).toHaveTextContent("Download 2 Contacts");
      await userEvent.selectOptions(within(dialog).getByLabelText("Format"), "xlsx");
      await userEvent.click(within(dialog).getByRole("button", { name: "Download" }));
      await waitFor(() => {
        expect(window.CRM.alert).toHaveBeenCalledWith(
          "Contacts.xlsx has been downloaded to your computer.",
          "Download Complete",
          "success",
        );
      });
      const { url, params } = sentDownload(fetchMock);
      expect(url).toBe("/civicrm/ajax/api4/SearchDisplay/download");
      expect(params).toMatchObject({
        savedSearch: "S",
        display: "D",
        format: "xlsx",
        filters: { id: [1, 2] },
      });
      expect(params).not.toHaveProperty("return");
      expect(params).not.toHaveProperty("limit");
      expect(link).toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      // A download changes nothing, so the table keeps its rows and selection.
      expect(checkbox("Name 1")).toBeChecked();
    });

    it("downloads only the columns picked to show, as core's getApiParams sends them", async () => {
      const { fetchMock } = stubDownload(
        new Response("x", { headers: { "Content-Disposition": 'attachment; filename="C.csv"' } }),
      );
      serve({ tasks: [enable, download] });
      const picking: DisplaySettings = {
        ...settings,
        toggleColumns: true,
        columns: [...columns, { type: "field", key: "email", label: "Email" }],
      };
      renderWithQuery(<AfreactSearch search="S" display="D" settings={picking} />);
      await screen.findByText("Name 1");
      await userEvent.click(screen.getByRole("checkbox", { name: "Email" }));
      await selectRows("Name 1");
      await openActions();
      await userEvent.click(screen.getByRole("menuitem", { name: /Download/, hidden: true }));
      const dialog = await screen.findByRole("dialog", { name: "Download Spreadsheet" });
      await userEvent.click(within(dialog).getByRole("button", { name: "Download" }));
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalled();
      });
      expect(sentDownload(fetchMock).params).toMatchObject({ toggleColumns: [0] });
    });

    // deviation:download-failure-closes
    it("offers every row without a selection and reports a failed download", async () => {
      const { fetchMock } = stubDownload(
        new Response(JSON.stringify({ error_message: "Not permitted" }), {
          status: 403,
          statusText: "Forbidden",
        }),
      );
      serve({ tasks: [enable, download], count: 3 });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      await screen.findByText("Name 1");
      await openActions();
      await userEvent.click(screen.getByRole("menuitem", { name: /Download/, hidden: true }));
      const dialog = await screen.findByRole("dialog", { name: "Download Spreadsheet" });
      expect(dialog).toHaveTextContent("Download 3 Contacts");
      await userEvent.click(within(dialog).getByRole("button", { name: "Download" }));
      await waitFor(() => {
        expect(window.CRM.alert).toHaveBeenCalledWith("Not permitted", "Error", "error");
      });
      // An empty id filter stands for every row, as in crmSearchTaskDownload.
      expect(sentDownload(fetchMock).params).toMatchObject({ filters: { id: [] } });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(status()).toHaveTextContent("Not permitted");
    });

    // deviation:download-dialog-status
    it("keeps the dialog open while the file loads and closes it once, when done", async () => {
      let answer = (response: Response) => {
        void response;
      };
      const fetchMock = vi.fn<typeof fetch>(
        () =>
          new Promise<Response>((resolve) => {
            answer = resolve;
          }),
      );
      vi.stubGlobal("fetch", fetchMock);
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      vi.stubGlobal(
        "URL",
        Object.assign(URL, { createObjectURL: () => "blob:1", revokeObjectURL: () => {} }),
      );
      serve({ tasks: [enable, download], count: 3 });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      await screen.findByText("Name 1");
      await openActions();
      await userEvent.click(screen.getByRole("menuitem", { name: /Download/, hidden: true }));
      const dialog = await screen.findByRole("dialog", { name: "Download Spreadsheet" });
      await userEvent.click(within(dialog).getByRole("button", { name: "Download" }));
      expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
      expect(within(dialog).getByRole("heading", { name: "Download Spreadsheet" })).toHaveFocus();
      expect(within(dialog).getByRole("status")).toHaveTextContent("Downloading");
      await userEvent.keyboard("{Escape}");
      expect(dialog).toBeInTheDocument();
      answer(new Response("x"));
      await waitFor(() => {
        expect(window.CRM.alert).toHaveBeenCalledWith(
          "Contacts.csv has been downloaded to your computer.",
          "Download Complete",
          "success",
        );
      });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(status()).toHaveTextContent("Contacts.csv has been downloaded");
      expect(window.CRM.alert).toHaveBeenCalledTimes(1);
    });
  });

  describe("update", () => {
    const fields = [
      {
        name: "job_title",
        label: "Job Title",
        input_type: "Text",
        data_type: "String",
        nullable: true,
      },
      { name: "is_deceased", label: "Deceased", input_type: "CheckBox", data_type: "Boolean" },
      {
        name: "gender_id",
        label: "Gender",
        input_type: "Select",
        data_type: "Integer",
        nullable: true,
        options: [
          { id: 1, label: "Female" },
          { id: 2, label: "Male" },
        ],
      },
      {
        name: "employer_id",
        label: "Employer",
        input_type: "EntityRef",
        data_type: "Integer",
        fk_entity: "Contact",
      },
      { name: "geo", label: "Where", input_type: "Location", data_type: "String" },
      { name: "is_deleted", label: "Deleted", input_type: "CheckBox", data_type: "Boolean" },
      { name: "sort_name", label: "Sort Name", input_type: "Text", data_type: "String" },
    ];

    /** Picks a field in the "Add Value" select and confirms it with the button beside it. */
    async function addField(dialog: HTMLElement, name: string) {
      await userEvent.selectOptions(
        within(dialog).getByRole("combobox", { name: "Add Value" }),
        name,
      );
      await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    }

    // deviation:bulk-update-native-picker
    // deviation:update-clause-field-resets
    it("updates the selected rows with the chosen fields and values", async () => {
      const calls = serve({
        tasks: [enable, update],
        handlers: {
          "Contact.getFields": () => fields,
          "Contact.update": () => counted(2),
          "Contact.autocomplete": () =>
            Object.assign([{ id: 2, label: "Bob" }], { countMatched: 1 }),
        },
      });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      await screen.findByText("Name 1");
      await selectRows("Name 1", "Name 2");
      await openActions();
      await userEvent.click(
        screen.getByRole("menuitem", { name: /Update Contacts/, hidden: true }),
      );
      const dialog = await screen.findByRole("dialog", { name: "Update Contacts" });
      expect(dialog).toHaveTextContent("Update the 2 selected Contacts with the following values:");
      const save = within(dialog).getByRole("button", { name: "Update Contacts" });
      expect(save).toBeDisabled();
      const add = within(dialog).getByRole("combobox", { name: "Add Value" });
      await waitFor(() => {
        expect(add).toBeEnabled();
      });
      expect(within(add).getByRole("option", { name: "Where" })).toBeDisabled();
      expect(within(add).getByRole("option", { name: "Where" })).toHaveAttribute(
        "title",
        "Not supported by the React renderer: Location",
      );
      const addButton = within(dialog).getByRole("button", { name: "Add" });
      expect(addButton).toBeDisabled();
      await addField(dialog, "job_title");
      expect(within(dialog).getByRole("textbox", { name: "Job Title" })).toHaveFocus();
      await userEvent.type(within(dialog).getByRole("textbox", { name: "Job Title" }), "Pilot");
      await addField(dialog, "is_deceased");
      expect(within(dialog).getByRole("radio", { name: "Yes" })).toBeChecked();
      await userEvent.click(within(dialog).getByRole("radio", { name: "No" }));
      await addField(dialog, "gender_id");
      expect(within(dialog).getByRole("combobox", { name: "Gender" })).toHaveValue("1");
      // A field already chosen cannot be added twice.
      expect(within(add).getByRole("option", { name: "Job Title" })).toBeDisabled();
      // Changing a clause's field keeps the focus on its select; emptying it drops the clause.
      const fieldSelects = () => within(dialog).getAllByRole("combobox", { name: "Field" });
      await userEvent.selectOptions(add, "is_deleted");
      expect(addButton).toBeEnabled();
      await userEvent.selectOptions(fieldSelects()[0]!, "is_deleted");
      expect(fieldSelects()[0]).toHaveFocus();
      expect(fieldSelects()[0]).toHaveValue("is_deleted");
      // The pick in "Add Value" is in use now, so Add waits for another.
      expect(addButton).toBeDisabled();
      await userEvent.selectOptions(fieldSelects()[0]!, "job_title");
      await userEvent.type(within(dialog).getByRole("textbox", { name: "Job Title" }), "Pilot");
      await userEvent.selectOptions(fieldSelects()[2]!, "");
      expect(within(dialog).queryByRole("combobox", { name: "Gender" })).not.toBeInTheDocument();
      // A contact reference searches its entity, named to the server by the field.
      await addField(dialog, "employer_id");
      const employer = await within(dialog).findByRole("combobox", { name: "Employer" });
      await userEvent.type(employer, "Bo");
      await userEvent.click(await screen.findByRole("option", { name: "Bob" }));
      expect(employer).toHaveValue("Bob");
      expect(named(calls, "Contact.autocomplete").map(({ params }) => params)).toEqual([
        {
          input: "Bo",
          searchField: null,
          exclude: null,
          quickEdit: false,
          fieldName: "Contact.employer_id",
        },
      ]);
      await userEvent.click(save);
      await waitFor(() => {
        expect(window.CRM.alert).toHaveBeenCalledWith(
          "Successfully updated 2 Contacts.",
          "Saved",
          "success",
        );
      });
      expect(named(calls, "Contact.update").map(({ params }) => params)).toEqual([
        {
          values: { job_title: "Pilot", is_deceased: false, employer_id: 2 },
          where: [["id", "IN", [1, 2]]],
        },
      ]);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      // The rows changed, so the table reloads and the selection clears.
      await waitFor(() => {
        expect(pageRuns(calls)).toHaveLength(2);
      });
      expect(checkbox("Name 1")).not.toBeChecked();
    });

    // deviation:update-preset-unknown-field
    it("starts with the values a hook preset and runs a row link as a plain update", async () => {
      const links = [{ task: "update", text: "Retire" }];
      const preset: SearchTask = { ...update, values: { is_deceased: true, legacy: "x" } };
      const calls = serve({
        rows: [row(1, { columns: [{ val: "Name 1" }, { links }] })],
        tasks: [preset],
        handlers: { "Contact.getFields": () => fields, "Contact.update": () => counted(1) },
      });
      renderWithQuery(
        <AfreactSearch
          search="S"
          display="D"
          settings={{ columns: [...columns, linksColumn(links)] }}
        />,
      );
      await userEvent.click(await screen.findByRole("button", { name: "Retire" }));
      const dialog = await screen.findByRole("dialog", { name: "Update Contacts" });
      expect(dialog).toHaveTextContent("Update the 1 selected Contact with the following values:");
      expect(await within(dialog).findByRole("radio", { name: "Yes" })).toBeChecked();
      // A preset on a field getFields does not list shows by name and can be dropped.
      const legacy = within(dialog).getAllByRole("combobox", { name: "Field" })[1]!;
      expect(legacy).toHaveValue("legacy");
      await userEvent.selectOptions(legacy, "");
      await userEvent.click(within(dialog).getByRole("button", { name: "Update Contact" }));
      await waitFor(() => {
        expect(named(calls, "Contact.update")).toHaveLength(1);
      });
      expect(named(calls, "Contact.update")[0]?.params).toEqual({
        values: { is_deceased: true },
        where: [["id", "IN", [1]]],
      });
      expect(named(calls, "SearchDisplay.inlineEdit")).toHaveLength(0);
    });

    it("holds a field that must not be empty until it has a value", async () => {
      const calls = serve({
        tasks: [enable, update],
        handlers: { "Contact.getFields": () => fields, "Contact.update": () => counted(1) },
      });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      await screen.findByText("Name 1");
      await selectRows("Name 1");
      await openActions();
      await userEvent.click(
        screen.getByRole("menuitem", { name: /Update Contacts/, hidden: true }),
      );
      const dialog = await screen.findByRole("dialog", { name: "Update Contacts" });
      await waitFor(() => {
        expect(within(dialog).getByRole("combobox", { name: "Add Value" })).toBeEnabled();
      });
      await addField(dialog, "sort_name");
      const input = within(dialog).getByRole("textbox", { name: "Sort Name" });
      expect(input).toBeRequired();
      await userEvent.click(within(dialog).getByRole("button", { name: "Update Contact" }));
      expect(input).toBeInvalid();
      expect(dialog).toBeInTheDocument();
      await userEvent.type(input, "Pilot");
      await userEvent.click(within(dialog).getByRole("button", { name: "Update Contact" }));
      await waitFor(() => {
        expect(named(calls, "Contact.update")).toHaveLength(1);
      });
    });

    it("cancels without a call and shows a failed field list", async () => {
      const calls = serve({
        tasks: [enable, update],
        handlers: {
          "Contact.getFields": () => {
            throw apiError("No such entity");
          },
        },
      });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      await screen.findByText("Name 1");
      await selectRows("Name 1");
      await openActions();
      await userEvent.click(
        screen.getByRole("menuitem", { name: /Update Contacts/, hidden: true }),
      );
      const dialog = await screen.findByRole("dialog", { name: "Update Contacts" });
      expect(await within(dialog).findByRole("alert")).toHaveTextContent("No such entity");
      await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(named(calls, "Contact.update")).toHaveLength(0);
      expect(checkbox("Name 1")).toBeChecked();
    });
  });

  describe("tag", () => {
    const tagRows = [
      { id: 1, label: "Alpha", is_selectable: true, parent_id: null },
      { id: 2, label: "Alpha child", is_selectable: true, parent_id: 1 },
      { id: 3, label: "Heading only", is_selectable: false, parent_id: null },
    ];
    const tagsets = [{ id: 10, name: "topics", label: "Topics" }];
    const topics = [{ id: 11, label: "Science" }];
    const tagGet = (params: Record<string, unknown>) => {
      const where = JSON.stringify(params.where);
      if (where.includes('["is_tagset","=",true]')) return tagsets;
      if (where.includes('["parent_id","=",10]')) return topics;
      return tagRows;
    };

    async function openTagDialog(...names: string[]) {
      await screen.findByText("Name 1");
      await selectRows(...names);
      await openActions();
      await userEvent.click(screen.getByRole("menuitem", { name: /Tag/, hidden: true }));
      return screen.findByRole("dialog", { name: "Tag - Add/Remove Tags" });
    }

    it("adds the chosen tags, from the tree and a tagset, to the selected rows", async () => {
      const calls = serve({
        tasks: [enable, tag],
        handlers: {
          "Tag.get": tagGet,
          "EntityTag.save": () => Object.assign([], { countFetched: 4, countMatched: 1 }),
        },
      });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      const dialog = await openTagDialog("Name 1", "Name 2");
      const add = within(dialog).getByRole("button", { name: "Add tags" });
      expect(add).toBeDisabled();
      const tags = await within(dialog).findByRole("listbox", { name: "Tags" });
      expect(within(tags).getByRole("option", { name: "Heading only" })).toBeDisabled();
      // Only no-break spaces survive in an option's text, so the tree keeps its indentation.
      expect(within(tags).getByRole("option", { name: "Alpha child" }).textContent).toBe(
        "\u00a0\u00a0Alpha child",
      );
      // Tags are used for "Contact" whatever contact type the search lists.
      expect(named(calls, "Tag.get")[0]?.params.where).toContainEqual([
        "used_for:name",
        "CONTAINS",
        "Contact",
      ]);
      await userEvent.selectOptions(tags, ["2"]);
      const set = await within(dialog).findByRole("listbox", { name: "Topics" });
      await userEvent.selectOptions(set, ["11"]);
      expect(add).toBeEnabled();
      await userEvent.click(add);
      await waitFor(() => {
        expect(window.CRM.alert).toHaveBeenCalledWith(
          "3 tags added. 1 tag already exists and was not added.",
          "Saved",
          "success",
        );
      });
      expect(named(calls, "EntityTag.save").map(({ params }) => params)).toEqual([
        {
          defaults: { "entity_table:name": "Contact" },
          records: [
            { tag_id: 2, entity_id: 1 },
            { tag_id: 11, entity_id: 1 },
            { tag_id: 2, entity_id: 2 },
            { tag_id: 11, entity_id: 2 },
          ],
          match: ["entity_id", "tag_id", "entity_table"],
        },
      ]);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await waitFor(() => {
        expect(pageRuns(calls)).toHaveLength(2);
      });
      expect(checkbox("Name 1")).not.toBeChecked();
    });

    it("removes the chosen tags from the selected rows", async () => {
      const calls = serve({
        tasks: [enable, tag],
        handlers: {
          "Tag.get": tagGet,
          "EntityTag.delete": () => Object.assign([], { countFetched: 2, count: 2 }),
        },
      });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      const dialog = await openTagDialog("Name 3");
      await userEvent.click(within(dialog).getByRole("radio", { name: "Remove Tags" }));
      const tags = await within(dialog).findByRole("listbox", { name: "Tags" });
      await userEvent.selectOptions(tags, ["1", "2"]);
      await userEvent.click(within(dialog).getByRole("button", { name: "Remove tags" }));
      await waitFor(() => {
        expect(window.CRM.alert).toHaveBeenCalledWith("2 tags removed.", "Saved", "success");
      });
      expect(named(calls, "EntityTag.delete").map(({ params }) => params)).toEqual([
        {
          where: [
            ["entity_table:name", "=", "Contact"],
            ["tag_id", "IN", [1, 2]],
            ["entity_id", "IN", [3]],
          ],
        },
      ]);
    });

    it("shows a failed tag lookup and lets the dialog close", async () => {
      const calls = serve({
        tasks: [enable, tag],
        handlers: {
          "Tag.get": () => {
            throw apiError("No such entity");
          },
        },
      });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      const dialog = await openTagDialog("Name 1");
      expect((await within(dialog).findAllByRole("alert"))[0]).toHaveTextContent("No such entity");
      await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(named(calls, "EntityTag.save")).toHaveLength(0);
    });
  });

  describe("relationship", () => {
    const fields = [
      { name: "description", label: "Description", input_type: "Text", data_type: "String" },
      { name: "start_date", label: "Start Date", input_type: "Date", data_type: "Date" },
      { name: "custom.Active", label: "Active", input_type: "Radio", data_type: "Boolean" },
    ];

    async function openRelationshipDialog(...names: string[]) {
      await screen.findByText("Name 1");
      await selectRows(...names);
      await openActions();
      await userEvent.click(screen.getByRole("menuitem", { name: /Relationship/, hidden: true }));
      return screen.findByRole("dialog", { name: "Add Relationship" });
    }

    it("relates the selected rows to the chosen contact with the type's fields", async () => {
      const calls = serve({
        tasks: [enable, relationship],
        handlers: {
          "Relationship.getFields": () => fields,
          "Relationship.save": () =>
            Object.assign([{ id: 1 }, { id: 2, duplicate_id: 5 }], { countFetched: 2 }),
          "Individual.autocomplete": () =>
            Object.assign([{ id: 7, label: "Bob" }], { countMatched: 1 }),
        },
      });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      const dialog = await openRelationshipDialog("Name 1", "Name 2");
      const save = within(dialog).getByRole("button", { name: "Save" });
      expect(save).toBeDisabled();
      expect(within(dialog).getByRole("textbox", { name: /Contact/ })).toBeDisabled();
      const type = within(dialog).getByRole("combobox", { name: /Relationship Type/ });
      expect(within(type).getByRole("option", { name: "Parent of" })).toHaveAttribute(
        "title",
        "A guardian",
      );
      await userEvent.selectOptions(type, "9_a_b");
      expect(named(calls, "Relationship.getFields")[0]?.params).toMatchObject({
        values: { relationship_type_id: "9" },
      });
      const description = await within(dialog).findByRole("textbox", { name: "Description" });
      await userEvent.type(description, "Met at the fair");
      // An untouched field shows nothing and sends nothing, as core's crm-search-input.
      const active = within(dialog).getByRole("radiogroup", { name: "Active" });
      expect(within(active).queryByRole("radio", { checked: true })).toBeNull();
      const contact = await within(dialog).findByRole("combobox", { name: /Contact/ });
      await userEvent.type(contact, "Bo");
      await userEvent.click(await screen.findByRole("option", { name: "Bob" }));
      expect(named(calls, "Individual.autocomplete")[0]?.params).toEqual({
        input: "Bo",
        searchField: null,
        exclude: null,
        quickEdit: false,
        filters: { contact_sub_type: "Student" },
      });
      await userEvent.click(save);
      await waitFor(() => {
        expect(window.CRM.alert).toHaveBeenCalledWith(
          "1 relationship added. 1 relationship already exists.",
          "Saved",
          "success",
        );
      });
      expect(named(calls, "Relationship.save").map(({ params }) => params)).toEqual([
        {
          defaults: {
            description: "Met at the fair",
            relationship_type_id: "9",
            contact_id_b: 7,
          },
          records: [{ contact_id_a: 1 }, { contact_id_a: 2 }],
        },
      ]);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await waitFor(() => {
        expect(pageRuns(calls)).toHaveLength(2);
      });
    });

    // deviation:relationship-preset-type
    it("starts from the values a hook preset, the type locked", async () => {
      const preset = {
        ...relationship,
        values: {
          relationship_type: "4_a_b",
          disableRelationshipSelect: true,
          contact_id: 8,
          description: "Preset",
        },
      };
      const calls = serve({
        tasks: [enable, preset],
        handlers: {
          "Relationship.getFields": () => fields,
          "Relationship.save": () => Object.assign([{ id: 1 }], { countFetched: 1 }),
          "Organization.autocomplete": () =>
            Object.assign([{ id: 8, label: "Acme" }], { countMatched: 1 }),
        },
      });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      const dialog = await openRelationshipDialog("Name 3");
      const type = within(dialog).getByRole("combobox", { name: /Relationship Type/ });
      expect(type).toHaveValue("4_a_b");
      expect(type).toBeDisabled();
      expect(await within(dialog).findByRole("textbox", { name: "Description" })).toHaveValue(
        "Preset",
      );
      expect(await within(dialog).findByRole("combobox", { name: /Contact/ })).toHaveValue("Acme");
      await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
      await waitFor(() => {
        expect(named(calls, "Relationship.save")).toHaveLength(1);
      });
      expect(named(calls, "Relationship.save")[0]?.params).toEqual({
        defaults: { description: "Preset", relationship_type_id: "4", contact_id_b: 8 },
        records: [{ contact_id_a: 3 }],
      });
    });

    it("takes the other side when the type reads the other way round", async () => {
      const calls = serve({
        tasks: [enable, relationship],
        handlers: {
          "Relationship.getFields": () => [],
          "Relationship.save": () => Object.assign([{ id: 1 }], { countFetched: 1 }),
          "Organization.autocomplete": () =>
            Object.assign([{ id: 8, label: "Acme" }], { countMatched: 1 }),
        },
      });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      const dialog = await openRelationshipDialog("Name 3");
      const type = within(dialog).getByRole("combobox", { name: /Relationship Type/ });
      await userEvent.selectOptions(type, "4_a_b");
      const contact = await within(dialog).findByRole("combobox", { name: /Contact/ });
      await userEvent.type(contact, "Ac");
      await userEvent.click(await screen.findByRole("option", { name: "Acme" }));
      expect(named(calls, "Organization.autocomplete")[0]?.params).toMatchObject({
        filters: { contact_sub_type: null },
      });
      await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
      await waitFor(() => {
        expect(window.CRM.alert).toHaveBeenCalledWith("1 relationship added.", "Saved", "success");
      });
      expect(named(calls, "Relationship.save")[0]?.params).toEqual({
        defaults: { relationship_type_id: "4", contact_id_b: 8 },
        records: [{ contact_id_a: 3 }],
      });
    });

    // deviation:relationship-batch-failure-alerts
    it("shows a failed save and reloads, as a batch may have run", async () => {
      const calls = serve({
        tasks: [enable, relationship],
        handlers: {
          "Relationship.getFields": () => [],
          "Relationship.save": () => {
            throw apiError("Relationship type is inactive");
          },
          "Individual.autocomplete": () =>
            Object.assign([{ id: 7, label: "Bob" }], { countMatched: 1 }),
        },
      });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      const dialog = await openRelationshipDialog("Name 1");
      const type = within(dialog).getByRole("combobox", { name: /Relationship Type/ });
      await userEvent.selectOptions(type, "4_b_a");
      const contact = await within(dialog).findByRole("combobox", { name: /Contact/ });
      await userEvent.type(contact, "Bo");
      await userEvent.click(await screen.findByRole("option", { name: "Bob" }));
      await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
      await waitFor(() => {
        expect(window.CRM.alert).toHaveBeenCalledWith(
          "Relationship type is inactive",
          "Error",
          "error",
        );
      });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await waitFor(() => {
        expect(pageRuns(calls)).toHaveLength(2);
      });
    });
  });

  describe("mailing", () => {
    const typeField = [
      {
        options: [
          { id: "traditional", label: "Traditional", description: "The classic editor" },
          { id: "mosaico", label: "Mosaico", description: null },
        ],
      },
    ];
    const group = () => [{ id: 7, mailing: { id: 9 } }];

    async function openMailingDialog(...names: string[]) {
      await screen.findByText("Name 1");
      await selectRows(...names);
      await openActions();
      await userEvent.click(screen.getByRole("menuitem", { name: /CiviMail/, hidden: true }));
      return screen.findByRole("dialog", { name: "Email - schedule/send via CiviMail" });
    }

    it("creates the mailing and its hidden group, adds the contacts and opens it", async () => {
      const location = { assign: vi.fn() };
      vi.stubGlobal("location", location);
      const calls = serve({
        tasks: [enable, mailing],
        handlers: {
          "Mailing.getFields": () => typeField,
          "Contact.get": () => Object.assign([], { count: 2 }),
          "Group.create": group,
          "GroupContact.save": () => counted(2),
        },
      });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      const dialog = await openMailingDialog("Name 1", "Name 2");
      expect(dialog).toHaveTextContent("mass-mailing to the 2 selected contacts");
      const create = within(dialog).getByRole("button", { name: "Create Mailing" });
      expect(create).toBeDisabled();
      await within(dialog).findByText("All of the selected contacts have active email addresses.");
      const type = await within(dialog).findByRole("combobox", { name: "Mailing Type" });
      expect(type).toHaveValue("traditional");
      await userEvent.selectOptions(type, "mosaico");
      await userEvent.type(within(dialog).getByRole("textbox", { name: /Mailing Name/ }), "News");
      await userEvent.click(create);
      await waitFor(() => {
        expect(location.assign).toHaveBeenCalledWith("/civicrm/a#/mailing/9");
      });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(pageRuns(calls)).toHaveLength(1);
      expect(named(calls, "Contact.get")[0]?.params).toMatchObject({
        where: expect.arrayContaining([["id", "IN", [1, 2]]]) as unknown,
      });
      expect(named(calls, "Group.create")[0]?.params).toMatchObject({
        values: { is_hidden: true },
        chain: {
          mailing: ["Mailing", "create", { values: { name: "News", template_type: "mosaico" } }, 0],
        },
      });
      expect(named(calls, "GroupContact.save").map(({ params }) => params)).toEqual([
        { defaults: { group_id: 7 }, records: [{ contact_id: 1 }, { contact_id: 2 }] },
      ]);
      expect(window.CRM.alert).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it("warns about contacts that cannot be mailed, withholds the button without any", async () => {
      serve({
        tasks: [enable, mailing],
        handlers: {
          "Mailing.getFields": () => typeField,
          "Contact.get": () => Object.assign([], { count: 0 }),
        },
      });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      const dialog = await openMailingDialog("Name 1", "Name 2");
      await within(dialog).findByText(/None of the selected contacts are eligible/);
      await userEvent.type(within(dialog).getByRole("textbox", { name: /Mailing Name/ }), "News");
      expect(within(dialog).getByRole("button", { name: "Create Mailing" })).toBeDisabled();
      await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("holds Escape while the group is being created", async () => {
      let resolve: (value: unknown) => void = () => undefined;
      const calls = serve({
        tasks: [enable, mailing],
        handlers: {
          "Mailing.getFields": () => [{ options: false }],
          "Contact.get": () => Object.assign([], { count: 2 }),
          "Group.create": () =>
            new Promise((finish) => {
              resolve = finish;
            }),
          "GroupContact.save": () => counted(2),
        },
      });
      vi.stubGlobal("location", { assign: vi.fn() });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      const dialog = await openMailingDialog("Name 1", "Name 2");
      await within(dialog).findByText("All of the selected contacts have active email addresses.");
      await userEvent.type(within(dialog).getByRole("textbox", { name: /Mailing Name/ }), "News");
      await userEvent.click(within(dialog).getByRole("button", { name: "Create Mailing" }));
      expect(within(dialog).getByRole("status")).toHaveTextContent("Creating mailing...");
      expect(within(dialog).getByRole("heading", { name: /CiviMail/ })).toHaveFocus();
      await userEvent.keyboard("{Escape}");
      expect(dialog).toBeInTheDocument();
      resolve(group());
      await waitFor(() => {
        expect(named(calls, "GroupContact.save")).toHaveLength(1);
      });
      vi.unstubAllGlobals();
    });

    // deviation:mailing-group-failure-stays
    it("keeps the dialog with the error when the group cannot be created", async () => {
      serve({
        tasks: [enable, mailing],
        handlers: {
          "Mailing.getFields": () => [{ options: false }],
          "Contact.get": () => Object.assign([], { count: 1 }),
          "Group.create": () => {
            throw apiError("Mailing component is disabled");
          },
        },
      });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      const dialog = await openMailingDialog("Name 1", "Name 2");
      await within(dialog).findByText(/1 of the selected contacts cannot receive mailings/);
      expect(within(dialog).queryByRole("combobox", { name: "Mailing Type" })).toBeNull();
      await userEvent.type(within(dialog).getByRole("textbox", { name: /Mailing Name/ }), "News");
      await userEvent.click(within(dialog).getByRole("button", { name: "Create Mailing" }));
      expect(await within(dialog).findByRole("alert")).toHaveTextContent(
        "An error occurred while attempting to create mailing. Mailing component is disabled",
      );
      expect(within(dialog).getByRole("button", { name: "Create Mailing" })).toBeEnabled();
    });
  });

  describe("case", () => {
    const fields = [
      {
        name: "case_type_id",
        label: "Case Type",
        input_type: "Select",
        data_type: "Integer",
        required: true,
        options: [
          { id: 1, label: "Housing" },
          { id: 2, label: "Legal" },
        ],
      },
      {
        name: "status_id",
        label: "Status",
        input_type: "Select",
        data_type: "Integer",
        required: true,
        default_value: 1,
        options: [{ id: 1, label: "Ongoing" }],
      },
      {
        name: "subject",
        label: "Subject",
        input_type: "Text",
        data_type: "String",
        nullable: true,
      },
      { name: "start_date", label: "Start", input_type: "Date", data_type: "Date", nullable: true },
    ];
    const opened = (count: number) =>
      Object.assign(
        Array.from({ length: count }, (_, index) => ({ id: 10 + index })),
        { countFetched: count },
      );

    async function openCaseDialog(...names: string[]) {
      await screen.findByText("Name 1");
      await selectRows(...names);
      await openActions();
      await userEvent.click(screen.getByRole("menuitem", { name: /Open New Case/, hidden: true }));
      return screen.findByRole("dialog", { name: "Case - Open New Case" });
    }

    it("starts with the required fields and the subject, skips open cases and saves one per contact", async () => {
      const calls = serve({
        tasks: [enable, openCase],
        handlers: {
          "Case.getFields": () => fields,
          "CaseContact.get": () => [{ contact_id: 2 }],
          "Case.save": () => opened(2),
        },
      });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      const dialog = await openCaseDialog("Name 1", "Name 2", "Name 3");
      expect(dialog).toHaveTextContent("Multiple contacts selected");
      expect(within(dialog).getByRole("radio", { name: /for each contact/ })).toBeChecked();
      const type = await within(dialog).findByRole("combobox", { name: "Case Type" });
      expect(type).toHaveValue("1");
      const subject = within(dialog).getByRole("textbox", { name: "Subject" });
      // The status has a default, so the trait leaves it out; the dialog adds the subject itself.
      const fieldSelects = within(dialog).getAllByRole("combobox", { name: "Field" });
      expect(fieldSelects).toHaveLength(2);
      expect(fieldSelects[0]).toHaveValue("case_type_id");
      expect(fieldSelects[1]).toHaveValue("subject");
      expect(
        within(dialog).getByRole("radiogroup", { name: "1 contact already has an open case." }),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByRole("radio", { name: "Skip contact with open case" }),
      ).toBeChecked();
      await userEvent.selectOptions(type, "2");
      await userEvent.type(subject, "Help");
      await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
      await waitFor(() => {
        expect(window.CRM.alert).toHaveBeenCalledWith(
          "Successfully opened 2 cases.",
          "Saved",
          "success",
        );
      });
      expect(named(calls, "Case.getFields")[0]?.params).toMatchObject({
        action: "create",
        where: expect.arrayContaining([
          ["name", "NOT IN", ["contact_id", "is_deleted"]],
        ]) as unknown,
      });
      expect(named(calls, "CaseContact.get")[0]?.params).toEqual({
        select: ["contact_id"],
        where: [
          ["contact_id", "IN", [1, 2, 3]],
          ["case_id.status_id:name", "!=", "Closed"],
        ],
      });
      expect(named(calls, "Case.save").map(({ params }) => params)).toEqual([
        {
          records: [
            { case_type_id: 2, subject: "Help", contact_id: 1 },
            { case_type_id: 2, subject: "Help", contact_id: 3 },
          ],
        },
      ]);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await waitFor(() => {
        expect(pageRuns(calls)).toHaveLength(2);
      });
      expect(checkbox("Name 1")).not.toBeChecked();
    });

    it("opens one case for all contacts jointly, including those with a case when asked", async () => {
      const calls = serve({
        tasks: [enable, openCase],
        handlers: {
          "Case.getFields": () => fields,
          "CaseContact.get": () => [{ contact_id: 1 }],
          "Case.create": () => opened(1),
        },
      });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      const dialog = await openCaseDialog("Name 1", "Name 2");
      await within(dialog).findByRole("combobox", { name: "Case Type" });
      await userEvent.click(within(dialog).getByRole("radio", { name: /single case/ }));
      await userEvent.click(within(dialog).getByRole("radio", { name: "Create new case anyway" }));
      await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
      await waitFor(() => {
        expect(window.CRM.alert).toHaveBeenCalledWith(
          "Successfully opened 1 case.",
          "Saved",
          "success",
        );
      });
      expect(named(calls, "Case.create").map(({ params }) => params)).toEqual([
        { values: { case_type_id: 1, subject: "", contact_id: [1, 2] } },
      ]);
      expect(named(calls, "Case.save")).toHaveLength(0);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await waitFor(() => {
        expect(pageRuns(calls)).toHaveLength(2);
      });
    });

    it("offers no joint case where the setting forbids it, and looks cases up on each opening", async () => {
      const calls = serve({
        tasks: [enable, { ...openCase, allowMultipleClients: false }],
        handlers: { "Case.getFields": () => fields, "CaseContact.get": () => [] },
      });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      const dialog = await openCaseDialog("Name 1", "Name 2");
      await within(dialog).findByRole("combobox", { name: "Case Type" });
      await waitFor(() => {
        expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();
      });
      expect(within(dialog).queryByRole("radio")).not.toBeInTheDocument();
      expect(dialog).not.toHaveTextContent("already");
      await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      // A case opened or closed meanwhile must show, so the lookup is not served from the cache.
      await openActions();
      await userEvent.click(screen.getByRole("menuitem", { name: /Open New Case/, hidden: true }));
      await screen.findByRole("dialog", { name: "Case - Open New Case" });
      await waitFor(() => {
        expect(named(calls, "CaseContact.get")).toHaveLength(2);
      });
      expect(named(calls, "Case.getFields")).toHaveLength(1);
    });

    // deviation:skipped-contacts-send-nothing
    it("tells when every contact is skipped and opens nothing", async () => {
      const calls = serve({
        tasks: [enable, openCase],
        handlers: {
          "Case.getFields": () => fields,
          "CaseContact.get": () => [{ contact_id: 1 }],
        },
      });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      const dialog = await openCaseDialog("Name 1");
      await within(dialog).findByRole("combobox", { name: "Case Type" });
      expect(within(dialog).queryByRole("radio", { name: /single case/ })).not.toBeInTheDocument();
      await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
      await waitFor(() => {
        expect(window.CRM.alert).toHaveBeenCalledWith(
          "No cases to open.",
          "All contacts skipped",
          undefined,
        );
      });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(named(calls, "Case.save")).toHaveLength(0);
      expect(pageRuns(calls)).toHaveLength(1);
      expect(checkbox("Name 1")).toBeChecked();
    });

    // deviation:open-case-batch-failure
    it("keeps a failed joint case in the dialog with the server's message", async () => {
      serve({
        tasks: [enable, openCase],
        handlers: {
          "Case.getFields": () => fields,
          "CaseContact.get": () => [],
          "Case.create": () => {
            throw apiError("Case type is inactive");
          },
        },
      });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      const dialog = await openCaseDialog("Name 1", "Name 2");
      await within(dialog).findByRole("combobox", { name: "Case Type" });
      await userEvent.click(within(dialog).getByRole("radio", { name: /single case/ }));
      await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
      expect(await within(dialog).findByRole("alert")).toHaveTextContent("Case type is inactive");
      expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();
      await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // deviation:open-case-save-waits-lookup
    it("withholds the save until the case lookup answers", async () => {
      let answer: (rows: unknown[]) => void = () => undefined;
      serve({
        tasks: [enable, openCase],
        handlers: {
          "Case.getFields": () => fields,
          "CaseContact.get": () =>
            new Promise((resolve) => {
              answer = resolve;
            }),
        },
      });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      const dialog = await openCaseDialog("Name 1");
      await within(dialog).findByRole("combobox", { name: "Case Type" });
      expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
      answer([]);
      await waitFor(() => {
        expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();
      });
    });

    // deviation:open-case-save-waits-lookup
    it("shows a failed case lookup and withholds the save", async () => {
      serve({
        tasks: [enable, openCase],
        handlers: {
          "Case.getFields": () => fields,
          "CaseContact.get": () => {
            throw apiError("No such entity");
          },
        },
      });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      const dialog = await openCaseDialog("Name 1");
      expect(await within(dialog).findByRole("alert")).toHaveTextContent("No such entity");
      await within(dialog).findByRole("combobox", { name: "Case Type" });
      expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    });
  });
  describe("grant", () => {
    const fields = [
      {
        name: "grant_type_id",
        label: "Grant Type",
        input_type: "Select",
        data_type: "Integer",
        required: true,
        options: [{ id: 1, label: "Emergency" }],
      },
      {
        name: "status_id",
        label: "Grant Status",
        input_type: "Select",
        data_type: "Integer",
        required: true,
        default_value: 1,
        options: [{ id: 1, label: "Submitted" }],
      },
      {
        name: "amount_total",
        label: "Total Amount",
        input_type: "Text",
        data_type: "Money",
        required: true,
      },
      { name: "rationale", label: "Rationale", input_type: "TextArea", data_type: "Text" },
    ];

    async function openGrantDialog(...names: string[]) {
      await screen.findByText("Name 1");
      await selectRows(...names);
      await openActions();
      await userEvent.click(screen.getByRole("menuitem", { name: /Add New Grant/, hidden: true }));
      return screen.findByRole("dialog", { name: "Grant - Add New Grant" });
    }

    // deviation:grant-count-contacts-once
    it("starts with the required fields, counts each contact with grants once and skips them", async () => {
      const calls = serve({
        tasks: [enable, addGrant],
        handlers: {
          "Grant.getFields": () => fields,
          // Two grants of one contact.
          "Grant.get": () => [{ contact_id: 2 }, { contact_id: 2 }],
          "Grant.save": () => Object.assign([{ id: 10 }, { id: 11 }], { countFetched: 2 }),
        },
      });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      const dialog = await openGrantDialog("Name 1", "Name 2", "Name 3");
      await within(dialog).findByRole("combobox", { name: "Grant Type" });
      const fieldSelects = within(dialog).getAllByRole("combobox", { name: "Field" });
      expect(fieldSelects).toHaveLength(2);
      expect(fieldSelects[0]).toHaveValue("grant_type_id");
      expect(fieldSelects[1]).toHaveValue("amount_total");
      expect(within(dialog).queryByRole("radio", { name: /single/ })).not.toBeInTheDocument();
      expect(
        within(dialog).getByRole("radiogroup", { name: "1 contact already has a grant." }),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByRole("radio", { name: "Skip contact with existing grant" }),
      ).toBeChecked();
      await userEvent.type(within(dialog).getByRole("textbox", { name: "Total Amount" }), "25");
      await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
      await waitFor(() => {
        expect(window.CRM.alert).toHaveBeenCalledWith(
          "Successfully added 2 grants.",
          "Saved",
          "success",
        );
      });
      expect(named(calls, "Grant.get")[0]?.params).toEqual({
        select: ["contact_id"],
        where: [["contact_id", "IN", [1, 2, 3]]],
      });
      expect(named(calls, "Grant.save").map(({ params }) => params)).toEqual([
        {
          records: [
            { grant_type_id: 1, amount_total: "25", contact_id: 1 },
            { grant_type_id: 1, amount_total: "25", contact_id: 3 },
          ],
        },
      ]);
    });

    // deviation:grant-dialog-case-fixes
    it("adds grants for every contact when asked, and tells when every contact is skipped", async () => {
      const calls = serve({
        tasks: [enable, addGrant],
        handlers: {
          "Grant.getFields": () => fields,
          "Grant.get": () => [{ contact_id: 1 }],
          "Grant.save": () => Object.assign([{ id: 10 }], { countFetched: 1 }),
        },
      });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      let dialog = await openGrantDialog("Name 1");
      await within(dialog).findByRole("combobox", { name: "Grant Type" });
      await userEvent.type(within(dialog).getByRole("textbox", { name: "Total Amount" }), "5");
      await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
      await waitFor(() => {
        expect(window.CRM.alert).toHaveBeenCalledWith(
          "No grants to add.",
          "All contacts skipped",
          undefined,
        );
      });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await openActions();
      await userEvent.click(screen.getByRole("menuitem", { name: /Add New Grant/, hidden: true }));
      dialog = await screen.findByRole("dialog", { name: "Grant - Add New Grant" });
      await userEvent.click(
        await within(dialog).findByRole("radio", { name: "Add new grant anyway" }),
      );
      await userEvent.type(within(dialog).getByRole("textbox", { name: "Total Amount" }), "5");
      await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
      await waitFor(() => {
        expect(named(calls, "Grant.save")).toHaveLength(1);
      });
      expect(named(calls, "Grant.save")[0]?.params).toMatchObject({
        records: [expect.objectContaining({ contact_id: 1 })],
      });
    });
  });
  describe("tag merge", () => {
    const tags = [
      { id: 2, label: "Alpha", is_reserved: false },
      { id: 1, label: "Beta", is_reserved: true },
    ];
    async function openMerge() {
      await screen.findByText("Name 1");
      await selectRows("Name 1", "Name 2");
      await openActions();
      await userEvent.click(screen.getByRole("menuitem", { name: /Merge Tags/, hidden: true }));
      return screen.findByRole("dialog", { name: "Merge Tags" });
    }

    it("keeps the first tag by label, takes the kept tag's label and merges the others into it", async () => {
      const calls = serve({
        tasks: [enable, tagMerge],
        handlers: { "Tag.get": () => tags, "Tag.merge": () => [] },
      });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      const dialog = await openMerge();
      const keep = await within(dialog).findByRole("combobox", { name: "Tag to keep" });
      const labelBox = within(dialog).getByRole("textbox", { name: "Label" });
      expect(keep).toHaveValue("2");
      expect(labelBox).toHaveValue("Alpha");
      expect(dialog).toHaveTextContent("One or more selected tags are reserved.");
      await userEvent.selectOptions(keep, "1");
      expect(labelBox).toHaveValue("Beta");
      await userEvent.clear(labelBox);
      expect(within(dialog).getByRole("button", { name: "Merge tags" })).toBeDisabled();
      await userEvent.type(labelBox, "Gamma");
      await userEvent.click(within(dialog).getByRole("button", { name: "Merge tags" }));
      await waitFor(() => {
        expect(window.CRM.alert).toHaveBeenCalledWith(
          '2 tags merged into "Gamma".',
          "Merged",
          "success",
        );
      });
      expect(named(calls, "Tag.get")[0]?.params).toEqual({
        select: ["id", "label", "is_reserved"],
        where: [["id", "IN", [1, 2]]],
        orderBy: { label: "ASC" },
      });
      expect(named(calls, "Tag.merge").map(({ params }) => params)).toEqual([
        { targetId: 1, tagIds: [2], label: "Gamma" },
      ]);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await waitFor(() => {
        expect(pageRuns(calls)).toHaveLength(2);
      });
    });

    // deviation:alert-text-escaped
    it("shows a merged tag's label as text in the notification", async () => {
      onCiviScreen();
      serve({
        tasks: [enable, tagMerge],
        handlers: { "Tag.get": () => tags, "Tag.merge": () => [] },
      });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      const dialog = await openMerge();
      const labelBox = await within(dialog).findByRole("textbox", { name: "Label" });
      await userEvent.clear(labelBox);
      await userEvent.type(labelBox, "<img src=x>");
      await userEvent.click(within(dialog).getByRole("button", { name: "Merge tags" }));
      await waitFor(() => {
        expect(window.CRM.alert).toHaveBeenCalledWith(
          '2 tags merged into "&lt;img src=x&gt;".',
          "Merged",
          "success",
        );
      });
    });

    // deviation:tag-merge-none-left
    it("says when none of the selected tags exists any more", async () => {
      const calls = serve({ tasks: [enable, tagMerge], handlers: { "Tag.get": () => [] } });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      const dialog = await openMerge();
      expect(
        await within(dialog).findByText("None of the selected tags exists any more."),
      ).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Merge tags" })).toBeDisabled();
      expect(named(calls, "Tag.merge")).toHaveLength(0);
    });

    it("keeps a failed merge in the dialog with the server's message", async () => {
      serve({
        tasks: [enable, tagMerge],
        handlers: {
          "Tag.get": () => tags,
          "Tag.merge": () => {
            throw apiError("Permission denied");
          },
        },
      });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      const dialog = await openMerge();
      await within(dialog).findByRole("combobox", { name: "Tag to keep" });
      await userEvent.click(within(dialog).getByRole("button", { name: "Merge tags" }));
      expect(await within(dialog).findByRole("alert")).toHaveTextContent("Permission denied");
      expect(within(dialog).getByRole("button", { name: "Merge tags" })).toBeEnabled();
    });
  });

  describe("add translation", () => {
    const settingsOf = () => [
      {
        allLanguages: { fr_FR: "French", de_DE: "German", es_ES: "Spanish" },
        uiLanguages: { de_DE: "German" },
      },
    ];
    async function openTranslation() {
      await screen.findByText("Name 1");
      await selectRows("Name 1");
      await userEvent.click(actionButton());
      await userEvent.click(
        await screen.findByRole("menuitem", { name: /Add Translation/, hidden: true }),
      );
      return screen.findByRole("dialog", { name: "Add Translation" });
    }

    // deviation:translation-dialog-labels-errors
    it("offers the languages in use first, marks existing ones and opens the editor for the choice", async () => {
      const location = { assign: vi.fn() };
      vi.stubGlobal("location", location);
      const calls = serve({
        tasks: [enable, addTranslation],
        handlers: {
          "MessageTemplate.get": () => [{ id: 1, msg_title: "Receipt" }],
          "Translation.get": (params) =>
            JSON.stringify(params.where).includes("entity_id")
              ? [{ language: "de_DE" }]
              : [{ language: "de_DE" }, { language: "fr_FR" }],
          "Afreact.getTaskSettings": settingsOf,
        },
      });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      const dialog = await openTranslation();
      expect(await within(dialog).findByRole("textbox", { name: "Message Template" })).toHaveValue(
        "Receipt",
      );
      const group = within(dialog).getByRole("radiogroup", { name: /Locale/ });
      expect(within(group).getByRole("radio", { name: /German/ })).toBeDisabled();
      expect(within(group).getByRole("radio", { name: "French" })).toBeChecked();
      expect(within(group).queryByRole("radio", { name: "Spanish" })).not.toBeInTheDocument();
      await userEvent.selectOptions(
        within(dialog).getByRole("combobox", { name: "Other" }),
        "es_ES",
      );
      expect(within(group).getByRole("radio", { name: "Other" })).toBeChecked();
      await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));
      expect(location.assign).toHaveBeenCalledWith(
        "/civicrm/admin/messageTemplates/edit#/edit?id=1&lang=es_ES",
      );
      expect(named(calls, "Afreact.getTaskSettings")[0]?.params).toEqual({
        module: "crmMsgadmTasks",
      });
      vi.unstubAllGlobals();
    });

    it("shows a failed lookup and offers no language", async () => {
      serve({
        tasks: [enable, addTranslation],
        handlers: {
          "MessageTemplate.get": () => [{ id: 1, msg_title: "Receipt" }],
          "Translation.get": () => [],
          "Afreact.getTaskSettings": () => {
            throw apiError('Module "crmMsgadmTasks" is not enabled.');
          },
        },
      });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      const dialog = await openTranslation();
      expect(await within(dialog).findByRole("alert")).toHaveTextContent("is not enabled");
      expect(within(dialog).queryByRole("radio")).not.toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Add" })).toBeDisabled();
    });
  });
  describe("case role", () => {
    const roleCount = (count: number) =>
      Object.assign(
        Array.from({ length: count }, (_, index) => ({ row_count: 1, case_id: index })),
        { count },
      );
    const assigned = () =>
      Object.assign(
        [
          { case_id: 1, relationship: [{ id: 3 }, { id: 4 }] },
          { case_id: 2, relationship: [{ id: 5, duplicate_id: 5 }] },
        ],
        { countFetched: 2 },
      );

    async function openRoleDialog(...names: string[]) {
      await screen.findByText("Name 1");
      await selectRows(...names);
      await openActions();
      await userEvent.click(screen.getByRole("menuitem", { name: /Assign Role/, hidden: true }));
      return screen.findByRole("dialog", { name: "Case - Assign Role" });
    }

    it("counts the cases holding the chosen role and adds it to each case's clients", async () => {
      const calls = serve({
        tasks: [enable, caseRole],
        handlers: {
          "Relationship.get": () => roleCount(0),
          "CaseContact.get": assigned,
          "Individual.autocomplete": () =>
            Object.assign([{ id: 7, label: "Bob" }], { countMatched: 1 }),
        },
      });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      const dialog = await openRoleDialog("Name 1", "Name 2");
      const save = within(dialog).getByRole("button", { name: "Save" });
      expect(save).toBeDisabled();
      expect(within(dialog).getByRole("textbox", { name: /Contact/ })).toBeDisabled();
      const type = within(dialog).getByRole("combobox", { name: /Role Type/ });
      expect(within(type).getByRole("option", { name: "Benefits Specialist is" })).toHaveAttribute(
        "title",
        "Handles claims",
      );
      await userEvent.selectOptions(type, "9_b_a");
      expect(
        await within(dialog).findByText("The selected cases do not yet have this role assigned."),
      ).toBeInTheDocument();
      expect(named(calls, "Relationship.get")[0]?.params).toEqual({
        select: ["row_count"],
        where: [
          ["case_id", "IN", [1, 2]],
          ["is_current", "=", true],
          ["relationship_type_id", "=", "9"],
        ],
        groupBy: ["case_id"],
      });
      const contact = await within(dialog).findByRole("combobox", { name: /Contact/ });
      await userEvent.type(contact, "Bo");
      await userEvent.click(await screen.findByRole("option", { name: "Bob" }));
      expect(named(calls, "Individual.autocomplete")[0]?.params).toMatchObject({
        filters: { contact_sub_type: "Staff" },
      });
      await userEvent.click(save);
      await waitFor(() => {
        expect(window.CRM.alert).toHaveBeenCalledWith(
          "2 case roles added. 1 case role already occupied by the selected contact.",
          "Saved",
          "success",
        );
      });
      expect(named(calls, "Relationship.update")).toHaveLength(0);
      expect(named(calls, "CaseContact.get").map(({ params }) => params)).toEqual([
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
                  contact_id_b: "$contact_id",
                  contact_id_a: 7,
                },
              },
            ],
          },
          where: [["case_id", "IN", [1, 2]]],
        },
      ]);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await waitFor(() => {
        expect(pageRuns(calls)).toHaveLength(2);
      });
    });

    it("asks whether to add or replace where cases hold the role, and ends the others first", async () => {
      const calls = serve({
        tasks: [enable, caseRole],
        handlers: {
          "Relationship.get": () => roleCount(1),
          "Relationship.update": () => [{ id: 2 }],
          "CaseContact.get": assigned,
          "Individual.autocomplete": () =>
            Object.assign([{ id: 7, label: "Bob" }], { countMatched: 1 }),
        },
      });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      const dialog = await openRoleDialog("Name 1", "Name 2");
      await userEvent.selectOptions(
        within(dialog).getByRole("combobox", { name: /Role Type/ }),
        "4_a_b",
      );
      const group = await within(dialog).findByRole("radiogroup", {
        name: "1 cases already have this role assigned.",
      });
      expect(within(group).queryByRole("radio", { checked: true })).toBeNull();
      const contact = await within(dialog).findByRole("combobox", { name: /Contact/ });
      await userEvent.type(contact, "Bo");
      await userEvent.click(await screen.findByRole("option", { name: "Bob" }));
      const save = within(dialog).getByRole("button", { name: "Save" });
      expect(save).toBeDisabled();
      await userEvent.click(within(group).getByRole("radio", { name: "Replace existing roles" }));
      await userEvent.click(save);
      await waitFor(() => {
        expect(window.CRM.alert).toHaveBeenCalledWith(
          expect.stringMatching(/^2 case roles added\./) as unknown,
          "Saved",
          "success",
        );
      });
      expect(named(calls, "Relationship.update")[0]?.params).toEqual({
        values: { end_date: "now", is_active: false },
        where: [
          ["case_id", "IN", [1, 2]],
          ["is_current", "=", true],
          ["relationship_type_id", "=", "4"],
          ["contact_id_b", "!=", 7],
        ],
      });
      const order = calls.map(({ call }) => call);
      expect(order.indexOf("Relationship.update")).toBeLessThan(order.indexOf("CaseContact.get"));
    });

    it("starts from a hook's preset role and contact, and shows a failed replace", async () => {
      serve({
        tasks: [enable, { ...caseRole, values: { relationship_type: "4_a_b", contact_id: 7 } }],
        handlers: {
          "Relationship.get": () => roleCount(2),
          "Relationship.update": () => {
            throw apiError("No write");
          },
          "Individual.autocomplete": () =>
            Object.assign([{ id: 7, label: "Bob" }], { countMatched: 1 }),
        },
      });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      const dialog = await openRoleDialog("Name 1", "Name 2");
      expect(within(dialog).getByRole("combobox", { name: /Role Type/ })).toHaveValue("4_a_b");
      await userEvent.click(
        await within(dialog).findByRole("radio", { name: "Replace existing roles" }),
      );
      await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
      expect(await within(dialog).findByRole("alert")).toHaveTextContent("No write");
      expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();
      await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // deviation:case-role-batch-failure-alerts
    it("alerts with the server's message when the role batch fails and closes the dialog", async () => {
      serve({
        tasks: [enable, caseRole],
        handlers: {
          "Relationship.get": () => roleCount(0),
          "CaseContact.get": () => {
            throw apiError("Relationship type is inactive");
          },
          "Individual.autocomplete": () =>
            Object.assign([{ id: 7, label: "Bob" }], { countMatched: 1 }),
        },
      });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      const dialog = await openRoleDialog("Name 1");
      await userEvent.selectOptions(
        within(dialog).getByRole("combobox", { name: /Role Type/ }),
        "9_b_a",
      );
      const contact = await within(dialog).findByRole("combobox", { name: /Contact/ });
      await userEvent.type(contact, "Bo");
      await userEvent.click(await screen.findByRole("option", { name: "Bob" }));
      await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
      await waitFor(() => {
        expect(window.CRM.alert).toHaveBeenCalledWith(
          "Relationship type is inactive",
          "Error",
          "error",
        );
      });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("shows a failed role count and withholds the save", async () => {
      serve({
        tasks: [enable, { ...caseRole, values: { relationship_type: "4_a_b", contact_id: 7 } }],
        handlers: {
          "Relationship.get": () => {
            throw apiError("No access");
          },
          "Individual.autocomplete": () =>
            Object.assign([{ id: 7, label: "Bob" }], { countMatched: 1 }),
        },
      });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      const dialog = await openRoleDialog("Name 1");
      expect(await within(dialog).findByRole("alert")).toHaveTextContent("No access");
      expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    });
  });
});
