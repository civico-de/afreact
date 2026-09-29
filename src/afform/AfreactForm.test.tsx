import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { apiError, mockApi, renderWithQuery } from "../test/render";
import { AfreactForm, formExpressions } from "./AfreactForm";
import type { FieldDefn, LayoutNode } from "./types";

const field = (
  name: string,
  defn: Partial<FieldDefn>,
  extra: Record<string, unknown> = {},
): LayoutNode => ({
  "#tag": "af-field",
  name,
  defn: { name, label: name, input_type: "Text", data_type: "String", ...defn },
  ...extra,
});

const contactForm: LayoutNode[] = [
  {
    "#tag": "af-form",
    ctrl: "afform",
    "#children": [
      { "#tag": "af-entity", type: "Contact", name: "Individual1" },
      {
        "#tag": "fieldset",
        "af-fieldset": "Individual1",
        "af-title": "Person",
        "#children": [
          field("first_name", { label: "First Name", required: true }),
          field("gender_id", {
            label: "Gender",
            input_type: "Select",
            data_type: "Integer",
            options: [
              { id: 1, label: "Female" },
              { id: 2, label: "Male" },
            ],
          }),
          {
            "#tag": "div",
            "af-join": "Email",
            "af-repeat": "Add email",
            min: "1",
            max: "2",
            "#children": [
              {
                "#tag": "afblock-contact-email",
                "#children": [
                  field("email", { label: "Email", input_type: "Email", required: true }),
                  field("is_primary", {
                    label: "Primary",
                    input_type: "CheckBox",
                    data_type: "Boolean",
                  }),
                ],
              },
            ],
          },
        ],
      },
      {
        "#tag": "button",
        class: "af-button btn btn-primary",
        "crm-icon": "fa-check",
        "ng-click": "afform.submit()",
        "#children": [{ "#text": "Save" }],
      },
    ],
  },
];

const prefill = [
  {
    name: "Individual1",
    values: [
      {
        fields: { id: 5, first_name: "Ada", gender_id: 2 },
        joins: { Email: [{ email: "ada@example.org", is_primary: true }] },
      },
    ],
  },
];

function renderForm(
  submit: (params: Record<string, unknown>) => unknown,
  search = "?Individual1=5",
) {
  const calls = mockApi({
    "Afreact.getForm": () => [
      { name: "afformTest", title: "Test form", type: "form", layout: contactForm, strings: [] },
    ],
    "Afform.prefill": () => (search ? prefill : []),
    "Afform.submit": submit,
  });
  renderWithQuery(<AfreactForm name="afformTest" location={{ search, hash: "" }} />);
  return calls;
}

