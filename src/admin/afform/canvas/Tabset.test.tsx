import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditorContext, type EditorApi } from "../context";
import { META } from "../testMeta";
import { RenderContext } from "./common";
import { TabsetElement } from "./Tabset";

const editor: EditorApi = {
  meta: META,
  afform: { type: "form", title: "Probe", layout: [] },
  entities: [],
  change: () => undefined,
  selected: null,
  select: () => undefined,
  addMeta: () => undefined,
  removeEntity: () => undefined,
  saveBlocked: null,
  openDialog: () => undefined,
};

const tab = (title: string) => ({
  "#tag": "af-tab",
  title,
  "#children": [],
});
const space = { "#text": "\n  " };

const scope = {
  path: [],
  entityName: null,
  dataEntity: "",
  inFieldset: false,
  inBlock: false,
  join: null,
  label: "Form",
  axis: "y" as const,
};
const handle = {
  ref: () => undefined,
  onPointerDown: () => undefined,
  onKeyDown: () => undefined,
};

describe("TabsetElement", () => {
  // deviation:chart-tab-count-not-offered
  it("offers the tab's tables for its count and leaves its charts out", async () => {
    const display = (tag: string, name: string) => ({
      "#tag": tag,
      "search-name": "contributions",
      "display-name": name,
    });
    const meta = {
      ...META,
      gui: {
        ...META.gui,
        searchDisplayTags: ["crm-search-display-table", "crm-search-display-chart-kit"],
      },
    };
    render(
      <EditorContext value={{ ...editor, meta }}>
        <RenderContext value={() => null}>
          <TabsetElement
            path={[0]}
            node={{
              "#tag": "af-tabset",
              "#children": [
                {
                  ...tab("One"),
                  "#children": [
                    display("crm-search-display-table", "table"),
                    display("crm-search-display-chart-kit", "chart"),
                  ],
                },
              ],
            }}
            scope={scope}
            handle={handle}
            label="Tabs"
          />
        </RenderContext>
      </EditorContext>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Configure One" }));
    // The menu is a popover, which jsdom keeps out of the accessibility tree.
    const count = await screen.findByLabelText("Count:");
    const options = within(count).getAllByRole("option", { hidden: true });
    expect(options.map((option) => option.textContent)).toEqual(["None", "Contributions Table"]);
  });

  it("shows the first page and steps through pages with text between them", async () => {
    render(
      <EditorContext value={editor}>
        <RenderContext value={() => null}>
          <TabsetElement
            path={[0]}
            node={{
              "#tag": "af-tabset",
              "page-nav-buttons": "1",
              "#children": [space, tab("One"), space, tab("Two"), space],
            }}
            scope={scope}
            handle={handle}
            label="Pages"
          />
        </RenderContext>
      </EditorContext>,
    );
    const selected = () => screen.getByRole("tab", { selected: true });
    expect(selected()).toHaveTextContent("One");
    await userEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(selected()).toHaveTextContent("Two");
    expect(screen.queryByRole("button", { name: /Next/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(selected()).toHaveTextContent("One");
  });
});
