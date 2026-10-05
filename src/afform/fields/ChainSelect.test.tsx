import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockApi, renderWithQuery } from "../../test/render";
import { AfreactForm } from "../AfreactForm";
import type { FieldDefn, LayoutNode } from "../types";

const field = (name: string, defn: Partial<FieldDefn>): LayoutNode => ({
  "#tag": "af-field",
  name,
  defn: { name, label: name, input_type: "Select", data_type: "Integer", ...defn },
});

const country = field("country_id", {
  label: "Country",
  options: [
    { id: 1, label: "Germany" },
    { id: 2, label: "Iceland" },
  ],
});
const state = (extra: Partial<FieldDefn> = {}) =>
  field("state_province_id", {
    label: "State",
    input_type: "ChainSelect",
    input_attrs: { control_field: "country_id" },
    ...extra,
  });

const submit: LayoutNode = {
  "#tag": "button",
  "ng-click": "afform.submit()",
  "#children": [{ "#text": "Submit" }],
};

function renderForm(children: LayoutNode[]) {
  const layout: LayoutNode[] = [
    {
      "#tag": "af-form",
      ctrl: "afform",
      "#children": [
        { "#tag": "af-entity", type: "Contact", name: "Individual1" },
        { "#tag": "div", "af-fieldset": "Individual1", "#children": children },
        submit,
      ],
    },
  ];
  const calls = mockApi({
    "Afreact.getForm": () => [
      { name: "afformTest", title: "Test", type: "form", layout, strings: [] },
    ],
    "Afform.prefill": () => [],
    "Afform.submit": () => [{}],
    "Afform.getOptions": ({ values }) =>
      typeof values === "object" &&
      values !== null &&
      "country_id" in values &&
      values.country_id === 1
        ? [
            { id: 10, label: "Berlin" },
            { id: 11, label: "Hamburg" },
          ]
        : [],
  });
  renderWithQuery(<AfreactForm name="afformTest" location={{ search: "", hash: "" }} />);
  return calls;
}

const lookups = (calls: ReturnType<typeof mockApi>) =>
  calls.filter(({ call }) => call === "Afform.getOptions").map(({ params }) => params);
const submitted = (calls: ReturnType<typeof mockApi>) =>
  calls.find(({ call }) => call === "Afform.submit")?.params.values;

describe("ChainSelect", () => {
  it("waits for the control field, loads its options, and drops a value they no longer offer", async () => {
    const calls = renderForm([country, state()]);
    const select = await screen.findByRole("combobox", { name: "State" });
    // Angular leaves it enabled, its only entry saying why.
    expect(select).toBeEnabled();
    expect(screen.getByRole("option", { name: "Choose Country first" })).toBeInTheDocument();
    expect(lookups(calls)).toEqual([]);

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Country" }), "Germany");
    await screen.findByRole("option", { name: "Hamburg" });
    expect(lookups(calls)).toEqual([
      {
        name: "afformTest",
        modelName: "Individual1",
        fieldName: "state_province_id",
        joinEntity: null,
        values: { country_id: 1 },
      },
    ]);
    await userEvent.selectOptions(select, "Hamburg");
    expect(select).toHaveValue("11");

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Country" }), "Iceland");
    await screen.findByRole("option", { name: "None Found" });
    expect(select).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(submitted(calls)).toEqual({
        Individual1: [{ fields: { country_id: 2 }, joins: {} }],
      });
    });
  });

  it("asks with the join record inside an af-join and submits the list a multiple field keeps", async () => {
    const calls = renderForm([
      {
        "#tag": "div",
        "af-join": "Address",
        "#children": [
          country,
          state({ input_attrs: { control_field: "country_id", multiple: true } }),
        ],
      },
    ]);
    await userEvent.selectOptions(
      await screen.findByRole("combobox", { name: "Country" }),
      "Germany",
    );
    const list = await screen.findByRole("listbox", { name: "State" });
    await screen.findByRole("option", { name: "Hamburg" });
    expect(lookups(calls)[0]).toMatchObject({ joinEntity: "Address", values: { country_id: 1 } });
    await userEvent.selectOptions(list, ["Berlin", "Hamburg"]);
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(submitted(calls)).toEqual({
        Individual1: [
          {
            fields: {},
            joins: { Address: [{ country_id: 1, state_province_id: [10, 11] }] },
          },
        ],
      });
    });
  });

  it("offers the field's own options without a control field", async () => {
    renderForm([state({ input_attrs: {}, options: [{ id: 5, label: "Bavaria" }] })]);
    const select = await screen.findByRole("combobox", { name: "State" });
    expect(select).toBeEnabled();
    expect(screen.getByRole("option", { name: "Bavaria" })).toBeInTheDocument();
  });

  it("names the control field by its name when the form does not show it", async () => {
    // afField puts "Choose undefined first" here.
    renderForm([state()]);
    await screen.findByRole("combobox", { name: "State" });
    expect(screen.getByRole("option", { name: "Choose country_id first" })).toBeInTheDocument();
  });
});
