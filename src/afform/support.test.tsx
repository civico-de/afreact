import { screen } from "@testing-library/react";
import { mockApi, renderWithQuery } from "../test/render";
import { AfreactForm } from "./AfreactForm";
import { layoutProblems, nodeKind } from "./support";
import type { ElementNode, FieldDefn, LayoutNode } from "./types";

const field = (
  name: string,
  defn: Partial<FieldDefn> = {},
  extra: Record<string, unknown> = {},
): LayoutNode => ({
  "#tag": "af-field",
  name,
  defn: { name, label: name, input_type: "Text", data_type: "String", ...defn },
  ...extra,
});
const always = `(${JSON.stringify([["Individual1[0][fields][first_name]", "IS EMPTY", ""]])})`;

/** Something of every kind the renderer flags, with every condition true so all of it renders. */
const layout: LayoutNode[] = [
  {
    "#tag": "af-form",
    ctrl: "afform",
    "#children": [
      { "#tag": "af-entity", type: "Contact", name: "Individual1" },
      { "#text": "Hello {{ person.name }}" },
      { "#tag": "iframe", "#children": [{ "#tag": "p", "#children": [{ "#text": "inner" }] }] },
      { "#tag": "div", "ng-if": "show", "ng-click": "go()" },
      { "#tag": "a", href: "#", title: "{{ link.title }}", "#children": [{ "#text": "a" }] },
      field("nick_name"),
      { "#tag": "div", "af-join": "Email" },
      { "#tag": "p", "af-if": "(not json", "#children": [{ "#tag": "marquee" }] },
      {
        "#tag": "fieldset",
        "af-fieldset": "Individual1",
        "af-title": "{{ person.title }}",
        "#children": [
          field("first_name", {}, { "ng-model": "x", "af-required": "(broken" }),
          field("state", { label: "State", input_type: "Signature" }),
          { "#tag": "div", "af-if": always, "#children": [field("last_name")] },
          {
            "#tag": "afblock-contact-email",
            "#children": [
              {
                "#tag": "div",
                "af-join": "Email",
                "af-repeat": "Add",
                min: "1",
                "#children": [
                  field("email", { input_type: "Email" }),
                  field("is_primary", { input_type: "Radio", data_type: "Boolean" }),
                ],
              },
            ],
          },
        ],
      },
      { "#tag": "button", "ng-click": "afform.submit()", "#children": [{ "#text": "Save" }] },
    ],
  },
];

describe("nodeKind", () => {
  it("dispatches in the renderer's order", () => {
    expect(nodeKind({ "#tag": "af-field", "af-if": "()" })).toBe("conditional");
    expect(nodeKind({ "#tag": "div", "ng-if": "afform.showSubmitButton" })).toBe("submitCondition");
    expect(nodeKind({ "#tag": "afblock-name-individual" })).toBe("block");
    expect(nodeKind({ "#tag": "crm-search-display-table" })).toBe("search");
    for (const type of ["list", "grid", "tree"])
      expect(nodeKind({ "#tag": `crm-search-display-${type}` })).toBe("search");
    expect(nodeKind({ "#tag": "crm-search-display-batch" })).toBe("unknown");
    expect(nodeKind({ "#tag": "div", "af-fieldset": "" })).toBe("searchFieldset");
    expect(nodeKind({ "#tag": "div", "af-fieldset": "Individual1" })).toBe("fieldset");
    expect(nodeKind({ "#tag": "div", "af-join": "Email" })).toBe("join");
  });
});

