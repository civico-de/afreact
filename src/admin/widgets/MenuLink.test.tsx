import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { MenuLink } from "./MenuLink";

describe("MenuLink", () => {
  it("is a focusable button that Enter and Space trigger once", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn<() => void>();
    render(<MenuLink onClick={onClick}>Delete</MenuLink>);
    const link = screen.getByRole("button", { name: "Delete" });
    await user.tab();
    expect(link).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(1);
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
    await user.keyboard("a{ArrowDown}");
    expect(onClick).toHaveBeenCalledTimes(2);
    await user.click(link);
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it("states a toggle's state as pressed and a switch's as checked", () => {
    render(
      <>
        <MenuLink onClick={vi.fn<() => void>()} pressed>
          Bold
        </MenuLink>
        <MenuLink onClick={vi.fn<() => void>()} checked={false}>
          Required
        </MenuLink>
      </>,
    );
    expect(screen.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("switch", { name: "Required" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });
});
