import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { jquerySelection } from "../test/jquery";
import { apiError, mockApi, renderWithQuery } from "../test/render";
import { AfreactForm, formExpressions, redirectUrl } from "./AfreactForm";
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

const meta = {
  name: "afformTest",
  title: "Test form",
  redirect: null,
  autosave_draft: false,
  confirmation_type: "show_confirmation_message",
  confirmation_message: null,
};

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
  container?: HTMLElement,
) {
  const calls = mockApi({
    "Afreact.getForm": () => [
      {
        name: "afformTest",
        title: "Test form",
        type: "form",
        meta,
        layout: contactForm,
        strings: [],
      },
    ],
    "Afform.prefill": () => (search ? prefill : []),
    "Afform.submit": submit,
  });
  renderWithQuery(
    <AfreactForm name="afformTest" location={{ search, hash: "" }} />,
    undefined,
    true,
    container,
  );
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

  describe("a value shorter than its minlength", () => {
    const form = (fields: LayoutNode[]): LayoutNode[] => [
      {
        "#tag": "af-form",
        ctrl: "afform",
        "#children": [
          { "#tag": "af-entity", type: "Contact", name: "Individual1" },
          { "#tag": "fieldset", "af-fieldset": "Individual1", "#children": fields },
          { "#tag": "button", "ng-click": "afform.submit()", "#children": [{ "#text": "Save" }] },
        ],
      },
    ];
    function renderFields(fields: LayoutNode[], values: Record<string, unknown>) {
      const calls = mockApi({
        "Afreact.getForm": () => [
          { name: "afformTest", title: "Test", type: "form", layout: form(fields), strings: [] },
        ],
        "Afform.prefill": () => [{ name: "Individual1", values: [{ fields: values }] }],
        "Afform.submit": () => [{}],
      });
      renderWithQuery(<AfreactForm name="afformTest" location={{ search: "", hash: "" }} />);
      return calls;
    }
    const save = async () => {
      await userEvent.click(await screen.findByRole("button", { name: "Save" }));
    };

    it("blocks the submission and names the field, without its required marker", async () => {
      const calls = renderFields(
        [
          field("first_name", {
            label: "First Name",
            required: true,
            input_attrs: { minlength: 3 },
          }),
          field("note", { label: "Note", input_type: "TextArea", input_attrs: { minlength: 5 } }),
        ],
        { first_name: "Al", note: "Hi" },
      );
      await save();
      expect(screen.getByRole("alert")).toHaveTextContent(
        /^First Name must be at least 3 characters\.$/,
      );
      const name = screen.getByRole("textbox", { name: "First Name" });
      expect(name).toHaveAttribute("minlength", "3");
      expect(name).toHaveFocus();
      expect(screen.getByRole("textbox", { name: "Note" })).toHaveAttribute("minlength", "5");
      expect(calls.map(({ call }) => call)).not.toContain("Afform.submit");

      await userEvent.type(name, "an");
      await save();
      expect(screen.getByRole("alert")).toHaveTextContent("Note must be at least 5 characters.");
      await userEvent.type(screen.getByRole("textbox", { name: "Note" }), " there");
      await save();
      await waitFor(() => {
        expect(calls.map(({ call }) => call)).toContain("Afform.submit");
      });
    });

    it("measures the trimmed text, as ng-minlength does", async () => {
      const calls = renderFields(
        [field("first_name", { label: "First Name", input_attrs: { minlength: 3 } })],
        { first_name: "Ada" },
      );
      const name = await screen.findByRole("textbox", { name: "First Name" });
      await userEvent.clear(name);
      await userEvent.type(name, "ab ");
      await save();
      expect(screen.getByRole("alert")).toHaveTextContent("First Name must be at least 3 characters.");
      expect(calls.map(({ call }) => call)).not.toContain("Afform.submit");
    });

    it("lets an empty value through and leaves minlength off other input types", async () => {
      const calls = renderFields(
        [
          field("first_name", { label: "First Name", input_attrs: { minlength: 3 } }),
          field("email", { label: "Email", input_type: "Email", input_attrs: { minlength: 30 } }),
        ],
        { email: "ada@example.org" },
      );
      expect(await screen.findByRole("textbox", { name: "Email" })).not.toHaveAttribute(
        "minlength",
      );
      await save();
      await waitFor(() => {
        expect(calls.map(({ call }) => call)).toContain("Afform.submit");
      });
    });

    it("words the message without a label when the field has none", async () => {
      renderFields([field("nick_name", { label: false, input_attrs: { minlength: 4 } })], {
        nick_name: "Al",
      });
      await save();
      expect(screen.getByRole("alert")).toHaveTextContent(
        "One or more fields must have at least 4 characters.",
      );
    });
  });

  it("reports an invalid value apart from a missing one", async () => {
    renderForm(() => [{}]);
    const email = await screen.findByRole("textbox", { name: "Email" });
    await userEvent.clear(email);
    await userEvent.type(email, "not an address");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Please check all answers are valid.");
  });

  it("blocks a required field holding only spaces, as ngModel trims it to empty", async () => {
    const calls = renderForm(() => [{}]);
    const first = await screen.findByRole("textbox", { name: "First Name" });
    await waitFor(() => expect(first).toHaveValue("Ada"));
    await userEvent.clear(first);
    await userEvent.type(first, "   ");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Please fill all required fields.");
    expect(first).toHaveFocus();
    expect(calls.map(({ call }) => call)).not.toContain("Afform.submit");
  });

  it("submits with Enter in a text field", async () => {
    const calls = renderForm(() => [{}]);
    await userEvent.type(await screen.findByRole("textbox", { name: "First Name" }), "{Enter}");
    await waitFor(() => {
      expect(calls.map(({ call }) => call)).toContain("Afform.submit");
    });
  });

  it("submits from inside a page's own form, as in the case summary, not that form", async () => {
    const outer = document.body.appendChild(document.createElement("form"));
    const outerSubmit = vi.fn((event: Event) => {
      event.preventDefault();
    });
    outer.addEventListener("submit", outerSubmit);
    const host = outer.appendChild(document.createElement("div"));
    const calls = renderForm(() => [{}], "?Individual1=5", host);
    const submits = () => calls.filter(({ call }) => call === "Afform.submit");
    const form = await within(outer).findByRole("form", { name: "Test form" });
    await userEvent.type(within(form).getByRole("textbox", { name: "First Name" }), "{Enter}");
    await waitFor(() => {
      expect(submits()).toHaveLength(1);
    });
    await userEvent.click(within(form).getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(submits()).toHaveLength(2);
    });
    expect(outerSubmit).not.toHaveBeenCalled();
    outer.remove();
  });

  it("keeps the form with a Saved status when there is no confirmation message", async () => {
    renderForm(() => [{}]);
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByText("Saved")).toHaveAttribute("role", "status"));
    expect(screen.getByRole("form")).toBeInTheDocument();
  });

  it("announces the save as afForm does and closes the popup it sits in", async () => {
    const dialog = vi.fn(() => popup);
    const trigger = vi.fn(() => popup);
    const popup = jquerySelection({ length: 1, data: () => "", trigger, dialog });
    vi.mocked(window.CRM.$).mockReturnValue(popup);
    renderForm(() => [{ saved: true }]);
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(dialog).toHaveBeenCalledWith("close");
    });
    expect(trigger).toHaveBeenCalledWith(
      "crmFormSuccess",
      expect.objectContaining({
        afform: meta,
        submissionResponse: [{ saved: true }],
      }),
    );
  });

  it("keeps the popup open for a confirmation message", async () => {
    const dialog = vi.fn(() => popup);
    const popup = jquerySelection({ length: 1, data: () => "", dialog });
    vi.mocked(window.CRM.$).mockReturnValue(popup);
    renderForm(() => [{ message: "Thanks" }]);
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
    expect(await screen.findByText("Thanks")).toBeInTheDocument();
    expect(dialog).not.toHaveBeenCalled();
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

    // The primary record went; afField's watcher makes the first one primary again.
    expect(screen.getByRole("radio", { name: "Primary" })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Add email" }));
    const [kept, added] = screen.getAllByRole("radio", { name: "Primary" });
    await userEvent.click(added!);
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(kept).toBeChecked();
    expect(added).not.toBeChecked();
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
      meta: { name: "afsearchTest", title: "Search" },
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
      { "#tag": "crm-search-display-batch", "#children": [] },
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
      "<crm-search-display-batch>",
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
    // As afRepeat.html, an empty af-repeat shows only the icon; both buttons keep a name.
    const visibleText = (button: HTMLElement) =>
      [...button.childNodes]
        .filter((node) => !(node instanceof HTMLElement && node.classList.contains("sr-only")))
        .map((node) => node.textContent)
        .join("")
        .trim();
    expect(visibleText(add)).toBe("");
    expect(visibleText(screen.getAllByRole("button", { name: "Remove" })[0]!)).toBe("");
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

describe("redirectUrl", () => {
  it("keeps every path on this site, as afForm's postProcess prefixes protocol and host", () => {
    const origin = `${window.location.protocol}//${window.location.host}`;
    expect(redirectUrl("//elsewhere.example/x")).toBe(`${origin}//elsewhere.example/x`);
    expect(redirectUrl("/thanks")).toBe(`${origin}/thanks`);
    expect(redirectUrl("https://example.org/done")).toBe("https://example.org/done");
    expect(redirectUrl("civicrm/done")).toBe(window.CRM.url("civicrm/done"));
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
