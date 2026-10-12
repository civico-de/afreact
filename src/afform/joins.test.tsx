import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockApi, renderWithQuery } from "../test/render";
import { AfreactForm } from "./AfreactForm";
import type { PrefillItem } from "./model";
import type { FieldDefn, LayoutNode } from "./types";

// Each Email block carries its location type as `data`; the server applies data[n] to record n.
const field = (name: string, defn: Partial<FieldDefn> = {}): LayoutNode => ({
  "#tag": "af-field",
  name,
  defn: { name, label: name, input_type: "Text", data_type: "String", ...defn },
});
const emailBlock = (label: string, location: number, extra: Record<string, unknown> = {}) => ({
  "#tag": "div",
  "af-join": "Email",
  data: { location_type_id: location },
  "#children": [field("email", { label, input_type: "Email" })],
  ...extra,
});
const homeShown = `(${JSON.stringify([["Individual1[0][fields][first_name]", "=", '"ada"']])})`;
const submit: LayoutNode = {
  "#tag": "button",
  "ng-click": "afform.submit()",
  "#children": [{ "#text": "Submit" }],
};

function form(fieldset: Record<string, unknown>, children: LayoutNode[]): LayoutNode[] {
  return [
    {
      "#tag": "af-form",
      ctrl: "afform",
      "#children": [
        { "#tag": "af-entity", type: "Contact", name: "Individual1" },
        { "#tag": "div", "af-fieldset": "Individual1", ...fieldset, "#children": children },
        submit,
      ],
    },
  ];
}

/** Home behind an af-if, then Work: the layout of the plan's `Email: [null, {…}]` case. */
const homeThenWork = form({}, [
  field("first_name"),
  emailBlock("Home", 1, { "af-if": homeShown }),
  emailBlock("Work", 2),
]);

function renderForm(layout: LayoutNode[], prefill: PrefillItem[] = [], search = "") {
  const calls = mockApi({
    "Afreact.getForm": () => [
      { name: "afformTest", title: "Test", type: "form", layout, strings: [] },
    ],
    "Afform.prefill": () => prefill,
    "Afform.submit": () => [{}],
  });
  renderWithQuery(<AfreactForm name="afformTest" location={{ search, hash: "" }} />);
  return calls;
}

const box = (name: string) => screen.getByRole("textbox", { name });

/** The submitted values as JSON carries them to the server: holes become null. */
async function submitted(calls: ReturnType<typeof mockApi>): Promise<unknown> {
  await userEvent.click(screen.getByRole("button", { name: "Submit" }));
  let values: unknown;
  await waitFor(() => {
    values = calls.find(({ call }) => call === "Afform.submit")?.params.values;
    expect(values).toBeDefined();
  });
  return JSON.parse(JSON.stringify(values));
}

const contact = (fields: Record<string, unknown>, Email: unknown[]) => ({
  Individual1: [{ fields, joins: { Email } }],
});

