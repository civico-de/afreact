import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listParam, mockApi, renderWithQuery } from "../../../test/render";
import { metadata } from "../../../test/searchMetadata";
import { DISPLAY_KEY, newDisplay, type EditorDisplay } from "../editor";
import { DisplayEditor, initialized } from "./DisplayEditor";

const search = {
  name: "S",
  api_entity: "Contact",
  api_params: { version: 4, select: ["id", "display_name"] },
};
const ctx = {
  meta: metadata,
  search,
  defaultPagerSize: 50,
};
const typeInfo = { label: "Table", description: "A table", icon: "fa-table" };

let latest: EditorDisplay | undefined;
const firstColumn = () => listParam(latest?.settings?.columns)[0];

/** The editor with every edit and adoption kept, as the search editor keeps them. */
function Harness({ initial, info = search }: { initial: EditorDisplay; info?: typeof search }) {
  const [display, setDisplay] = useState(initial);
  latest = display;
  return (
    <DisplayEditor
      ctx={{ ...ctx, search: info }}
      search={info}
      display={display}
      typeInfo={typeInfo}
      searchDisplayPath="/civicrm/search"
      classic="/civicrm/admin/search"
      onChange={setDisplay}
      onAdopt={setDisplay}
    />
  );
}

const columns = [
  { type: "field", key: "id", label: "ID", sortable: true },
  { type: "field", key: "display_name", label: "Name", sortable: true },
];

beforeEach(() => {
  latest = undefined;
  mockApi({
    "SearchDisplay.getSearchTasks": () => [],
    "SearchDisplay.run": () => Object.assign([], { count: 0, countFetched: 0 }),
  });
});

async function retype(name: string | RegExp, text: string) {
  const input = screen.getByRole("textbox", { name });
  await userEvent.clear(input);
  await userEvent.type(input, text);
  return input;
}

describe("display settings trimmed as ngModel trims them", () => {
  it("trims a table's label, description, header and totals labels with every keystroke", async () => {
    renderWithQuery(
      <Harness
        initial={{
          id: 1,
          name: "T",
          label: "T",
          type: "table",
          settings: {
            columns: columns.map((col) => ({ ...col, tally: { fn: "SUM" } })),
            tally: { label: "", header: true, footer: false },
            editableRow: { create: true },
            noResultsText: "",
          },
        }}
      />,
    );
    const label = await retype(/^Name/, "  Members  ");
    expect(latest?.label).toBe("Members");
    expect(label).toHaveValue("  Members  ");
    await retype("Description (shown above)", " About ");
    expect(latest?.settings?.description).toBe("About");
    await retype("Label", " Sum ");
    expect(latest?.settings?.tally).toMatchObject({ label: "Sum" });
    await retype("Add New Button label", " Add ");
    expect(latest?.settings?.editableRow).toMatchObject({ createLabel: "Add" });
    await retype("No Results Text", " Nobody ");
    expect(latest?.settings?.noResultsText).toBe("Nobody");
    const [header] = screen.getAllByRole("textbox", { name: "Header" });
    if (!header) throw new Error("The column header is missing.");
    await userEvent.clear(header);
    await userEvent.type(header, " Key ");
    const [totals] = screen.getAllByRole("textbox", { name: "Totals" });
    if (!totals) throw new Error("The totals label is missing.");
    await userEvent.type(totals, " All ");
    expect(firstColumn()).toMatchObject({ label: "Key", tally: { label: "All" } });
  });

  it("trims a table's totals rewrite, search button and CSS class once they are left", async () => {
    renderWithQuery(
      <Harness
        initial={{
          id: 1,
          name: "T",
          label: "T",
          type: "table",
          settings: {
            columns: [{ ...columns[0], tally: { fn: "SUM", rewrite: "[id]" } }],
            tally: { label: "", header: false, footer: true },
            button: "Go",
            cssRules: [["my-row"]],
          },
        }}
      />,
    );
    const rewrite = screen.getByRole("textbox", { name: "Totals rewrite with tokens" });
    await userEvent.type(rewrite, " total ");
    expect(firstColumn()).toMatchObject({ tally: { rewrite: "[id]" } });
    await userEvent.tab();
    expect(firstColumn()).toMatchObject({ tally: { rewrite: "[id] total" } });
    await retype("Search button text", " Find ");
    expect(latest?.settings?.button).toBe("Go");
    await userEvent.tab();
    expect(latest?.settings?.button).toBe("Find");
    await retype(/^CSS class of/, " my-class ");
    expect(latest?.settings?.cssRules).toEqual([["my-row"]]);
    await userEvent.tab();
    expect(latest?.settings?.cssRules).toEqual([["my-class"]]);
  });

  it("trims a batch display's label, description, header and footer", async () => {
    renderWithQuery(
      <Harness
        initial={{
          id: 1,
          name: "B",
          label: "B",
          type: "batch",
          settings: {
            columns: [{ ...columns[0], tally: { fn: "SUM" } }],
            tally: { label: "" },
          },
        }}
      />,
    );
    await retype(/^Label/, " Batch ");
    expect(latest?.label).toBe("Batch");
    await retype("Description", " About ");
    expect(latest?.settings?.description).toBe("About");
    await retype("Header", " Key ");
    await retype("Footer", " All ");
    expect(firstColumn()).toMatchObject({ label: "Key", tally: { label: "All" } });
  });

  it("trims an entity display's label, description and column label", async () => {
    renderWithQuery(
      <Harness
        initial={{
          id: 1,
          name: "E",
          label: "E",
          type: "entity",
          settings: { columns: [{ ...columns[1], name: "display_name" }] },
        }}
      />,
    );
    const [label, colLabel] = screen.getAllByRole("textbox", { name: "Label" });
    if (!label || !colLabel) throw new Error("A label input is missing.");
    await userEvent.clear(label);
    await userEvent.type(label, " Entity ");
    expect(latest?.label).toBe("Entity");
    await retype("Description", " About ");
    expect(latest?.settings?.description).toBe("About");
    await userEvent.clear(colLabel);
    await userEvent.type(colLabel, " Full name ");
    expect(firstColumn()).toMatchObject({ label: "Full name" });
  });

  it("lets a column name take a space between words, which becomes an underscore", async () => {
    renderWithQuery(
      <Harness
        initial={{
          id: 1,
          name: "E",
          label: "E",
          type: "entity",
          settings: { columns: [{ ...columns[1], name: "display_name" }] },
        }}
      />,
    );
    const name = await retype("Name", "full name");
    expect(firstColumn()).toMatchObject({ name: "full_name" });
    expect(name).toHaveValue("full_name");
    await userEvent.clear(name);
    await userEvent.type(name, "full ");
    expect(firstColumn()).toMatchObject({ name: "full" });
    expect(name).toHaveValue("full ");
    // Core's ng-change leaves a name of spaces alone, which munge would make a random name.
    await userEvent.clear(name);
    await userEvent.type(name, "  ");
    expect(firstColumn()).toMatchObject({ name: "" });
  });

  it("trims an autocomplete display's label", async () => {
    renderWithQuery(
      <Harness initial={{ id: 1, name: "A", label: "A", type: "autocomplete", settings: {} }} />,
    );
    await retype(/^Label/, " Pick ");
    expect(latest?.label).toBe("Pick");
  });
});

