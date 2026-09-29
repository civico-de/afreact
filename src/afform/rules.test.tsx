import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockApi, renderWithQuery } from "../test/render";
import { AfreactForm } from "./AfreactForm";
import type { FieldDefn, LayoutNode } from "./types";

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
const when = (fieldName: string, op: string, value: string) =>
  `(${JSON.stringify([[`Individual1[0][fields][${fieldName}]`, op, value]])})`;

const submit: LayoutNode = {
  "#tag": "button",
  "ng-click": "afform.submit()",
  "#children": [{ "#text": "Submit" }],
};

function form(children: LayoutNode[], extra: LayoutNode[] = [submit]): LayoutNode[] {
  return [
    {
      "#tag": "af-form",
      ctrl: "afform",
      "#children": [
        { "#tag": "af-entity", type: "Contact", name: "Individual1" },
        { "#tag": "div", "af-fieldset": "Individual1", "#children": children },
        ...extra,
      ],
    },
  ];
}

function renderForm(layout: LayoutNode[], search = "", strings: Record<string, string> | [] = []) {
  const calls = mockApi({
    "Afreact.getForm": () => [{ name: "afformTest", title: "Test", type: "form", layout, strings }],
    "Afform.prefill": () => [],
    "Afform.submit": () => [{}],
  });
  renderWithQuery(<AfreactForm name="afformTest" location={{ search, hash: "" }} />);
  return calls;
}

const box = (name: string) => screen.getByRole("textbox", { name });
const submitted = (calls: ReturnType<typeof mockApi>) =>
  calls.find(({ call }) => call === "Afform.submit")?.params.values;

describe("live rules", () => {
  it("shows an af-if element while its condition holds and drops the values it hid", async () => {
    const calls = renderForm(
      form([
        field("first_name"),
        {
          "#tag": "div",
          "af-if": when("first_name", "=", '"ada"'),
          "#children": [field("nick_name"), field("job_title", { input_type: "DisplayOnly" })],
        },
      ]),
    );
    await userEvent.type(await screen.findByRole("textbox", { name: "first_name" }), "Ada");
    await userEvent.type(box("nick_name"), "A");
    await userEvent.type(box("first_name"), "x");
    expect(screen.queryByRole("textbox", { name: "nick_name" })).not.toBeInTheDocument();
    await userEvent.type(box("first_name"), "{Backspace}");
    expect(box("nick_name")).toHaveValue("");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(submitted(calls)).toEqual({
        Individual1: [{ fields: { first_name: "Ada" }, joins: {} }],
      });
    });
  });

  it("keeps values an af-if never showed, as afIf only drops what it rendered", async () => {
    const calls = mockApi({
      "Afreact.getForm": () => [
        {
          name: "afformTest",
          title: "Test",
          type: "form",
          strings: [],
          layout: form([
            field("first_name"),
            {
              "#tag": "div",
              "af-if": when("first_name", "=", '"x"'),
              "#children": [field("nick_name")],
            },
          ]),
        },
      ],
      "Afform.prefill": () => [
        { name: "Individual1", values: [{ fields: { first_name: "Ada", nick_name: "A" } }] },
      ],
      "Afform.submit": () => [{}],
    });
    renderWithQuery(
      <AfreactForm name="afformTest" location={{ search: "?Individual1=1", hash: "" }} />,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(submitted(calls)).toEqual({
        Individual1: [{ fields: { first_name: "Ada", nick_name: "A" }, joins: {} }],
      });
    });
  });

  it("applies af-required, af-disabled and conditional options live", async () => {
    renderForm(
      form([
        field("first_name"),
        field("last_name", {}, { "af-required": when("first_name", "IS NOT EMPTY", "") }),
        field("nick_name", {}, { "af-disabled": when("first_name", "=", '"lock"') }),
        field("prefix_id", {
          input_type: "Select",
          data_type: "Integer",
          options: [
            { id: 1, label: "Dr." },
            { id: 2, label: "Prof.", if: [["Individual1[0][fields][first_name]", "=", '"ada"']] },
          ],
        }),
      ]),
    );
    const last = await screen.findByRole("textbox", { name: "last_name" });
    expect(last).not.toBeRequired();
    expect(screen.queryByRole("option", { name: "Prof." })).not.toBeInTheDocument();
    await userEvent.type(box("first_name"), "ada");
    expect(last).toBeRequired();
    expect(screen.getByRole("option", { name: "Prof." })).toBeInTheDocument();
    await userEvent.clear(box("first_name"));
    await userEvent.type(box("first_name"), "lock");
    expect(box("nick_name")).toBeDisabled();
  });

  it("calculates a token default until the user edits the field", async () => {
    renderForm(
      form([
        field("first_name"),
        field("nick_name", { afform_default: "Dear [Individual1.0.first_name]" }),
      ]),
    );
    const nick = await screen.findByRole("textbox", { name: "nick_name" });
    expect(nick).toHaveValue("Dear ");
    await userEvent.type(box("first_name"), "Ada");
    expect(nick).toHaveValue("Dear Ada");
    await userEvent.type(nick, "!");
    await userEvent.type(box("first_name"), "m");
    expect(nick).toHaveValue("Dear Ada!");
  });

  it("hides the submit button for a stored submission, as afForm does", async () => {
    const button: LayoutNode = {
      "#tag": "button",
      "ng-click": "afform.submit()",
      "ng-if": "afform.showSubmitButton",
      "#children": [{ "#text": "Submit" }],
    };
    renderForm(form([field("first_name")], [button]), "?sid=7");
    await screen.findByRole("textbox", { name: "first_name" });
    expect(screen.queryByRole("button", { name: "Submit" })).not.toBeInTheDocument();
  });

  it("resolves ts() with the form's translations and crmUrl() links", async () => {
    renderForm(
      form([
        { "#text": "{{:: ts('Learn more...') }} " },
        {
          "#tag": "a",
          "ng-href": "{{:: crmUrl('civicrm/admin/x?reset=1') }}",
          title: "{{ ts('Open') }}",
          "#children": [{ "#text": "{{:: ts('View') }}" }],
        },
        { "#tag": "p", class: "{{ cls }}", "#children": [] },
      ]),
      "",
      { "Learn more...": "Mehr erfahren …", View: "Ansehen" },
    );
    const link = await screen.findByRole("link", { name: "Ansehen" });
    expect(link).toHaveAttribute("href", "/civicrm/admin/x?reset=1");
    expect(link).toHaveAttribute("title", "Open");
    expect(screen.getByText("Mehr erfahren …")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Angular expression {{ cls }}");
  });

  it("reports a condition it cannot read and still renders the element", async () => {
    renderForm(form([{ "#tag": "div", "af-if": "(nope)", "#children": [field("nick_name")] }]));
    expect(await screen.findByRole("note")).toHaveTextContent('af-if="(nope)"');
    expect(box("nick_name")).toBeInTheDocument();
  });
});