describe("AfreactForm", () => {
  it("prefills from the route arguments and submits the edited record", async () => {
    const calls = renderForm(() => [{ message: "<p>Contact saved.</p>" }]);
    const form = await screen.findByRole("form", { name: "Test form" });
    expect(within(form).getByRole("group", { name: "Person" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "First Name" })).toHaveValue("Ada");
    expect(screen.getByRole("combobox", { name: "Gender" })).toHaveValue("2");
    expect(screen.getByRole("radio", { name: "Primary" })).toBeChecked();

    await userEvent.clear(screen.getByRole("textbox", { name: "First Name" }));
    await userEvent.type(screen.getByRole("textbox", { name: "First Name" }), "Adele");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Contact saved.")).toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(calls.map(({ call }) => call)).toEqual([
      "Afreact.getForm",
      "Afform.prefill",
      "Afform.submit",
    ]);
    expect(calls[1]?.params).toEqual({
      name: "afformTest",
      args: { Individual1: ["5"] },
      fillMode: "form",
    });
    expect(calls[2]?.params).toEqual({
      name: "afformTest",
      args: { Individual1: ["5"] },
      values: {
        Individual1: [
          {
            fields: { id: 5, first_name: "Adele", gender_id: 2 },
            joins: { Email: [{ email: "ada@example.org", is_primary: true }] },
          },
        ],
      },
    });
  });

  it("blocks an incomplete submission", async () => {
    const calls = renderForm(() => [{}], "");
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Please fill all required fields.");
    expect(screen.getByRole("textbox", { name: "First Name" })).toHaveFocus();
    expect(calls.map(({ call }) => call)).not.toContain("Afform.submit");
  });

  it("submits with Enter in a text field", async () => {
    const calls = renderForm(() => [{}]);
    await userEvent.type(await screen.findByRole("textbox", { name: "First Name" }), "{Enter}");
    await waitFor(() => {
      expect(calls.map(({ call }) => call)).toContain("Afform.submit");
    });
  });

  it("keeps the form with a Saved status when there is no confirmation message", async () => {
    renderForm(() => [{}]);
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByText("Saved")).toHaveAttribute("role", "status"));
    expect(screen.getByRole("form")).toBeInTheDocument();
  });

  it("shows a server error and lets the user retry", async () => {
    renderForm(() => {
      throw apiError("Validation failed");
    });
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Validation failed");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("follows a redirect and stays busy", async () => {
    renderForm(() => [{ redirect: "#done" }]);
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(window.location.hash).toBe("#done");
    });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByText("Saving…")).toBeInTheDocument();
    window.location.hash = "";
  });

  it("adds and removes email records within min and max and moves the primary flag", async () => {
    renderForm(() => [{}], "");
    await screen.findByRole("form");
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add email" }));
    expect(screen.getAllByRole("textbox", { name: "Email" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Add email" })).not.toBeInTheDocument();

    const [first, second] = screen.getAllByRole("radio", { name: "Primary" });
    expect(first).toBeChecked();
    await userEvent.click(second!);
    expect(first).not.toBeChecked();
    expect(second).toBeChecked();

    await userEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]!);
    expect(screen.getAllByRole("textbox", { name: "Email" })).toHaveLength(1);

    const remaining = screen.getByRole("radio", { name: "Primary" });
    await userEvent.click(remaining);
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(remaining).not.toBeChecked();
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });

  it("reports a form that cannot be loaded", async () => {
    mockApi({
      "Afreact.getForm": () =>
        Promise.reject(apiError('Form "x" does not exist or you may not open it.')),
    });
    renderWithQuery(<AfreactForm name="x" location={{ search: "", hash: "" }} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("does not exist");
  });

  it("renders a layout the page embedded without calling getForm", async () => {
    const layout: LayoutNode[] = [{ "#tag": "p", "#children": [{ "#text": "a&nbsp;b" }] }];
    const form = {
      name: "afsearchTest",
      title: "Search",
      type: "search",
      layout,
      strings: [] as [],
    };
    window.CRM.vars = { afreact: { layouts: { afsearchTest: form } } };
    try {
      const calls = mockApi({});
      renderWithQuery(
        <AfreactForm name="afsearchTest" source="page" location={{ search: "", hash: "" }} />,
      );
      // The default normaliser would turn the non-breaking space into a plain one.
      const text = await screen.findByText("a\u00a0b", { normalizer: (value) => value });
      expect(text).toBeInTheDocument();
      expect(calls).toEqual([]);
    } finally {
      delete window.CRM.vars;
    }
  });

  it("renders a search page without prefill and flags what it cannot render", async () => {
    const layout: LayoutNode[] = [
      { "#comment": "note" },
      { "#tag": "div", "af-if": "x", "#children": [{ "#text": "never shown" }] },
      { "#text": "{{ total }}" },
      { "#tag": "crm-search-display-grid", "#children": [] },
      { "#tag": "crm-search-display-table", settings: { limit: 5 } },
      {
        "#tag": "div",
        "af-fieldset": "",
        class: "af-container",
        "#children": [
          field("first_name", {}, { "af-required": "x" }),
          { "#tag": "af-field", name: "last_name" },
        ],
      },
    ];
    const calls = mockApi({
      "Afreact.getForm": () => [
        { name: "afsearchTest", title: "Search", type: "search", layout, strings: [] },
      ],
    });
    renderWithQuery(<AfreactForm name="afsearchTest" location={{ search: "", hash: "" }} />);
    const notes = await screen.findAllByRole("note");
    expect(
      notes.map((note) => note.textContent?.replace("Not supported by the React renderer: ", "")),
    ).toEqual([
      'af-if="x"',
      "Angular expression {{ total }}",
      "<crm-search-display-grid>",
      "search display settings without columns",
      "af-required on first_name",
      "field last_name without metadata",
    ]);
    expect(screen.queryByText("never shown")).not.toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(calls.map(({ call }) => call)).toEqual(["Afreact.getForm"]);
  });

  it("puts a field's class on its wrapper and flags attributes afField ignores", async () => {
    const layout: LayoutNode[] = [
      { "#tag": "af-entity", type: "Contact", name: "Individual1" },
      {
        "#tag": "div",
        "af-fieldset": "Individual1",
        "#children": [field("nick_name", { label: "Nick" }, { class: "wide", placeholder: "x" })],
      },
    ];
    mockApi({
      "Afreact.getForm": () => [
        { name: "afformTest", title: "Attrs", type: "form", layout, strings: [] },
      ],
      "Afform.prefill": () => [],
    });
    renderWithQuery(<AfreactForm name="afformTest" location={{ search: "", hash: "" }} />);
    const input = await screen.findByRole("textbox", { name: "Nick" });
    const element = input.closest("af-field");
    expect(element).toHaveAttribute("name", "nick_name");
    expect(element).toHaveClass("af-field-type-text", "wide");
    expect(screen.getByRole("note")).toHaveTextContent("placeholder on nick_name");
  });

  it("makes a record-selecting field read-only when the entity forbids that action", async () => {
    const idField = field("id", {
      label: "Existing",
      input_type: "Number",
      data_type: "Integer",
      input_attrs: { autofill: "update" },
    });
    const layout = (update: boolean): LayoutNode[] => [
      {
        "#tag": "af-entity",
        type: "Contact",
        name: "Individual1",
        actions: { create: true, update },
      },
      { "#tag": "div", "af-fieldset": "Individual1", "#children": [idField] },
    ];
    for (const update of [false, true]) {
      mockApi({
        "Afreact.getForm": () => [
          { name: "afformTest", title: "Ids", type: "form", layout: layout(update), strings: [] },
        ],
        "Afform.prefill": () => [],
      });
      const { unmount } = renderWithQuery(
        <AfreactForm name="afformTest" location={{ search: "", hash: "" }} />,
      );
      const input = await screen.findByRole("spinbutton", { name: "Existing" });
      if (update) expect(input).toBeEnabled();
      else expect(input).toBeDisabled();
      unmount();
    }
  });

  it("repeats a fieldset, embeds a search display and flags a join outside a fieldset", async () => {
    const layout: LayoutNode[] = [
      {
        "#tag": "af-form",
        "#children": [
          {
            "#tag": "div",
            "af-fieldset": "Activity1",
            "af-repeat": "",
            "af-copy": "Copy",
            "add-icon": "fa-user-plus",
            min: "1",
            "#children": [field("details", { label: "Details", input_type: "TextArea" })],
          },
          { "#tag": "div", "af-join": "Email", "#children": [] },
          {
            "#tag": "crm-search-display-table",
            "search-name": "S",
            "display-name": "D",
            settings: {
              columns: [{ type: "field", key: "id", label: "ID" }],
              limit: 0,
              pager: false,
            },
          },
        ],
      },
    ];
    const calls = mockApi({
      "Afreact.getForm": () => [
        { name: "afformTest", title: "Mixed", type: "form", layout, strings: [] },
      ],
      "Afform.prefill": () => [],
      "SearchDisplay.run": () => [{ key: 1, columns: [{ val: 1 }] }],
    });
    renderWithQuery(<AfreactForm name="afformTest" location={{ search: "", hash: "" }} />);
    await userEvent.type(await screen.findByRole("textbox", { name: "Details" }), "x");
    await userEvent.click(screen.getByRole("button", { name: "Copy" }));
    const add = screen.getByRole("button", { name: "Add" });
    expect(add.querySelector(".crm-i")).toHaveClass("fa-user-plus");
    await userEvent.click(add);
    expect(
      screen
        .getAllByRole("textbox", { name: "Details" })
        .map((box) => box instanceof HTMLTextAreaElement && box.value),
    ).toEqual(["x", "x", ""]);
    expect(screen.getByRole("note")).toHaveTextContent('af-join="Email" outside a fieldset');
    expect(await screen.findByRole("cell", { name: "1" })).toBeInTheDocument();
    expect(calls.find(({ call }) => call === "SearchDisplay.run")?.params).toMatchObject({
      savedSearch: "S",
      display: "D",
      afform: "afformTest",
    });
  });

  // Route filters are covered with the search fieldset.
  it("flags a total-count binding, which writes into the page's scope", async () => {
    const layout: LayoutNode[] = [
      {
        "#tag": "crm-search-display-table",
        "search-name": "S",
        "display-name": "D",
        "total-count": "totalCount",
        settings: { columns: [{ type: "field", key: "id", label: "ID" }], pager: false },
      },
    ];
    mockApi({
      "Afreact.getForm": () => [
        { name: "afsearchTest", title: "Search", type: "search", layout, strings: [] },
      ],
      "SearchDisplay.run": () => [{ key: 1, columns: [{ val: 1 }] }],
    });
    renderWithQuery(<AfreactForm name="afsearchTest" location={{ search: "", hash: "" }} />);
    expect(await screen.findByRole("note")).toHaveTextContent('total-count="totalCount"');
    expect(await screen.findByRole("cell", { name: "1" })).toBeInTheDocument();
  });

  it("renders line breaks and rules the layout lists with an empty child list", async () => {
    const layout: LayoutNode[] = [
      { "#tag": "p", "#children": [{ "#text": "a" }, { "#tag": "br", "#children": [] }] },
      { "#tag": "hr", class: "wide", "#children": [] },
    ];
    mockApi({
      "Afreact.getForm": () => [
        { name: "afsearchTest", title: "Search", type: "search", layout, strings: [] },
      ],
    });
    const { container } = renderWithQuery(
      <AfreactForm name="afsearchTest" location={{ search: "", hash: "" }} />,
    );
    expect(await screen.findByRole("separator")).toHaveClass("wide");
    expect(container.querySelector("p br")).not.toBeNull();
  });
});

describe("formExpressions", () => {
  it("translates with the form's strings first and never returns an inherited property", () => {
    const { translate } = formExpressions({ Save: "Speichern" });
    expect(translate("Save")).toBe("Speichern");
    expect(translate("constructor")).toBe("constructor");
    expect(formExpressions([]).translate("toString")).toBe("toString");
  });
});
