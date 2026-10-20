import { fireEvent, render, screen } from "@testing-library/react";
import type { EditorMeta } from "../meta";
import { META } from "../testMeta";
import { InputPreview } from "./FieldInputs";
import { fieldApi as probe } from "./testField";
import type { BaseDefn } from "./fieldModel";
import type { FieldApi } from "./Field";

const meta: EditorMeta = {
  ...META,
  gui: {
    ...META.gui,
    inputTypes: [
      { name: "Date", label: "Date", admin_template: "~/afGuiEditor/inputType/Date.html" },
      { name: "Range", label: "Slider", admin_template: "~/afGuiEditor/inputType/Range.html" },
    ],
  },
};

const fieldApi = (base: BaseDefn, local: FieldApi["state"]["local"]) =>
  probe(base, local, { meta });

describe("InputPreview", () => {
  // deviation:date-range-separator-once
  it("puts the separator of a date range between its two inputs only", () => {
    const { container } = render(
      <InputPreview
        api={fieldApi(
          { name: "birth_date", label: "Birth Date", input_type: "Date", input_attrs: {} },
          { search_range: true },
        )}
      />,
    );
    const separators = container.querySelectorAll(".af-field-range-sep");
    expect(separators).toHaveLength(1);
    const groups = container.querySelectorAll(".form-group");
    expect(groups).toHaveLength(2);
    expect(groups[0]?.querySelector(".af-field-range-sep")).toBeNull();
  });

  it("takes a placeholder trimmed while it shows what was typed, as core's ngModel does", () => {
    const api = fieldApi(
      { name: "birth_date", label: "Birth Date", input_type: "Date", input_attrs: {} },
      {},
    );
    render(<InputPreview api={api} />);
    const input = screen.getAllByRole("textbox", { name: "Placeholder text" })[0];
    fireEvent.change(input!, { target: { value: " From " } });
    expect(api.set).toHaveBeenLastCalledWith("input_attrs.placeholder", "From");
    expect(input).toHaveValue(" From ");
  });

  // deviation:slider-defaults-not-written
  it("shows a slider without bounds from 0 to 99 without writing them into the field", () => {
    const api = fieldApi(
      { name: "probe_number", label: "Number", input_type: "Range", input_attrs: {} },
      {},
    );
    render(<InputPreview api={api} />);
    const slider = screen.getByRole("slider", { name: "Default value" });
    expect(slider).toHaveAttribute("min", "0");
    expect(slider).toHaveAttribute("max", "99");
    expect(slider).toHaveAttribute("step", "1");
    expect(api.set).not.toHaveBeenCalled();
    expect(api.update).not.toHaveBeenCalled();
    expect(api.ops.edit).not.toHaveBeenCalled();
    expect(api.editor.change).not.toHaveBeenCalled();
  });
});
