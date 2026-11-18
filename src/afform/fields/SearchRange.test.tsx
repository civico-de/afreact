import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SEARCH_DELAY_MS } from "../../search/filters";
import { mockApi, renderWithQuery } from "../../test/render";
import { fakeTimeouts, passTime } from "../../test/timers";
import { memoryStore } from "../../url/hash";
import { AfreactForm } from "../AfreactForm";
import type { FieldDefn, LayoutNode } from "../types";

const field = (name: string, defn: Partial<FieldDefn>): LayoutNode => ({
  "#tag": "af-field",
  name,
  defn: { name, label: name, input_type: "Text", data_type: "String", search_range: true, ...defn },
});

function renderSearch(fields: LayoutNode[], hash = "") {
  const layout: LayoutNode[] = [
    {
      "#tag": "div",
      "af-fieldset": "",
      "#children": [
        ...fields,
        {
          "#tag": "crm-search-display-table",
          "search-name": "Contacts",
          "display-name": "Table",
          settings: {
            columns: [{ type: "field", key: "id", label: "ID" }],
            limit: 5,
            pager: false,
          },
        },
      ],
    },
  ];
  const calls = mockApi({
    "Afreact.getForm": () => [
      { name: "afsearchTest", title: "T", type: "search", layout, strings: [] },
    ],
    "SearchDisplay.run": () => [{ key: 1, columns: [{ val: "Row" }] }],
  });
  const store = memoryStore(hash);
  renderWithQuery(<AfreactForm name="afsearchTest" location={{ search: "", hash }} />, store);
  const runs = () =>
    calls.filter(({ call }) => call === "SearchDisplay.run").map(({ params }) => params.filters);
  /** The filters of the search that starts once typing pauses. */
  const lastRun = () => {
    passTime(SEARCH_DELAY_MS);
    return runs().at(-1);
  };
  return { runs, lastRun, store };
}

