import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockApi, renderWithQuery } from "../../../test/render";
import { EditorContext, formEntities, type EditorApi } from "../context";
import type { AfformDefinition, EditorMeta } from "../meta";
import { CONTRIBUTIONS, META } from "../testMeta";
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

function renderTab(
  afform: AfformDefinition,
  meta: EditorMeta = META,
  change: EditorApi["change"] = () => undefined,
) {
  const api: EditorApi = {
    meta,
    afform,
    entities: formEntities(afform, meta),
    change,
    selected: null,
    select: () => undefined,
    addMeta: () => undefined,
    removeEntity: () => undefined,
    saveBlocked: null,
    openDialog: () => undefined,
  };
  renderWithQuery(
    <EditorContext value={api}>
      <SearchTab display={{ key: "contributions.table", path: [0, 0], fieldsetPath: [0] }} />
    </EditorContext>,
  );
}

describe("SearchTab", () => {
  // deviation:filter-field-through-join
  it("names a filter's field behind a foreign key and offers its value", async () => {
    const calls = mockApi({
      "Contribution.getFields": () => [
        {
          name: "financial_type_id.is_deductible",
          label: "Tax-deductible",
          data_type: "Boolean",
          input_type: "CheckBox",
        },
      ],
    });
    renderTab(searchForm("{'financial_type_id.is_deductible': true}"));
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Filter field" })).toHaveValue(
        "Contribution Financial Type: Tax-deductible",
      );
    });
    expect(calls[0]?.params).toMatchObject({
      action: "get",
      where: [["name", "=", "financial_type_id.is_deductible"]],
    });
    expect(screen.getByRole("combobox", { name: "Filter value" })).toHaveDisplayValue("Yes");
  });

  // deviation:filter-field-through-join
  it("asks for a field behind a foreign key without its suffix", async () => {
    const calls = mockApi({
      "Contribution.getFields": () => [
        {
          name: "contact_id.gender_id",
          label: "Gender",
          data_type: "Integer",
          input_type: "Select",
        },
      ],
    });
    renderTab(searchForm("{'contact_id.gender_id:name': 'Female'}"));
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Filter field" })).toHaveValue(
        "Contribution Contact: Gender",
      );
    });
    expect(calls[0]?.params).toMatchObject({ where: [["name", "=", "contact_id.gender_id"]] });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // deviation:filter-field-through-join
  it("does not take a field behind a foreign key for the entity's own of the same name", async () => {
    const calls = mockApi({
      "Contribution.getFields": () => [
        {
          name: "contribution_page_id.financial_type_id",
          label: "Financial Type",
          data_type: "Integer",
        },
      ],
    });
    renderTab(searchForm("{'contribution_page_id.financial_type_id': 1}"));
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Filter field" })).toHaveValue(
        "Contribution contribution_page_id: Financial Type",
      );
    });
    expect(calls[0]?.params).toMatchObject({
      where: [["name", "=", "contribution_page_id.financial_type_id"]],
    });
  });

  // deviation:filter-field-through-join
  it("names a field behind a join's foreign key by the join", async () => {
    const calls = mockApi({
      "Email.getFields": () => [
        { name: "location_type_id.is_reserved", label: "Reserved", data_type: "Boolean" },
      ],
    });
    renderTab(searchForm("{'email.location_type_id.is_reserved': true}"));
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Filter field" })).toHaveValue(
        "Donor Email Location Type: Reserved",
      );
    });
    expect(calls[0]?.params).toMatchObject({
      where: [["name", "=", "location_type_id.is_reserved"]],
    });
  });

  // deviation:filter-field-through-join
  it("names a field behind a custom foreign key by that field", async () => {
    mockApi({
      "Contribution.getFields": () => [
        { name: "Gift_Details.Referrer.is_deceased", label: "Deceased", data_type: "Boolean" },
      ],
    });
    const contribution = META.gui.entities.Contribution;
    if (!contribution) throw new Error("No Contribution in the test metadata.");
    const meta: EditorMeta = {
      ...META,
      gui: {
        ...META.gui,
        entities: {
          ...META.gui.entities,
          Contribution: {
            ...contribution,
            fields: {
              ...contribution.fields,
              "Gift_Details.Referrer": {
                name: "Gift_Details.Referrer",
                label: "Referrer",
                fk_entity: "Contact",
              },
            },
          },
        },
      },
    };
    renderTab(searchForm("{'Gift_Details.Referrer.is_deceased': true}"), meta);
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Filter field" })).toHaveValue(
        "Contribution Referrer: Deceased",
      );
    });
  });

  it("asks nothing about a filter on a join's bridge field", async () => {
    const calls = mockApi({});
    const meta: EditorMeta = {
      ...META,
      gui: {
        ...META.gui,
        entities: {
          ...META.gui.entities,
          Group: {
            entity: "Group",
            label: "Group",
            fields: { title: { name: "title", label: "Title" } },
          },
          GroupContact: {
            entity: "GroupContact",
            label: "Group Contact",
            fields: { status: { name: "status", label: "Status", input_type: "Text" } },
          },
        },
      },
      searchDisplays: {
        ...META.searchDisplays,
        "contributions.table": {
          ...CONTRIBUTIONS,
          "saved_search_id.api_params": { join: [["Group AS groups", "LEFT", "GroupContact"]] },
          "saved_search_id.form_values": { join: { groups: "Groups" } },
        },
      },
    };
    renderTab(searchForm("{'groups.status': 'Added'}"), meta);
    expect(await screen.findByRole("textbox", { name: "Filter value" })).toHaveValue("Added");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it("offers a text input for a filter on a calculated field and asks nothing about it", async () => {
    const calls = mockApi({});
    const form = searchForm("{GROUP_COUNT_id: 2}");
    const changes: AfformDefinition[] = [];
    renderTab(form, META, (update) => {
      changes.push(update(form));
    });
    expect(await screen.findByRole("combobox", { name: "Filter field" })).toHaveValue("Count");
    const value = screen.getByRole("textbox", { name: "Filter value" });
    expect(value).toHaveValue("2");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(calls).toEqual([]);
    await userEvent.type(value, "5");
    expect(JSON.stringify(changes.at(-1))).toContain(`GROUP_COUNT_id: '25'`);
  });

  it("says when a filter's field cannot be found", async () => {
    mockApi({ "Contribution.getFields": () => [] });
    renderTab(searchForm("{'financial_type_id.nonsense': 1}"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Contribution has no field financial_type_id.nonsense.",
    );
  });

  it("says when the field of a filter from the URL cannot be found", async () => {
    mockApi({ "Contribution.getFields": () => [] });
    renderTab(searchForm("{'financial_type_id.nonsense': routeParams.type}"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Contribution has no field financial_type_id.nonsense.",
    );
  });

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
