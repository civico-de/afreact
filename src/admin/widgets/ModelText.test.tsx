import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModelText } from "./ModelText";

const unload = () => {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

describe("ModelText", () => {
  it("asks before the page unloads while typed text waits for the input to be left", () => {
    const onChange = vi.fn<(value: string) => void>();
    render(<ModelText value="Old" onChange={onChange} title="tip" />);
    const input = screen.getByTitle("tip");
    expect(unload()).toBe(false);
    fireEvent.change(input, { target: { value: "New" } });
    expect(onChange).not.toHaveBeenCalled();
    expect(unload()).toBe(true);
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith("New");
    expect(unload()).toBe(false);
  });

  it("lets the page unload when the typed text trims to the value", () => {
    render(<ModelText value="Old" onChange={vi.fn<(value: string) => void>()} title="tip" />);
    fireEvent.change(screen.getByTitle("tip"), { target: { value: " Old " } });
    expect(unload()).toBe(false);
  });
});