describe("layoutProblems", () => {
  it("names every part the renderer cannot show", () => {
    expect(layoutProblems(layout)).toEqual([
      "Angular expression {{ person.name }}",
      "<iframe>",
      'ng-if, ng-click="go()"',
      "Angular expression {{ link.title }}",
      "field nick_name without entity or metadata",
      'af-join="Email" outside a fieldset',
      'af-if="(not json"',
      "Angular expression {{ person.title }}",
      'ng-model, af-required="(broken" on first_name',
      "field type Signature (State)",
    ]);
  });

  it("reports parts behind a condition or an empty repeat, whatever the data", () => {
    const hidden: LayoutNode[] = [
      { "#tag": "div", "af-if": "([])", "#children": [{ "#tag": "marquee" }] },
      {
        "#tag": "div",
        "af-fieldset": "Individual1",
        "#children": [
          {
            "#tag": "div",
            "af-join": "Phone",
            "af-repeat": "Add",
            "#children": [field("x", { input_type: "Signature" })],
          },
        ],
      },
    ];
    expect(layoutProblems(hidden)).toEqual(["<marquee>", "field type Signature (x)"]);
  });

  it("flags draft and reset buttons only outside af-form, which handles them", async () => {
    const buttons: ElementNode[] = [
      { "#tag": "button", "ng-click": "afform.submitDraft()", "#children": [{ "#text": "Draft" }] },
      {
        "#tag": "button",
        type: "reset",
        class: "af-button btn",
        "#children": [{ "#text": "Reset" }],
      },
    ];
    const [draft, reset] = buttons;
    expect(nodeKind(draft!)).toBe("draft");
    expect(nodeKind(reset!)).toBe("reset");
    // Without the af-button class it is no afForm reset button.
    expect(nodeKind({ "#tag": "button", type: "reset", class: "btn" })).toBe("unknown");
    expect(layoutProblems([{ "#tag": "af-form", "#children": buttons }])).toEqual([]);
    const outside = ["save draft button outside af-form", "reset button outside af-form"];
    expect(layoutProblems(buttons)).toEqual(outside);
    mockApi({
      "Afreact.getForm": () => [
        { name: "afsearchTest", title: "S", type: "search", layout: buttons, strings: [] },
      ],
    });
    renderWithQuery(<AfreactForm name="afsearchTest" location={{ search: "", hash: "" }} />);
    const notes = await screen.findAllByRole("note");
    expect(notes.map((note) => note.textContent)).toEqual(
      outside.map((note) => `Not supported by the React renderer: ${note}`),
    );
  });

  it("finds nothing in a layout the renderer fully supports", () => {
    const supported: LayoutNode[] = [
      {
        "#tag": "div",
        "af-fieldset": "Individual1",
        class: "af-container",
        "#children": [field("first_name", {}, { class: "wide", "af-required": always })],
      },
      { "#comment": " note " },
      { "#text": "{{:: ts('Hello') }}" },
      {
        "#tag": "div",
        "ng-if": "afform.showSubmitButton",
        "#children": [{ "#tag": "button", "ng-click": "afform.submit()" }],
      },
    ];
    expect(layoutProblems(supported)).toEqual([]);
  });

  it("checks each display with the settings its type reads", () => {
    const columns = [{ type: "field", key: "label" }];
    const display = (tag: string, settings: Record<string, unknown>): LayoutNode => ({
      "#tag": tag,
      "search-name": "S",
      "display-name": "D",
      settings: { columns, ...settings },
    });
    expect(
      layoutProblems([
        display("crm-search-display-grid", { colno: "2", draggable: "weight", actions: true }),
        display("crm-search-display-list", { style: "ol", section_group_by: "kind" }),
        display("crm-search-display-tree", { parent_field: "parent_id", draggable: "weight" }),
      ]),
    ).toEqual(["drag to reorder (draggable)"]);
  });

  it("matches the notes the rendered form shows", async () => {
    mockApi({
      "Afreact.getForm": () => [
        { name: "afformTest", title: "Test", type: "form", layout, strings: [] },
      ],
      "Afform.prefill": () => [],
    });
    renderWithQuery(<AfreactForm name="afformTest" location={{ search: "", hash: "" }} />);
    await screen.findByRole("button", { name: "Save" });
    const shown = screen
      .getAllByRole("note")
      .map((note) => note.textContent?.replace("Not supported by the React renderer: ", ""));
    expect(shown.sort()).toEqual(layoutProblems(layout).sort());
  });
});

const display = (settings: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  "#tag": "crm-search-display-table",
  "search-name": "Groups_search",
  "display-name": "Groups",
  settings: {
    columns: [
      { type: "field", key: "title", label: "Title" },
      { type: "field", key: "description", label: "Description" },
    ],
    ...settings,
  },
  ...extra,
});
const searchForm = (children: LayoutNode[]): LayoutNode[] => [
  { "#tag": "div", "af-fieldset": "", "#children": children },
];

