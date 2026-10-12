import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { isPopoverOpen } from "../test/popover";
import { Menu, type MenuProps } from "./Menu";
import type { Link } from "./types";

const links: Link[] = [
  { url: "/view", text: "View" },
  { url: "/edit", text: "Edit", target: "crm-popup" },
  { url: "/delete", text: "Delete" },
];

function menu() {
  const onLinkClick = vi.fn<NonNullable<MenuProps["onLinkClick"]>>();
  render(
    <Menu
      buttonClass="btn btn-default"
      label="Actions "
      srLabel="Row Actions"
      links={links}
      alignRight={false}
      onLinkClick={onLinkClick}
    />,
  );
  const button = screen.getByRole("button", { name: "Actions Row Actions" });
  const list = screen.getByRole("menu", { hidden: true });
  return { button, list, onLinkClick };
}

// jsdom styles every popover as closed, so its items count as hidden.
const item = (name: string) => screen.getByRole("menuitem", { name, hidden: true });

describe("Menu", () => {
  it("links its button to a closed popover menu", () => {
    const { button, list } = menu();
    expect(button).toHaveAttribute("aria-haspopup", "true");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-controls", list.id);
    expect(button).toHaveAttribute("popovertarget", list.id);
    expect(list).toHaveAttribute("popover", "auto");
    expect(isPopoverOpen(list)).toBe(false);
  });

  it("opens on click with focus on the first item and marks the group open", async () => {
    const { button, list } = menu();
    await userEvent.click(button);
    expect(isPopoverOpen(list)).toBe(true);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(button.parentElement).toHaveClass("btn-group open");
    expect(item("View")).toHaveFocus();
  });

  // deviation:actions-menu-in-viewport
  it("sits under its button and scrolls within the space below it", async () => {
    const { button, list } = menu();
    // A button at (20, 0), 100 px tall: its bottom is at 100.
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 0, 0, 100));
    vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(500);
    await userEvent.click(button);
    expect(list.style.top).toBe("100px");
    expect(list.style.left).toBe("20px");
    expect(list.style.maxHeight).toBe("392px");
  });

  // deviation:actions-menu-in-viewport
  it("opens above its button when the space below is too small", async () => {
    const { button, list } = menu();
    // A button from 460 to 480, 20 px above the viewport's bottom edge.
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 460, 0, 20));
    vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(500);
    vi.spyOn(list, "scrollHeight", "get").mockReturnValue(150);
    await userEvent.click(button);
    expect(list.style.top).toBe("auto");
    expect(list.style.bottom).toBe("40px");
    expect(list.style.maxHeight).toBe("452px");
  });

  it("opens on Enter and Space like any button", async () => {
    const { button, list } = menu();
    button.focus();
    await userEvent.keyboard("{Enter}");
    expect(item("View")).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(isPopoverOpen(list)).toBe(false);
    await userEvent.keyboard(" ");
    expect(item("View")).toHaveFocus();
  });

  it("opens on ArrowDown at the first item and on ArrowUp at the last", async () => {
    const { button } = menu();
    button.focus();
    await userEvent.keyboard("{ArrowUp}");
    expect(item("Delete")).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard("{ArrowDown}");
    expect(item("View")).toHaveFocus();
  });

  it("moves between items with the arrows, wrapping, and Home and End", async () => {
    const { button } = menu();
    await userEvent.click(button);
    await userEvent.keyboard("{ArrowDown}");
    expect(item("Edit")).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(item("View")).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    expect(item("Delete")).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(item("View")).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(item("Delete")).toHaveFocus();
  });

  it("closes on Escape and gives focus back to the button", async () => {
    const { button, list } = menu();
    await userEvent.click(button);
    await userEvent.keyboard("{Escape}");
    expect(isPopoverOpen(list)).toBe(false);
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button.parentElement).not.toHaveClass("open");
  });

  it("closes on Tab", async () => {
    const { button, list } = menu();
    await userEvent.click(button);
    await userEvent.tab();
    expect(isPopoverOpen(list)).toBe(false);
  });

  it("reports the chosen link and closes", async () => {
    const { button, list, onLinkClick } = menu();
    await userEvent.click(button);
    const edit = item("Edit");
    edit.addEventListener("click", (event) => {
      event.preventDefault();
    });
    await userEvent.click(edit);
    expect(onLinkClick).toHaveBeenCalledWith(links[1], expect.anything());
    expect(isPopoverOpen(list)).toBe(false);
  });

  it("aligns the menu right when asked", () => {
    render(<Menu buttonClass="btn" label="Add" links={links} alignRight />);
    expect(screen.getByRole("menu", { hidden: true })).toHaveClass("dropdown-menu-right");
  });
});
