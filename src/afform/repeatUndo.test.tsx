import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockApi, renderWithQuery } from "../test/render";
import { AfreactForm } from "./AfreactForm";
import type { FieldDefn, LayoutNode } from "./types";

const field = (name: string, defn: Partial<FieldDefn>): LayoutNode => ({
  "#tag": "af-field",
  name,
  defn: { name, label: name, input_type: "Text", data_type: "String", ...defn },
});
const emails: LayoutNode = {
  "#tag": "div",
  "af-join": "Email",
  "af-repeat": "Add email",
  "#children": [field("email", { label: "Email" })],
};
const first = field("first_name", { label: "First" });

/** People in a repeated fieldset, with a submit button. */
function renderPeople(children: LayoutNode[], prefill: () => unknown = () => []) {
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
          "#children": children,
        },
        {
          "#tag": "button",
          "ng-click": "afform.submit()",
          "#children": [{ "#text": "Submit" }],
        },
      ],
    },
  ];
  mockApi({
    "Afreact.getForm": () => [
      { name: "afformTest", title: "Test", type: "form", layout, strings: [] },
    ],
    "Afform.prefill": prefill,
    "Afform.submit": () => [{}],
  });
  renderWithQuery(<AfreactForm name="afformTest" location={{ search: "", hash: "" }} />);
}

const people = () => [...document.querySelectorAll<HTMLElement>("fieldset > [af-repeat-item]")];
/** A person's own ⊘, after those of its emails. */
const removePerson = (person: HTMLElement) =>
  within(person)
    .getAllByRole("button", { name: /^Remove item/ })
    .at(-1)!;
const undo = () => screen.queryByRole("button", { name: "Undo" });

// deviation:repeat-remove-undo
describe("undo of a removed repeat item", () => {
  it("brings back a person with their emails and values", async () => {
    renderPeople([first, emails]);
    await screen.findByRole("form");
    await userEvent.type(screen.getByRole("textbox", { name: "First" }), "Ann");
    await userEvent.click(screen.getByRole("button", { name: "Add email" }));
    const [one, two] = screen.getAllByRole("textbox", { name: "Email" });
    await userEvent.type(one!, "a1");
    await userEvent.type(two!, "a2");
    await userEvent.click(screen.getByRole("button", { name: "Add person" }));
    await userEvent.type(screen.getAllByRole("textbox", { name: "First" })[1]!, "Bob");

    await userEvent.click(removePerson(people()[0]!));
    expect(screen.getAllByRole("textbox", { name: "First" })).toHaveLength(1);
    await userEvent.click(undo()!);

    const [ann, bob] = screen.getAllByRole("textbox", { name: "First" });
    expect(ann).toHaveValue("Ann");
    expect(bob).toHaveValue("Bob");
    const [a1, a2] = within(people()[0]!).getAllByRole("textbox", { name: "Email" });
    expect(a1).toHaveValue("a1");
    expect(a2).toHaveValue("a2");
    expect(removePerson(people()[0]!)).toHaveFocus();
  });

  it("stays when the removal flips a condition that drops a field", async () => {
    const shown = `(${JSON.stringify([["Individual1[1][fields][first_name]", "=", '"bob"']])})`;
    renderPeople([
      first,
      { "#tag": "div", "af-if": shown, "#children": [field("nick_name", { label: "Nick" })] },
    ]);
    await screen.findByRole("form");
    await userEvent.click(screen.getByRole("button", { name: "Add person" }));
    await userEvent.type(screen.getAllByRole("textbox", { name: "First" })[1]!, "bob");
    expect(screen.getAllByRole("textbox", { name: "Nick" })).toHaveLength(2);

    await userEvent.click(removePerson(people()[1]!));
    expect(screen.queryByRole("textbox", { name: "Nick" })).not.toBeInTheDocument();
    expect(undo()).toHaveFocus();
    await userEvent.click(undo()!);
    expect(screen.getAllByRole("textbox", { name: "Nick" })).toHaveLength(2);
  });

  it("ends for good with the next edit, even when a later undo returns the data", async () => {
    renderPeople([first, emails]);
    await screen.findByRole("form");
    await userEvent.click(screen.getByRole("button", { name: "Add person" }));
    await userEvent.click(within(people()[1]!).getByRole("button", { name: "Add email" }));
    await userEvent.click(
      within(people()[1]!).getAllByRole("button", { name: /^Remove item/ })[0]!,
    );
    expect(within(people()[1]!).getByRole("button", { name: "Undo" })).toHaveFocus();

    await userEvent.click(removePerson(people()[0]!));
    expect(screen.getAllByRole("button", { name: "Undo" })).toHaveLength(1);
    await userEvent.click(undo()!);
    expect(undo()).not.toBeInTheDocument();
    expect(
      people().map((person) => within(person).getAllByRole("textbox", { name: "Email" }).length),
    ).toEqual([1, 1]);
  });

  it("ends with a save and with the prefill landing", async () => {
    let land: (records: unknown) => void = () => undefined;
    renderPeople(
      [first],
      () =>
        new Promise((resolve) => {
          land = resolve;
        }),
    );
    await screen.findByRole("form");
    await userEvent.click(screen.getByRole("button", { name: "Add person" }));
    await userEvent.click(removePerson(people()[1]!));
    expect(undo()).toHaveFocus();
    land([]);
    await waitFor(() => {
      expect(undo()).not.toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Add person" }));
    await userEvent.click(removePerson(people()[1]!));
    expect(undo()).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await screen.findByText("Saved");
    expect(undo()).not.toBeInTheDocument();
  });
});
