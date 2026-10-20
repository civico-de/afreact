import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { ModelNumber } from "./ModelNumber";

let latest: number | null | undefined;
let setOutside: (value: number | null | undefined) => void = () => undefined;

function Harness({ initial }: { initial: number | null | undefined }) {
  const [value, setValue] = useState(initial);
  latest = value;
  setOutside = setValue;
  return <ModelNumber aria-label="Length" min={1} step={1} value={value} onChange={setValue} />;
}

describe("ModelNumber", () => {
  it("keeps an invalid number on show once its input is left, until the value changes", () => {
    render(<Harness initial={5} />);
    const input = screen.getByRole("spinbutton", { name: "Length" });
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.blur(input);
    expect(latest).toBeUndefined();
    expect(input).toHaveValue(0);
    act(() => {
      setOutside(7);
    });
    expect(input).toHaveValue(7);
    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.blur(input);
    expect(input).toHaveValue(12);
    fireEvent.change(input, { target: { value: "" } });
    expect(latest).toBeNull();
    expect(input).toHaveValue(null);
  });
});
