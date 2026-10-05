import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { vi } from "vitest";
import { Field } from "../Field";
import type { FieldDefn } from "../types";

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
    const onValue = vi.fn();
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
    const onValue = vi.fn();
    render(<Harness defn={rating} initial={null} onValue={onValue} />);
    expect(onValue).toHaveBeenCalledExactlyOnceWith(4);
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuetext", "Fair");
  });

  it("takes a stored value given as text, and shows the value of a slider without options", () => {
    const onValue = vi.fn();
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

  it("is disabled with the form", () => {
    render(<Field defn={rating} value={4} disabled onChange={() => undefined} />);
    expect(screen.getByRole("slider")).toBeDisabled();
  });
});
