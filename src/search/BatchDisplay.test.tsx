import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryStore } from "../url/hash";
import { editInfo } from "../test/editInfo";
import { apiError, listParam, mockApi, renderWithQuery } from "../test/render";
import { AfreactSearch } from "./AfreactSearch";
import type { Column, DisplaySettings } from "./types";

const contact: Column = {
  type: "field",
  key: "contact_id",
  label: "Contact",
  required: true,
  spec: { name: "contact_id" },
};
const amount: Column = {
  type: "field",
  key: "total_amount",
  label: "Total Amount",
  required: true,
  tally: { fn: "SUM", target: true },
  spec: { name: "total_amount" },
};
const fee: Column = {
  type: "field",
  key: "fee_amount",
  label: "Fee Amount",
  tally: { fn: "SUM" },
  spec: { name: "fee_amount" },
};
const net: Column = {
  type: "field",
  key: "net_amount",
  label: "Net Amount",
  spec: { name: "net_amount" },
};
const source: Column = { type: "field", key: "source", label: "Source", spec: { name: "source" } };
const settings: DisplaySettings = {
  columns: [amount, fee, net, source],
  classes: ["table"],
  tally: {},
};

const editable = {
  contact_id: editInfo({
    entity: "Contribution",
    value_key: "contact_id",
    input_type: "EntityRef",
    data_type: "Integer",
    fk_entity: "Contact",
    nullable: false,
    required: true,
  }),
  total_amount: editInfo({
    entity: "Contribution",
    value_key: "total_amount",
    data_type: "Money",
    nullable: false,
    required: true,
    target: 30.3,
  }),
  fee_amount: editInfo({ entity: "Contribution", value_key: "fee_amount", data_type: "Money" }),
  net_amount: editInfo({
    entity: "Contribution",
    value_key: "net_amount",
    data_type: "Money",
    input_type: "DisplayOnly",
    input_attrs: { formula: "[total_amount] - [fee_amount]" },
  }),
  source: editInfo({ entity: "Contribution", value_key: "source" }),
};

const row = (id: number, values: Record<string, unknown> = {}) => ({
  data: {
    _id: id,
    _status: "NEW",
    _status_message: null,
    _entity_id: null,
    total_amount: null,
    fee_amount: null,
    net_amount: null,
    source: null,
    ...values,
  },
});

function show(
  rows: ReturnType<typeof row>[],
  handlers: Record<string, (params: Record<string, unknown>) => unknown> = {},
  shown: DisplaySettings = settings,
  store = memoryStore("#?batch=7"),
) {
  const calls = mockApi({
    "SearchDisplay.runBatch": () => Object.assign(rows, { editable }),
    "Import_7.save": (params) => listParam(params.records),
    ...handlers,
  });
  const { unmount } = renderWithQuery(
    <AfreactSearch search="S" display="D" type="batch" settings={shown} />,
    store,
  );
  return Object.assign(calls, { unmount });
}

const saves = (calls: { call: string; params: Record<string, unknown> }[]) =>
  calls.filter((call) => call.call === "Import_7.save");

/** A beforeunload event, cancelled when the page asks before leaving. */
function leaving() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

