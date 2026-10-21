import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { editInfo } from "../test/editInfo";
import { apiError, mockApi, renderWithQuery } from "../test/render";
import { AfreactSearch } from "./AfreactSearch";
import { rowName } from "./EditableCell";
import type { CellData, DisplaySettings, EditableInfo, Row } from "./types";

type Info = Partial<EditableInfo> & { value_key: string };

/** A display of a name and one editable column, with the given info and raw value. */
function setup(
  info: Info,
  value: unknown,
  {
    shown = value,
    inlineEdit,
    data = {},
    settings: extra = {},
    cell = {},
    handlers = {},
    more = [],
  }: {
    shown?: unknown;
    inlineEdit?: (params: Record<string, unknown>) => unknown;
    data?: Record<string, unknown>;
    settings?: Partial<DisplaySettings>;
    cell?: CellData;
    handlers?: Parameters<typeof mockApi>[0];
    more?: Row[];
  } = {},
) {
  const key = info.value_key;
  const row = (raw: unknown, text: unknown): Row => ({
    key: 7,
    columns: [{ val: "Ada" }, { val: text, edit: true, ...cell }],
    data: { id: 7, [key]: raw, ...data },
  });
  const settings: DisplaySettings = {
    columns: [
      { type: "field", key: "sort_name", label: "Name" },
      { type: "field", key, label: "Value" },
    ],
    limit: 10,
    pager: false,
    tally: { footer: true },
    ...extra,
  };
  const calls = mockApi({
    "SearchDisplay.run": (params) =>
      params.return === "tally"
        ? [{}]
        : params.return === "row_count"
          ? Object.assign([], { count: 2 })
          : Object.assign([row(value, shown), ...more], { editable: { [key]: editInfo(info) } }),
    // By default the server returns the row with the saved value, shown as "Saved".
    "SearchDisplay.inlineEdit":
      inlineEdit ?? ((params) => [row(Object.values(params.values ?? {})[0], "Saved")]),
    ...handlers,
  });
  renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} afform="afsearchX" />);
  const edits = () =>
    calls.filter(({ call }) => call === "SearchDisplay.inlineEdit").map(({ params }) => params);
  const runs = () => calls.filter(({ call }) => call === "SearchDisplay.run");
  return { calls, edits, runs };
}

const open = async (name = "Edit Value") => {
  await userEvent.click(await screen.findByRole("button", { name: new RegExp(name) }));
};
const field = () => screen.getByLabelText("Value, Ada");
/** The cell's name: the hidden "Edit" prefix, then the value as the cell shows it. */
const edit = (text: string) => `Edit Value ${text}`;

