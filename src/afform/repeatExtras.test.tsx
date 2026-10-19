import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockApi, renderWithQuery } from "../test/render";
import { AfreactForm } from "./AfreactForm";
import type { FieldDefn, LayoutNode } from "./types";

const defn = (name: string, label: string): Partial<FieldDefn> => ({
  name,
  label,
  input_type: "Text",
  data_type: "String",
});
/** An af-field without a name: an extra field, named by its definition alone. */
const extra = (name: string, label: string): LayoutNode => ({
  "#tag": "af-field",
  defn: defn(name, label),
});

const PERSON: LayoutNode[] = [
  { "#tag": "af-field", name: "first_name", defn: defn("first_name", "First") },
  extra("note", "Note"),
];

function renderPeople(hash: string, prefill: () => unknown = () => [], person = PERSON) {
  const layout: LayoutNode[] = [
    {
      "#tag": "af-form",
      ctrl: "afform",
      "#children": [
        { "#tag": "af-entity", type: "Contact", name: "Individual1" },
        {
          "#tag": "fieldset",
          "af-fieldset": "Individual1",
          "af-repeat": "Add person",
          "#children": person,
        },
        extra("remark", "Remark"),
        { "#tag": "button", "ng-click": "afform.submit()", "#children": [{ "#text": "Submit" }] },
      ],
    },
  ];
  const calls = mockApi({
    "Afreact.getForm": () => [
      { name: "afformTest", title: "Test", type: "form", layout, strings: [] },
    ],
    "Afform.prefill": prefill,
    "Afform.submit": () => [{}],
  });
  renderWithQuery(<AfreactForm name="afformTest" location={{ search: "", hash }} />);
  return calls;
}

const notes = () => screen.getAllByRole("textbox", { name: "Note" });
const values = (label: string) =>
  screen
    .getAllByRole("textbox", { name: label })
    .map((input) => input instanceof HTMLInputElement && input.value);

// deviation:repeat-extra-fields-per-item
describe("extra fields in a repeated fieldset", () => {
  it("keep a value per item, filled by the route's plain name, and submit with their item", async () => {
    const calls = renderPeople("#?note=Linked&Individual12.note=Unread");
    await screen.findByRole("form");
    await userEvent.click(screen.getByRole("button", { name: "Add person" }));
    expect(values("Note")).toEqual(["Linked", "Linked"]);
    await userEvent.clear(notes()[1]!);
    await userEvent.type(notes()[1]!, "Second");
    expect(notes()[0]).toHaveValue("Linked");
    await userEvent.type(screen.getByRole("textbox", { name: "Remark" }), "Whole form");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await screen.findByText("Saved");
    expect(calls.find(({ call }) => call === "Afform.submit")?.params.values).toEqual({
      Individual1: [
        { fields: {}, joins: {}, extras: { note: "Linked" } },
        { fields: {}, joins: {}, extras: { note: "Second" } },
      ],
      extra: { fields: { remark: "Whole form" } },
    });
  });

  it("come back with their item from a stored draft", async () => {
    renderPeople("", () => [
      {
        name: "Individual1",
        values: [
          { fields: { first_name: "Ann" }, extras: { note: "First" } },
          { fields: { first_name: "Bob" }, extras: { note: "Second" } },
        ],
      },
    ]);
    await screen.findByDisplayValue("Bob");
    expect(values("First")).toEqual(["Ann", "Bob"]);
    expect(values("Note")).toEqual(["First", "Second"]);
  });

  it("belong to the fieldset's item also inside one of its join blocks", async () => {
    const email: LayoutNode = { "#tag": "div", "af-join": "Email", "#children": [PERSON[1]!] };
    const calls = renderPeople("#?note=Linked", () => [], [email]);
    await screen.findByRole("form");
    await userEvent.click(screen.getByRole("button", { name: "Add person" }));
    expect(values("Note")).toEqual(["Linked", "Linked"]);
    await userEvent.type(notes()[1]!, "!");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await screen.findByText("Saved");
    const people = calls.find(({ call }) => call === "Afform.submit")?.params.values;
    expect(people).toMatchObject({
      Individual1: [{ extras: { note: "Linked" } }, { extras: { note: "Linked!" } }],
    });
  });
});
