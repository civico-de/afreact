import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { mockApi, renderWithQuery } from "../test/render";
import { memoryStore } from "../url/hash";
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

function renderForm(layout: LayoutNode[], route = "", strings: Record<string, string> | [] = []) {
  const calls = mockApi({
    "Afreact.getForm": () => [{ name: "afformTest", title: "Test", type: "form", layout, strings }],
    "Afform.prefill": () => [],
    "Afform.submit": () => [{}],
  });
  const location = { search: "", hash: route && `#${route}` };
  renderWithQuery(<AfreactForm name="afformTest" location={location} />);
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
          "#children": [
            field("nick_name"),
            field("job_title", { input_type: "DisplayOnly", afform_default: "Engineer" }),
          ],
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
        Individual1: [{ fields: { first_name: "Ada", job_title: "Engineer" }, joins: {} }],
      });
    });
  });

  // deviation:af-if-focus-kept
  it("keeps the focus in the form when an af-if hides the focused field, and says what changed", async () => {
    renderForm(
      form([
        field("first_name"),
        {
          "#tag": "div",
          "af-if": when("first_name", "=", '"ada"'),
          "#children": [field("first_name", { label: "Again" }), field("nick_name")],
        },
      ]),
    );
    const first = await screen.findByRole("textbox", { name: "first_name" });
    await userEvent.type(first, "ada");
    const live = () => document.querySelector(".afreact-form > p[aria-live]");
    await waitFor(
      () => {
        expect(live()).toHaveTextContent("More fields are shown.");
      },
      { timeout: 2000 },
    );
    // A change from a control that took no focus (a click in Safari) returns the focus to it.
    await userEvent.click(box("nick_name"));
    fireEvent.change(first, { target: { value: "bob" } });
    expect(screen.queryByRole("textbox", { name: "nick_name" })).not.toBeInTheDocument();
    expect(first).toHaveFocus();
    await waitFor(
      () => {
        expect(live()).toHaveTextContent("Some fields are hidden.");
      },
      { timeout: 2000 },
    );
    // A field that hides itself leaves the focus on its nearest remaining ancestor.
    fireEvent.change(first, { target: { value: "ada" } });
    const again = box("Again");
    await userEvent.type(again, "x");
    expect(screen.queryByRole("textbox", { name: "Again" })).not.toBeInTheDocument();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toContainElement(first);
  });

  it("initialises what an af-if shows only once shown, and again on every re-show", async () => {
    const calls = renderForm([
      {
        "#tag": "af-form",
        ctrl: "afform",
        "#children": [
          { "#tag": "af-entity", type: "Contact", name: "Individual1" },
          { "#tag": "af-entity", type: "Contact", name: "Individual2" },
          {
            "#tag": "div",
            "af-fieldset": "Individual1",
            "#children": [
              field("first_name"),
              {
                "#tag": "div",
                "af-if": when("first_name", "=", '"ada"'),
                "#children": [field("nick_name", { afform_default: "Default" })],
              },
            ],
          },
          {
            "#tag": "div",
            "af-if": when("first_name", "=", '"bob"'),
            "#children": [
              {
                "#tag": "div",
                "af-fieldset": "Individual2",
                "#children": [field("last_name", { afform_default: "Second" })],
              },
            ],
          },
          submit,
        ],
      },
    ]);
    await userEvent.type(await screen.findByRole("textbox", { name: "first_name" }), "ada");
    expect(box("nick_name")).toHaveValue("Default");
    await userEvent.clear(box("nick_name"));
    await userEvent.type(box("nick_name"), "Mine");
    await userEvent.type(box("first_name"), "x");
    await userEvent.type(box("first_name"), "{Backspace}");
    expect(box("nick_name")).toHaveValue("Default");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(submitted(calls)).toEqual({
        Individual1: [{ fields: { first_name: "ada", nick_name: "Default" }, joins: {} }],
        Individual2: [],
      });
    });
  });

  it("keeps a display-only value when its af-if hides it, as afField skips it on afIfDestroy", async () => {
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
              "af-if": when("first_name", "=", '"ada"'),
              "#children": [field("nick_name"), field("job_title", { input_type: "DisplayOnly" })],
            },
          ]),
        },
      ],
      "Afform.prefill": () => [
        {
          name: "Individual1",
          values: [{ fields: { first_name: "Ada", nick_name: "A", job_title: "Engineer" } }],
        },
      ],
      "Afform.submit": () => [{}],
    });
    renderWithQuery(
      <AfreactForm name="afformTest" location={{ search: "?Individual1=1", hash: "" }} />,
    );
    await userEvent.type(await screen.findByRole("textbox", { name: "first_name" }), "x");
    expect(screen.queryByRole("textbox", { name: "nick_name" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(submitted(calls)).toEqual({
        Individual1: [{ fields: { first_name: "Adax", job_title: "Engineer" }, joins: {} }],
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

  it("drops what a nested af-if showed when an outer one hides, and fills nothing back", async () => {
    const calls = renderForm(
      form([
        field("first_name"),
        {
          "#tag": "div",
          "af-if": when("first_name", "=", '"ada"'),
          "#children": [
            {
              "#tag": "div",
              "af-if": when("first_name", "CONTAINS", '"a"'),
              "#children": [field("nick_name", { afform_default: "Nick" })],
            },
            {
              "#tag": "div",
              "af-if": when("first_name", "=", '"ada"'),
              "#children": [field("middle_name")],
            },
          ],
        },
      ]),
    );
    await userEvent.type(await screen.findByRole("textbox", { name: "first_name" }), "Ada");
    expect(box("nick_name")).toHaveValue("Nick");
    await userEvent.type(box("middle_name"), "Typed");
    await userEvent.type(box("first_name"), "x");
    expect(screen.queryByRole("textbox", { name: "nick_name" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(submitted(calls)).toEqual({
        Individual1: [{ fields: { first_name: "Adax" }, joins: {} }],
      });
    });
  });

  it("keeps what a nested af-if never showed when an outer one hides", async () => {
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
              "af-if": when("first_name", "=", '"ada"'),
              "#children": [
                {
                  "#tag": "div",
                  "af-if": when("first_name", "=", '"x"'),
                  "#children": [field("nick_name")],
                },
              ],
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
    await userEvent.type(await screen.findByRole("textbox", { name: "first_name" }), "b");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(submitted(calls)).toEqual({
        Individual1: [{ fields: { first_name: "Adab", nick_name: "A" }, joins: {} }],
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
    expect(box("nick_name")).toBeEnabled();
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
    await userEvent.clear(box("first_name"));
    expect(nick).toHaveValue("Dear ");
    await userEvent.type(box("first_name"), "Ada");
    expect(nick).toHaveValue("Dear Ada");
    await userEvent.type(nick, "!");
    await userEvent.type(box("first_name"), "m");
    expect(nick).toHaveValue("Dear Ada!");
  });

  it("evaluates conditions and token defaults on the trimmed text, as ngModel stores it", async () => {
    const calls = renderForm(
      form([
        field("first_name"),
        field("nick_name", { afform_default: "Dear [Individual1.0.first_name]" }),
        {
          "#tag": "div",
          "af-if": when("first_name", "=", '"ada"'),
          "#children": [field("job_title")],
        },
      ]),
    );
    await userEvent.type(await screen.findByRole("textbox", { name: "first_name" }), " Ada ");
    expect(box("first_name")).toHaveValue(" Ada ");
    expect(box("nick_name")).toHaveValue("Dear Ada");
    expect(box("job_title")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(submitted(calls)).toEqual({
        Individual1: [{ fields: { first_name: "Ada", nick_name: "Dear Ada" }, joins: {} }],
      });
    });
  });

  it("stops calculating a token default once the user leaves the field, even unchanged", async () => {
    renderForm(
      form([
        field("first_name"),
        field("nick_name", { afform_default: "Dear [Individual1.0.first_name]" }),
      ]),
    );
    const nick = await screen.findByRole("textbox", { name: "nick_name" });
    await userEvent.click(nick);
    await userEvent.tab();
    await userEvent.type(box("first_name"), "Ada");
    expect(nick).toHaveValue("Dear ");
  });

  it("types a token default like the field and reports one that refers to itself", async () => {
    const calls = renderForm(
      form([
        field("source"),
        field("count", { data_type: "Integer", afform_default: "[Individual1.0.source]" }),
        field("nick_name", { afform_default: "[Individual1.0.nick_name]x" }),
      ]),
    );
    await userEvent.type(await screen.findByRole("textbox", { name: "source" }), "42");
    expect(screen.getByRole("note")).toHaveTextContent(
      'afform_default "[Individual1.0.nick_name]x" refers to its own field on nick_name',
    );
    expect(box("nick_name")).toHaveValue("");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(submitted(calls)).toEqual({
        Individual1: [{ fields: { source: "42", count: 42 }, joins: {} }],
      });
    });
  });

  it("fills the current user and relative dates into field defaults", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 0, 30, 9, 5, 7));
    window.CRM.config = { cid: 7 };
    const date = { input_type: "Date", data_type: "Date" };
    const calls = renderForm(
      form([
        field("employer_id", {
          input_type: "EntityRef",
          data_type: "Integer",
          fk_entity: "Contact",
          afform_default: "user_contact_id",
        }),
        field("birth_date", { ...date, afform_default: "now -1 year" }),
        field("follow_up", { ...date, input_attrs: { time: true }, afform_default: "now +1 day" }),
      ]),
    );
    expect(await screen.findByLabelText("birth_date")).toHaveValue("2025-01-30");
    expect(screen.getByLabelText("follow_up")).toHaveValue("2026-01-31T09:05");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(submitted(calls)).toEqual({
        Individual1: [
          {
            fields: {
              employer_id: 7,
              birth_date: "2025-01-30",
              follow_up: "2026-01-31 09:05:07",
            },
            joins: {},
          },
        ],
      });
    });
    delete window.CRM.config;
    vi.useRealTimers();
  });

  it("drops a selected option once its condition hides it", async () => {
    const calls = renderForm(
      form([
        field("first_name"),
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
    await userEvent.type(await screen.findByRole("textbox", { name: "first_name" }), "ada");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "prefix_id" }), "Prof.");
    await userEvent.type(box("first_name"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(submitted(calls)).toEqual({
        Individual1: [{ fields: { first_name: "adax" }, joins: {} }],
      });
    });
  });

  it("shows an option whose condition cannot be read, and says so", async () => {
    renderForm(
      form([
        field("prefix_id", {
          input_type: "Select",
          data_type: "Integer",
          options: [{ id: 2, label: "Prof.", if: [["a + b", "=", "1"]] }],
        }),
      ]),
    );
    expect(await screen.findByRole("option", { name: "Prof." })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(
      'option 2 if=[["a + b","=","1"]] on prefix_id',
    );
  });

  it("shows the submit button when the route opens no stored submission", async () => {
    const button: LayoutNode = {
      "#tag": "button",
      "ng-click": "afform.submit()",
      "ng-if": "afform.showSubmitButton",
      "#children": [{ "#text": "Submit" }],
    };
    renderForm(form([field("first_name")], [button]));
    expect(await screen.findByRole("button", { name: "Submit" })).toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
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

  it("reports a condition it cannot read and renders nothing of its element, as afIf", async () => {
    const calls = renderForm(
      form([
        field("first_name"),
        {
          "#tag": "div",
          "af-if": "(nope)",
          "#children": [field("nick_name", { afform_default: "A" })],
        },
      ]),
    );
    expect(await screen.findByRole("note")).toHaveTextContent('af-if="(nope)"');
    expect(screen.queryByRole("textbox", { name: "nick_name" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(submitted(calls)).toEqual({ Individual1: [{ fields: {}, joins: {} }] });
    });
  });

  it("writes an Email block under an af-if to its own record", async () => {
    const calls = renderForm(
      form([
        { "#tag": "div", "af-join": "Email", "#children": [field("email", { label: "First" })] },
        {
          "#tag": "div",
          "af-join": "Email",
          "af-if": "([])",
          "#children": [field("email", { label: "Second" })],
        },
      ]),
    );
    await userEvent.type(await screen.findByRole("textbox", { name: "First" }), "a@example.org");
    await userEvent.type(box("Second"), "b@example.org");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(submitted(calls)).toEqual({
        Individual1: [
          {
            fields: {},
            joins: { Email: [{ email: "a@example.org" }, { email: "b@example.org" }] },
          },
        ],
      });
    });
  });

  it("keeps each repeat item's state when an earlier item is removed", async () => {
    renderForm(
      form([
        field("first_name"),
        {
          "#tag": "div",
          "af-join": "Email",
          "af-repeat": "Add",
          "af-repeat-default": "2",
          "#children": [
            field("email", { afform_default: "[Individual1.0.first_name]@example.org" }),
          ],
        },
      ]),
    );
    await screen.findByRole("textbox", { name: "first_name" });
    const second = screen.getAllByRole("textbox", { name: "email" })[1]!;
    await userEvent.clear(second);
    await userEvent.type(second, "mine@example.org");
    await userEvent.click(screen.getAllByRole("button", { name: /^Remove item/ })[0]!);
    await userEvent.type(box("first_name"), "ada");
    expect(box("email")).toHaveValue("mine@example.org");
  });

  it("keeps item state in every repeat of a join when one of them removes an item", async () => {
    const repeat = (child: LayoutNode): LayoutNode => ({
      "#tag": "div",
      "af-join": "Email",
      "af-repeat": "Add",
      "af-repeat-default": "3",
      "#children": [child],
    });
    renderForm(
      form([
        field("first_name"),
        repeat(field("email", { afform_default: "[Individual1.0.first_name]@example.org" })),
        repeat(field("signature_text", { afform_default: "[Individual1.0.first_name]" })),
      ]),
    );
    await screen.findByRole("textbox", { name: "first_name" });
    const last = screen.getAllByRole("textbox", { name: "signature_text" })[2]!;
    await userEvent.type(last, "mine");
    await userEvent.click(screen.getAllByRole("button", { name: /^Remove item/ })[0]!);
    await userEvent.type(box("first_name"), "ada");
    const [first, second, third] = screen.getAllByRole("textbox", { name: "signature_text" });
    expect(first).toHaveValue("ada");
    expect(second).toHaveValue("mine");
    expect(third).toBeUndefined();
  });

  it("initialises a copied item's repeats as afRepeat renders them", async () => {
    const calls = mockApi({
      "Afreact.getForm": () => [
        {
          name: "afformTest",
          title: "Test",
          type: "form",
          strings: [],
          layout: [
            {
              "#tag": "af-form",
              ctrl: "afform",
              "#children": [
                { "#tag": "af-entity", type: "Contact", name: "Individual1" },
                {
                  "#tag": "div",
                  "af-fieldset": "Individual1",
                  "af-repeat": "Add",
                  "af-copy": "Copy",
                  "#children": [
                    field("first_name"),
                    {
                      "#tag": "div",
                      "af-join": "Email",
                      "af-repeat": "Add email",
                      "#children": [field("email")],
                    },
                  ],
                },
                submit,
              ],
            },
          ],
        },
      ],
      "Afform.prefill": () => [],
      "Afform.submit": () => [{}],
    });
    renderWithQuery(<AfreactForm name="afformTest" location={{ search: "", hash: "" }} />);
    await userEvent.type(await screen.findByRole("textbox", { name: "first_name" }), "Ada");
    await userEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(screen.getAllByRole("textbox", { name: "email" })).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(submitted(calls)).toEqual({
        Individual1: [
          { fields: { first_name: "Ada" }, joins: { Email: [{}] } },
          { fields: { first_name: "Ada" }, joins: { Email: [{}] } },
        ],
      });
    });
  });

  it("initialises an added repeat item as afRepeat renders it", async () => {
    const calls = renderForm(
      form([
        {
          "#tag": "div",
          "af-join": "Email",
          "af-repeat": "Add",
          "#children": [
            field("email"),
            field("location_type_id", { data_type: "Integer", afform_default: "1" }),
          ],
        },
      ]),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Add" }));
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(submitted(calls)).toEqual({
        Individual1: [
          { fields: {}, joins: { Email: [{ location_type_id: 1 }, { location_type_id: 1 }] } },
        ],
      });
    });
  });
});

