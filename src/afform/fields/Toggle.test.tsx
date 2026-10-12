import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { mockApi, renderWithQuery } from "../../test/render";
import { AfreactForm } from "../AfreactForm";
import { Field } from "../Field";
import { layoutProblems } from "../support";
import type { FieldDefn, LayoutNode } from "../types";

const toggle = (defn: Partial<FieldDefn> = {}): FieldDefn => ({
  name: "is_archived",
  label: "Archived",
  input_type: "Toggle",
  data_type: "Boolean",
  ...defn,
});

function setup(defn: FieldDefn, initial?: unknown, disabled = false) {
  const values: unknown[] = [];
  function Harness() {
    const [value, setValue] = useState<unknown>(initial);
    return (
      <Field
        defn={defn}
        value={value}
        disabled={disabled}
        onChange={(next) => {
          values.push(next);
          setValue(next);
        }}
      />
    );
  }
  const view = render(<Harness />);
  return { values, container: view.container };
}

describe("Toggle", () => {
  // deviation:toggle-switch-role
  it("is a labelled switch in Toggle.html's markup with Yes and No after it", () => {
    const { container } = setup(toggle({ help_post: "Hidden from lists" }));
    const control = screen.getByRole("switch", { name: "Archived" });
    expect(control).not.toBeChecked();
    expect(control).toHaveClass("crm-form-toggle");
    expect(control).toHaveAccessibleDescription("Hidden from lists");
    expect(control.parentElement).toHaveClass("crm-form-toggle-container");
    expect(container.querySelector(".crm-form-toggle-text-on")).toHaveTextContent("Yes");
    expect(container.querySelector(".crm-form-toggle-text-off")).toHaveTextContent("No");
  });

  it("sets true and then false, as the checkbox's ngModel does", async () => {
    const { values } = setup(toggle());
    const control = screen.getByRole("switch", { name: "Archived" });
    await userEvent.click(control);
    expect(control).toBeChecked();
    await userEvent.keyboard(" ");
    expect(control).not.toBeChecked();
    expect(values).toEqual([true, false]);
  });

  it("shows a stored 1 as on, and the field's own option labels", () => {
    const { container } = setup(
      toggle({
        options: [
          { id: 1, label: "Archived" },
          { id: 0, label: "Current" },
        ],
      }),
      "1",
    );
    expect(screen.getByRole("switch")).toBeChecked();
    expect(container.querySelector(".crm-form-toggle-text-off")).toHaveTextContent("Current");
  });

  it("is required and disabled as the field says", () => {
    setup(toggle({ required: true, input_style: "big" }), undefined, true);
    const control = screen.getByRole("switch", { name: /Archived/ });
    expect(control).toBeRequired();
    expect(control).toBeDisabled();
    expect(control.parentElement).toHaveClass("crm-form-toggle-container", "big");
  });

  it("is supported in the report", () => {
    const layout = (defn: FieldDefn): LayoutNode[] => [
      { "#tag": "div", "af-fieldset": "", "#children": [{ "#tag": "af-field", name: "f", defn }] },
    ];
    expect(layoutProblems(layout(toggle()))).toEqual([]);
  });

  it("filters a search once switched, on and then off", async () => {
    const layout: LayoutNode[] = [
      {
        "#tag": "div",
        "af-fieldset": "",
        "#children": [
          { "#tag": "af-field", name: "is_archived", defn: toggle() },
          {
            "#tag": "crm-search-display-table",
            "search-name": "Mailings",
            "display-name": "Table",
            settings: { columns: [{ type: "field", key: "name", label: "Name" }] },
          },
        ],
      },
    ];
    const calls = mockApi({
      "Afreact.getForm": () => [{ name: "afsearchM", type: "search", layout, strings: [] }],
      "SearchDisplay.run": () => [{ key: 1, columns: [{ val: "Row" }] }],
    });
    renderWithQuery(<AfreactForm name="afsearchM" location={{ search: "", hash: "" }} />);
    await screen.findByRole("cell", { name: "Row" });
    const runs = () =>
      calls.filter(({ call }) => call === "SearchDisplay.run").map(({ params }) => params.filters);
    await userEvent.click(screen.getByRole("switch", { name: "Archived" }));
    await waitFor(() => {
      expect(runs()).toEqual([{}, { is_archived: true }]);
    });
    await userEvent.click(screen.getByRole("switch", { name: "Archived" }));
    await waitFor(() => {
      expect(runs()).toEqual([{}, { is_archived: true }, { is_archived: false }]);
    });
  });
});