it("offers a default value input for an aliased column", async () => {
  const info = { ...search, api_params: { version: 4, select: ["display_name AS who"] } };
  renderWithQuery(
    <Harness
      info={info}
      initial={{
        id: 1,
        name: "B",
        label: "B",
        type: "batch",
        settings: { columns: [{ type: "field", key: "who", label: "Who" }] },
      }}
    />,
  );
  await userEvent.click(screen.getByRole("checkbox", { name: "Default Value" }));
  await userEvent.type(screen.getByLabelText("Default value of Who"), "Bo");
  expect(firstColumn()).toMatchObject({ default: "Bo" });
});

it("shows a token inserted into a list item's label and keeps it when the label is left", async () => {
  renderWithQuery(
    <Harness
      initial={{
        id: 1,
        name: "L",
        label: "L",
        type: "list",
        settings: { columns: [{ type: "field", key: "display_name", label: "Name" }] },
      }}
    />,
  );
  const label = await retype("Label text", " Who ");
  await userEvent.tab();
  expect(firstColumn()).toMatchObject({ label: "Who" });
  await userEvent.click(screen.getByRole("combobox", { name: "Insert Token" }));
  // The column comes first, before the same field among the entity's fields.
  const [column] = await screen.findAllByRole("option", { name: "Display Name" });
  await userEvent.click(column ?? document.body);
  expect(label).toHaveValue("Who[display_name]");
  await userEvent.click(label);
  await userEvent.tab();
  expect(firstColumn()).toMatchObject({ label: "Who[display_name]" });
});

