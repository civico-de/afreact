import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { jquerySelection } from "../../test/jquery";
import { apiError, mockApi, renderWithQuery } from "../../test/render";
import { AfreactForm } from "../AfreactForm";
import { layoutProblems } from "../support";
import type { FieldDefn, LayoutNode } from "../types";

type Handler = (params: Record<string, unknown>) => unknown;

const entityRef = (name: string, defn: Partial<FieldDefn> = {}): LayoutNode => ({
  "#tag": "af-field",
  name,
  defn: {
    name,
    label: "Employer",
    input_type: "EntityRef",
    data_type: "Integer",
    fk_entity: "Contact",
    ...defn,
  },
});

const submit: LayoutNode = {
  "#tag": "button",
  "ng-click": "afform.submit()",
  "#children": [{ "#text": "Submit" }],
};

function form(children: LayoutNode[]): LayoutNode[] {
  return [
    {
      "#tag": "af-form",
      ctrl: "afform",
      "#children": [
        { "#tag": "af-entity", type: "Contact", name: "Individual1", actions: "{update: true}" },
        { "#tag": "div", "af-fieldset": "Individual1", "#children": children },
        submit,
      ],
    },
  ];
}

function renderForm(layout: LayoutNode[], handlers: Record<string, Handler>) {
  const calls = mockApi({
    "Afreact.getForm": () => [
      { name: "afformTest", title: "Test", type: "form", layout, strings: [] },
    ],
    "Afform.prefill": () => [],
    "Afform.submit": () => [{}],
    ...handlers,
  });
  renderWithQuery(<AfreactForm name="afformTest" location={{ search: "", hash: "" }} />);
  return calls;
}

/** A result of `<Entity>.autocomplete`, with the props CRM.api4 copies onto the list. */
const rows = (items: { id: number; label: string }[], extra: object = {}) =>
  Object.assign(items, { countFetched: items.length, countMatched: items.length, ...extra });

const ADA = { id: 1, label: "Ada" };
const BOB = { id: 2, label: "Bob" };
const CY = { id: 3, label: "Cy" };

const searches = (calls: ReturnType<typeof mockApi>) =>
  calls.filter(({ call, params }) => call === "Contact.autocomplete" && !("ids" in params));
/** The combobox's own live region; the form has others. */
function widget(input: HTMLElement): HTMLElement {
  const container = input.closest<HTMLElement>(".afreact-combobox");
  if (!container) throw new Error("input outside a combobox");
  return container;
}
const announced = (input: HTMLElement) => within(widget(input)).getByRole("status");
const findAnnounced = (input: HTMLElement) => within(widget(input)).findByRole("status");
const submitted = (calls: ReturnType<typeof mockApi>) =>
  calls.find(({ call }) => call === "Afform.submit")?.params.values;