describe("join blocks of one entity behind af-if", () => {
  // deviation:join-blocks-layout-order
  it("keeps its position while an earlier block is hidden, so it keeps its location", async () => {
    const calls = renderForm(homeThenWork);
    await userEvent.type(await screen.findByRole("textbox", { name: "Work" }), "w@example.org");
    expect(screen.queryByRole("textbox", { name: "Home" })).not.toBeInTheDocument();
    // AbstractProcessor::preprocessSubmittedValues() drops the null and keeps index 1 (since 6.2).
    expect(await submitted(calls)).toEqual(contact({}, [null, { email: "w@example.org" }]));
  });

  it("writes a block shown after load to its own position, not the next free one", async () => {
    const calls = renderForm(homeThenWork);
    await userEvent.type(await screen.findByRole("textbox", { name: "Work" }), "w@example.org");
    await userEvent.type(box("first_name"), "ada");
    await userEvent.type(box("Home"), "h@example.org");
    expect(await submitted(calls)).toEqual(
      contact({ first_name: "ada" }, [{ email: "h@example.org" }, { email: "w@example.org" }]),
    );
  });

  it("returns a re-shown block to the same record after hiding dropped its value", async () => {
    const calls = renderForm(homeThenWork);
    await userEvent.type(await screen.findByRole("textbox", { name: "first_name" }), "ada");
    await userEvent.type(box("Home"), "old@example.org");
    await userEvent.type(box("Work"), "w@example.org");
    await userEvent.type(box("first_name"), "x");
    expect(screen.queryByRole("textbox", { name: "Home" })).not.toBeInTheDocument();
    expect(await submitted(calls)).toEqual(
      contact({ first_name: "adax" }, [{}, { email: "w@example.org" }]),
    );
    await userEvent.type(box("first_name"), "{Backspace}");
    expect(box("Home")).toHaveValue("");
    await userEvent.type(box("Home"), "new@example.org");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(calls.filter(({ call }) => call === "Afform.submit")).toHaveLength(2);
    });
    expect(calls.at(-1)?.params.values).toEqual(
      contact({ first_name: "ada" }, [{ email: "new@example.org" }, { email: "w@example.org" }]),
    );
  });

  it("shows each prefilled record in its own block while an earlier block is hidden", async () => {
    // loadJoins() sorts records of multiple location blocks by the blocks' location types.
    const calls = renderForm(
      homeThenWork,
      [
        {
          name: "Individual1",
          values: [
            {
              fields: { id: 5, first_name: "Bob" },
              joins: {
                Email: [
                  { id: 11, email: "h@example.org", location_type_id: 1 },
                  { id: 12, email: "w@example.org", location_type_id: 2 },
                ],
              },
            },
          ],
        },
      ],
      "?Individual1=5",
    );
    const work = await screen.findByRole("textbox", { name: "Work" });
    expect(work).toHaveValue("w@example.org");
    await userEvent.clear(work);
    await userEvent.type(work, "new@example.org");
    expect(await submitted(calls)).toEqual(
      contact({ id: 5, first_name: "Bob" }, [
        { id: 11, email: "h@example.org", location_type_id: 1 },
        { id: 12, email: "new@example.org", location_type_id: 2 },
      ]),
    );
  });

  it("keeps the null core prefills for a location the contact lacks", async () => {
    const calls = renderForm(
      homeThenWork,
      [
        {
          name: "Individual1",
          values: [
            {
              fields: { id: 5 },
              joins: { Email: [null, { id: 12, email: "w@example.org", location_type_id: 2 }] },
            },
          ],
        },
      ],
      "?Individual1=5",
    );
    expect(await screen.findByRole("textbox", { name: "Work" })).toHaveValue("w@example.org");
    await userEvent.type(box("first_name"), "ada");
    expect(box("Home")).toHaveValue("");
    await userEvent.type(box("Home"), "h@example.org");
    expect(await submitted(calls)).toEqual(
      contact({ id: 5, first_name: "ada" }, [
        { email: "h@example.org" },
        { id: 12, email: "w@example.org", location_type_id: 2 },
      ]),
    );
  });
});

describe("join blocks in a repeated fieldset", () => {
  const repeated = form({ "af-repeat": "Add", min: "1" }, [
    field("first_name"),
    emailBlock("Email", 1),
  ]);

  it("writes each item's block to the item's first record", async () => {
    const calls = renderForm(repeated);
    await userEvent.type(await screen.findByRole("textbox", { name: "Email" }), "a@example.org");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await userEvent.type(screen.getAllByRole("textbox", { name: "Email" })[1]!, "b@example.org");
    expect(await submitted(calls)).toEqual({
      Individual1: [
        { fields: {}, joins: { Email: [{ email: "a@example.org" }] } },
        { fields: {}, joins: { Email: [{ email: "b@example.org" }] } },
      ],
    });
  });

  it("edits a later item's prefilled record instead of adding one", async () => {
    const item = (id: number, emailId: number, email: string) => ({
      fields: { id },
      joins: { Email: [{ id: emailId, email, location_type_id: 1 }] },
    });
    const calls = renderForm(
      repeated,
      [
        {
          name: "Individual1",
          values: [item(5, 11, "a@example.org"), item(6, 12, "b@example.org")],
        },
      ],
      "?Individual1=5,6",
    );
    await waitFor(() => {
      expect(screen.getAllByRole("textbox", { name: "Email" })).toHaveLength(2);
    });
    const second = screen.getAllByRole("textbox", { name: "Email" })[1]!;
    expect(second).toHaveValue("b@example.org");
    await userEvent.clear(second);
    await userEvent.type(second, "new@example.org");
    expect(await submitted(calls)).toEqual({
      Individual1: [item(5, 11, "a@example.org"), item(6, 12, "new@example.org")],
    });
  });
});
