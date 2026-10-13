import { render, screen } from "@testing-library/react";
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

describe("TabsetElement", () => {
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
            scope={{
              path: [],
              entityName: null,
              dataEntity: "",
              inFieldset: false,
              inBlock: false,
              join: null,
              label: "Form",
              axis: "y",
            }}
            handle={{
              ref: () => undefined,
              onPointerDown: () => undefined,
              onKeyDown: () => undefined,
            }}
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
