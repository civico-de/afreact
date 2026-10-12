import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditOptions } from "./EditOptions";
import { fieldApi } from "./testField";

const OPTIONS = [
  { id: 1, label: "Red" },
  { id: 2, label: "Green" },
  { id: 3, label: "Blue" },
];

describe("EditOptions", () => {
  // deviation:option-move-buttons
  it("reorders options by their move buttons and keeps the order on Done", async () => {
    const api = fieldApi(
      { name: "colour", label: "Colour", input_type: "Select", input_attrs: {} },
      {},
      {
        options: OPTIONS,
      },
    );
    render(<EditOptions api={api} onClose={() => undefined} />);
    expect(screen.getByRole("button", { name: "Move Red up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Blue down" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Move Blue up" }));
    await userEvent.click(screen.getByRole("button", { name: "Move Red down" }));
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(api.set).toHaveBeenCalledWith("options", [
      { id: 3, label: "Blue" },
      { id: 1, label: "Red" },
      { id: 2, label: "Green" },
    ]);
  });

  it("keeps the focus on the moved option, on its other button once it reaches the end", async () => {
    const api = fieldApi(
      { name: "colour", label: "Colour", input_type: "Select", input_attrs: {} },
      {},
      { options: OPTIONS },
    );
    render(<EditOptions api={api} onClose={() => undefined} />);
    await userEvent.click(screen.getByRole("button", { name: "Move Blue up" }));
    expect(screen.getByRole("button", { name: "Move Blue up" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Move Blue up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Blue down" })).toHaveFocus();
  });
});
