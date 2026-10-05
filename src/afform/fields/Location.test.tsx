import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { vi } from "vitest";
import { Field } from "../Field";
import type { FieldDefn } from "../types";

const proximity: FieldDefn = {
  name: "address_primary.proximity",
  label: "Near",
  input_type: "Location",
  data_type: "Boolean",
};

function Harness({ initial, onValue }: { initial: unknown; onValue: (value: unknown) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <Field
        defn={proximity}
        value={value}
        disabled={false}
        onChange={(next) => {
          setValue(next);
          onValue(next);
        }}
      />
      <button
        type="button"
        onClick={() => {
          setValue({ distance: 2, distance_unit: "km", address: "Paris" });
        }}
      >
        Load
      </button>
      <button
        type="button"
        onClick={() => {
          setValue(null);
        }}
      >
        Reset
      </button>
    </>
  );
}

beforeEach(() => {
  window.CRM.vars = { afreact: { distanceUnit: "miles" } };
});
afterEach(() => {
  delete window.CRM.vars;
});

describe("Location fields", () => {
  it("writes distance, unit and address once all are set, the address on leaving it", async () => {
    const onValue = vi.fn();
    render(<Harness initial={null} onValue={onValue} />);
    const group = screen.getByRole("group", { name: "Near" });
    expect(group).toHaveClass("form-inline");
    const unit = screen.getByRole("combobox", { name: "Distance unit" });
    expect(unit).toHaveValue("miles");

    await userEvent.type(screen.getByRole("spinbutton", { name: "Distance" }), "5");
    expect(onValue).toHaveBeenLastCalledWith(null);
    const address = screen.getByRole("textbox", { name: "Address" });
    expect(address).toHaveAttribute("placeholder", "Street, City, State, Country");
    await userEvent.type(address, "Berlin");
    expect(onValue).toHaveBeenCalledTimes(1);
    await userEvent.tab();
    expect(onValue).toHaveBeenLastCalledWith({
      distance: 5,
      distance_unit: "miles",
      address: "Berlin",
    });

    await userEvent.selectOptions(unit, "Km");
    expect(onValue).toHaveBeenLastCalledWith({
      distance: 5,
      distance_unit: "km",
      address: "Berlin",
    });
    await userEvent.clear(screen.getByRole("spinbutton", { name: "Distance" }));
    expect(onValue).toHaveBeenLastCalledWith(null);
  });

  it("shows a value set from outside, and keeps the inputs when it is emptied", async () => {
    render(<Harness initial={null} onValue={() => undefined} />);
    await userEvent.click(screen.getByRole("button", { name: "Load" }));
    expect(screen.getByRole("spinbutton", { name: "Distance" })).toHaveValue(2);
    expect(screen.getByRole("combobox", { name: "Distance unit" })).toHaveValue("km");
    expect(screen.getByRole("textbox", { name: "Address" })).toHaveValue("Paris");

    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByRole("textbox", { name: "Address" })).toHaveValue("Paris");
  });

  it("is disabled with the form", () => {
    render(<Field defn={proximity} value={null} disabled onChange={() => undefined} />);
    expect(screen.getByRole("spinbutton")).toBeDisabled();
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("reports a page without the site's default unit", () => {
    delete window.CRM.vars;
    render(<Field defn={proximity} value={null} disabled={false} onChange={() => undefined} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The page provides no default distance unit.",
    );
  });
});
