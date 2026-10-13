import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NumberInput } from "./common";

describe("NumberInput", () => {
  // deviation:number-input-rejects-invalid
  it.each(["1.5", "-5"])("keeps the saved value when %s is typed", async (typed) => {
    const user = userEvent.setup();
    const onCommit = vi.fn<(value: number) => void>();
    render(<NumberInput label="Page Size" value={50} onCommit={onCommit} />);
    const input = screen.getByRole("spinbutton", { name: "Page Size" });
    await user.clear(input);
    await user.type(input, typed);
    await user.tab();
    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue(50);
  });

  it("commits a cleared field as 0 and a retyped integer as itself", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn<(value: number) => void>();
    render(<NumberInput label="Page Size" value={50} onCommit={onCommit} />);
    const input = screen.getByRole("spinbutton", { name: "Page Size" });
    await user.clear(input);
    await user.tab();
    expect(onCommit).toHaveBeenLastCalledWith(0);
    await user.clear(input);
    await user.type(input, "25");
    await user.tab();
    expect(onCommit).toHaveBeenLastCalledWith(25);
  });

  // deviation:number-input-rejects-invalid
  it("keeps the saved value when an unfinished entry reads as empty", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn<(value: number) => void>();
    render(<NumberInput label="Page Size" value={50} onCommit={onCommit} />);
    const input = screen.getByRole("spinbutton", { name: "Page Size" });
    // A browser reports "1e" as value "" with badInput, which jsdom does not model.
    Object.defineProperty(input, "validity", { value: { badInput: true } });
    await user.clear(input);
    await user.tab();
    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue(50);
  });
});
