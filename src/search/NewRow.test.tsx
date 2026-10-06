import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { editInfo } from "../test/editInfo";
import { apiError, mockApi, renderWithQuery } from "../test/render";
import { AfreactSearch } from "./AfreactSearch";
import type { DisplaySettings, EditableInfo, Row } from "./types";

/** An option list with an editable label and description, as the custom field options page. */
function setup({
  inlineEdit,
  settings: extra = {},
  editable: extraEditable = {},
}: {
  inlineEdit?: (params: Record<string, unknown>) => unknown;
  settings?: Partial<DisplaySettings>;
  editable?: Record<string, EditableInfo>;
} = {}) {
  const row = (key: number, label: string, description = ""): Row => ({
    key,
    columns: [{ val: label, edit: true }, { val: String(key) }, { val: description, edit: true }],
    data: { id: key, label, value: String(key), description },
  });
  const settings: DisplaySettings = {
    columns: [
      { type: "field", key: "label", label: "Label", editable: true },
      { type: "field", key: "value", label: "Value" },
      { type: "field", key: "description", label: "Description", editable: true },
    ],
    editableRow: { create: true, createLabel: "Add Option" },
    headerCount: true,
    ...extra,
  };
  const calls = mockApi({
    "SearchDisplay.run": (params) =>
      params.return === "row_count"
        ? Object.assign([], { count: 1 })
        : Object.assign([row(1, "One")], {
            editable: {
              label: editInfo({ value_key: "label", entity: "OptionValue", nullable: false }),
              description: editInfo({ value_key: "description", entity: "OptionValue" }),
              ...extraEditable,
            },
          }),
    "SearchDisplay.inlineEdit":
      inlineEdit ??
      ((params) => {
        const values = params.values as { label: string; description?: string };
        return [row(2, values.label, values.description)];
      }),
  });
  renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} afform="afsearchX" />);
  const edits = () =>
    calls.filter(({ call }) => call === "SearchDisplay.inlineEdit").map(({ params }) => params);
  const pages = () =>
    calls.filter(({ call, params }) => call === "SearchDisplay.run" && params.return === "page:1");
  return { calls, edits, pages };
}

const addButton = () => screen.getByRole("button", { name: "Add Option" });
const newRow = () => screen.getByRole("button", { name: "Save" }).closest("tr")!;
const rowOpen = () => screen.queryByRole("button", { name: "Save" }) !== null;
const rows = () => screen.getAllByRole("row").filter((row) => row.closest("tbody"));