it("trims an autocomplete column's rewrite and placeholder and keeps an inserted token", async () => {
  renderWithQuery(
    <Harness
      initial={{
        id: 1,
        name: "A",
        label: "A",
        type: "autocomplete",
        settings: {
          columns: [{ type: "field", key: "display_name", rewrite: "Hi", empty_value: "x" }],
        },
      }}
    />,
  );
  const rewrite = await retype("Rewrite Text", " Hello ");
  await userEvent.tab();
  expect(firstColumn()).toMatchObject({ rewrite: "Hello" });
  await userEvent.click(
    screen.getAllByRole("combobox", { name: "Insert Token" })[1] ?? document.body,
  );
  const [column] = await screen.findAllByRole("option", { name: "Display Name" });
  await userEvent.click(column ?? document.body);
  expect(rewrite).toHaveValue("Hello[display_name]");
  await userEvent.click(rewrite);
  await userEvent.tab();
  expect(firstColumn()).toMatchObject({ rewrite: "Hello[display_name]" });
  await retype("Empty placeholder", "   ");
  await userEvent.tab();
  expect(firstColumn()).toMatchObject({ empty_value: "" });
});

// deviation:sort-controls-named
it("names each sort row's direction and clear button by its field", async () => {
  renderWithQuery(
    <Harness
      initial={{
        id: 1,
        name: "T",
        label: "T",
        type: "table",
        settings: {
          columns,
          sort: [
            ["display_name", "ASC"],
            ["id", "DESC"],
          ],
        },
      }}
    />,
  );
  const direction = screen.getByRole("combobox", { name: "Direction of Contact ID" });
  expect(direction).toHaveValue("DESC");
  await userEvent.selectOptions(direction, "ASC");
  await userEvent.click(screen.getByRole("button", { name: "Clear sorting by Display Name" }));
  expect(latest?.settings?.sort).toEqual([["id", "ASC"]]);
});

// deviation:rule-condition-alias-field
it.each([
  ["gender_id:label AS g", "Weiblich"],
  ["gender_id AS g", 1],
])(
  "offers the options of %s to a style condition, stored as the column returns them",
  async (expr, stored) => {
    mockApi({
      "SearchDisplay.getSearchTasks": () => [],
      "SearchDisplay.run": () => Object.assign([], { count: 0, countFetched: 0 }),
      "Contact.getFields": () => [
        { name: "gender_id", options: [{ id: 1, name: "Female", label: "Weiblich" }] },
      ],
    });
    const info = { ...search, api_params: { version: 4, select: [expr] } };
    renderWithQuery(
      <Harness
        info={info}
        initial={{
          id: 1,
          name: "T",
          label: "T",
          type: "table",
          settings: {
            columns: [{ type: "field", key: "g", label: "G" }],
            cssRules: [["bg-danger", "g", "=", ""]],
          },
        }}
      />,
    );
    const option = await screen.findByRole("option", { name: "Weiblich" });
    const list = option.closest("select");
    if (!list) throw new Error("The options are not a select.");
    await userEvent.selectOptions(list, option);
    expect(latest?.settings?.cssRules).toEqual([["bg-danger", "g", "=", stored]]);
  },
);

it("keeps a subsearch's chosen saved search and fills it in once its details arrive", async () => {
  window.CRM.vars = {
    ...window.CRM.vars,
    afreactAdmin: { searchDisplay: { viewableDisplayTypes: { table: "Table" } } },
  };
  mockApi({
    "SearchDisplay.getSearchTasks": () => [],
    "SearchDisplay.run": () => Object.assign([], { count: 0, countFetched: 0 }),
    "SavedSearch.autocomplete": () => [{ id: "Members", label: "Members" }],
    "SavedSearch.get": () => [
      { label: "Members", api_entity: "Contact", api_params: { version: 4, select: ["id"] } },
    ],
    "SearchDisplay.get": () => [{ name: "Members_table", label: "Members table" }],
  });
  renderWithQuery(
    <Harness
      initial={{
        id: 1,
        name: "L",
        label: "L",
        type: "list",
        settings: {
          columns: [{ type: "subsearch", subsearch: { filters: [], subsearch_mode: "dropdown" } }],
        },
      }}
    />,
  );
  await userEvent.click(await screen.findByRole("combobox", { name: "Saved Search" }));
  await userEvent.click(await screen.findByRole("option", { name: "Members" }));
  await vi.waitFor(() => {
    expect(firstColumn()).toMatchObject({
      label: "Members",
      subsearch: {
        search: "Members",
        display: "Members_table",
        filters: [{ subsearch_field: "id", parent_field: "id" }],
      },
    });
  });
  window.CRM.vars = { ...window.CRM.vars, afreactAdmin: {} };
});

it("keeps a new display's identity through its first setup and every edit", async () => {
  const fresh = newDisplay({ label: "New", type: "table", settings: {} });
  const set = initialized(ctx, fresh);
  expect(set).not.toBe(fresh);
  expect(set[DISPLAY_KEY]).toBe(fresh[DISPLAY_KEY]);
  renderWithQuery(<Harness initial={fresh} />);
  await retype(/^Name/, "Renamed");
  expect(latest?.label).toBe("Renamed");
  expect(latest?.[DISPLAY_KEY]).toBe(fresh[DISPLAY_KEY]);
});
