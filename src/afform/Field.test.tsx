import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { vi } from "vitest";
import { renderWithQuery } from "../test/render";
import { Field, fieldClasses, INPUT_TYPES } from "./Field";
import { FieldEnvContext } from "./fields/env";
import { UploadsContext } from "./fields/upload";
import type { FieldDefn } from "./types";

function Harness({
  defn,
  initial,
  onValue,
}: {
  defn: Partial<FieldDefn>;
  initial?: unknown;
  onValue: (value: unknown) => void;
}) {
  const [value, setValue] = useState<unknown>(initial);
  const full = {
    name: "field",
    label: "Field",
    input_type: "Text",
    data_type: "String",
    ...defn,
  } as FieldDefn;
  return (
    <Field
      defn={full}
      value={value}
      disabled={false}
      onChange={(next) => {
        setValue(next);
        onValue(next);
      }}
    />
  );
}

function setup(defn: Partial<FieldDefn>, initial?: unknown) {
  const values: unknown[] = [];
  render(
    <Harness
      defn={defn}
      initial={initial}
      onValue={(value) => {
        values.push(value);
      }}
    />,
  );
  return values;
}

describe("Field", () => {
  it("labels a required text input and links its help text", async () => {
    const values = setup({ required: true, help_post: "Visible to members" });
    const input = screen.getByRole("textbox", { name: "Field" });
    expect(input).toBeRequired();
    expect(input).toHaveAccessibleDescription("Visible to members");
    await userEvent.type(input, "ab");
    await userEvent.clear(input);
    // ngModel sets no value while required fails.
    expect(values).toEqual(["a", "ab", undefined]);
  });

  it("empties an optional text input to an empty string, as ngModel", async () => {
    const text = setup({});
    await userEvent.type(screen.getByRole("textbox", { name: "Field" }), "a");
    await userEvent.clear(screen.getByRole("textbox", { name: "Field" }));
    expect(text).toEqual(["a", ""]);
  });

  it("trims typed text as ngModel and keeps the raw text in the control", async () => {
    const values = setup({});
    const input = screen.getByRole("textbox", { name: "Field" });
    await userEvent.type(input, " John Smith ");
    expect(input).toHaveValue(" John Smith ");
    expect(values).toEqual([
      "",
      "J",
      "Jo",
      "Joh",
      "John",
      "John",
      "John S",
      "John Sm",
      "John Smi",
      "John Smit",
      "John Smith",
      "John Smith",
    ]);
  });

  it("trims a text area and empties it when it holds only spaces", async () => {
    const values = setup({ input_type: "TextArea" });
    const area = screen.getByRole("textbox", { name: "Field" });
    await userEvent.type(area, " a\nb ");
    expect(area).toHaveValue(" a\nb ");
    expect(values.at(-1)).toBe("a\nb");
    await userEvent.clear(area);
    await userEvent.type(area, "  ");
    expect(values.at(-1)).toBe("");
  });

  // deviation:blank-required-validity
  it("leaves a required field holding only spaces invalid and its value unset", async () => {
    const values = setup({ required: true });
    const input = screen.getByRole("textbox", { name: "Field" });
    await userEvent.type(input, "  ");
    expect(values).toEqual([undefined, undefined]);
    expect(input).toBeInvalid();
    await userEvent.type(input, "a");
    expect(input).toBeValid();
    expect(values.at(-1)).toBe("a");
  });

  it("shows a value set from outside, such as a reset or a prefill", async () => {
    function Form() {
      const [value, setValue] = useState<unknown>("");
      return (
        <>
          <Field
            defn={{ name: "f", label: "Field", input_type: "Text", data_type: "String" }}
            value={value}
            disabled={false}
            onChange={setValue}
          />
          <button
            type="button"
            onClick={() => {
              setValue("");
            }}
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => {
              setValue("Bob");
            }}
          >
            Prefill
          </button>
        </>
      );
    }
    render(<Form />);
    const input = screen.getByRole("textbox", { name: "Field" });
    await userEvent.type(input, "Ada ");
    expect(input).toHaveValue("Ada ");
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(input).toHaveValue("");
    await userEvent.type(input, "  ");
    await userEvent.click(screen.getByRole("button", { name: "Prefill" }));
    expect(input).toHaveValue("Bob");
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(input).toHaveValue("");
  });

  it("empties an optional number input to null, as ngModel", async () => {
    const number = setup({ input_type: "Number", data_type: "Integer" });
    await userEvent.type(screen.getByRole("spinbutton", { name: "Field" }), "4");
    await userEvent.clear(screen.getByRole("spinbutton", { name: "Field" }));
    expect(number).toEqual([4, null]);
  });

  // deviation:invalid-input-kept
  it("keeps a typed number above max in the data, where ngModel holds undefined", async () => {
    const number = setup({ input_type: "Number", data_type: "Integer", input_attrs: { max: 5 } });
    const input = screen.getByRole<HTMLInputElement>("spinbutton", { name: "Field" });
    await userEvent.type(input, "12");
    expect(input.validity.rangeOverflow).toBe(true);
    expect(number).toEqual([1, 12]);
  });

  // deviation:number-bound-zero
  it("keeps a number's bounds, a minimum of 0 included, and flags a value outside them", async () => {
    const number = setup({
      input_type: "Number",
      data_type: "Float",
      input_style: "short",
      input_attrs: { min: 0, max: 10, step: 0.5, placeholder: "Hours" },
    });
    const input = screen.getByRole<HTMLInputElement>("spinbutton", { name: "Field" });
    expect(input).toHaveAttribute("min", "0");
    expect(input).toHaveAttribute("max", "10");
    expect(input).toHaveAttribute("step", "0.5");
    expect(input).toHaveAttribute("placeholder", "Hours");
    expect(input).toHaveClass("form-control", "short");
    await userEvent.type(input, "-1.5");
    expect(number.at(-1)).toBe(-1.5);
    expect(input.validity.rangeUnderflow).toBe(true);
  });

  it("keeps numeric option IDs in selects", async () => {
    const values = setup({
      input_type: "Select",
      data_type: "Integer",
      options: [
        { id: 1, label: "Female" },
        { id: 2, label: "Male" },
      ],
      input_attrs: { placeholder: "- select -" },
    });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Field" }), "Male");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Field" }), "- select -");
    expect(values).toEqual([2, null]);
  });

  // deviation:boolean-select-cleared-null
  it("empties a Yes/No select to null, not No", async () => {
    const values = setup(
      { input_type: "Select", data_type: "Boolean", input_attrs: { placeholder: "- select -" } },
      true,
    );
    const select = screen.getByRole("combobox", { name: "Field" });
    await userEvent.selectOptions(select, "No");
    await userEvent.selectOptions(select, "- select -");
    expect(values).toEqual([false, null]);
  });

  // deviation:url-input-disabled
  it("disables a URL input like every other input", () => {
    const url = { name: "website", label: "Website", input_type: "Url", data_type: "String" };
    render(<Field defn={url} value="https://example.org" disabled onChange={() => undefined} />);
    expect(screen.getByRole("textbox", { name: "Website" })).toBeDisabled();
  });

  it("returns the typed IDs of a multi-select", async () => {
    const values = setup(
      {
        input_type: "Select",
        options: [
          { id: 1, label: "A" },
          { id: 2, label: "B" },
        ],
        input_attrs: { multiple: true },
      },
      [1],
    );
    await userEvent.selectOptions(screen.getByRole("listbox", { name: "Field" }), "B");
    expect(values).toEqual([[1, 2]]);
  });

  // deviation:native-select-fields
  it("names selects without a label by their placeholder, else Select.html's title", () => {
    const options = [{ id: 1, label: "A" }];
    setup({ input_type: "Select", label: false, options });
    setup({ input_type: "Select", label: false, options, input_attrs: { multiple: true } });
    const placeholder = { multiple: true, placeholder: "Filter by type" };
    setup({ input_type: "Select", label: false, options, input_attrs: placeholder });
    setup({ input_type: "Select", options });
    // A name of its own, not the title alone (axe label-title-only).
    expect(screen.getByRole("combobox", { name: "Select Value" })).toHaveAttribute("aria-label");
    expect(screen.getByRole("listbox", { name: "Select Values" })).toHaveAttribute("aria-label");
    expect(screen.getByRole("listbox", { name: "Filter by type" })).toHaveAttribute(
      "title",
      "Select Values",
    );
    expect(screen.getByRole("combobox", { name: "Field" })).not.toHaveAttribute("aria-label");
  });

  it("offers Yes/No as real booleans for Boolean radios", async () => {
    const values = setup({ input_type: "Radio", data_type: "Boolean", required: true });
    expect(screen.getByRole("radiogroup", { name: "Field" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "No" }));
    expect(values).toEqual([false]);
    expect(screen.getByRole("radio", { name: "Yes" })).toBeRequired();
  });

  // deviation:radio-group-named
  it("groups a field's radios under the field's label and help", () => {
    setup({
      input_type: "Radio",
      help_post: "Pick one",
      options: [
        { id: 1, label: "A" },
        { id: 2, label: "B" },
      ],
    });
    const group = screen.getByRole("radiogroup", { name: "Field" });
    expect(group).toHaveAccessibleDescription("Pick one");
    expect(within(group).getAllByRole("radio")).toHaveLength(2);
  });

  // deviation:clear-link-button
  it("clears an optional radio from the keyboard", async () => {
    const values = setup(
      {
        input_type: "Radio",
        options: [
          { id: 1, label: "A" },
          { id: 2, label: "B" },
        ],
      },
      2,
    );
    screen.getByRole("button", { name: "Clear" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(values).toEqual([null]);
    expect(screen.getByRole("radio", { name: "B" })).not.toBeChecked();
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });

  it("offers no clearing for a required radio", () => {
    setup({ input_type: "Radio", data_type: "Boolean", required: true }, false);
    expect(screen.getByRole("radio", { name: "No" })).toBeChecked();
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });

  it("clears a date and hides the clear link while it is empty", async () => {
    const values = setup({ input_type: "Date", data_type: "Date" }, "2026-09-29");
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    // crmDatepicker writes "" into the model on clearing.
    expect(values).toEqual([""]);
    expect(screen.getByLabelText("Field")).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });

  // deviation:textarea-count-describes
  it("counts the characters of a text area with a maximum and describes the field by the count", async () => {
    setup(
      { input_type: "TextArea", input_attrs: { maxlength: 10 }, help_post: "Short" },
      "abcdefg",
    );
    const area = screen.getByRole("textbox", { name: "Field" });
    expect(area).toHaveAccessibleDescription("Short 7 / 10");
    const count = screen.getByText("7 / 10");
    expect(count).toHaveClass("af-character-count", "text-success");
    expect(count).toHaveAttribute("title", "Max characters allowed: 10");
    expect(count).not.toHaveAttribute("role");
    expect(count).not.toHaveAttribute("aria-live");
    await userEvent.type(area, "h");
    expect(count).toHaveTextContent("8 / 10");
    expect(count).toHaveClass("text-warning");
    // As core, a class changes only above 70 % and above 90 %.
    await userEvent.type(area, "i");
    expect(count).toHaveClass("text-warning");
    await userEvent.type(area, "j");
    expect(count).toHaveClass("text-danger");
    await userEvent.type(area, "kl");
    expect(count).toHaveTextContent("10 / 10");
  });

  it("shows no count on a text area without a maximum", () => {
    setup({ input_type: "TextArea" }, "abc");
    expect(screen.queryByText(/\/ /)).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Field" })).not.toHaveAttribute("aria-describedby");
  });

  it("requires each box of a required checkbox list until one is checked", async () => {
    const values = setup({
      input_type: "CheckBox",
      required: true,
      options: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
    });
    const boxes = screen.getAllByRole("checkbox");
    for (const box of boxes) expect(box).toBeRequired();
    await userEvent.click(screen.getByRole("checkbox", { name: "B" }));
    expect(values).toEqual([["b"]]);
    for (const box of boxes) expect(box).not.toBeRequired();
    await userEvent.click(screen.getByRole("checkbox", { name: "B" }));
    for (const box of boxes) expect(box).toBeRequired();
  });

  it("offers no clearing for a required date or date and time", () => {
    setup({ input_type: "Date", data_type: "Date", required: true }, "2026-09-29");
    setup(
      { input_type: "Date", data_type: "Timestamp", required: true, input_attrs: { time: true } },
      "2026-09-29 10:00:00",
    );
    expect(screen.getAllByLabelText(/^Field/)).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Clear", hidden: true })).not.toBeInTheDocument();
  });

  it("toggles values in a checkbox list", async () => {
    const values = setup(
      {
        input_type: "CheckBox",
        options: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
      },
      ["a"],
    );
    await userEvent.click(screen.getByRole("checkbox", { name: "B" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "A" }));
    expect(values).toEqual([["a", "b"], ["b"]]);
  });

  it("unchecks a stored value whose type differs from the option ID", async () => {
    const values = setup({ input_type: "CheckBox", options: [{ id: 1, label: "A" }] }, ["1"]);
    await userEvent.click(screen.getByRole("checkbox", { name: "A" }));
    expect(values).toEqual([[]]);
  });

  it("renders a single Boolean checkbox", async () => {
    const values = setup({ input_type: "CheckBox", data_type: "Boolean" }, "1");
    const box = screen.getByRole("checkbox", { name: "Field" });
    expect(box).toBeChecked();
    await userEvent.click(box);
    expect(values).toEqual([false]);
  });

  it("converts between API datetimes and datetime-local", async () => {
    const values = setup(
      { input_type: "Date", input_attrs: { time: true } },
      "2026-09-29 14:30:00",
    );
    const input = screen.getByLabelText("Field");
    expect(input).toHaveValue("2026-09-29T14:30");
    await userEvent.clear(input);
    expect(values).toEqual([""]);
  });

  // deviation:native-date-inputs
  it("shows the year of a year-only date and stores January 1st", async () => {
    const values = setup({ input_type: "Date", input_attrs: { date: "yy" } }, "1990-05-17");
    const input = screen.getByRole("spinbutton", { name: "Field" });
    expect(input).toHaveValue(1990);
    // No year limit, as for the date input.
    expect(input).not.toHaveAttribute("min");
    await userEvent.clear(input);
    await userEvent.type(input, "2001");
    expect(values).toEqual(["", "2001-01-01"]);
    expect(input).toHaveValue(2001);
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(values.at(-1)).toBe("");
    expect(input).toHaveValue(null);
  });

  // deviation:month-date-any-format
  it.each(["yy-mm", "M yy"])("stores the 1st of the month for format %s", (date) => {
    const values = setup({ input_type: "Date", input_attrs: { date } }, "1990-05-17");
    const input = screen.getByLabelText("Field");
    expect(input).toHaveAttribute("type", "month");
    expect(input).toHaveValue("1990-05");
    fireEvent.change(input, { target: { value: "2001-03" } });
    expect(values).toEqual(["2001-03-01"]);
    expect(input).toHaveValue("2001-03");
  });

  // deviation:native-date-inputs
  it("keeps a full date input for a format with a day", () => {
    setup({ input_type: "Date", input_attrs: { date: "dd.mm.yy" } }, "1990-05-17");
    const input = screen.getByLabelText("Field");
    expect(input).toHaveAttribute("type", "date");
    expect(input).toHaveValue("1990-05-17");
  });

  it("sends dates and numbers in API form", async () => {
    render(
      <Harness
        defn={{ name: "d", input_type: "Date" }}
        initial="2026-01-02"
        onValue={() => undefined}
      />,
    );
    expect(screen.getByLabelText("Field")).toHaveValue("2026-01-02");
    const values = setup({ name: "n", label: "Count", input_type: "Number" });
    await userEvent.type(screen.getByRole("spinbutton", { name: "Count" }), "7");
    expect(values).toEqual([7]);
  });

  it("shows a list value comma-joined and refuses an object value", () => {
    render(
      <Harness defn={{ input_type: "DisplayOnly" }} initial={[1, 2]} onValue={() => undefined} />,
    );
    expect(screen.getByText("1,2").tagName).toBe("OUTPUT");
    // React logs the render error before rethrowing it.
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() =>
      render(
        <Harness defn={{ input_type: "Text" }} initial={{ a: 1 }} onValue={() => undefined} />,
      ),
    ).toThrow("A field value must be a scalar or a list, got object");
    quiet.mockRestore();
  });

  it("shows display-only values and flags unknown input types", () => {
    render(
      <Harness defn={{ input_type: "DisplayOnly" }} initial="Shown" onValue={() => undefined} />,
    );
    expect(screen.getByText("Shown").tagName).toBe("OUTPUT");
    render(<Harness defn={{ input_type: "Signature" }} onValue={() => undefined} />);
    expect(screen.getByRole("note")).toHaveTextContent(
      "Not supported by the React renderer: field type Signature (Field)",
    );
  });

  it("adds the multiple class only for fields afField treats as multi-value inputs", () => {
    const defn = (extra: Partial<FieldDefn> & Pick<FieldDefn, "input_type">): FieldDefn => ({
      name: "f",
      label: "F",
      data_type: "String",
      ...extra,
    });
    expect(fieldClasses(defn({ input_type: "ChainSelect" }))).toBe("af-field-type-chain-select");
    expect(fieldClasses(defn({ input_type: "Select", input_attrs: { multiple: true } }))).toBe(
      "af-field-type-select af-field-type-multiple",
    );
    expect(fieldClasses(defn({ input_type: "CheckBox" }))).toBe("af-field-type-check-box");
  });

  it("renders a control for every input type the support report accepts, and a note otherwise", () => {
    const options = [{ id: 1, label: "One" }];
    const env = {
      formName: "f",
      modelName: "Individual1",
      fieldName: "field",
      values: {},
      entityIndex: 0,
    };
    for (const input_type of INPUT_TYPES) {
      const { unmount } = renderWithQuery(
        <UploadsContext.Provider
          value={{ pending: new Map(), restored: new Map(), retry: null, changed: () => undefined }}
        >
          <FieldEnvContext.Provider value={env}>
            <Harness
              defn={{ input_type, options, fk_entity: "Contact" }}
              onValue={() => undefined}
            />
          </FieldEnvContext.Provider>
        </UploadsContext.Provider>,
      );
      expect(screen.queryByRole("note"), input_type).toBeNull();
      unmount();
    }
    render(<Harness defn={{ input_type: "Signature" }} onValue={() => undefined} />);
    expect(screen.getByRole("note")).toHaveTextContent("field type Signature (Field)");
  });
});