describe("EntityRef", () => {
  // The lazy combobox chunk loads once here, not inside the first test's findBy timeout.
  beforeAll(async () => {
    await import("./Combobox");
  });

  // deviation:entityref-aria-combobox
  it("searches once the typing pauses and submits the chosen id as a number", async () => {
    const calls = renderForm(form([entityRef("employer_id")]), {
      "Contact.autocomplete": () => rows([ADA, BOB]),
    });
    const input = await screen.findByRole("combobox", { name: "Employer" });
    expect(input).toHaveAttribute("aria-expanded", "false");
    await userEvent.type(input, "Ad");
    const listbox = screen.getByRole("listbox", { name: "Employer" });
    await within(listbox).findByRole("option", { name: "Ada" });
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(announced(input)).toHaveTextContent("2 results");
    // One request for the whole term, with the field's form context.
    expect(searches(calls).map(({ params }) => params)).toEqual([
      {
        input: "Ad",
        searchField: null,
        exclude: null,
        quickEdit: false,
        formName: "afform:afformTest",
        fieldName: "Individual1:employer_id",
        values: {},
      },
    ]);
    await userEvent.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute(
      "aria-activedescendant",
      within(listbox).getByRole("option", { name: "Bob" }).id,
    );
    await userEvent.keyboard("{Enter}");
    expect(input).toHaveValue("Bob");
    expect(input).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(submitted(calls)).toEqual({
        Individual1: [{ fields: { employer_id: 2 }, joins: {} }],
        extra: { fields: {} },
      });
    });
  });

  it("says when the term is too short, when it searches, and when nothing matches", async () => {
    let answer: (value: unknown) => void = () => undefined;
    renderForm(form([entityRef("employer_id")]), {
      "Contact.autocomplete": () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    });
    const input = await screen.findByRole("combobox", { name: "Employer" });
    await userEvent.click(input);
    expect(announced(input)).toHaveTextContent("Enter search term or id...");
    await userEvent.type(input, "Z");
    expect(await findAnnounced(input)).toHaveTextContent("Searching...");
    await waitFor(() => {
      answer(rows([]));
      expect(announced(input)).toHaveTextContent("None found.");
    });
    // Escape closes the list and gives the input back its value.
    await userEvent.keyboard("{Escape}");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveValue("");
  });

  it("loads the next page at the last result, excluding what it lists, as select2 does", async () => {
    const calls = renderForm(form([entityRef("employer_id")]), {
      "Contact.autocomplete": ({ exclude, searchField }) =>
        exclude
          ? rows(searchField === "id" ? [] : [CY], {
              searchField,
              searchFields: ["sort_name", "id"],
            })
          : rows([ADA, BOB], {
              countMatched: 3,
              searchField: "sort_name",
              searchFields: ["sort_name", "id"],
            }),
    });
    const input = await screen.findByRole("combobox", { name: "Employer" });
    await userEvent.type(input, "a");
    await screen.findByRole("option", { name: "Bob" });
    await userEvent.keyboard("{ArrowDown}");
    await screen.findByRole("option", { name: "Cy" });
    expect(searches(calls).map(({ params }) => [params.searchField, params.exclude])).toEqual([
      [null, null],
      ["sort_name", [1, 2]],
    ]);
    // The last field ran out: a further page moves on to the next search field.
    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() => {
      expect(searches(calls).map(({ params }) => [params.searchField, params.exclude])).toEqual([
        [null, null],
        ["sort_name", [1, 2]],
        ["id", [1, 2, 3]],
      ]);
    });
  });

  it("shows the stored ids as removable chips and submits the list that is left", async () => {
    const calls = renderForm(
      form([entityRef("tag_ids", { label: "Contacts", input_attrs: { multiple: true } })]),
      {
        "Afform.prefill": () => [
          { name: "Individual1", values: [{ fields: { tag_ids: [1, 2] } }] },
        ],
        "Contact.autocomplete": ({ ids }) => (ids ? rows([ADA, BOB]) : rows([ADA, BOB, CY])),
      },
    );
    const remove = await screen.findByRole("button", { name: "Remove Ada" });
    expect(screen.getByRole("button", { name: "Remove Bob" })).toBeInTheDocument();
    const input = screen.getByRole("combobox", { name: "Contacts" });
    // A chip goes by keyboard, and focus returns to the input.
    remove.focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.queryByRole("button", { name: "Remove Ada" })).toBeNull();
    expect(input).toHaveFocus();
    // Backspace in the empty input removes the last chip.
    await userEvent.keyboard("{Backspace}");
    expect(screen.queryByRole("button", { name: "Remove Bob" })).toBeNull();
    await userEvent.type(input, "c");
    await screen.findByRole("option", { name: "Cy" });
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    // Chosen records leave the results.
    await userEvent.type(input, "c");
    const listbox = screen.getByRole("listbox");
    await within(listbox).findByRole("option", { name: "Ada" });
    expect(within(listbox).queryByRole("option", { name: "Cy" })).toBeNull();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(submitted(calls)).toEqual({
        Individual1: [{ fields: { tag_ids: [3] }, joins: {} }],
        extra: { fields: {} },
      });
    });
  });

  // deviation:missing-ids-noted
  it("says which stored ids it could not find", async () => {
    renderForm(form([entityRef("employer_id")]), {
      "Afform.prefill": () => [{ name: "Individual1", values: [{ fields: { employer_id: 9 } }] }],
      "Contact.autocomplete": () => rows([]),
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("No record found for 9.");
  });

  it("keeps a required field invalid until a record is chosen, and clears a single value", async () => {
    renderForm(form([entityRef("employer_id", { required: true })]), {
      "Contact.autocomplete": () => rows([ADA]),
    });
    const input = await screen.findByRole("combobox", { name: /Employer/ });
    expect(input).toBeRequired();
    expect(input).toBeInvalid();
    await userEvent.type(input, "a");
    await userEvent.click(await screen.findByRole("option", { name: "Ada" }));
    expect(input).toBeValid();
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(input).toHaveValue("");
    expect(input).toBeInvalid();
  });

  it("lists results before typing with autoOpen", async () => {
    const calls = renderForm(
      form([entityRef("campaign_id", { input_attrs: { autoOpen: true } })]),
      {
        "Contact.autocomplete": () => rows([ADA]),
      },
    );
    await userEvent.click(await screen.findByRole("combobox", { name: "Employer" }));
    await screen.findByRole("option", { name: "Ada" });
    expect(searches(calls)[0]?.params.input).toBe("");
  });

  it("fills the entity with the record an autofill field selects, and resets it when cleared", async () => {
    const calls = renderForm(
      form([
        entityRef("id", { label: "Existing", input_attrs: { autofill: "update" } }),
        {
          "#tag": "af-field",
          name: "first_name",
          defn: { name: "first_name", label: "First", input_type: "Text", data_type: "String" },
        },
      ]),
      {
        "Contact.autocomplete": () => rows([ADA]),
        "Afform.prefill": ({ fillMode }) =>
          fillMode === "entity"
            ? [{ name: "Individual1", values: [{ fields: { id: 1, first_name: "Ada" } }] }]
            : [],
      },
    );
    const input = await screen.findByRole("combobox", { name: "Existing" });
    await userEvent.type(input, "a");
    await userEvent.click(await screen.findByRole("option", { name: "Ada" }));
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "First" })).toHaveValue("Ada");
    });
    expect(calls.find(({ params }) => params.fillMode === "entity")?.params).toEqual({
      name: "afformTest",
      args: { Individual1: { 0: { id: 1 } } },
      fillMode: "entity",
    });
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "First" })).toHaveValue("");
    });
  });

  // deviation:autofill-latest-selection
  it("drops the prefill of a selection that was cleared before it arrived", async () => {
    let answer: (records: unknown) => void = () => undefined;
    renderForm(
      form([
        entityRef("id", { label: "Existing", input_attrs: { autofill: "update" } }),
        {
          "#tag": "af-field",
          name: "first_name",
          defn: { name: "first_name", label: "First", input_type: "Text", data_type: "String" },
        },
      ]),
      {
        "Contact.autocomplete": () => rows([ADA]),
        "Afform.prefill": ({ fillMode }) =>
          fillMode === "entity"
            ? new Promise((resolve) => {
                answer = resolve;
              })
            : [],
      },
    );
    const input = await screen.findByRole("combobox", { name: "Existing" });
    await userEvent.type(input, "a");
    await userEvent.click(await screen.findByRole("option", { name: "Ada" }));
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    answer([{ name: "Individual1", values: [{ fields: { id: 1, first_name: "Ada" } }] }]);
    await userEvent.type(screen.getByRole("textbox", { name: "First" }), "B");
    expect(screen.getByRole("textbox", { name: "First" })).toHaveValue("B");
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
  });

  it("merges the selected record's join records into the ones typed, by position", async () => {
    const text = (name: string, label: string): LayoutNode => ({
      "#tag": "af-field",
      name,
      defn: { name, label, input_type: "Text", data_type: "String" },
    });
    renderForm(
      form([
        entityRef("id", { label: "Existing", input_attrs: { autofill: "update" } }),
        {
          "#tag": "div",
          "af-join": "Email",
          "#children": [text("email", "Email"), text("signature_text", "Signature")],
        },
      ]),
      {
        "Contact.autocomplete": () => rows([ADA]),
        "Afform.prefill": ({ fillMode }) =>
          fillMode === "entity"
            ? [
                {
                  name: "Individual1",
                  values: [{ fields: { id: 1 }, joins: { Email: [{ email: "a@example.org" }] } }],
                },
              ]
            : [],
      },
    );
    await userEvent.type(await screen.findByRole("textbox", { name: "Signature" }), "Sig");
    const input = screen.getByRole("combobox", { name: "Existing" });
    await userEvent.type(input, "a");
    await userEvent.click(await screen.findByRole("option", { name: "Ada" }));
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Email" })).toHaveValue("a@example.org");
    });
    expect(screen.getByRole("textbox", { name: "Signature" })).toHaveValue("Sig");
  });

  it("fills a related entity the prefill of the selected record returns too", async () => {
    const firstName = (label: string): LayoutNode => ({
      "#tag": "af-field",
      name: "first_name",
      defn: { name: "first_name", label, input_type: "Text", data_type: "String" },
    });
    const layout: LayoutNode[] = [
      {
        "#tag": "af-form",
        ctrl: "afform",
        "#children": [
          { "#tag": "af-entity", type: "Contact", name: "Individual1", actions: "{update: true}" },
          { "#tag": "af-entity", type: "Contact", name: "Individual2", actions: "{update: true}" },
          {
            "#tag": "div",
            "af-fieldset": "Individual1",
            "#children": [
              entityRef("id", { label: "Existing", input_attrs: { autofill: "update" } }),
              firstName("First"),
            ],
          },
          { "#tag": "div", "af-fieldset": "Individual2", "#children": [firstName("Child")] },
          submit,
        ],
      },
    ];
    renderForm(layout, {
      "Contact.autocomplete": () => rows([ADA]),
      "Afform.prefill": ({ fillMode }) =>
        fillMode === "entity"
          ? [
              { name: "Individual1", values: [{ fields: { id: 1, first_name: "Ada" } }] },
              { name: "Individual2", values: [{ fields: { id: 7, first_name: "Kim" } }] },
            ]
          : [],
    });
    const input = await screen.findByRole("combobox", { name: "Existing" });
    await userEvent.type(input, "a");
    await userEvent.click(await screen.findByRole("option", { name: "Ada" }));
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Child" })).toHaveValue("Kim");
    });
    expect(screen.getByRole("textbox", { name: "First" })).toHaveValue("Ada");
  });

  // deviation:autofill-clear-resets-related
  it("fills related entities with a selection and resets the untouched ones when it is cleared", async () => {
    const text = (name: string, label: string): LayoutNode => ({
      "#tag": "af-field",
      name,
      defn: { name, label, input_type: "Text", data_type: "String" },
    });
    const layout: LayoutNode[] = [
      {
        "#tag": "af-form",
        ctrl: "afform",
        "#children": [
          { "#tag": "af-entity", type: "Contact", name: "Individual1", actions: "{update: true}" },
          { "#tag": "af-entity", type: "Contact", name: "Individual2", actions: "{update: true}" },
          { "#tag": "af-entity", type: "Contact", name: "Individual3", actions: "{update: true}" },
          {
            "#tag": "div",
            "af-fieldset": "Individual1",
            "#children": [
              entityRef("id", { label: "Existing", input_attrs: { autofill: "update" } }),
            ],
          },
          {
            "#tag": "div",
            "af-fieldset": "Individual2",
            "#children": [text("first_name", "Spouse")],
          },
          {
            "#tag": "div",
            "af-fieldset": "Individual3",
            "#children": [text("first_name", "Child")],
          },
        ],
      },
    ];
    renderForm(layout, {
      "Contact.autocomplete": () => rows([ADA]),
      "Afform.prefill": ({ fillMode }) =>
        fillMode === "entity"
          ? [
              { name: "Individual1", values: [{ fields: { id: 1 } }] },
              { name: "Individual2", values: [{ fields: { id: 5, first_name: "Sam" } }] },
              { name: "Individual3", values: [{ fields: { id: 6 } }] },
            ]
          : [],
    });
    const input = await screen.findByRole("combobox", { name: "Existing" });
    const spouse = screen.getByRole("textbox", { name: "Spouse" });
    const child = screen.getByRole("textbox", { name: "Child" });
    await userEvent.type(spouse, "Jo");
    await userEvent.type(input, "a");
    await userEvent.click(await screen.findByRole("option", { name: "Ada" }));
    await waitFor(() => {
      expect(spouse).toHaveValue("Sam");
    });
    expect(child).toHaveValue("");
    // A field the selection left empty counts as an edit once typed into.
    await userEvent.type(child, "a");
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    // What was typed before the selection comes back with the clear.
    await waitFor(() => {
      expect(spouse).toHaveValue("Jo");
    });
    expect(child).toHaveValue("a");
  });

  // deviation:autofill-clear-resets-related
  it("resets what a repeated selection filled after an earlier item was removed, or it was undone", async () => {
    const layout: LayoutNode[] = [
      {
        "#tag": "af-form",
        ctrl: "afform",
        "#children": [
          { "#tag": "af-entity", type: "Contact", name: "Individual1", actions: "{update: true}" },
          { "#tag": "af-entity", type: "Contact", name: "Individual2", actions: "{update: true}" },
          {
            "#tag": "div",
            "af-fieldset": "Individual1",
            "af-repeat": "Add person",
            "#children": [
              entityRef("id", { label: "Existing", input_attrs: { autofill: "update" } }),
            ],
          },
          {
            "#tag": "div",
            "af-fieldset": "Individual2",
            "#children": [
              {
                "#tag": "af-field",
                name: "first_name",
                defn: {
                  name: "first_name",
                  label: "Spouse",
                  input_type: "Text",
                  data_type: "String",
                },
              },
            ],
          },
        ],
      },
    ];
    renderForm(layout, {
      "Contact.autocomplete": () => rows([ADA]),
      "Afform.prefill": ({ fillMode }) =>
        fillMode === "entity"
          ? [
              { name: "Individual1", values: [{ fields: { id: 1 } }, { fields: { id: 1 } }] },
              { name: "Individual2", values: [{ fields: { id: 5, first_name: "Sam" } }] },
            ]
          : [],
    });
    await userEvent.click(await screen.findByRole("button", { name: "Add person" }));
    const second = screen.getAllByRole("combobox", { name: "Existing" })[1];
    if (!second) throw new Error("no second item");
    await userEvent.type(second, "a");
    await userEvent.click(await screen.findByRole("option", { name: "Ada" }));
    const spouse = screen.getByRole("textbox", { name: "Spouse" });
    await waitFor(() => {
      expect(spouse).toHaveValue("Sam");
    });
    await userEvent.click(screen.getByRole("button", { name: /^Remove item 1/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Remove item 1/ }));
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => {
      expect(spouse).toHaveValue("");
    });
  });

  // deviation:autofill-clear-resets-related
  it("gives a repeat item added in a removed one's place none of its autofill history", async () => {
    const layout: LayoutNode[] = [
      {
        "#tag": "af-form",
        ctrl: "afform",
        "#children": [
          { "#tag": "af-entity", type: "Contact", name: "Individual1", actions: "{update: true}" },
          { "#tag": "af-entity", type: "Contact", name: "Individual2", actions: "{update: true}" },
          {
            "#tag": "div",
            "af-fieldset": "Individual1",
            "af-repeat": "Add person",
            "#children": [
              entityRef("id", { label: "Existing", input_attrs: { autofill: "update" } }),
            ],
          },
          {
            "#tag": "div",
            "af-fieldset": "Individual2",
            "#children": [
              {
                "#tag": "af-field",
                name: "first_name",
                defn: {
                  name: "first_name",
                  label: "Spouse",
                  input_type: "Text",
                  data_type: "String",
                },
              },
            ],
          },
        ],
      },
    ];
    renderForm(layout, {
      "Contact.autocomplete": () => rows([ADA, BOB]),
      "Afform.prefill": ({ fillMode, args }) => {
        if (fillMode !== "entity") return [];
        if (JSON.stringify(args).includes('"id":2'))
          return [{ name: "Individual1", values: [{ fields: { id: 2 } }] }];
        return [
          { name: "Individual1", values: [{ fields: { id: 1 } }] },
          { name: "Individual2", values: [{ fields: { id: 5, first_name: "Sam" } }] },
        ];
      },
    });
    const select = async (position: number, name: string) => {
      const input = screen.getAllByRole("combobox", { name: "Existing" })[position];
      if (!input) throw new Error(`no item ${String(position)}`);
      await userEvent.type(input, name.charAt(0));
      await userEvent.click(await screen.findByRole("option", { name }));
    };
    const spouse = await screen.findByRole("textbox", { name: "Spouse" });
    await userEvent.click(screen.getByRole("button", { name: "Add person" }));
    await select(1, "Ada");
    await waitFor(() => {
      expect(spouse).toHaveValue("Sam");
    });
    await select(0, "Ada");
    await userEvent.click(screen.getByRole("button", { name: /^Remove item 2/ }));
    await userEvent.click(screen.getByRole("button", { name: "Add person" }));
    await select(1, "Bob");
    await waitFor(() => {
      expect(screen.getAllByRole("combobox", { name: "Existing" })[1]).toHaveValue("Bob");
    });
    expect(spouse).toHaveValue("Sam");
  });

  // deviation:autofill-clear-resets-related
  it("drops the related repeat items a cleared selection added", async () => {
    const layout: LayoutNode[] = [
      {
        "#tag": "af-form",
        ctrl: "afform",
        "#children": [
          { "#tag": "af-entity", type: "Contact", name: "Individual1", actions: "{update: true}" },
          { "#tag": "af-entity", type: "Contact", name: "Individual2", actions: "{update: true}" },
          {
            "#tag": "div",
            "af-fieldset": "Individual1",
            "#children": [
              entityRef("id", { label: "Existing", input_attrs: { autofill: "update" } }),
            ],
          },
          {
            "#tag": "div",
            "af-fieldset": "Individual2",
            "af-repeat": "Add child",
            "#children": [
              {
                "#tag": "af-field",
                name: "first_name",
                defn: {
                  name: "first_name",
                  label: "Child",
                  input_type: "Text",
                  data_type: "String",
                },
              },
            ],
          },
        ],
      },
    ];
    renderForm(layout, {
      "Contact.autocomplete": () => rows([ADA]),
      "Afform.prefill": ({ fillMode }) =>
        fillMode === "entity"
          ? [
              { name: "Individual1", values: [{ fields: { id: 1 } }] },
              {
                name: "Individual2",
                values: [
                  { fields: { id: 5, first_name: "Sam" } },
                  { fields: { id: 6, first_name: "Kim" } },
                ],
              },
            ]
          : [],
    });
    const input = await screen.findByRole("combobox", { name: "Existing" });
    await userEvent.type(input, "a");
    await userEvent.click(await screen.findByRole("option", { name: "Ada" }));
    await waitFor(() => {
      expect(screen.getAllByRole("textbox", { name: "Child" })).toHaveLength(2);
    });
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => {
      expect(screen.getAllByRole("textbox", { name: "Child" })).toHaveLength(1);
    });
    expect(screen.getByRole("textbox", { name: "Child" })).toHaveValue("");
  });

  it("shows the server's message when a search fails", async () => {
    renderForm(form([entityRef("employer_id")]), {
      "Contact.autocomplete": () => {
        throw apiError("Access denied");
      },
    });
    const input = await screen.findByRole("combobox", { name: "Employer" });
    await userEvent.type(input, "a");
    await waitFor(() => {
      expect(announced(input)).toHaveTextContent("Access denied");
    });
  });

  // deviation:dynamic-entity-unmapped-note
  it("searches the entity the control field names with dfk_entities", async () => {
    const calls = renderForm(
      form([
        {
          "#tag": "af-field",
          name: "entity_table",
          defn: {
            name: "entity_table",
            label: "Type",
            input_type: "Select",
            data_type: "String",
            options: [
              { id: "civicrm_activity", label: "Activity" },
              { id: "civicrm_note", label: "Note" },
            ],
          },
        },
        entityRef("entity_id", {
          label: "Record",
          fk_entity: null,
          dfk_entities: { civicrm_activity: "Activity" },
          input_attrs: { control_field: "entity_table" },
        }),
      ]),
      { "Activity.autocomplete": () => rows([{ id: 4, label: "Call" }]) },
    );
    const input = await screen.findByRole("combobox", { name: "Record" });
    expect(input).toBeDisabled();
    const type = screen.getByRole("combobox", { name: "Type" });
    await userEvent.selectOptions(type, "Activity");
    expect(input).toBeEnabled();
    await userEvent.type(input, "c");
    await screen.findByRole("option", { name: "Call" });
    expect(calls.some(({ call }) => call === "Activity.autocomplete")).toBe(true);
    await userEvent.selectOptions(type, "Note");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No entity to search for entity_table = civicrm_note",
    );
    expect(input).toBeDisabled();
  });

  it("shows a kept id by the label the newly controlled entity gives it", async () => {
    renderForm(
      form([
        {
          "#tag": "af-field",
          name: "entity_table",
          defn: {
            name: "entity_table",
            label: "Type",
            input_type: "Select",
            data_type: "String",
            options: [
              { id: "civicrm_activity", label: "Activity" },
              { id: "civicrm_case", label: "Case" },
            ],
          },
        },
        entityRef("entity_id", {
          label: "Record",
          fk_entity: null,
          dfk_entities: { civicrm_activity: "Activity", civicrm_case: "Case" },
          input_attrs: { control_field: "entity_table" },
        }),
      ]),
      {
        "Activity.autocomplete": () => rows([{ id: 4, label: "Call" }]),
        "Case.autocomplete": () => rows([{ id: 4, label: "Housing" }]),
      },
    );
    const type = await screen.findByRole("combobox", { name: "Type" });
    await userEvent.selectOptions(type, "Activity");
    const input = screen.getByRole("combobox", { name: "Record" });
    await userEvent.type(input, "c");
    await userEvent.click(await screen.findByRole("option", { name: "Call" }));
    expect(input).toHaveValue("Call");
    await userEvent.selectOptions(type, "Case");
    await waitFor(() => {
      expect(input).toHaveValue("Housing");
    });
  });

  it("fills a join record with the record an autofill field selects in it", async () => {
    const calls = renderForm(
      form([
        {
          "#tag": "div",
          "af-join": "Email",
          "#children": [
            entityRef("id", {
              label: "Existing email",
              fk_entity: "Email",
              input_attrs: { autofill: "update" },
            }),
            {
              "#tag": "af-field",
              name: "email",
              defn: { name: "email", label: "Email", input_type: "Text", data_type: "String" },
            },
          ],
        },
      ]),
      {
        "Email.autocomplete": () => rows([{ id: 5, label: "a@example.org" }]),
        "Afform.prefill": ({ fillMode }) =>
          fillMode === "join"
            ? [
                {
                  name: "Individual1",
                  // Afform.prefill's join mode returns the join record without `fields`.
                  values: [{ joins: { Email: [{ id: 5, email: "a@example.org" }] } }],
                },
              ]
            : [],
      },
    );
    const input = await screen.findByRole("combobox", { name: "Existing email" });
    await userEvent.type(input, "a");
    await userEvent.click(await screen.findByRole("option", { name: "a@example.org" }));
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Email" })).toHaveValue("a@example.org");
    });
    expect(calls.find(({ params }) => params.fillMode === "join")?.params.args).toEqual({
      Individual1: { 0: { joins: { Email: { 0: { id: 5 } } } } },
    });
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(submitted(calls)).toEqual({
        Individual1: [{ fields: {}, joins: { Email: [{}] } }],
        extra: { fields: {} },
      });
    });
  });

  it("says when the selected record cannot be loaded", async () => {
    renderForm(
      form([entityRef("id", { label: "Existing", input_attrs: { autofill: "update" } })]),
      {
        "Contact.autocomplete": () => rows([ADA]),
        "Afform.prefill": ({ fillMode }) => {
          if (fillMode === "entity") throw apiError("Not allowed");
          return [];
        },
      },
    );
    await userEvent.type(await screen.findByRole("combobox", { name: "Existing" }), "a");
    await userEvent.click(await screen.findByRole("option", { name: "Ada" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Not allowed");
  });

  it("notes a field without an entity, which it does not render, and not quick-add links", () => {
    expect(
      layoutProblems(
        form([
          entityRef("contact_id", { input_attrs: { quickAdd: ["civicrm/quick-add/Individual"] } }),
          entityRef("other_id", { fk_entity: null }),
        ]),
      ),
    ).toEqual(["field type EntityRef without fk_entity (other_id)"]);
  });
});

describe("EntityRef quick-add links", () => {
  const quickAddForms = [
    {
      path: "civicrm/quick-add/Individual",
      entity: "Individual",
      title: "Add Individual",
      icon: "fa-user",
    },
    { path: "civicrm/quick-add/Organization", entity: "Organization", title: "Add Organization" },
    { path: "civicrm/quick-add/Activity", entity: "Activity", title: "Add Activity" },
  ];
  /** CRM.loadForm's popup: hands back the URL and lets the test announce the saved form. */
  function popup() {
    const opened: string[] = [];
    let succeed = (_data: unknown) => undefined as void;
    vi.mocked(window.CRM.loadForm).mockImplementation((url) => {
      opened.push(url);
      const selection = jquerySelection({
        on: (name, handler) => {
          if (name === "crmFormSuccess") {
            succeed = (data) => {
              handler(new Event(name), data);
            };
          }
          return selection;
        },
      });
      return selection;
    });
    return {
      opened,
      succeed: (data: unknown) => {
        act(() => {
          succeed(data);
        });
      },
    };
  }

  beforeEach(() => {
    window.CRM.config = { quickAdd: quickAddForms };
  });
  afterEach(() => {
    delete window.CRM.config;
    vi.mocked(window.CRM.loadForm).mockReset();
  });

  // deviation:quick-add-links-reachable
  it("offers the contact types' forms, opens one and selects the record it saved", async () => {
    const { opened, succeed } = popup();
    const quickAdd = entityRef("employer_id", { input_attrs: { quickAdd: true } });
    const calls = renderForm(form([quickAdd]), {
      "Contact.autocomplete": ({ ids }) => (ids ? rows([{ id: 9, label: "Dee" }]) : rows([])),
    });
    const input = await screen.findByRole("combobox", { name: "Employer" });
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent.trim())).toEqual([
      "Add Individual",
      "Add Organization",
    ]);
    const hash = "parentFormName=afform%3AafformTest&parentFormFieldName=Individual1%3Aemployer_id";
    expect(links[0]).toHaveAttribute("href", `/civicrm/quick-add/Individual#?${hash}`);
    expect(links[0]?.closest("div")).toHaveClass("crm-entityref-links", "crm-entityref-quick-add");

    links[0]?.focus();
    await userEvent.keyboard("{Enter}");
    expect(opened).toEqual([`/civicrm/quick-add/Individual#?${hash}`]);
    succeed({ submissionResponse: [{ Individual1: [{ id: 9 }] }] });
    await waitFor(() => {
      expect(input).toHaveValue("Dee");
    });
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(submitted(calls)).toEqual({
        Individual1: [{ fields: { employer_id: 9 }, joins: {} }],
        extra: { fields: {} },
      });
    });
  });

  it("offers only the listed forms the page knows, and adds to a multiple field", async () => {
    const { succeed } = popup();
    renderForm(
      form([
        entityRef("tag_ids", {
          label: "Tags",
          input_attrs: {
            multiple: true,
            quickAdd: ["civicrm/quick-add/Organization", "civicrm/quick-add/Unknown"],
          },
        }),
      ]),
      { "Contact.autocomplete": ({ ids }) => rows(ids ? [ADA, BOB] : []) },
    );
    await screen.findByRole("combobox", { name: "Tags" });
    expect(screen.getAllByRole("link").map((link) => link.textContent.trim())).toEqual([
      "Add Organization",
    ]);
    await userEvent.click(screen.getByRole("link", { name: "Add Organization" }));
    succeed({ submissionResponse: [{ Organization1: [{ id: 1 }] }] });
    expect(await screen.findByText("Ada")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Add Organization" }));
    succeed({ submissionResponse: [{ Organization1: [{ id: 2 }] }] });
    expect(await screen.findByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Ada")).toBeInTheDocument();
  });

  // deviation:quick-add-links-reachable
  it("says when the form saved no record", async () => {
    const { succeed } = popup();
    renderForm(form([entityRef("employer_id", { input_attrs: { quickAdd: true } })]), {});
    await userEvent.click(await screen.findByRole("link", { name: "Add Organization" }));
    succeed({ submissionResponse: [{}] });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The form saved no record to select.",
    );
  });

  it("reports a page without the quick-add list", async () => {
    delete window.CRM.config;
    renderForm(form([entityRef("employer_id", { input_attrs: { quickAdd: true } })]), {});
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The page lists no quick-add forms.",
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
