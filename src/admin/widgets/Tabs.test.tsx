import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { TabList, TabPanel } from "./Tabs";

const ITEMS = [
  { key: "one", label: "One" },
  { key: "two", label: "Two" },
  { key: "three", label: "Three" },
];

function Harness() {
  const [active, setActive] = useState("one");
  return (
    <>
      <TabList base="t" items={ITEMS} active={active} onSelect={setActive} label="Sections" />
      {ITEMS.map((item) => (
        <TabPanel key={item.key} base="t" tab={item.key} active={active}>
          {item.label} content
        </TabPanel>
      ))}
    </>
  );
}

const tab = (name: string) => screen.getByRole("tab", { name });

describe("TabList", () => {
  it("marks the active tab selected and the only one in the tab order", () => {
    render(<Harness />);
    expect(screen.getByRole("tablist", { name: "Sections" })).toBeInTheDocument();
    expect(tab("One")).toHaveAttribute("aria-selected", "true");
    expect(tab("One")).toHaveAttribute("tabindex", "0");
    for (const name of ["Two", "Three"]) {
      expect(tab(name)).toHaveAttribute("aria-selected", "false");
      expect(tab(name)).toHaveAttribute("tabindex", "-1");
    }
    const panel = screen.getByRole("tabpanel", { name: "One" });
    expect(tab("One")).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveTextContent("One content");
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
  });

  it("moves selection and focus with the arrow keys, wrapping at the ends", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(tab("One"));
    await user.keyboard("{ArrowRight}");
    expect(tab("Two")).toHaveFocus();
    expect(tab("Two")).toHaveAttribute("aria-selected", "true");
    expect(tab("Two")).toHaveAttribute("tabindex", "0");
    expect(tab("One")).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("tabpanel", { name: "Two" })).toBeVisible();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(tab("One")).toHaveFocus();
    expect(tab("One")).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowLeft}");
    expect(tab("Three")).toHaveFocus();
    expect(tab("Three")).toHaveAttribute("aria-selected", "true");
  });

  it("goes to the first and last tab with Home and End, and ignores other keys", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(tab("One"));
    await user.keyboard("{End}");
    expect(tab("Three")).toHaveFocus();
    expect(tab("Three")).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Home}");
    expect(tab("One")).toHaveFocus();
    expect(tab("One")).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}");
    expect(tab("One")).toHaveFocus();
    expect(tab("One")).toHaveAttribute("aria-selected", "true");
  });

  it("selects a clicked tab without following its link", () => {
    render(<Harness />);
    expect(fireEvent.click(tab("Three"))).toBe(false);
    expect(tab("Three")).toHaveAttribute("aria-selected", "true");
  });
});
