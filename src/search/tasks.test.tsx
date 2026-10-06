import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { events } from "../test/jquery";
import { apiError, mockApi, renderWithQuery } from "../test/render";
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

const done = (count: number) => Object.assign([], { countFetched: count });

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
    const calls = serve({ handlers: { "Contact.delete": () => done(2) } });
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
          const where = params.where as unknown[][];
          return done((where[1]?.[2] as unknown[]).length);
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
    expect(batches.map((params) => (params.where as unknown[][])[1]?.[2])).toEqual([
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

  it("shows the progress of a run and the error of a failed batch, then reloads what changed", async () => {
    let finish: (value: unknown) => void = () => undefined;
    let call = 0;
    const calls = serve({
      rows: [row(1), row(2)],
      count: 600,
      handlers: {
        "Contact.update": () => {
          call += 1;
          if (call === 1) return new Promise((resolve) => (finish = resolve));
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

    finish(done(500));
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
    const calls = serve({ tasks: [enable, tag] });
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
    await screen.findByText("Name 1");
    await selectRows("Name 1");
    expect(
      await screen.findByText(
        "Not supported by the React renderer: task tag (Angular dialog ~/crmSearchTasks/crmSearchTaskTag.html)",
      ),
    ).toHaveAttribute("role", "note");
    await openActions();
    const item = screen.getByRole("menuitem", { name: /Tag/, hidden: true });
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(item).toHaveAttribute("title", "Not supported by the React renderer: task tag");
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

  it("runs a row's update link through inlineEdit and confirms with a status", async () => {
    const links = [{ task: "enable", text: "Enable", icon: "fa-toggle-on" }];
    const calls = serve({
      rows: [row(1), row(2, { columns: [{ val: "Name 2" }, { links }] })],
      handlers: { "SearchDisplay.inlineEdit": () => done(1) },
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
    const links = [{ task: "tag", text: "Tag" }];
    serve({ rows: [row(1, { columns: [{ val: "Name 1" }, { links }] })], tasks: [tag] });
    renderWithQuery(
      <AfreactSearch
        search="S"
        display="D"
        settings={{ columns: [...columns, linksColumn(links)] }}
      />,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Tag" }));
    await waitFor(() => {
      expect(window.CRM.alert).toHaveBeenCalledWith(
        "Not supported by the React renderer: task tag (Angular dialog ~/crmSearchTasks/crmSearchTaskTag.html)",
        "Error",
        "error",
      );
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

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
    const calls = serve({ handlers: { "Contact.delete": () => done(1) } });
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

  describe("download", () => {
    function stubDownload(response: Partial<Response>) {
      const fetchMock = vi.fn(() => Promise.resolve({ ok: true, ...response } as Response));
      vi.stubGlobal("fetch", fetchMock);
      const link = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:1", revokeObjectURL: () => {} }));
      return { fetchMock, link };
    }

    it("downloads the selected rows in the chosen format and names the file from the answer", async () => {
      const { fetchMock, link } = stubDownload({
        headers: new Headers({ "Content-Disposition": 'attachment; filename="Contacts.xlsx"' }),
        blob: () => Promise.resolve(new Blob(["x"])),
      });
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
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("/civicrm/ajax/api4/SearchDisplay/download");
      const params = JSON.parse(new URLSearchParams(init.body as string).get("params") ?? "");
      expect(params).toMatchObject({ savedSearch: "S", display: "D", format: "xlsx", filters: { id: [1, 2] } });
      expect(params).not.toHaveProperty("return");
      expect(params).not.toHaveProperty("limit");
      expect(link).toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      // A download changes nothing, so the table keeps its rows and selection.
      expect(checkbox("Name 1")).toBeChecked();
    });

    it("offers every row without a selection and reports a failed download", async () => {
      stubDownload({
        ok: false,
        statusText: "Forbidden",
        json: () => Promise.resolve({ error_message: "Not permitted" }),
      });
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
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(status()).toHaveTextContent("Not permitted");
    });
  });

  describe("update", () => {
    const fields = [
      { name: "job_title", label: "Job Title", input_type: "Text", data_type: "String", nullable: true },
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
      { name: "employer_id", label: "Employer", input_type: "EntityRef", data_type: "Integer", fk_entity: "Contact" },
    ];

    it("updates the selected rows with the chosen fields and values", async () => {
      const calls = serve({
        tasks: [enable, update],
        handlers: { "Contact.getFields": () => fields, "Contact.update": () => done(2) },
      });
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
      await screen.findByText("Name 1");
      await selectRows("Name 1", "Name 2");
      await openActions();
      await userEvent.click(screen.getByRole("menuitem", { name: /Update Contacts/, hidden: true }));
      const dialog = await screen.findByRole("dialog", { name: "Update Contacts" });
      expect(dialog).toHaveTextContent("Update the 2 selected Contacts with the following values:");
      const save = within(dialog).getByRole("button", { name: "Update Contacts" });
      expect(save).toBeDisabled();
      const add = within(dialog).getByRole("combobox", { name: "Add Value" });
      await waitFor(() => {
        expect(add).toBeEnabled();
      });
      expect(within(add).getByRole("option", { name: "Employer" })).toBeDisabled();
      expect(within(add).getByRole("option", { name: "Employer" })).toHaveAttribute(
        "title",
        "Not supported by the React renderer: EntityRef",
      );
      await userEvent.selectOptions(add, "job_title");
      await userEvent.type(within(dialog).getByRole("textbox", { name: "Job Title" }), "Pilot");
      await userEvent.selectOptions(add, "is_deceased");
      expect(within(dialog).getByRole("radio", { name: "Yes" })).toBeChecked();
      await userEvent.click(within(dialog).getByRole("radio", { name: "No" }));
      await userEvent.selectOptions(add, "gender_id");
      expect(within(dialog).getByRole("combobox", { name: "Gender" })).toHaveValue("1");
      // A field already chosen cannot be added twice.
      expect(within(add).getByRole("option", { name: "Job Title" })).toBeDisabled();
      // Emptying a clause's field drops the clause.
      await userEvent.selectOptions(within(dialog).getAllByRole("combobox", { name: "Field" })[2]!, "");
      expect(within(dialog).queryByRole("combobox", { name: "Gender" })).not.toBeInTheDocument();
      await userEvent.click(save);
      await waitFor(() => {
        expect(window.CRM.alert).toHaveBeenCalledWith(
          "Successfully updated 2 Contacts.",
          "Update Contacts Complete",
          "success",
        );
      });
      expect(named(calls, "Contact.update").map(({ params }) => params)).toEqual([
        { values: { job_title: "Pilot", is_deceased: false }, where: [["id", "IN", [1, 2]]] },
      ]);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      // The rows changed, so the table reloads and the selection clears.
      await waitFor(() => {
        expect(pageRuns(calls)).toHaveLength(2);
      });
      expect(checkbox("Name 1")).not.toBeChecked();
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
      await userEvent.click(screen.getByRole("menuitem", { name: /Update Contacts/, hidden: true }));
      const dialog = await screen.findByRole("dialog", { name: "Update Contacts" });
      expect(await within(dialog).findByRole("alert")).toHaveTextContent("No such entity");
      await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(named(calls, "Contact.update")).toHaveLength(0);
      expect(checkbox("Name 1")).toBeChecked();
    });
  });
});
