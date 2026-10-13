import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditorContext, formEntities, type EditorApi } from "../context";
import type { AfformDefinition } from "../meta";
import { META } from "../testMeta";
import { SearchTab } from "./SearchTab";

const searchForm = (filters: string): AfformDefinition => ({
  type: "search",
  title: "Contributions",
  layout: [
    {
      "#tag": "div",
      "af-fieldset": "",
      "#children": [
        {
          "#tag": "crm-search-display-table",
          "search-name": "contributions",
          "display-name": "table",
          filters,
        },
      ],
    },
  ],
});

function renderTab(afform: AfformDefinition) {
  const api: EditorApi = {
    meta: META,
    afform,
    entities: formEntities(afform, META),
    change: () => undefined,
    selected: null,
    select: () => undefined,
    addMeta: () => undefined,
    removeEntity: () => undefined,
    saveBlocked: null,
    openDialog: () => undefined,
  };
  render(
    <EditorContext value={api}>
      <SearchTab display={{ key: "contributions.table", path: [0, 0], fieldsetPath: [0] }} />
    </EditorContext>,
  );
}

describe("SearchTab", () => {
  it("says when the display's filters cannot be read and offers no filter to add", async () => {
    renderTab(searchForm("{contact_id: user_contact_id}"));
    expect(screen.getByRole("alert")).toHaveTextContent("These filters cannot be read");
    expect(await screen.findByRole("combobox", { name: "Add filter" })).toBeDisabled();
  });

  it("lists readable filters without an alert", async () => {
    renderTab(searchForm("{financial_type_id: 1}"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(await screen.findByRole("combobox", { name: "Add filter" })).toBeEnabled();
  });

  // deviation:palette-sections
  it("tells of filters it cannot read while their section is shut", async () => {
    renderTab(searchForm("{contact_id: user_contact_id}"));
    const filters = screen.getByRole("button", { name: "Hidden Filters" });
    await userEvent.click(filters);
    expect(filters).toHaveAccessibleDescription("A value is missing or invalid");
  });

  // deviation:palette-sections
  it("counts readable filters while their section is shut", async () => {
    renderTab(searchForm("{financial_type_id: 1}"));
    const filters = screen.getByRole("button", { name: "Hidden Filters" });
    await userEvent.click(filters);
    expect(filters).toHaveAccessibleDescription("1 filter");
  });
});
