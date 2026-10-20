import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { listParam, mockApi, renderWithQuery } from "../../../test/render";
import { metadata } from "../../../test/searchMetadata";
import type { EditorDisplay } from "../editor";
import { DisplayEditor } from "./DisplayEditor";

const search = {
  name: "S",
  api_entity: "Contact",
  api_params: { version: 4, select: ["id", "display_name"] },
};
const ctx = {
  meta: metadata,
  search,
  defaultPagerSize: 50,
  entityIndex: true,
  customDateFormat: true,
};
const typeInfo = { label: "Table", description: "A table", icon: "fa-table" };

let latest: EditorDisplay | undefined;
const firstColumn = () => listParam(latest?.settings?.columns)[0];

/** The editor with every edit and adoption kept, as the search editor keeps them. */
function Harness({ initial }: { initial: EditorDisplay }) {
  const [display, setDisplay] = useState(initial);
  latest = display;
  return (
    <DisplayEditor
      ctx={ctx}
      search={search}
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