const input = (name: string) => screen.findByRole("textbox", { name });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("new batch", () => {
  // deviation:batch-name-label
  it("starts a batch with its name, row count and the targets of SUM columns", async () => {
    const calls = mockApi({
      "SearchDisplay.createBatch": () => [{ id: 7 }],
      "SearchDisplay.runBatch": () => Object.assign([row(1), row(2)], { editable }),
    });
    const store = memoryStore("");
    renderWithQuery(
      <AfreactSearch search="S" display="D" type="batch" settings={settings} />,
      store,
    );
    const form = screen.getByRole("group", { name: "New Batch" });
    await userEvent.type(within(form).getByRole("textbox", { name: "Name" }), "March");
    const rows = within(form).getByRole("spinbutton", { name: "Rows" });
    await userEvent.clear(rows);
    await userEvent.type(rows, "2");
    await userEvent.type(within(form).getByRole("spinbutton", { name: "Total Amount" }), "30.3");
    expect(within(form).queryByRole("spinbutton", { name: "Fee Amount" })).toBeNull();
    await userEvent.click(within(form).getByRole("button", { name: "Start New Batch" }));
    expect(await screen.findAllByRole("textbox", { name: /^Total Amount, Row/ })).toHaveLength(2);
    expect(calls.find((call) => call.call === "SearchDisplay.createBatch")?.params).toEqual({
      savedSearch: "S",
      display: "D",
      rowCount: 2,
      targets: { total_amount: 30.3 },
      label: "March",
    });
    expect(store.params().get("batch")).toBe("7");
    expect(calls.find((call) => call.call === "SearchDisplay.runBatch")?.params).toMatchObject({
      savedSearch: "S",
      display: "D",
      userJobId: 7,
    });
  });

  it("links only the user's own import batches without the queue permission", () => {
    renderWithQuery(<AfreactSearch search="S" display="D" type="batch" settings={settings} />);
    expect(screen.getAllByRole("link").map((link) => link.textContent.trim())).toEqual([
      "View My Import Batches",
    ]);
  });

  it("names the second link only for administer queues", () => {
    vi.mocked(window.CRM.checkPerm).mockImplementation((perm) => perm === "administer queues");
    renderWithQuery(<AfreactSearch search="S" display="D" type="batch" settings={settings} />);
    expect(screen.getByRole("link", { name: "View All Import Batches" })).toHaveAttribute(
      "href",
      "/civicrm/imports/all-imports#/?job_type=search_batch_import",
    );
  });

  // deviation:batch-create-import-failure
  it("keeps the form with the server's message when the batch cannot start", async () => {
    mockApi({ "SearchDisplay.createBatch": () => Promise.reject(apiError("No access")) });
    renderWithQuery(<AfreactSearch search="S" display="D" type="batch" settings={settings} />);
    await userEvent.click(screen.getByRole("button", { name: "Start New Batch" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No access");
    expect(screen.getByRole("button", { name: "Start New Batch" })).toBeEnabled();
  });
});

describe("batch rows", () => {
  it("computes the formula and the totals as values change, and saves the changed rows", async () => {
    const calls = show([row(1), row(2)]);
    await userEvent.type(await input("Total Amount, Row 1"), "10.1");
    await userEvent.type(await input("Fee Amount, Row 1"), "0.1");
    await userEvent.type(await input("Total Amount, Row 2"), "20.2");
    const [first] = screen.getAllByRole("row").slice(1);
    expect(first).toHaveTextContent("10");
    const footer = screen.getAllByRole("row").at(-1);
    expect(footer).toHaveTextContent("30.3 / 30.3");
    expect(within(footer!).getByText("30.3 / 30.3").closest("td")).toHaveClass("text-success");
    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await screen.findByRole("button", { name: "Changes Saved" });
    const saved = calls.filter((call) => call.call === "Import_7.save");
    expect(saved.at(-1)?.params.records).toEqual([
      { ...row(1).data, total_amount: "10.1", fee_amount: "0.1", net_amount: 10 },
      { ...row(2).data, total_amount: "20.2", net_amount: 20.2 },
    ]);
  });

  it("saves the changes every 10 seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const calls = show([row(1)]);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    await user.type(await input("Source, Row 1"), "Mail");
    expect(calls.some((call) => call.call === "Import_7.save")).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    await waitFor(() => {
      expect(calls.filter((call) => call.call === "Import_7.save")).toHaveLength(1);
    });
  });

  // deviation:batch-save-failure-keeps-rows
  it("keeps changes unsaved and says why when saving fails", async () => {
    show([row(1)], { "Import_7.save": () => Promise.reject(apiError("Disk full")) });
    await userEvent.type(await input("Source, Row 1"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Disk full");
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeEnabled();
  });

  it("clears a failed save's message once a later save succeeds", async () => {
    let failures = 1;
    show([row(1)], {
      "Import_7.save": (params) =>
        failures-- > 0 ? Promise.reject(apiError("Disk full")) : listParam(params.records),
    });
    await userEvent.type(await input("Source, Row 1"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Disk full");
    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await screen.findByRole("button", { name: "Changes Saved" });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // deviation:batch-unsaved-on-leave
  it("asks before leaving the page with unsaved changes, and saves them when it closes", async () => {
    const calls = show([row(1)]);
    await userEvent.type(await input("Source, Row 1"), "x");
    expect(leaving()).toBe(true);
    calls.unmount();
    expect(saves(calls).at(-1)?.params.records).toEqual([
      { ...row(1).data, source: "x", net_amount: 0 },
    ]);
  });

  it("leaves the page without asking once the changes are saved", async () => {
    show([row(1)]);
    await userEvent.type(await input("Source, Row 1"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await screen.findByRole("button", { name: "Changes Saved" });
    expect(leaving()).toBe(false);
  });

  // deviation:batch-load-error-new
  it("offers a new batch when the batch does not load", async () => {
    mockApi({ "SearchDisplay.runBatch": () => Promise.reject(apiError("Batch not found")) });
    const store = memoryStore("#?batch=7");
    renderWithQuery(
      <AfreactSearch search="S" display="D" type="batch" settings={settings} />,
      store,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Batch not found");
    await userEvent.click(screen.getByRole("button", { name: "New Batch" }));
    expect(await screen.findByRole("group", { name: "New Batch" })).toBeInTheDocument();
    expect(store.params().get("batch")).toBeNull();
  });

  it("names the settings it leaves out", async () => {
    const shown = { ...settings, seeMore: true };
    show([row(1)], {}, shown);
    await input("Source, Row 1");
    expect(screen.getByRole("note")).toHaveTextContent(/: setting seeMore$/);
  });

  it("adds rows from the menu and removes one, moving the focus to the next row", async () => {
    const calls = show([row(1), row(2)], {
      "Import_7.save": (params) => listParam(params.records).map((_, index) => row(3 + index).data),
      "Import_7.delete": () => [],
    });
    await screen.findByRole("textbox", { name: "Source, Row 2" });
    await userEvent.click(screen.getByRole("button", { name: /Add Rows/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Add 5 Rows", hidden: true }));
    expect(await screen.findByRole("textbox", { name: "Source, Row 7" })).toBeInTheDocument();
    expect(calls.find((call) => call.call === "Import_7.save")?.params).toEqual({
      records: [{}, {}, {}, {}, {}],
      reload: ["*"],
    });
    await userEvent.click(screen.getByRole("button", { name: "Remove Row 1" }));
    await waitFor(() => {
      expect(screen.getAllByRole("textbox", { name: /^Source/ })).toHaveLength(6);
    });
    expect(calls.find((call) => call.call === "Import_7.delete")?.params).toEqual({
      where: [["_id", "=", 1]],
    });
    expect(screen.getByRole("button", { name: "Remove Row 1" })).toHaveFocus();
  });

  // deviation:batch-delete-then-remove
  it("keeps a row whose removal fails, with the server's message", async () => {
    show([row(1), row(2)], { "Import_7.delete": () => Promise.reject(apiError("Locked")) });
    await screen.findByRole("textbox", { name: "Source, Row 2" });
    await userEvent.click(screen.getByRole("button", { name: "Remove Row 1" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Locked");
    expect(screen.getAllByRole("textbox", { name: /^Source/ })).toHaveLength(2);
  });

  // deviation:batch-display-only-import-column
  it("shows a display-only column with a joined, suffixed key from its import column", async () => {
    const joined: Column = {
      type: "field",
      key: "Soft.status_id:label",
      label: "Soft Status",
      spec: { name: "Soft_status_id" },
    };
    show([row(1, { Soft_status_id: "Pending" })], {}, { ...settings, columns: [source, joined] });
    await input("Source, Row 1");
    expect(screen.getByRole("cell", { name: "Pending" })).toBeInTheDocument();
  });

  // deviation:batch-copy-recomputes-formulas
  it("copies the first row's value down, recomputing the formula", async () => {
    show([
      row(1, { total_amount: "5" }),
      row(2, { total_amount: "8", fee_amount: "1", net_amount: 7 }),
    ]);
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Copy Total Amount from the first row to all rows",
      }),
    );
    expect(await input("Total Amount, Row 2")).toHaveValue("5");
    expect(screen.getAllByRole("row")[2]).toHaveTextContent("4");
    expect(screen.queryByRole("button", { name: /Copy Net Amount/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeEnabled();
  });

  it("shows no pager without rows", async () => {
    show([], {}, { ...settings, limit: 2, pager: {} });
    await waitFor(() => {
      expect(document.querySelector(".crm-search-loading-placeholder")).toBeNull();
    });
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("pages through the rows on the client", async () => {
    show([row(1), row(2), row(3)], {}, { ...settings, limit: 2, pager: {} });
    await screen.findByRole("textbox", { name: "Source, Row 2" });
    expect(screen.queryByRole("textbox", { name: "Source, Row 3" })).toBeNull();
    await userEvent.click(screen.getByRole("link", { name: "2" }));
    expect(await input("Source, Row 3")).toBeInTheDocument();
  });

  it("goes back a page when a removal empties the last one, and stays there", async () => {
    show(
      [row(1), row(2), row(3)],
      {
        "Import_7.save": (params) => listParam(params.records).map(() => row(4).data),
        "Import_7.delete": () => [],
      },
      { ...settings, limit: 2, pager: {} },
    );
    await screen.findByRole("textbox", { name: "Source, Row 2" });
    await userEvent.click(screen.getByRole("link", { name: "2" }));
    await userEvent.click(await screen.findByRole("button", { name: "Remove Row 3" }));
    expect(await input("Source, Row 1")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Add Rows/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Add 1 Row", hidden: true }));
    await screen.findByRole("link", { name: "2" });
    expect(screen.getByRole("textbox", { name: "Source, Row 1" })).toBeInTheDocument();
  });

  it("pages and focuses by the rows there are once a removal returns", async () => {
    let finish = () => {};
    show(
      [row(1), row(2), row(3)],
      {
        "Import_7.save": (params) => listParam(params.records).map(() => row(4).data),
        "Import_7.delete": () =>
          new Promise<never[]>((resolve) => {
            finish = () => {
              resolve([]);
            };
          }),
      },
      { ...settings, limit: 2, pager: {} },
    );
    await screen.findByRole("textbox", { name: "Source, Row 2" });
    await userEvent.click(screen.getByRole("link", { name: "2" }));
    await userEvent.click(await screen.findByRole("button", { name: "Remove Row 3" }));
    await userEvent.click(screen.getByRole("button", { name: /Add Rows/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Add 1 Row", hidden: true }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Remove Row 4" })).toBeInTheDocument();
    });
    finish();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Remove Row 3" })).toHaveFocus();
    });
    expect(screen.queryByRole("textbox", { name: "Source, Row 1" })).toBeNull();
  });
});

describe("import", () => {
  // deviation:batch-required-every-page
  it("names the rows missing a required value, on every page, and focuses the first", async () => {
    const calls = show(
      [row(1, { total_amount: "1" }), row(2), row(3), row(4), row(5)],
      {},
      { ...settings, limit: 1, pager: {} },
    );
    await input("Total Amount, Row 1");
    await userEvent.click(screen.getByRole("button", { name: "Run Import" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Please complete the following:");
    expect(
      within(alert)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Row 2: Total Amount", "Row 3: Total Amount", "Row 4: Total Amount", "And 1 more"]);
    const field = await input("Total Amount, Row 2");
    await waitFor(() => {
      expect(field).toHaveFocus();
    });
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(calls.some((call) => call.call === "SearchDisplay.importBatch")).toBe(false);
  });

  // deviation:batch-mismatch-dialog
  it("asks before importing totals that miss their target, then saves and imports", async () => {
    const location = { assign: vi.fn() };
    vi.stubGlobal("location", location);
    const calls = show([row(1, { total_amount: "10" })], {
      "SearchDisplay.importBatch": () => [{ url: "/civicrm/queue/runner" }],
    });
    await userEvent.type(await input("Source, Row 1"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Run Import" }));
    const dialog = await screen.findByRole("dialog", { name: "Totals Mismatch" });
    expect(dialog).toHaveTextContent("Total Amount value 10 does not match expected 30.3");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(calls.some((call) => call.call === "SearchDisplay.importBatch")).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Run Import" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Run Import" }),
    );
    await waitFor(() => {
      expect(location.assign).toHaveBeenCalledWith("/civicrm/queue/runner");
    });
    const order = calls
      .map((call) => call.call)
      .filter((call) => call !== "SearchDisplay.runBatch");
    expect(order).toEqual(["Import_7.save", "SearchDisplay.importBatch"]);
    expect(calls.at(-1)?.params).toEqual({ savedSearch: "S", display: "D", userJobId: 7 });
  });

  // deviation:batch-import-after-last-save
  it("saves the edits made while an earlier save ran before it imports", async () => {
    const location = { assign: vi.fn() };
    vi.stubGlobal("location", location);
    let release = () => {};
    const first = new Promise<void>((resolve) => {
      release = resolve;
    });
    let count = 0;
    const calls = show([row(1, { total_amount: "10.1" }), row(2, { total_amount: "20.2" })], {
      "Import_7.save": async (params) => {
        if (count++ === 0) await first;
        return listParam(params.records);
      },
      "SearchDisplay.importBatch": () => [{ url: "/civicrm/queue/runner" }],
    });
    await userEvent.type(await input("Source, Row 1"), "a");
    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await userEvent.type(await input("Source, Row 2"), "b");
    await userEvent.click(screen.getByRole("button", { name: "Run Import" }));
    release();
    await waitFor(() => {
      expect(location.assign).toHaveBeenCalledWith("/civicrm/queue/runner");
    });
    const order = calls
      .map((call) => call.call)
      .filter((call) => call !== "SearchDisplay.runBatch");
    expect(order).toEqual(["Import_7.save", "Import_7.save", "SearchDisplay.importBatch"]);
    expect(saves(calls).at(-1)?.params.records).toEqual([
      { ...row(2).data, total_amount: "20.2", source: "b", net_amount: 20.2 },
    ]);
  });

  it("does not import when the last save fails", async () => {
    const calls = show([row(1, { total_amount: "30.3" })], {
      "Import_7.save": () => Promise.reject(apiError("Disk full")),
      "SearchDisplay.importBatch": () => [{ url: "/civicrm/queue/runner" }],
    });
    await userEvent.type(await input("Source, Row 1"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Run Import" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Disk full");
    expect(screen.getByRole("button", { name: "Run Import" })).toBeEnabled();
    expect(calls.some((call) => call.call === "SearchDisplay.importBatch")).toBe(false);
  });

  it("marks and focuses a required entity reference and a required Yes/No left empty", async () => {
    const flag: Column = {
      type: "field",
      key: "is_test",
      label: "Test",
      required: true,
      spec: { name: "is_test" },
    };
    mockApi({
      "SearchDisplay.runBatch": () =>
        Object.assign([row(1, { total_amount: "30.3", contact_id: 5, is_test: null })], {
          editable: {
            ...editable,
            is_test: editInfo({
              entity: "Contribution",
              value_key: "is_test",
              data_type: "Boolean",
              required: true,
            }),
          },
        }),
      "Contact.autocomplete": () => [{ id: 5, label: "Five" }],
    });
    renderWithQuery(
      <AfreactSearch
        search="S"
        display="D"
        type="batch"
        settings={{ ...settings, columns: [flag, contact] }}
      />,
      memoryStore("#?batch=7"),
    );
    const group = await screen.findByRole("radiogroup", { name: "Test, Row 1" });
    await userEvent.click(screen.getByRole("button", { name: "Run Import" }));
    await waitFor(() => {
      expect(within(group).getByRole("radio", { name: "Yes" })).toHaveFocus();
    });
    expect(group).toHaveAttribute("aria-invalid", "true");
  });

  it("marks a required entity reference left empty", async () => {
    show(
      [row(1, { total_amount: "30.3", contact_id: null })],
      {},
      {
        ...settings,
        columns: [contact],
      },
    );
    const combobox = await screen.findByRole("combobox", { name: "Contact, Row 1" });
    await userEvent.click(screen.getByRole("button", { name: "Run Import" }));
    await waitFor(() => {
      expect(combobox).toHaveFocus();
    });
    expect(combobox).toHaveAttribute("aria-invalid", "true");
  });

  // deviation:batch-create-import-failure
  it("stays on the batch with the server's message when the import fails", async () => {
    show([row(1, { total_amount: "30.3" })], {
      "SearchDisplay.importBatch": () => Promise.reject(apiError("Queue busy")),
    });
    await userEvent.click(await screen.findByRole("button", { name: "Run Import" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Queue busy");
    expect(screen.getByRole("button", { name: "Run Import" })).toBeEnabled();
  });

  // deviation:batch-import-inert
  // deviation:batch-status-announced
  it("makes the table inert and announces the import while it runs", async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    show([row(1, { total_amount: "30.3" })], {
      "SearchDisplay.importBatch": () => held.then(() => Promise.reject(apiError("Queue busy"))),
    });
    await userEvent.click(await screen.findByRole("button", { name: "Run Import" }));
    const statuses = () => screen.getAllByRole("status").map((status) => status.textContent);
    await waitFor(() => {
      expect(statuses()).toContain("Importing...");
    });
    expect(screen.getByRole("table", { hidden: true })).toHaveAttribute("inert");
    release();
    expect(await screen.findByRole("alert")).toHaveTextContent("Queue busy");
    expect(screen.getByRole("table")).not.toHaveAttribute("inert");
    expect(statuses()).not.toContain("Importing...");
  });

  it("shows an entity reference with the in-place editors' input", async () => {
    show([row(1, { contact_id: null })], {}, { ...settings, columns: [contact] });
    expect(await screen.findByRole("combobox", { name: "Contact, Row 1" })).toBeRequired();
  });
});