/** A search form the renderer fully supports, as core's own search forms store it. */
const healthySearch = searchForm([
  field("title", { search_operator: "CONTAINS" }, { class: "wide", "af-if": always }),
  field("created_date", { input_type: "Date", data_type: "Timestamp", search_range: true }),
  field("modified_date", {
    input_type: "Select",
    data_type: "Timestamp",
    search_range: true,
    is_date: 1,
    options: [
      { id: "{}", label: "Choose Date Range" },
      { id: "this.month", label: "This month" },
    ],
  }),
  field("children", { input_type: "Number", data_type: "Integer", search_range: true }),
  display(
    {
      pager: { show_count: true, hide_single: true, expose_limit: true },
      actions_display_mode: "menu",
      nested: true,
      placeholder: 5,
      addButton: { path: "civicrm/group/add", text: "Add Group", icon: "fa-plus" },
    },
    { "af-if": always },
  ),
]);

/** Something of every kind the renderer flags in a search form. */
const gappySearch = searchForm([
  field("title", {}, { "ng-model": "x" }),
  field("created_date", { label: "Created", input_type: "Radio", search_range: true }),
  field("parent", { label: "Parent", input_type: "File" }),
  display(
    {
      columns: [
        { type: "include", path: "~/x.html" },
        { type: "field", key: "title" },
      ],
      seeMore: true,
      pager: { jump: true },
      draggable: "weight",
      hierarchical: true,
    },
    { "total-count": "count", "ng-click": "go()" },
  ),
  display({}, { filters: "{contact_id: options.contact_id}" }),
]);

async function shownNotes(searchLayout: LayoutNode[], options?: Record<string, unknown>) {
  mockApi({
    "Afreact.getForm": () => [
      { name: "afsearchTest", title: "Test", type: "search", layout: searchLayout, strings: [] },
    ],
    "SearchDisplay.run": () => [{ key: 1, columns: [{ val: "Row" }, { val: "Row" }] }],
  });
  renderWithQuery(
    <AfreactForm name="afsearchTest" location={{ search: "", hash: "" }} options={options} />,
  );
  await screen.findAllByRole("cell", { name: "Row" });
  return screen
    .queryAllByRole("note")
    .map((note) => note.textContent?.replace("Not supported by the React renderer: ", "") ?? "");
}

describe("search forms", () => {
  it("finds nothing in a search form as core stores it, a conditional filter included", async () => {
    expect(layoutProblems(healthySearch)).toEqual([]);
    expect(await shownNotes(healthySearch)).toEqual([]);
    expect(screen.getByRole("textbox", { name: "title" })).toBeInTheDocument();
  });

  it("titles an open details element by a summary, as afTitle", async () => {
    const filters: LayoutNode = {
      "#tag": "details",
      class: "af-container",
      "af-title": "Filters",
      open: "",
      "#children": [field("title", { search_operator: "CONTAINS" })],
    };
    const details = searchForm([filters, display({})]);
    expect(layoutProblems(details)).toEqual([]);
    expect(await shownNotes(details)).toEqual([]);
    const summary = screen.getByText("Filters");
    expect(summary.tagName).toBe("SUMMARY");
    expect(summary).toHaveClass("af-title");
    expect(summary.parentElement?.firstElementChild).toBe(summary);
    expect(summary.closest("details")).toHaveProperty("open", true);
    expect(screen.getByRole("textbox", { name: "title" })).toBeVisible();
  });

  it("matches the notes the rendered search form shows", async () => {
    const report = layoutProblems(gappySearch);
    expect(report).toEqual([
      "ng-model on title",
      "search range (Created)",
      "file upload outside a form (Parent)",
      "ng-click on <crm-search-display-table>",
      'total-count="count"',
      "setting seeMore, setting pager.jump, drag to reorder in hierarchical tables (draggable)",
      "include column ~/x.html",
      "display filters from options outside a placement",
    ]);
    const shown = await shownNotes(gappySearch);
    expect([...new Set(shown)].sort()).toEqual([...report].sort());
  });

  it("checks display filters from options only outside a placement", () => {
    const placed = searchForm([display({}, { filters: "{contact_id: options.contact_id}" })]);
    expect(layoutProblems(placed, {})).toEqual([]);
    expect(layoutProblems(placed)).toEqual(["display filters from options outside a placement"]);
  });
});