describe("editableRow.create", () => {
  it("adds a row of inputs for the editable columns and saves it as a new record", async () => {
    const { edits } = setup();
    await screen.findByText("One");
    expect(screen.getByText("1 result")).toBeInTheDocument();
    await userEvent.click(addButton());
    const label = within(newRow()).getByRole("textbox", { name: "Label" });
    expect(label).toHaveFocus();
    expect(label).toBeRequired();
    expect(within(newRow()).getByRole("textbox", { name: "Description" })).not.toBeRequired();
    // The value column is not editable, so its cell stays empty.
    expect(within(newRow()).getAllByRole("cell")).toHaveLength(4);
    expect(within(newRow()).queryByRole("textbox", { name: "Value" })).not.toBeInTheDocument();
    await userEvent.type(label, "Two");
    await userEvent.type(within(newRow()).getByRole("textbox", { name: "Description" }), "Second");
    await userEvent.click(within(newRow()).getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(screen.getByText("Two")).toBeInTheDocument();
    });
    // getApiParams() without a row key, as saveEditing() sends it in create mode.
    expect(edits()).toEqual([
      expect.objectContaining({
        return: null,
        values: { label: "Two", description: "Second" },
      }),
    ]);
    expect(edits()[0]).not.toHaveProperty("rowKey");
    // The new row joins the page without a reload and counts.
    expect(rows()).toHaveLength(3);
    const cells = within(rows()[1]!).getAllByRole("cell");
    expect(cells.map((cell) => cell.textContent?.replace(/\s+/g, " ").trim())).toEqual([
      "",
      "Edit Label Two",
      "2",
      "Edit Description Second",
    ]);
    expect(screen.getByText("2 results")).toBeInTheDocument();
    expect(screen.getByText("Saved", { selector: "[role=status]" })).toBeInTheDocument();
    expect(addButton()).toBeInTheDocument();
  });

  it("saves with Enter, cancels with Escape and holds an empty required value", async () => {
    const { edits } = setup();
    await screen.findByText("One");
    await userEvent.click(addButton());
    await userEvent.keyboard("{Enter}");
    expect(within(newRow()).getByRole("textbox", { name: "Label" })).toBeInvalid();
    expect(edits()).toHaveLength(0);
    await userEvent.keyboard("{Escape}");
    expect(rowOpen()).toBe(false);
    expect(addButton()).toHaveFocus();
    await userEvent.click(addButton());
    await userEvent.type(within(newRow()).getByRole("textbox", { name: "Label" }), "Three{Enter}");
    await waitFor(() => {
      expect(edits()).toHaveLength(1);
    });
    expect(edits()[0]?.values).toEqual({ label: "Three" });
  });

  it("keeps the row open with the error and the typed values when the save fails", async () => {
    let fail = (): void => {};
    setup({
      inlineEdit: () =>
        new Promise((_, reject) => (fail = () => reject(apiError("Duplicate label")))),
    });
    await screen.findByText("One");
    await userEvent.click(addButton());
    await userEvent.type(within(newRow()).getByRole("textbox", { name: "Label" }), "One{Enter}");
    // While the save runs the inputs hold their values, disabled.
    expect(within(newRow()).getByRole("textbox", { name: "Label" })).toHaveValue("One");
    expect(within(newRow()).getByRole("textbox", { name: "Label" })).toBeDisabled();
    expect(within(newRow()).getByRole("button", { name: "Save" })).toBeDisabled();
    fail();
    await within(newRow()).findByText("Duplicate label");
    const label = within(newRow()).getByRole("textbox", { name: "Label" });
    expect(label).toHaveValue("One");
    expect(label).toBeInvalid();
    expect(screen.getByText("Not saved: Duplicate label")).toHaveAttribute("role", "status");
  });

  it("excludes the new row and a cell editor from each other", async () => {
    setup();
    await screen.findByText("One");
    await userEvent.click(screen.getByRole("button", { name: /Edit Label/ }));
    expect(screen.queryByRole("button", { name: "Add Option" })).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(addButton());
    await userEvent.click(screen.getByRole("button", { name: /Edit Label/ }));
    expect(screen.queryByLabelText("Label, One")).not.toBeInTheDocument();
    expect(rowOpen()).toBe(true);
  });

  it("reloads the form's displays when the new record does not match the filters", async () => {
    const { pages } = setup({ inlineEdit: () => [] });
    await screen.findByText("One");
    await userEvent.click(addButton());
    await userEvent.type(within(newRow()).getByRole("textbox", { name: "Label" }), "Other{Enter}");
    await waitFor(() => {
      expect(pages()).toHaveLength(2);
    });
    expect(rowOpen()).toBe(false);
    expect(rows()).toHaveLength(2);
    expect(addButton()).toHaveFocus();
  });

  it("leaves hidden columns out of the row", async () => {
    setup({ settings: { toggleColumns: true } });
    await screen.findByText("One");
    await userEvent.click(screen.getByText("Pick Columns"));
    await userEvent.click(screen.getByRole("checkbox", { name: "Description" }));
    await userEvent.click(addButton());
    expect(within(newRow()).getAllByRole("cell")).toHaveLength(3);
    expect(within(newRow()).queryByRole("textbox", { name: "Description" })).toBeNull();
  });

  it("names a column it cannot fill", async () => {
    const employer = (nullable: boolean) =>
      editInfo({ value_key: "employer_id", entity: "OptionValue", fk_entity: "Contact", nullable });
    setup({ editable: { "employer_id.display_name": employer(true) } });
    await screen.findByText("One");
    expect(screen.getByRole("note")).toHaveTextContent(
      "in-place editing of employer_id.display_name (EntityRef), " +
        "new row: employer_id.display_name (EntityRef)",
    );
    expect(addButton()).toBeInTheDocument();
  });

  it("withholds the row when a column it cannot fill is required", async () => {
    const employer = editInfo({
      value_key: "employer_id",
      entity: "OptionValue",
      fk_entity: "Contact",
      nullable: false,
    });
    setup({ editable: { "employer_id.display_name": employer } });
    await screen.findByText("One");
    expect(screen.getByRole("note")).toHaveTextContent(
      "new row: employer_id.display_name (EntityRef, required)",
    );
    expect(screen.queryByRole("button", { name: "Add Option" })).not.toBeInTheDocument();
  });

  it("shows the button only on a table with editableRow.create", async () => {
    setup({ settings: { editableRow: { full: true } } });
    await screen.findByText("One");
    expect(screen.queryByRole("button", { name: "Add Option" })).not.toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("full-row editing (editableRow.full)");
  });
});