describe("in-place editing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // deviation:inline-edit-refreshes-totals
  it("marks the cell as core does and saves a text with core's parameters", async () => {
    const { edits, runs } = setup({ value_key: "job_title" }, "Pilot");
    const cell = await screen.findByRole("button", { name: edit("Pilot") });
    expect(cell).toHaveClass("crm-editable-enabled");
    expect(cell).toHaveAttribute("tabindex", "0");
    expect(
      within(screen.getByRole("cell", { name: "Ada" })).queryByRole("button"),
    ).not.toBeInTheDocument();

    await userEvent.click(cell);
    expect(document.querySelector("td.crm-search-field-editing")).toBeInTheDocument();
    expect(field()).toHaveFocus();
    expect(field()).toHaveValue("Pilot");
    await userEvent.clear(field());
    await userEvent.type(field(), "Captain{Enter}");

    const seed = runs()[0]?.params.seed;
    expect(edits()).toEqual([
      {
        savedSearch: "S",
        display: "D",
        seed,
        afform: "afsearchX",
        filters: {},
        sort: [],
        limit: 10,
        return: null,
        rowKey: 7,
        values: { job_title: "Captain" },
      },
    ]);
    // The returned row replaces the old one; the totals are asked again.
    const saved = await screen.findByRole("button", { name: edit("Saved") });
    await waitFor(() => {
      expect(saved).toHaveFocus();
    });
    expect(screen.getByText("Saved", { selector: "[role=status]" })).toBeInTheDocument();
    await waitFor(() => {
      expect(runs().filter(({ params }) => params.return === "tally")).toHaveLength(2);
    });
    expect(runs().filter(({ params }) => params.return === "page:1")).toHaveLength(1);
  });

  // deviation:inline-edit-keyboard-button
  it("opens with Enter, Space and F2 and cancels with Escape, focus back on the cell", async () => {
    const { edits } = setup({ value_key: "job_title" }, "Pilot");
    const cell = await screen.findByRole("button", { name: edit("Pilot") });
    for (const key of ["{Enter}", " ", "{F2}"]) {
      cell.focus();
      await userEvent.keyboard(key);
      expect(field()).toHaveFocus();
      await userEvent.type(field(), "x");
      await userEvent.keyboard("{Escape}");
      const back = screen.getByRole("button", { name: edit("Pilot") });
      await waitFor(() => {
        expect(back).toHaveFocus();
      });
    }
    expect(edits()).toEqual([]);
  });

  it("cancels with its button and saves with its button", async () => {
    const { edits } = setup({ value_key: "job_title" }, "Pilot");
    await open();
    await userEvent.type(field(), "x");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(edits()).toEqual([]);
    await open();
    await userEvent.type(field(), "s");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(edits()[0]?.values).toEqual({ job_title: "Pilots" });
  });

  // deviation:inplace-save-on-leave
  it("saves a change on leaving the editor and closes an unchanged one", async () => {
    // jsdom reports no focus while focus moves; a browser reports whether the window has it.
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const { edits } = setup({ value_key: "job_title" }, "Pilot");
    await open();
    await userEvent.tab();
    await userEvent.tab();
    expect(field()).toBeInTheDocument();
    await userEvent.tab();
    expect(screen.queryByLabelText("Value, Ada")).not.toBeInTheDocument();
    expect(edits()).toEqual([]);
    await open();
    await userEvent.type(field(), "s");
    await userEvent.click(document.body);
    expect(edits()[0]?.values).toEqual({ job_title: "Pilots" });
  });

  // deviation:inplace-save-on-leave
  it("stays open when the window loses focus", async () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    const { edits } = setup({ value_key: "job_title" }, "Pilot");
    await open();
    await userEvent.type(field(), "s");
    field().blur();
    expect(field()).toHaveValue("Pilots");
    expect(edits()).toEqual([]);
  });

  // deviation:inline-edit-keys-on-editor
  it("leaves Enter and Escape outside the editor alone", async () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    const { edits } = setup({ value_key: "job_title" }, "Pilot");
    await open();
    await userEvent.type(field(), "s");
    fireEvent.keyDown(document.body, { key: "Enter" });
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(field()).toHaveValue("Pilots");
    expect(edits()).toEqual([]);
  });

  it("saves nothing when the value did not change", async () => {
    const { edits } = setup({ value_key: "job_title" }, "Pilot");
    await open();
    await userEvent.keyboard("{Enter}");
    expect(edits()).toEqual([]);
    expect(await screen.findByRole("button", { name: edit("Pilot") })).toBeInTheDocument();
  });

  // deviation:inline-edit-failed-save-reopens
  it("keeps a failed editor open with the error and the typed value", async () => {
    setup({ value_key: "job_title" }, "Pilot", {
      inlineEdit: () => {
        throw apiError("Inline edit failed.");
      },
    });
    await open();
    await userEvent.type(field(), "s{Enter}");
    expect(await screen.findByText("Inline edit failed.", { selector: "p" })).toHaveClass(
      "alert-danger",
    );
    expect(field()).toHaveValue("Pilots");
    expect(field()).toHaveAttribute("aria-invalid", "true");
    expect(field()).toHaveAccessibleDescription("Inline edit failed.");
    expect(screen.getByText("Not saved: Inline edit failed.")).toHaveAttribute("role", "status");
  });

  it("keeps a second editor and what it holds when the first cell's save arrives", async () => {
    const person = (key: number, name: string, title: string): Row => ({
      key,
      columns: [{ val: name }, { val: title, edit: true }],
      data: { id: key, job_title: title },
    });
    let answer: (rows: Row[]) => void = () => undefined;
    mockApi({
      "SearchDisplay.run": (params) =>
        params.return === "tally"
          ? [{}]
          : Object.assign([person(7, "Ada", "Pilot"), person(8, "Bob", "Cook")], {
              editable: { job_title: editInfo({ value_key: "job_title" }) },
            }),
      "SearchDisplay.inlineEdit": () =>
        new Promise<Row[]>((resolve) => {
          answer = resolve;
        }),
    });
    const settings: DisplaySettings = {
      columns: [
        { type: "field", key: "sort_name", label: "Name" },
        { type: "field", key: "job_title", label: "Value" },
      ],
      pager: false,
    };
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
    await open(edit("Pilot"));
    await userEvent.type(field(), "s{Enter}");
    // The second editor opens while the first cell's save runs.
    await userEvent.click(screen.getByRole("button", { name: edit("Cook") }));
    const second = screen.getByLabelText("Value, Bob");
    await userEvent.type(second, "s");
    answer([person(7, "Ada", "Pilots")]);
    expect(await screen.findByRole("button", { name: edit("Pilots") })).toBeInTheDocument();
    expect(second).toBeInTheDocument();
    expect(second).toHaveValue("Cooks");
    expect(second).toHaveFocus();
  });

  it("leaves a failed editor closed when the new row opened meanwhile", async () => {
    let fail: (error: unknown) => void = () => undefined;
    setup({ value_key: "job_title" }, "Pilot", {
      settings: { editableRow: { create: true } },
      inlineEdit: () =>
        new Promise((_, reject) => {
          fail = reject;
        }),
    });
    await open();
    await userEvent.type(field(), "s{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    fail(apiError("Inline edit failed."));
    expect(await screen.findByText("Not saved: Inline edit failed.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Value, Ada")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: edit("Pilot") })).toBeInTheDocument();
  });

  // deviation:inplace-empty-null
  it("sends null for an emptied nullable field", async () => {
    const { edits } = setup({ value_key: "job_title" }, "Pilot");
    await open();
    await userEvent.clear(field());
    await userEvent.keyboard("{Enter}");
    expect(edits()[0]?.values).toEqual({ job_title: null });
  });

  // deviation:inline-edit-required-checked
  it("requires a value where the field cannot be emptied", async () => {
    const { edits } = setup({ value_key: "job_title", nullable: false }, "Pilot");
    await open();
    expect(field()).toBeRequired();
    await userEvent.clear(field());
    await userEvent.keyboard("{Enter}");
    expect(field()).toBeInvalid();
    expect(edits()).toEqual([]);
  });

  it("reloads the form's displays when the saved row leaves the result", async () => {
    const { runs } = setup({ value_key: "job_title" }, "Pilot", { inlineEdit: () => [] });
    await open();
    await userEvent.type(field(), "s{Enter}");
    await waitFor(() => {
      expect(runs().filter(({ params }) => params.return === "page:1")).toHaveLength(2);
    });
  });

  // deviation:edited-row-deselected
  it("takes a selected row the save left out of the result off the selection", async () => {
    setup({ value_key: "job_title" }, "Pilot", {
      inlineEdit: () => [],
      settings: { actions: true },
      handlers: { "SearchDisplay.getSearchTasks": () => [] },
    });
    await userEvent.click(await screen.findByRole("checkbox", { name: "Select Ada" }));
    await open();
    await userEvent.type(field(), "s{Enter}");
    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: "Select Ada" })).not.toBeChecked();
    });
    // The display's live region tells of the smaller selection.
    expect(screen.getByText("1 result", { selector: "p.sr-only" })).toBeInTheDocument();
  });

  it("keeps a selection changed while the save that drops a row runs", async () => {
    let answer: (rows: Row[]) => void = () => undefined;
    setup({ value_key: "job_title" }, "Pilot", {
      inlineEdit: () =>
        new Promise<Row[]>((resolve) => {
          answer = resolve;
        }),
      settings: { actions: true },
      handlers: { "SearchDisplay.getSearchTasks": () => [] },
      more: [{ key: 8, columns: [{ val: "Bob" }, { val: "Cook" }], data: { id: 8 } }],
    });
    const bob = () => screen.getByRole("checkbox", { name: "Select Bob" });
    await userEvent.click(await screen.findByRole("checkbox", { name: "Select Ada" }));
    await userEvent.click(bob());
    await open();
    await userEvent.type(field(), "s{Enter}");
    await userEvent.click(bob());
    answer([]);
    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: "Select Ada" })).not.toBeChecked();
    });
    expect(bob()).not.toBeChecked();
  });

  it("announces a row ticked while the save that drops it runs", async () => {
    let answer: (rows: Row[]) => void = () => undefined;
    setup({ value_key: "job_title" }, "Pilot", {
      inlineEdit: () =>
        new Promise<Row[]>((resolve) => {
          answer = resolve;
        }),
      settings: { actions: true },
      handlers: { "SearchDisplay.getSearchTasks": () => [] },
      more: [{ key: 8, columns: [{ val: "Bob" }, { val: "Cook" }], data: { id: 8 } }],
    });
    await open();
    await userEvent.type(field(), "s{Enter}");
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Ada" }));
    expect(
      screen.getByText("1 selected of 2 results", { selector: "p.sr-only" }),
    ).toBeInTheDocument();
    answer([]);
    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: "Select Ada" })).not.toBeChecked();
    });
    expect(screen.getByText("2 results", { selector: "p.sr-only" })).toBeInTheDocument();
  });

  it("leaves a row a save dropped out of a select-all still loading", async () => {
    let ids: (keys: number[]) => void = () => undefined;
    const ada: Row = {
      key: 7,
      columns: [{ val: "Ada" }, { val: "Pilot", edit: true }],
      data: { id: 7 },
    };
    setup({ value_key: "job_title" }, "Pilot", {
      inlineEdit: () => [],
      settings: { actions: true, limit: 1, pager: {} },
      handlers: {
        "SearchDisplay.getSearchTasks": () => [],
        "SearchDisplay.run": (params) => {
          if (params.return === "row_count") return Object.assign([], { count: 3 });
          if (params.return === "id")
            return new Promise<number[]>((resolve) => {
              ids = resolve;
            });
          return Object.assign([ada], {
            editable: { job_title: editInfo({ value_key: "job_title" }) },
          });
        },
      },
    });
    await userEvent.click(await screen.findByRole("checkbox", { name: "Select all" }));
    await open();
    await userEvent.type(field(), "s{Enter}");
    ids([7, 8, 9]);
    await waitFor(() => {
      expect(screen.getAllByText("2 selected of 3 results").length).toBeGreaterThan(0);
    });
    expect(screen.getByRole("checkbox", { name: "Select Ada" })).not.toBeChecked();
  });

  // deviation:next-page-prefetched
  it("loads a page fetched ahead afresh once a save changed the page on show", async () => {
    const { runs } = setup({ value_key: "job_title" }, "Pilot", {
      settings: { limit: 1, pager: {} },
    });
    await userEvent.hover(await screen.findByRole("link", { name: "Next" }));
    await open();
    await userEvent.type(field(), "s{Enter}");
    await screen.findByRole("button", { name: edit("Saved") });
    await userEvent.click(screen.getByRole("link", { name: "Next" }));
    await waitFor(() => {
      expect(runs().filter(({ params }) => params.return === "page:2")).toHaveLength(2);
    });
  });

  it("leaves rows the server marks read-only alone", async () => {
    setup({ value_key: "job_title" }, "Pilot", { cell: { edit: false } });
    expect(await screen.findByRole("cell", { name: "Pilot" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit/ })).not.toBeInTheDocument();
  });

  it("names the row by its first other field with a value, else by its key", () => {
    const settings: DisplaySettings = {
      columns: [
        { type: "field", key: "a" },
        { type: "links" },
        { type: "field", key: "b" },
        { type: "field", key: "c" },
      ],
    };
    const named = (columns: CellData[]) => rowName({ key: 9, columns }, settings, 3);
    expect(named([{ val: "" }, { val: "Link" }, { val: ["x", "y"] }, { val: "self" }])).toBe(
      "x, y",
    );
    expect(named([{ val: null }, {}, {}, { val: "self" }])).toBe("ID 9");
  });

  // deviation:inplace-reference-combobox
  it("edits a contact reference through an autocomplete on its entity", async () => {
    const bob = { id: 2, label: "Bob" };
    const { edits, calls } = setup({ value_key: "employer_id", fk_entity: "Contact" }, 3, {
      shown: "Acme",
      handlers: {
        "Contact.autocomplete": ({ ids }) =>
          Object.assign(ids ? [{ id: 3, label: "Acme" }] : [bob], { countMatched: 1 }),
      },
    });
    await open();
    const input = await screen.findByRole("combobox", { name: "Value, Ada" });
    expect(input).toHaveFocus();
    // The stored id resolves to its label through the same request as a form field's.
    await waitFor(() => {
      expect(input).toHaveValue("Acme");
    });
    await userEvent.type(input, "Bo");
    await screen.findByRole("option", { name: "Bob" });
    // Enter picks the highlighted record; a second Enter saves the cell.
    await userEvent.keyboard("{Enter}");
    expect(input).toHaveValue("Bob");
    expect(edits()).toEqual([]);
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("button", { name: edit("Saved") });
    expect(edits()[0]?.values).toEqual({ employer_id: 2 });
    const lookups = calls.filter(({ call }) => call === "Contact.autocomplete");
    expect(lookups.map(({ params }) => params.fieldName)).toEqual([
      "Contact.employer_id",
      "Contact.employer_id",
    ]);
    expect(lookups[0]?.params.ids).toEqual([3]);
  });

  const reference = () =>
    setup({ value_key: "employer_id", fk_entity: "Contact", nullable: true }, 3, {
      shown: "Acme",
      handlers: {
        "Contact.autocomplete": ({ ids }) =>
          Object.assign(ids ? [{ id: 3, label: "Acme" }] : [{ id: 2, label: "Bob" }], {
            countMatched: 1,
          }),
      },
    });

  // deviation:inplace-reference-combobox
  it("closes an open list on Escape before the editor, then the editor with a value", async () => {
    const { edits } = reference();
    await open();
    const input = await screen.findByRole("combobox", { name: "Value, Ada" });
    await userEvent.type(input, "Bo");
    await screen.findByRole("option", { name: "Bob" });
    await userEvent.keyboard("{Escape}");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(await screen.findByRole("button", { name: edit("Acme") })).toHaveFocus();
    expect(edits()).toHaveLength(0);
  });

  it("clears a reference, the focus back on the input", async () => {
    const { edits } = reference();
    await open();
    const input = await screen.findByRole("combobox", { name: "Value, Ada" });
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
    expect(input).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("button", { name: edit("Saved") });
    expect(edits()[0]?.values).toEqual({ employer_id: null });
  });
});

