import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rawKit } from "../../../test/chartKit";
import { mockApi, renderWithQuery } from "../../../test/render";
import { metadata } from "../../../test/searchMetadata";
import type { EditorDisplay } from "../editor";
import { DisplayEditor } from "./DisplayEditor";

vi.mock("../../../search/ElementDisplay", () => ({ loadChartKit: () => Promise.resolve(true) }));

const search = {
  name: "S",
  api_entity: "Contact",
  api_params: { version: 4, select: ["id", "display_name", "birth_date"] },
};
const ctx = { meta: metadata, search, defaultPagerSize: 50, entityIndex: true };
const typeInfo = { label: "Chart", description: "A chart", icon: "fa-pie-chart" };

function renderEditor(display: EditorDisplay) {
  const onChange = vi.fn<(display: EditorDisplay) => void>();
  const onAdopt = vi.fn<(display: EditorDisplay) => void>();
  renderWithQuery(
    <DisplayEditor
      ctx={ctx}
      search={search}
      display={display}
      typeInfo={typeInfo}
      searchDisplayPath="/civicrm/search"
      classic="/civicrm/admin/search"
      onChange={onChange}
      onAdopt={onAdopt}
    />,
  );
  return { onChange, onAdopt };
}

const line: EditorDisplay = {
  id: 1,
  name: "C",
  label: "C",
  type: "chart-kit",
  settings: {
    chartType: "line",
    columns: [
      { axis: "x", key: "id", index: 0, name: "x_0" },
      { axis: "y", key: "id", scaleType: "numeric", reduceType: "sum", index: 1, name: "y_0" },
    ],
  },
};

beforeEach(() => {
  Reflect.set(window.CRM, "chart_kit", rawKit());
  mockApi({ "SearchDisplay.getSearchTasks": () => [] });
});

describe("chart display editor", () => {
  it("starts a new chart without a type, as core's $onInit", async () => {
    const { onAdopt } = renderEditor({ label: "New", type: "chart-kit" });
    await waitFor(() => {
      expect(onAdopt).toHaveBeenCalledWith(
        expect.objectContaining({ settings: { chartType: null } }),
      );
    });
  });

  it("keeps the chart's columns when the shared header changes the label", async () => {
    const { onChange } = renderEditor(line);
    await screen.findByRole("radio", { name: "Line" });
    fireEvent.change(screen.getByRole("textbox", { name: /^Name/ }), { target: { value: "D" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...line, label: "D" });
  });

  it("re-picks the stat type a categorical scale no longer offers", async () => {
    const { onChange } = renderEditor(line);
    const y = await screen.findByRole("group", { name: "Y field 1" });
    fireEvent.change(within(y).getByRole("combobox", { name: "Scale type" }), {
      target: { value: "categorical" },
    });
    const sent = onChange.mock.lastCall?.[0].settings?.columns;
    expect(sent).toEqual([
      expect.objectContaining({ axis: "x" }),
      expect.objectContaining({ scaleType: "categorical", reduceType: "count" }),
    ]);
  });

  it("refuses to edit a chart whose column has no axis, rather than dropping it", async () => {
    renderEditor({ ...line, settings: { chartType: "line", columns: [{ key: "id" }] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("has no axis");
    expect(screen.queryByRole("radio", { name: "Line" })).toBeNull();
  });
});
