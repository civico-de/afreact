import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DebugDock } from "./DebugDock";
import { DebugSwitch } from "./DebugSwitch";
import {
  addDebugEntry,
  DebugFacts,
  DebugSection,
  debugEntries,
  debugSections,
  switchDebug,
} from "./debug";

const allowDebug = () => {
  vi.mocked(window.CRM.checkPerm).mockImplementation((perm) => perm === "view debug output");
};

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("debug mode", () => {
  it("merges each section's facts and links from all parts", () => {
    const link = { label: "Classic", href: "/classic" };
    expect(
      debugSections([
        { section: "Builder", facts: { Islands: ["a"], Route: "r" }, links: [link] },
        { section: "Form x", facts: { Source: "page" }, links: [] },
        { section: "Builder", facts: { Islands: ["b", "a"] }, links: [link] },
      ]),
    ).toEqual([
      {
        title: "Builder",
        facts: [
          ["Islands", ["a", "b"]],
          ["Route", ["r"]],
        ],
        links: [link],
      },
      { title: "Form x", facts: [["Source", ["page"]]], links: [] },
    ]);
  });

  it("adds facts only with the permission and the viewer's switch, and drops them on unmount", () => {
    const facts = <DebugFacts facts={{ Source: "page" }} />;
    const inSection = <DebugSection value="Form x">{facts}</DebugSection>;
    switchDebug(true);
    render(inSection).unmount();
    expect(debugEntries()).toEqual([]);

    allowDebug();
    switchDebug(false);
    render(inSection).unmount();
    expect(debugEntries()).toEqual([]);

    switchDebug(true);
    render(facts).unmount();
    expect(debugEntries(), "outside any section").toEqual([]);

    const { unmount } = render(inSection);
    expect(debugEntries()).toEqual([{ section: "Form x", facts: { Source: "page" }, links: [] }]);
    unmount();
    expect(debugEntries()).toEqual([]);
  });

  it("opens the panel from a floating button and closes it with Escape, focus back on the button", async () => {
    const user = userEvent.setup();
    render(<DebugDock />);
    expect(screen.queryByRole("button", { name: "Debug" })).toBeNull();
    let remove = () => {};
    act(() => {
      remove = addDebugEntry({
        section: "Builder",
        facts: { "Angular islands": ["search-admin-display-x"], Panels: [] },
        links: [{ label: "Open in the classic builder", href: "/classic#/list" }],
      });
    });
    const button = screen.getByRole("button", { name: "Debug" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    const section = screen.getByRole("region", { name: "Builder" });
    expect(section).toHaveTextContent("Angular islandssearch-admin-display-x");
    expect(section).toHaveTextContent("PanelsNone");
    expect(screen.getByRole("link", { name: "Open in the classic builder" })).toHaveAttribute(
      "href",
      "/classic#/list",
    );
    fireEvent.keyDown(section, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Builder" })).toBeNull();
    expect(button).toHaveFocus();
    act(remove);
    expect(screen.queryByRole("button", { name: "Debug" })).toBeNull();
  });

  it("keeps the viewer's switch, and says so where the browser keeps nothing", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<DebugSwitch />);
    await user.click(screen.getByRole("checkbox"));
    expect(window.localStorage.getItem("afreact-debug")).toBe("1");
    await user.click(screen.getByRole("checkbox"));
    expect(window.localStorage.getItem("afreact-debug")).toBeNull();
    unmount();

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked");
    });
    render(<DebugSwitch />);
    await user.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("status")).toHaveTextContent("debug mode stays off here");
    expect(screen.getByRole("checkbox"), "shows the state debug mode is in").not.toBeChecked();
  });
});