describe("in-place editors", () => {
  it("edits whole numbers and decimals as numbers", async () => {
    const { edits } = setup({ value_key: "n", data_type: "Integer" }, 4);
    await open();
    expect(field()).toHaveAttribute("type", "number");
    expect(field()).toHaveAttribute("step", "1");
    await userEvent.clear(field());
    await userEvent.type(field(), "12{Enter}");
    expect(edits()[0]?.values).toEqual({ n: 12 });
  });

  it("allows any step for decimals and clears to null", async () => {
    const { edits } = setup({ value_key: "f", data_type: "Float", nullable: false }, 1.5);
    await open();
    expect(field()).toHaveAttribute("step", "any");
    expect(field()).toBeRequired();
    await userEvent.clear(field());
    await userEvent.type(field(), "2.25{Enter}");
    expect(edits()[0]?.values).toEqual({ f: 2.25 });
  });

  it("edits an email address", async () => {
    const { edits } = setup({ value_key: "email", input_type: "Email" }, "a@example.org");
    await open();
    expect(field()).toHaveAttribute("type", "email");
    await userEvent.clear(field());
    await userEvent.type(field(), "b@example.org{Enter}");
    expect(edits()[0]?.values).toEqual({ email: "b@example.org" });
  });

  it("keeps Enter for new lines in a text area", async () => {
    const { edits } = setup({ value_key: "note", input_type: "TextArea" }, "One");
    await open();
    expect(field().tagName).toBe("TEXTAREA");
    await userEvent.type(field(), "{Enter}Two");
    expect(edits()).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(edits()[0]?.values).toEqual({ note: "One\nTwo" });
  });

  it("edits a date and a date with time in the API's format", async () => {
    const { edits } = setup({ value_key: "d", data_type: "Date" }, "2026-01-02");
    await open();
    expect(field()).toHaveAttribute("type", "date");
    await userEvent.clear(field());
    await userEvent.type(field(), "2026-03-04{Enter}");
    expect(edits()[0]?.values).toEqual({ d: "2026-03-04" });
  });

  it("edits a timestamp", async () => {
    const { edits } = setup({ value_key: "t", data_type: "Timestamp" }, "2026-01-02 10:30:00");
    await open();
    expect(field()).toHaveAttribute("type", "datetime-local");
    expect(field()).toHaveValue("2026-01-02T10:30");
    await userEvent.clear(field());
    await userEvent.type(field(), "2026-03-04T08:15{Enter}");
    expect(edits()[0]?.values).toEqual({ t: "2026-03-04 08:15:00" });
  });

  // deviation:inplace-native-inputs
  it("edits a colour by picker or as text", async () => {
    const { edits } = setup({ value_key: "c", input_type: "Color" }, "#112233");
    await open();
    const [picker, typed] = screen.getAllByLabelText("Value, Ada");
    expect(picker).toHaveAttribute("type", "color");
    expect(typed).toHaveValue("#112233");
    if (!typed) throw new Error("no text input");
    await userEvent.clear(typed);
    await userEvent.type(typed, "#445566{Enter}");
    expect(edits()[0]?.values).toEqual({ c: "#445566" });
  });

  it("edits Yes/No with radio buttons", async () => {
    const { edits } = setup({ value_key: "b", data_type: "Boolean" }, false, { shown: "No" });
    await open();
    const group = screen.getByRole("radiogroup", { name: "Value, Ada" });
    expect(within(group).getByRole("radio", { name: "No" })).toHaveFocus();
    await userEvent.click(within(group).getByRole("radio", { name: "Yes" }));
    await userEvent.keyboard("{Enter}");
    expect(edits()[0]?.values).toEqual({ b: true });
  });

  // deviation:inplace-native-inputs
  it("edits an option list with the option's own id type, and clears it", async () => {
    const options = [
      { id: 1, label: "Female" },
      { id: 2, label: "Male" },
    ];
    const { edits } = setup({ value_key: "gender_id", data_type: "Integer", options }, 1, {
      shown: "Female",
    });
    await open();
    expect(field()).toHaveDisplayValue("Female");
    expect(screen.getByRole("option", { name: "None" })).toHaveValue("");
    await userEvent.selectOptions(field(), "Male");
    await userEvent.keyboard("{Enter}");
    expect(edits()[0]?.values).toEqual({ gender_id: 2 });
  });

  // deviation:select-placeholder-text
  it("offers Select… instead of None where the value is required", async () => {
    const { edits } = setup(
      { value_key: "s", options: [{ id: "a", label: "A" }], nullable: false },
      null,
      { shown: "" },
    );
    await open();
    expect(screen.getByRole("option", { name: "Select…" })).toBeInTheDocument();
    expect(field()).toBeRequired();
    await userEvent.selectOptions(field(), "A");
    await userEvent.keyboard("{Enter}");
    expect(edits()[0]?.values).toEqual({ s: "a" });
  });

  it("edits several options", async () => {
    const options = [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ];
    const { edits } = setup({ value_key: "m", options, serialize: true }, ["a"], { shown: "A" });
    await open();
    expect(field()).toHaveAttribute("multiple");
    await userEvent.selectOptions(field(), "B");
    await userEvent.keyboard("{Enter}");
    expect(edits()[0]?.values).toEqual({ m: ["a", "b"] });
  });

  // deviation:inplace-list-chips
  it("edits a list of texts as chips: Enter or a comma adds, Backspace removes", async () => {
    const { edits } = setup({ value_key: "fee_level", serialize: true }, ["Early"], {
      shown: "Early",
    });
    await open();
    expect(field()).toHaveFocus();
    expect(screen.getByRole("button", { name: "Remove Early" })).toBeInTheDocument();
    await userEvent.keyboard("Late{Enter}");
    expect(screen.getByRole("button", { name: "Remove Late" })).toBeInTheDocument();
    expect(field()).toHaveValue("");
    expect(edits()).toHaveLength(0);
    await userEvent.keyboard("Member,{Backspace}");
    expect(screen.queryByRole("button", { name: "Remove Member" })).toBeNull();
    await userEvent.keyboard("{Backspace}");
    expect(screen.queryByRole("button", { name: "Remove Late" })).toBeNull();
    await userEvent.keyboard("Late");
    await userEvent.click(screen.getByRole("button", { name: "Remove Early" }));
    expect(field()).toHaveFocus();
    await userEvent.keyboard("{Enter}{Enter}");
    expect(edits()[0]?.values).toEqual({ fee_level: ["Late"] });
  });

  it("keeps the text typed into a list when Save is clicked", async () => {
    const { edits } = setup({ value_key: "fee_level", serialize: true }, ["Early"], {
      shown: "Early",
    });
    await open();
    await userEvent.keyboard("Late");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(edits()[0]?.values).toEqual({ fee_level: ["Early", "Late"] });
  });

  // deviation:inplace-save-on-leave
  it("saves the text typed into a list when the focus leaves the editor", async () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const { edits } = setup({ value_key: "fee_level", serialize: true }, ["Early"], {
      shown: "Early",
    });
    await open();
    await userEvent.keyboard("Late");
    await userEvent.click(document.body);
    expect(edits()[0]?.values).toEqual({ fee_level: ["Early", "Late"] });
  });

  it("edits a list of numbers, turning away what is no number", async () => {
    const { edits } = setup({ value_key: "n", data_type: "Integer", serialize: true }, [1], {
      shown: "1",
    });
    await open();
    await userEvent.keyboard("x{Enter}");
    expect(field()).toHaveValue("x");
    expect(edits()).toHaveLength(0);
    await userEvent.clear(field());
    await userEvent.keyboard("2,{Enter}");
    expect(edits()[0]?.values).toEqual({ n: [1, 2] });
  });

  it("edits a list of dates one pick at a time, each day once", async () => {
    const { edits } = setup(
      { value_key: "d", data_type: "Date", serialize: true },
      ["2026-01-02"],
      { shown: "2026-01-02" },
    );
    await open();
    expect(field()).toHaveAttribute("type", "date");
    fireEvent.change(field(), { target: { value: "2026-01-02" } });
    fireEvent.change(field(), { target: { value: "2026-03-04" } });
    expect(screen.getAllByRole("button", { name: /^Remove/ })).toHaveLength(2);
    await userEvent.keyboard("{Enter}");
    expect(edits()[0]?.values).toEqual({ d: ["2026-01-02", "2026-03-04"] });
  });

  it("edits a list of Yes/No with checkboxes", async () => {
    const { edits } = setup({ value_key: "b", data_type: "Boolean", serialize: true }, [true], {
      shown: "Yes",
    });
    await open();
    const group = screen.getByRole("group", { name: "Value, Ada" });
    expect(within(group).getByRole("checkbox", { name: "Yes" })).toBeChecked();
    await userEvent.click(within(group).getByRole("checkbox", { name: "No" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(edits()[0]?.values).toEqual({ b: [true, false] });
  });

  it("shows why options that depend on the row did not load", async () => {
    setup({ value_key: "state_province_id", entity: "Address", options: true }, 5, {
      shown: "Berlin",
      handlers: {
        "Address.getFields": () => {
          throw apiError("Access denied");
        },
      },
    });
    await open();
    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent("Access denied");
    expect(error).toHaveClass("alert-danger");
    // Nothing to edit, yet Escape still closes it.
    await userEvent.keyboard("{Escape}");
    expect(await screen.findByRole("button", { name: edit("Berlin") })).toHaveFocus();
  });

  it("closes with Escape while its options load", async () => {
    setup({ value_key: "state_province_id", entity: "Address", options: true }, 5, {
      shown: "Berlin",
      handlers: {
        "Address.getFields": () =>
          new Promise(() => {
            // Never answers.
          }),
      },
    });
    await open();
    expect(await screen.findByRole("button", { name: "Save" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(await screen.findByRole("button", { name: edit("Berlin") })).toHaveFocus();
  });

  it("loads the row's options again on each opening", async () => {
    const { calls } = setup(
      { value_key: "state_province_id", entity: "Address", options: true },
      5,
      {
        shown: "Berlin",
        handlers: { "Address.getFields": () => [{ options: [{ id: 5, label: "Berlin" }] }] },
      },
    );
    for (const loads of [1, 2]) {
      await open();
      await waitFor(() => {
        expect(field()).toHaveDisplayValue("Berlin");
      });
      expect(calls.filter(({ call }) => call === "Address.getFields")).toHaveLength(loads);
      await userEvent.keyboard("{Escape}");
    }
  });

  it("loads options that depend on the row, as loadOptions()", async () => {
    const { calls, edits } = setup(
      { value_key: "state_province_id", entity: "Address", options: true },
      5,
      {
        shown: "Berlin",
        data: { country_id: 9 },
        handlers: {
          "Address.getFields": () => [
            {
              options: [
                { id: 5, label: "Berlin" },
                { id: 6, label: "Hamburg" },
              ],
            },
          ],
        },
      },
    );
    await open();
    await waitFor(() => {
      expect(field()).toHaveDisplayValue("Berlin");
    });
    expect(field()).toHaveFocus();
    expect(calls.find(({ call }) => call === "Address.getFields")?.params).toEqual({
      action: "update",
      select: ["options"],
      values: { id: 7, state_province_id: 5, country_id: 9 },
      loadOptions: ["id", "name", "label", "description", "color", "icon"],
      where: [["name", "=", "state_province_id"]],
    });
    await userEvent.selectOptions(field(), "Hamburg");
    await userEvent.keyboard("{Enter}");
    expect(edits()[0]?.values).toEqual({ state_province_id: 6 });
  });
});
