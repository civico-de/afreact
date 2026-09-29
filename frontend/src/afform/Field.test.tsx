import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Field } from "./Field";
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
  render(<Harness defn={defn} initial={initial} onValue={(value) => values.push(value)} />);
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
    expect(values).toEqual(["a", "ab", null]);
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
    expect(screen.getByRole("group", { name: "Field" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "No" }));
    expect(values).toEqual([false]);
    expect(screen.getByRole("radio", { name: "Yes" })).toBeRequired();
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

  it("shows display-only values and flags unknown input types", () => {
    render(
      <Harness defn={{ input_type: "DisplayOnly" }} initial="Shown" onValue={() => undefined} />,
    );
    expect(screen.getByText("Shown").tagName).toBe("OUTPUT");
    render(<Harness defn={{ input_type: "EntityRef" }} onValue={() => undefined} />);
    expect(screen.getByRole("note")).toHaveTextContent(
      "Not supported by the React renderer: field type EntityRef (Field)",
    );
  });
});