/** Sets an input's value at once, without userEvent's waits. */
function enter(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

/** Picks the option with this label, as userEvent.selectOptions does. */
function choose(select: HTMLElement, label: string) {
  const { value } = within(select).getByRole<HTMLOptionElement>("option", { name: label });
  fireEvent.change(select, { target: { value } });
}

describe("search ranges", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("searches a number range with both bounds as numbers, in a group named by the label", async () => {
    const { runs, lastRun } = renderSearch([
      field("count", {
        label: "Count",
        input_type: "Number",
        data_type: "Integer",
        input_attrs: { step: 5, min: 0, placeholder: "Low", placeholder2: "High" },
      }),
    ]);
    await screen.findByRole("cell", { name: "Row" });
    expect(runs()).toEqual([{}]);
    const group = screen.getByRole("group", { name: "Count" });
    const low = within(group).getByRole("spinbutton", { name: "Count from" });
    const high = within(group).getByRole("spinbutton", { name: "Count to" });
    expect(low).toHaveAttribute("step", "5");
    expect(low).toHaveAttribute("min", "0");
    expect(low).toHaveAttribute("placeholder", "Low");
    expect(high).toHaveAttribute("placeholder", "High");
    // The label points at the low input.
    await userEvent.click(screen.getByText("Count"));
    expect(low).toHaveFocus();
    fakeTimeouts();
    enter(low, "5");
    enter(high, "10");
    expect(lastRun()).toEqual({ count: { ">=": 5, "<=": 10 } });
    enter(high, "");
    expect(lastRun()).toEqual({ count: { ">=": 5 } });
  });

  it("keeps the operator out of a range and searches text bounds as typed", async () => {
    const { lastRun } = renderSearch([
      field("postal_code", { label: "Postal code", search_operator: "CONTAINS" }),
    ]);
    await screen.findByRole("cell", { name: "Row" });
    fakeTimeouts();
    enter(screen.getByRole("textbox", { name: "Postal code from" }), "10115");
    enter(screen.getByRole("textbox", { name: "Postal code to" }), "10999");
    expect(lastRun()).toEqual({ postal_code: { ">=": "10115", "<=": "10999" } });
  });

  // deviation:range-bounds-labelled
  it("fills a date range from the URL and clears one bound", async () => {
    const { runs, lastRun } = renderSearch(
      [
        field("created_date", {
          label: "Created",
          input_type: "Date",
          data_type: "Timestamp",
          input_attrs: { time: false },
        }),
      ],
      `#?created_date=${encodeURIComponent('{">=":"2026-01-01","<=":"2026-01-31"}')}`,
    );
    await screen.findByRole("cell", { name: "Row" });
    expect(runs()).toEqual([{ created_date: { ">=": "2026-01-01", "<=": "2026-01-31" } }]);
    expect(screen.getByLabelText("Created from")).toHaveValue("2026-01-01");
    const [, clearHigh] = screen.getAllByRole("button", { name: "Clear" });
    fakeTimeouts();
    fireEvent.click(clearHigh ?? document.body);
    expect(screen.getByLabelText("Created to")).toHaveValue("");
    expect(lastRun()).toEqual({ created_date: { ">=": "2026-01-01" } });
  });

  // deviation:date-time-by-type
  it.each([{ time: true }, {}])(
    "writes date and time bounds of a timestamp with time settings %o as the datepicker does",
    async (attrs) => {
      const { lastRun } = renderSearch([
        field("start", {
          label: "Start",
          input_type: "Date",
          data_type: "Timestamp",
          input_attrs: attrs,
        }),
      ]);
      await screen.findByRole("cell", { name: "Row" });
      const low = screen.getByLabelText("Start from");
      expect(low).toHaveAttribute("type", "datetime-local");
      fakeTimeouts();
      enter(low, "2026-02-03T04:05");
      expect(lastRun()).toEqual({ start: { ">=": "2026-02-03 04:05:00" } });
    },
  );

  it("shows both bounds of a date field without time as date inputs", async () => {
    const { lastRun } = renderSearch([
      field("birth_date", {
        label: "Birth date",
        input_type: "Date",
        data_type: "Date",
        input_attrs: { time: false },
      }),
    ]);
    await screen.findByRole("cell", { name: "Row" });
    const low = screen.getByLabelText("Birth date from");
    expect(low).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("Birth date to")).toHaveAttribute("type", "date");
    fakeTimeouts();
    enter(low, "1990-05-17");
    expect(lastRun()).toEqual({ birth_date: { ">=": "1990-05-17" } });
  });

  it("marks a required range as Date.html and Select.html do: the low date, both selects", async () => {
    renderSearch([
      field("birth_date", {
        label: "Birth date",
        input_type: "Date",
        data_type: "Date",
        required: true,
      }),
      field("priority", {
        label: "Priority",
        input_type: "Select",
        data_type: "Integer",
        required: true,
        options: [{ id: 1, label: "Low" }],
      }),
    ]);
    await screen.findByRole("cell", { name: "Row" });
    expect(screen.getByLabelText("Birth date from")).toBeRequired();
    expect(screen.getByLabelText("Birth date to")).not.toBeRequired();
    expect(screen.getByRole("combobox", { name: "Priority from" })).toBeRequired();
    expect(screen.getByRole("combobox", { name: "Priority to" })).toBeRequired();
  });

  // deviation:search-range-typed-ids
  it("searches a select range with typed option ids", async () => {
    const { lastRun } = renderSearch([
      field("priority", {
        label: "Priority",
        input_type: "Select",
        data_type: "Integer",
        input_attrs: { placeholder: "Select" },
        options: [
          { id: 1, label: "Low" },
          { id: 2, label: "Medium" },
          { id: 3, label: "High" },
        ],
      }),
    ]);
    await screen.findByRole("cell", { name: "Row" });
    const high = screen.getByRole("combobox", { name: "Priority to" });
    expect(within(high).getAllByRole("option")[0]).toHaveTextContent("Select");
    fakeTimeouts();
    choose(screen.getByRole("combobox", { name: "Priority from" }), "Medium");
    choose(high, "High");
    expect(lastRun()).toEqual({ priority: { ">=": 2, "<=": 3 } });
    choose(high, "Select");
    expect(lastRun()).toEqual({ priority: { ">=": 2 } });
  });

  it("offers relative dates and a chosen pair of dates for a date shown as a select", async () => {
    const { runs, lastRun, store } = renderSearch([
      field("created_date", {
        label: "Created",
        input_type: "Select",
        data_type: "Timestamp",
        input_attrs: { time: false },
        is_date: 1,
        afform_default: "this.month",
        options: [
          { id: "{}", label: "Choose Date Range" },
          { id: "this.month", label: "This month" },
          { id: "previous.year", label: "Last year" },
        ],
      }),
    ]);
    await screen.findByRole("cell", { name: "Row" });
    expect(runs()).toEqual([{ created_date: "this.month" }]);
    const select = screen.getByRole("combobox", { name: "Created" });
    expect(screen.queryByLabelText("Created from")).not.toBeInTheDocument();
    fakeTimeouts();
    choose(select, "Last year");
    expect(lastRun()).toEqual({ created_date: "previous.year" });
    expect(store.params().get("created_date")).toBe("previous.year");
    choose(select, "Choose Date Range");
    const group = screen.getByRole("group", { name: "Created" });
    enter(within(group).getByLabelText("Created from"), "2025-03-01");
    expect(lastRun()).toEqual({ created_date: { ">=": "2025-03-01" } });
    // Choosing the range again keeps the dates.
    choose(select, "Choose Date Range");
    expect(within(group).getByLabelText("Created from")).toHaveValue("2025-03-01");
  });

  it("starts a date select on its date pair when the default is the range choice", async () => {
    renderSearch([
      field("created_date", {
        label: "Created",
        input_type: "Select",
        data_type: "Date",
        is_date: 1,
        afform_default: "{}",
        options: [{ id: "{}", label: "Choose Date Range" }],
      }),
    ]);
    await screen.findByRole("cell", { name: "Row" });
    expect(screen.getByRole("combobox", { name: "Created" })).toHaveValue("{}");
    expect(screen.getByLabelText("Created to")).toHaveValue("");
  });

  it("names a date select without a label by its placeholder, else Select.html's title", async () => {
    const date = (name: string, placeholder?: string) =>
      field(name, {
        label: false,
        input_type: "Select",
        data_type: "Timestamp",
        is_date: 1,
        input_attrs: placeholder ? { placeholder } : {},
        options: [{ id: "this.day", label: "Today" }],
      });
    renderSearch([date("activity_date_time", "Date"), date("created_date")]);
    await screen.findByRole("cell", { name: "Row" });
    expect(screen.getByRole("combobox", { name: "Date" })).toHaveAttribute("title", "Select Value");
    expect(screen.getByRole("combobox", { name: "Select Value" })).toHaveAttribute("aria-label");
  });
});
