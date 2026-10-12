import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PluginElement } from "./plugins";

class ProbePart extends HTMLElement {
  node: unknown;
}
customElements.define("afreact-afform-admin-probe-part", ProbePart);

const send = (element: Element, detail: unknown) => {
  act(() => {
    element.dispatchEvent(new CustomEvent("change", { detail, bubbles: true }));
  });
};

describe("PluginElement", () => {
  // deviation:afform-plugin-parts
  it("hands over its props and applies changes, showing one it cannot read", () => {
    const onChange = vi.fn<(node: unknown) => void>();
    const node = { "#tag": "afreact-probe" };
    const { container } = render(
      <PluginElement tag="afreact-afform-admin-probe-part" props={{ node }} onChange={onChange} />,
    );
    const element = container.querySelector("afreact-afform-admin-probe-part");
    if (!(element instanceof ProbePart)) throw new Error("The plugin element was not created.");
    expect(element.node).toBe(node);

    send(element, { node: { ...node, title: "T" } });
    expect(onChange).toHaveBeenCalledWith({ ...node, title: "T" });
    expect(screen.queryByRole("alert")).toBeNull();

    send(element, { other: node });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "afreact-afform-admin-probe-part sent a change without an element in detail.node",
    );

    send(element, { node });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
