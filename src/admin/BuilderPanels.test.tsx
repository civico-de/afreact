import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BuilderPanels } from "./BuilderPanels";
import { pluginValidationMessages } from "./search/display/PluginDisplayEditor";

class ProbePanel extends HTMLElement {
  record: unknown;
  searchMeta: unknown;
  validationMessage = "";
}
customElements.define("afreact-probe-panel", ProbePanel);

const setPanels = (panels: string[] | undefined) => {
  window.CRM.vars = { ...window.CRM.vars, afreactAdmin: { panels } };
};

afterEach(() => {
  setPanels(undefined);
});

describe("builder panels", () => {
  it("renders nothing when no extension names a panel", () => {
    const { container } = render(<BuilderPanels record={{ label: "S" }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("hands each panel a copy of the record on every change, and its message blocks saving", () => {
    setPanels(["afreact-probe-panel"]);
    const record = { label: "S", displays: [{ type: "table" }] };
    const searchMeta = { parseExpr: () => undefined };
    const { container, rerender } = render(
      <BuilderPanels record={record} services={{ searchMeta }} />,
    );
    const panel = container.querySelector("afreact-probe-panel");
    if (!(panel instanceof ProbePanel)) throw new Error("The panel element is missing.");
    expect(panel.record).toEqual(record);
    expect(panel.record).not.toBe(record);
    expect(panel.searchMeta).toBe(searchMeta);

    const changed = { ...record, label: "T" };
    rerender(<BuilderPanels record={changed} />);
    expect(container.querySelector("afreact-probe-panel")).toBe(panel);
    expect(panel.record).toEqual(changed);

    expect(pluginValidationMessages(container)).toEqual([]);
    panel.validationMessage = "Pick a chart.";
    expect(pluginValidationMessages(container)).toEqual(["Pick a chart."]);
  });

  it("names a panel no extension defines and blocks saving", async () => {
    setPanels(["afreact-undefined-panel"]);
    const { container } = render(<BuilderPanels record={{ label: "S" }} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No extension defines the element afreact-undefined-panel.",
    );
    expect(pluginValidationMessages(container)).toEqual([
      "No extension defines the element afreact-undefined-panel.",
    ]);
  });
});
