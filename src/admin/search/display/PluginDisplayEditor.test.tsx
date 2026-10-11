import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { metadata } from "../../../test/searchMetadata";
import {
  hasPluginEditor,
  PluginDisplayEditor,
  pluginColumns,
  pluginValidationMessages,
} from "./PluginDisplayEditor";

class ProbeEditor extends HTMLElement {
  display: unknown;
  savedSearch: unknown;
  columns: unknown;
  validationMessage = "";
}
customElements.define("afreact-search-admin-display-probe", ProbeEditor);

const search = {
  name: "S",
  api_entity: "Contact",
  api_params: { version: 4, select: ["id", "display_name"] },
};

describe("plugin display editor", () => {
  it("knows a type only once an element is registered for it", () => {
    expect(hasPluginEditor("probe")).toBe(true);
    expect(hasPluginEditor("unknown")).toBe(false);
  });

  it("hands the element the display, the search and its columns, and takes its settings", () => {
    const onSettings = vi.fn<(settings: Record<string, unknown>) => void>();
    const display = { id: 1, label: "P", type: "probe", settings: { a: 1 } };
    const { container } = render(
      <PluginDisplayEditor
        meta={metadata}
        search={search}
        display={display}
        onLabel={vi.fn<(label: string) => void>()}
        onSettings={onSettings}
      />,
    );
    const element = container.querySelector("afreact-search-admin-display-probe");
    if (!(element instanceof ProbeEditor)) throw new Error("The editor element is missing.");
    expect(element.display).toEqual(display);
    expect(element.savedSearch).toEqual(search);
    expect(element.columns).toEqual([
      { key: "id", label: "Contact ID", data_type: "Integer" },
      { key: "display_name", label: "Display Name", data_type: "String" },
    ]);
    element.dispatchEvent(new CustomEvent("change", { detail: { settings: { a: 2 } } }));
    expect(onSettings).toHaveBeenCalledWith({ a: 2 });
    expect(screen.getByRole("textbox", { name: "Display Label" })).toHaveValue("P");

    expect(pluginValidationMessages(container)).toEqual([]);
    element.validationMessage = "Choose a chart type.";
    expect(pluginValidationMessages(container)).toEqual(["Choose a chart type."]);
  });

  it("lists the columns with their labels and types", () => {
    expect(pluginColumns(metadata, search).map((col) => col.key)).toEqual(["id", "display_name"]);
  });
});
