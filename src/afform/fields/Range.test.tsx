import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { vi } from "vitest";
import { mockApi, renderWithQuery } from "../../test/render";
import { AfreactForm } from "../AfreactForm";
import { Field } from "../Field";
import type { FieldDefn, LayoutNode } from "../types";
import { rangeValue } from "./Range";

const button = (ngClick: string, text: string): LayoutNode => ({
  "#tag": "button",
  "ng-click": ngClick,
  "#children": [{ "#text": text }],
});

// As AfformMetadataInjector sends it: min, max and step from the option ids.
const rating: FieldDefn = {
  name: "rating",
  label: "Rating",
  input_type: "Range",
  data_type: "Integer",
  options: [
    { id: 2, label: "Poor" },
    { id: 4, label: "Fair" },
    { id: 6, label: "Good" },
  ],
  input_attrs: { min: 2, max: 6, step: 2 },
};

function Harness({
  defn,
  initial,
  onValue,
}: {
  defn: FieldDefn;
  initial: unknown;
  onValue: (value: unknown) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <Field
      defn={defn}
      value={value}
      disabled={false}
      onChange={(next) => {
        setValue(next);
        onValue(next);
      }}
    />
  );
}

describe("Range fields", () => {
  it("shows the chosen option's label and writes the option id as a number", () => {
    const onValue = vi.fn<(value: unknown) => void>();
    const { container } = render(<Harness defn={rating} initial={2} onValue={onValue} />);
    const slider = screen.getByRole("slider", { name: "Rating" });
    expect(slider).toHaveAttribute("aria-valuetext", "Poor");
    expect(slider).toHaveAttribute("list", `${slider.id}-list`);
    expect(container.querySelector(".crm-af-field-label span")).toHaveTextContent("Poor");
    const ticks = [...container.querySelectorAll("datalist option")];
    expect(ticks.map((option) => option.getAttribute("value"))).toEqual(["2", "4", "6"]);
    expect(onValue).not.toHaveBeenCalled();

    fireEvent.change(slider, { target: { value: "6" } });
    expect(onValue).toHaveBeenLastCalledWith(6);
    expect(slider).toHaveAttribute("aria-valuetext", "Good");
  });

  it("writes the position an unset slider shows, as ngModel's range input does", () => {
    const onValue = vi.fn<(value: unknown) => void>();
    render(<Harness defn={rating} initial={null} onValue={onValue} />);
    expect(onValue).toHaveBeenCalledExactlyOnceWith(4);
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuetext", "Fair");
  });

  it("takes a stored value given as text, and shows the value of a slider without options", () => {
    const onValue = vi.fn<(value: unknown) => void>();
    const { unmount } = render(<Harness defn={rating} initial="6" onValue={onValue} />);
    expect(onValue).toHaveBeenCalledExactlyOnceWith(6);
    unmount();

    const plain: FieldDefn = { ...rating, options: false, input_attrs: { max: 10 } };
    const { container } = render(<Harness defn={plain} initial={3} onValue={onValue} />);
    const slider = screen.getByRole("slider", { name: "Rating" });
    expect(slider).toHaveAttribute("step", "1");
    expect(slider).not.toHaveAttribute("aria-valuetext");
    expect(container.querySelector(".crm-af-field-label span")).toHaveTextContent("3");
  });

  it("starts a form with the middle option, so an untouched form holds no change", async () => {
    const calls = mockApi({
      "Afreact.getForm": () => [
        {
          name: "afformRange",
          title: "Range",
          type: "form",
          strings: [],
          layout: [
            {
              "#tag": "af-form",
              ctrl: "afform",
              "#children": [
                { "#tag": "af-entity", type: "Contact", name: "Individual1" },
                {
                  "#tag": "div",
                  "af-fieldset": "Individual1",
                  "#children": [{ "#tag": "af-field", name: "rating", defn: rating }],
                },
                button("afform.submit()", "Save"),
                button("afform.submitDraft()", "Save Draft"),
              ],
            },
          ],
        },
      ],
      "Afform.prefill": () => [],
      "Afform.submit": () => [{}],
    });
    renderWithQuery(<AfreactForm name="afformRange" location={{ search: "", hash: "" }} />);
    expect(await screen.findByRole("slider")).toHaveAttribute("aria-valuetext", "Fair");
    expect(screen.getByRole("button", { name: "Save Draft" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(calls.find(({ call }) => call === "Afform.submit")?.params.values).toEqual({
        Individual1: [{ fields: { rating: 4 }, joins: {} }],
      });
    });
  });

  it("takes the browser's default position: the middle of the bounds on the nearest step", () => {
    const at = (input_attrs: FieldDefn["input_attrs"], value: unknown = null) =>
      rangeValue({ ...rating, input_attrs }, value);
    expect(at({})).toBe(50);
    expect(at({ min: 1, max: 4 })).toBe(3);
    expect(at({ min: 0, max: 5, step: 2 })).toBe(2);
    expect(at({ min: 0, max: 2, step: 2 })).toBe(2);
    expect(at({ min: 0, max: 3, step: 2 })).toBe(2);
    expect(at({ min: 5, max: 1 })).toBe(5);
    expect(at({}, "6")).toBe(6);
    expect(at({}, 0)).toBe(0);
    expect(at({ min: "1", max: "4" })).toBe(3);
  });

  it("is disabled with the form", () => {
    render(<Field defn={rating} value={4} disabled onChange={() => undefined} />);
    expect(screen.getByRole("slider")).toBeDisabled();
  });
});
