import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { renderWithQuery } from "../test/render";
import { Field, fieldClasses, INPUT_TYPES } from "./Field";
import { FieldEnvContext } from "./fields/env";
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

  it("empties an optional number input to null, as ngModel", async () => {
    const number = setup({ input_type: "Number", data_type: "Integer" });
    await userEvent.type(screen.getByRole("spinbutton", { name: "Field" }), "4");
    await userEvent.clear(screen.getByRole("spinbutton", { name: "Field" }));
    expect(number).toEqual([4, null]);
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

  it("offers Yes/No as real booleans for Boolean radios", async () => {
    const values = setup({ input_type: "Radio", data_type: "Boolean", required: true });
    expect(screen.getByRole("radiogroup", { name: "Field" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "No" }));
    expect(values).toEqual([false]);
    expect(screen.getByRole("radio", { name: "Yes" })).toBeRequired();
  });

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
    expect(values).toEqual([null]);
    expect(screen.getByLabelText("Field")).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
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
    expect(values).toEqual([null]);
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
    render(<Harness defn={{ input_type: "RichTextEditor" }} onValue={() => undefined} />);
    expect(screen.getByRole("note")).toHaveTextContent(
      "Not supported by the React renderer: field type RichTextEditor (Field)",
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
    const env = { formName: "f", modelName: "Individual1", fieldName: "field", values: {} };
    for (const input_type of INPUT_TYPES) {
      const { unmount } = renderWithQuery(
        <FieldEnvContext.Provider value={env}>
          <Harness defn={{ input_type, options, fk_entity: "Contact" }} onValue={() => undefined} />
        </FieldEnvContext.Provider>,
      );
      expect(screen.queryByRole("note"), input_type).toBeNull();
      unmount();
    }
    render(<Harness defn={{ input_type: "File" }} onValue={() => undefined} />);
    expect(screen.getByRole("note")).toHaveTextContent("field type File (Field)");
  });
});
