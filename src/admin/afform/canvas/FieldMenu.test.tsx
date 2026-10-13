import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { FieldApi } from "./Field";
import { DefaultItems, MinMaxItem } from "./FieldMenu";
import { withLocal } from "./fieldModel";
import { fieldApi } from "./testField";

let latest: FieldApi["state"] | undefined;

function Harness({ local }: { local: FieldApi["state"]["local"] }) {
  const base = fieldApi(
    { name: "amount", input_type: "Number", data_type: "Integer", input_attrs: {} },
    local,
  );
  const [state, setState] = useState(base.state);
  latest = state;
  return (
    <ul>
      <MinMaxItem api={{ ...base, state, update: setState }} />
    </ul>
  );
}

describe("MinMaxItem", () => {
  // deviation:field-bounds-on-blur
  it("keeps a maximum typed digit by digit past a smaller first digit", async () => {
    render(<Harness local={{ input_attrs: { min: 10 } }} />);
    const max = screen.getByRole("spinbutton", { name: "Maximum:" });
    await userEvent.type(max, "20");
    await userEvent.tab();
    expect(latest?.local.input_attrs).toEqual({ min: 10, max: 20 });
  });

  it("brings a bound past the other one back to it once its input is left", async () => {
    render(<Harness local={{ input_attrs: { max: 9 } }} />);
    const min = screen.getByRole("spinbutton", { name: "Minimum:" });
    await userEvent.type(min, "12");
    expect(latest?.local.input_attrs).toEqual({ min: 12, max: 9 });
    await userEvent.tab();
    expect(latest?.local.input_attrs).toEqual({ min: 9, max: 9 });
  });
});

describe("DefaultItems", () => {
  function DateHarness() {
    const base = fieldApi(
      { name: "start", input_type: "Date", data_type: "Date", input_attrs: {} },
      { afform_default: "now +5 day" },
    );
    const [state, setState] = useState(base.state);
    latest = state;
    return (
      <ul>
        <DefaultItems
          api={{
            ...base,
            state,
            hasDefault: true,
            set: (key, value) => {
              setState((current) => withLocal(current, [key], value));
            },
          }}
        />
      </ul>
    );
  }

  // deviation:date-offset-minus
  it("keeps a lone minus on show and takes the negative offset that follows", () => {
    render(<DateHarness />);
    const offset = screen.getByRole("spinbutton", { name: /Now/ });
    // A browser reports a number input holding only "-" as empty.
    fireEvent.change(offset, { target: { value: "" } });
    expect(offset).toHaveValue(null);
    expect(latest?.local.afform_default).toBe("now +5 day");
    fireEvent.change(offset, { target: { value: "-3" } });
    expect(latest?.local.afform_default).toBe("now -3 day");
  });
});