describe("a required reference field", () => {
  it("is reported as a missing value, as afForm reads ng-invalid-required", async () => {
    renderForm(
      form([
        field("employer_id", {
          input_type: "EntityRef",
          data_type: "Integer",
          fk_entity: "Contact",
          required: true,
        }),
      ]),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Submit" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please fill all required fields.");
  });

  it("holds no submit while af-disabled, as the browser skips a disabled control", async () => {
    const calls = renderForm(
      form([
        field("first_name"),
        field(
          "employer_id",
          { input_type: "EntityRef", data_type: "Integer", fk_entity: "Contact", required: true },
          { "af-disabled": when("first_name", "=", '"lock"') },
        ),
      ]),
    );
    await userEvent.type(await screen.findByRole("textbox", { name: "first_name" }), "lock");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(submitted(calls)).toBeDefined();
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("extra fields", () => {
  const extra = (name: string, defn: Partial<FieldDefn> = {}): LayoutNode => ({
    "#tag": "af-field",
    defn: { name, label: name, input_type: "Text", data_type: "String", ...defn },
  });

  it("keep their values outside every entity and submit them as afForm does", async () => {
    const calls = renderForm(
      form([
        field("first_name"),
        extra("text1"),
        extra("number1", { input_type: "Number", data_type: "Integer", afform_default: "3" }),
      ]),
      "?text1=Url&Individual1.number1=9",
    );
    expect(await screen.findByRole("textbox", { name: "text1" })).toHaveValue("Url");
    await userEvent.type(box("first_name"), "Ada");
    await userEvent.type(box("text1"), "!");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(submitted(calls)).toEqual({
        Individual1: [{ fields: { first_name: "Ada" }, joins: {} }],
        extra: { fields: { text1: "Url!", number1: 3 } },
      });
    });
  });
});

describe("values from the route", () => {
  const reset: LayoutNode = {
    "#tag": "button",
    class: "af-button btn",
    type: "reset",
    "#children": [{ "#text": "Reset" }],
  };

  it("come from the hash; the page's query string fills nothing", async () => {
    mockApi({
      "Afreact.getForm": () => [
        {
          name: "afformTest",
          title: "Test",
          type: "form",
          layout: form([field("id")]),
          strings: [],
        },
      ],
      "Afform.prefill": () => [],
    });
    const location = { search: "?id=3&reset=1", hash: "" };
    renderWithQuery(<AfreactForm name="afformTest" location={location} />);
    expect(await screen.findByRole("textbox", { name: "id" })).toHaveValue("");
  });

  // deviation:reset-refills-route-values
  it("fill fields over their default and survive a reset", async () => {
    const calls = renderForm(
      form([field("first_name", { afform_default: "Default" }), field("last_name")], [reset]),
      "?first_name=Ada&Individual1.last_name=Lovelace",
    );
    expect(await screen.findByRole("textbox", { name: "first_name" })).toHaveValue("Ada");
    expect(box("last_name")).toHaveValue("Lovelace");
    await userEvent.clear(box("first_name"));
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() => {
      expect(box("first_name")).toHaveValue("Ada");
    });
    expect(calls.filter(({ call }) => call === "Afform.prefill")).toHaveLength(2);
  });

  it("fill fields an af-if shows later and items added later", async () => {
    renderForm(
      form([
        field("first_name"),
        {
          "#tag": "div",
          "af-if": when("first_name", "=", '"x"'),
          "#children": [field("nick_name")],
        },
        {
          "#tag": "div",
          "af-join": "Email",
          "af-repeat": "Add",
          "#children": [field("email", { label: "Email" })],
        },
      ]),
      "?nick_name=Nick&Individual1.Email.email=a@example.org",
    );
    await userEvent.type(await screen.findByRole("textbox", { name: "first_name" }), "x");
    expect(await screen.findByRole("textbox", { name: "nick_name" })).toHaveValue("Nick");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    const emails = screen.getAllByRole("textbox", { name: "Email" });
    expect(emails).toHaveLength(2);
    for (const email of emails) expect(email).toHaveValue("a@example.org");
  });

  it("replace a token default until the fields it refers to change", async () => {
    renderForm(
      form([
        field("first_name"),
        field("nick_name", { afform_default: "Dear [Individual1.0.first_name]" }),
      ]),
      "?nick_name=Hi",
    );
    const nick = await screen.findByRole("textbox", { name: "nick_name" });
    expect(nick).toHaveValue("Hi");
    await userEvent.type(box("first_name"), "Ada");
    expect(nick).toHaveValue("Dear Ada");
  });

  // deviation:token-default-keeps-loaded
  it("keeps a prefilled value over the token default until the fields it refers to change", async () => {
    mockApi({
      "Afreact.getForm": () => [
        {
          name: "afformTest",
          title: "Test",
          type: "form",
          layout: form([
            field("first_name"),
            field("nick_name", { afform_default: "Dear [Individual1.0.first_name]" }),
          ]),
          strings: [],
        },
      ],
      "Afform.prefill": () => [
        { name: "Individual1", values: [{ fields: { first_name: "Ada", nick_name: "Stored" } }] },
      ],
    });
    renderWithQuery(<AfreactForm name="afformTest" location={{ search: "", hash: "" }} />);
    const nick = await screen.findByRole("textbox", { name: "nick_name" });
    expect(nick).toHaveValue("Stored");
    await userEvent.type(box("first_name"), "m");
    expect(nick).toHaveValue("Dear Adam");
  });
});

describe("route parameters in the layout", () => {
  /** The form with the route in a store of its own, which a test changes as the hash would. */
  function renderRouted(children: LayoutNode[], route: string) {
    mockApi({
      "Afreact.getForm": () => [
        { name: "afformTest", title: "Test", type: "form", layout: form(children), strings: [] },
      ],
      "Afform.prefill": () => [],
    });
    const store = memoryStore(`#${route}`);
    const location = { search: "", hash: `#${route}` };
    renderWithQuery(<AfreactForm name="afformTest" location={location} />, store);
    return (next: string) => {
      act(() => {
        store.write(new URLSearchParams(next));
      });
    };
  }

  it("shows them as text in text and attributes, and follows the route as afCore rebinds it", async () => {
    const go = renderRouted(
      [
        {
          "#tag": "p",
          title: "Event {{ routeParams.event }}",
          "#children": [{ "#text": "Feedback for event {{routeParams.event}}" }],
        },
        {
          "#tag": "a",
          href: "{{ routeParams.next }}",
          "#children": [{ "#text": "Next" }],
        },
      ],
      "?event=<b>12</b>&next=javascript:alert(1)",
    );
    const text = await screen.findByText("Feedback for event <b>12</b>");
    expect(text).toHaveAttribute("title", "Event <b>12</b>");
    expect(text.querySelector("b")).toBeNull();
    // React blocks a script URL as Angular's $$sanitizeUri does.
    expect(screen.getByRole("link", { name: "Next" }).getAttribute("href")).not.toContain(
      "alert(1)",
    );
    go("event=13");
    expect(await screen.findByText("Feedback for event 13")).toHaveAttribute("title", "Event 13");
    go("");
    expect(await screen.findByText("Feedback for event")).toHaveAttribute("title", "Event ");
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  // deviation:route-params-as-text
  it("reads a key without value as empty and a repeated key by its last value", async () => {
    renderRouted(
      [{ "#tag": "p", "#children": [{ "#text": "[{{ routeParams.a }}|{{ routeParams.b }}]" }] }],
      "?a&b=1&b=2",
    );
    expect(await screen.findByText("[|2]")).toBeInTheDocument();
  });

  it("renders an ng-if element while its route test holds, following the route", async () => {
    const text = (content: string, extra: Record<string, unknown>): LayoutNode => ({
      "#tag": "p",
      ...extra,
      "#children": [{ "#text": content }],
    });
    const go = renderRouted(
      [
        text("Feedback for event {{ routeParams.event }}", { "ng-if": "routeParams.event" }),
        text("Pick an event", { "ng-if": "!routeParams.event" }),
        text("Short", { "ng-if": "routeParams.mode == 'short'" }),
        text("Shown by both", { "af-if": "([])", "ng-if": "routeParams.event" }),
      ],
      "?event=12",
    );
    expect(await screen.findByText("Feedback for event 12")).toBeInTheDocument();
    expect(screen.getByText("Shown by both")).toBeInTheDocument();
    expect(screen.queryByText("Pick an event")).not.toBeInTheDocument();
    expect(screen.queryByText("Short")).not.toBeInTheDocument();
    go("mode=short");
    expect(await screen.findByText("Pick an event")).toBeInTheDocument();
    expect(screen.getByText("Short")).toBeInTheDocument();
    expect(screen.queryByText(/Feedback for event/)).not.toBeInTheDocument();
    expect(screen.queryByText("Shown by both")).not.toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("reports a route ng-if around fields, which the form would initialise while hidden", async () => {
    renderRouted(
      [{ "#tag": "div", "ng-if": "!routeParams.event", "#children": [field("first_name")] }],
      "",
    );
    expect(await screen.findByRole("note")).toHaveTextContent(
      'route condition (ng-if="!routeParams.event") around fields',
    );
  });

  it("hides a submit button with an af-if for a stored submission, as afForm does", async () => {
    const button: LayoutNode = {
      "#tag": "button",
      "ng-click": "afform.submit()",
      "ng-if": "afform.showSubmitButton",
      "af-if": "([])",
      "#children": [{ "#text": "Save" }],
    };
    renderRouted([field("first_name"), button], "?sid=7");
    await screen.findByRole("textbox", { name: "first_name" });
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("leaves a one-time route parameter unsupported, as it would freeze at its first value", async () => {
    renderRouted(
      [{ "#tag": "p", "#children": [{ "#text": "{{:: routeParams.event }}" }] }],
      "?event=12",
    );
    expect(await screen.findByRole("note")).toHaveTextContent(
      "Angular expression {{:: routeParams.event }}",
    );
  });
});
