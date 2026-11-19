import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { EditorContext, formEntities, type EditorApi } from "../context";
import type { AfformDefinition, EditorMeta } from "../meta";
import { textAttribute } from "../model";
import type { ShallowElement } from "../tree";
import { useNodeOps } from "./common";
import {
  ConditionalMenuItem,
  fieldChoices,
  parseRule,
  readRule,
  rowScope,
  withRules,
} from "./Conditional";

const META: EditorMeta = {
  gui: {
    entities: {
      Individual: {
        entity: "Individual",
        label: "Individual",
        fields: {
          first_name: { name: "first_name", label: "First Name", data_type: "String" },
          gender_id: {
            name: "gender_id",
            label: "Gender",
            data_type: "Integer",
            options: [
              { id: 1, name: "Female", label: "Female" },
              { id: 2, name: "Male", label: "Male" },
            ],
          },
        },
      },
      Email: {
        entity: "Email",
        label: "Email",
        fields: { email: { name: "email", label: "Email", data_type: "String" } },
      },
    },
    elements: {},
    styles: {},
    permissions: [],
    dateRanges: [],
    searchDisplayTags: [],
    inputTypes: [],
  },
  admin: {
    afform_fields: {},
    afform_placement: [],
    afform_container_style: [],
    field_styles: [],
    placement_entities: {},
    placement_filters: {},
    search_operators: {},
    locales: [],
  },
  types: { "*": { "*": "text" } },
  blocks: {
    "block-name": {
      name: "blockName",
      title: "Name",
      directive_name: "block-name",
      layout: [{ "#tag": "af-field", name: "first_name" }],
    },
  },
  searchDisplays: {},
  behaviors: {},
};

const FIELD: ShallowElement = {
  "#tag": "af-field",
  name: "first_name",
  defn: "{required: true, label: 'Given name'}",
};

const EMAIL: ShallowElement = {
  "#tag": "div",
  "af-join": "Email",
  "#children": [{ "#tag": "af-field", name: "email" }],
};

const form = (
  field: ShallowElement,
  email: ShallowElement = EMAIL,
  fieldset: Partial<ShallowElement> = {},
): AfformDefinition => ({
  type: "form",
  title: "Test",
  layout: [
    {
      "#tag": "af-form",
      ctrl: "afform",
      "#children": [
        { "#tag": "af-entity", type: "Individual", name: "Individual1", label: "Individual 1" },
        {
          "#tag": "fieldset",
          "af-fieldset": "Individual1",
          ...fieldset,
          "#children": [
            field,
            { "#tag": "af-field", name: "gender_id:name" },
            email,
            { "#tag": "block-name" },
          ],
        },
      ],
    },
  ],
});

describe("parseRule", () => {
  // deviation:condition-rules-plain-json
  it("reads plain quotes and the entities core's builder writes", () => {
    expect(parseRule('([["a","=","1"]])')).toEqual([["a", "=", "1"]]);
    expect(parseRule("([[&quot;a&quot;,&quot;=&quot;,&quot;1&quot;]])")).toEqual([["a", "=", "1"]]);
    expect(parseRule(undefined)).toEqual([]);
  });

  it("refuses what is not a condition list, so it is kept", () => {
    expect(parseRule("someFlag")).toBeNull();
    expect(parseRule("([oops)")).toBeNull();
  });
});

describe("withRules", () => {
  it("writes set rules as JSON and drops the static counterpart from the defn", () => {
    const next = withRules(FIELD, { "af-required": [["a", "=", '"x"']] });
    expect(next["af-required"]).toBe('([["a","=","\\"x\\""]])');
    expect(next.defn).toBe("{label: 'Given name'}");
  });

  it("removes emptied rules and keeps unreadable ones", () => {
    const node = { ...FIELD, "af-if": '([["a","=","1"]])', "af-disabled": "flag" };
    const next = withRules(node, { "af-if": [], "af-disabled": null });
    expect(next["af-if"]).toBeUndefined();
    expect(next["af-disabled"]).toBe("flag");
    expect(next.defn).toBe(FIELD.defn);
  });
});

// ADR 0012
describe("afreact's own rules", () => {
  const own = '[["[Individual1.0.Email.@.email]","IS NOT EMPTY"]]';
  // deviation:row-conditions
  it("writes a rule on the element's own row or comparing two fields to afreact's attribute", () => {
    const node = { ...FIELD, "af-if": '([["a","=","1"]])' };
    const row = withRules(node, {
      "af-if": [["[Individual1.0.Email.@.email]", "=", '"x"']],
    });
    expect(row["af-if"]).toBeUndefined();
    expect(row["afreact-if"]).toBe('[["[Individual1.0.Email.@.email]","=","x"]]');
    const compared = withRules(FIELD, {
      "af-required": [
        ["Individual1[0][fields][first_name]", "=", '"[Individual1.0.last_name]"'],
        ["OR", [["Individual1[0][joins][Email][1][email]", "IS EMPTY"]]],
      ],
    });
    expect(compared["afreact-required"]).toBe(
      '[["[Individual1.0.first_name]","=","[Individual1.0.last_name]"],["OR",[["[Individual1.0.Email.1.email]","IS EMPTY"]]]]',
    );
    expect(compared.defn).toBe("{label: 'Given name'}");
  });

  it("goes back to core's attribute once a rule no longer needs afreact's", () => {
    const next = withRules({ ...FIELD, "afreact-if": own }, { "af-if": [["a", "=", "1"]] });
    expect(next["afreact-if"]).toBeUndefined();
    expect(next["af-if"]).toBe('([["a","=","1"]])');
    expect(
      withRules({ ...FIELD, "afreact-if": own }, { "af-if": [] })["afreact-if"],
    ).toBeUndefined();
  });

  it("reads both attributes as one rule, core's data paths where no row is meant", () => {
    const node = {
      ...FIELD,
      "af-if": '([["a","=","1"]])',
      "afreact-if":
        '[["[Individual1.0.first_name]","=",2],["[Individual1.0.Email.@.email]","IS EMPTY"]]',
    };
    expect(readRule(node, "af-if")).toEqual([
      ["a", "=", "1"],
      ["Individual1[0][fields][first_name]", "=", "2"],
      ["[Individual1.0.Email.@.email]", "IS EMPTY"],
    ]);
    expect(readRule({ ...FIELD, "afreact-if": "[[1]]" }, "af-if")).toBeNull();
  });

  it("reads a single clause or group as a list of one, as the runtime does", () => {
    const clause = '["[Individual1.0.first_name]","=",2]';
    expect(readRule({ ...FIELD, "afreact-if": clause }, "af-if")).toEqual([
      ["Individual1[0][fields][first_name]", "=", "2"],
    ]);
    expect(readRule({ ...FIELD, "afreact-if": `["NOT",[${clause}]]` }, "af-if")).toEqual([
      ["NOT", [["Individual1[0][fields][first_name]", "=", "2"]]],
    ]);
  });

  it("reads a required rule set in both attributes as either, as the runtime applies it", () => {
    const node = {
      ...FIELD,
      "af-required": '([["a","=","1"]])',
      "afreact-required":
        '[["[Individual1.0.first_name]","=",2],["[Individual1.0.last_name]","=",3]]',
    };
    expect(readRule(node, "af-required")).toEqual([
      [
        "OR",
        [
          ["a", "=", "1"],
          [
            "AND",
            [
              ["Individual1[0][fields][first_name]", "=", "2"],
              ["Individual1[0][fields][last_name]", "=", "3"],
            ],
          ],
        ],
      ],
    ]);
  });

  it("offers the fields of the repeat an element sits in as this row's", () => {
    const afform = form(FIELD, {
      ...EMAIL,
      "af-repeat": "Add",
      "#children": [
        { "#tag": "af-field", name: "email" },
        { "#tag": "af-field", name: "location_type_id" },
      ],
    });
    expect(rowScope(afform.layout, [0, 1, 0])).toBeNull();
    const row = rowScope(afform.layout, [0, 1, 2, 1]);
    expect(row).toEqual({
      entity: "Individual1",
      entityRepeated: false,
      join: "Email",
    });
    const choices = fieldChoices({ afform, meta: META, entities: formEntities(afform, META) }, row);
    expect(choices.options.filter((o) => String(o.id).startsWith("["))).toEqual([
      {
        id: "[Individual1.0.Email.@.email]",
        label: "Email",
        group: "Individual 1: Email, this row",
      },
      {
        id: "[Individual1.0.Email.@.location_type_id]",
        label: "location_type_id",
        group: "Individual 1: Email, this row",
      },
    ]);
  });

  it("offers the entity's row inside a repeated join of a repeated fieldset", () => {
    const afform = form(FIELD, { ...EMAIL, "af-repeat": "Add" }, { "af-repeat": "Add" });
    const row = rowScope(afform.layout, [0, 1, 2, 0]);
    expect(row).toEqual({
      entity: "Individual1",
      entityRepeated: true,
      join: "Email",
    });
    const choices = fieldChoices({ afform, meta: META, entities: formEntities(afform, META) }, row);
    const ids = choices.options.map((o) => String(o.id)).filter((id) => id.startsWith("["));
    expect(ids).toContain("[Individual1.@.Email.@.email]");
    expect(ids).toContain("[Individual1.@.first_name]");
  });
});

describe("fieldChoices", () => {
  // deviation:condition-fields-once
  it("lists each placed field once by its data path, joins and blocks included", () => {
    const afform = form(FIELD);
    const choices = fieldChoices({ afform, meta: META, entities: formEntities(afform, META) });
    expect(choices.options).toEqual([
      { id: "Individual1[0][fields][first_name]", label: "Given name", group: "Individual 1" },
      { id: "Individual1[0][fields][gender_id:name]", label: "Gender", group: "Individual 1" },
      { id: "Individual1[0][fields][first_name]", label: "First Name", group: "Individual 1" },
      {
        id: "Individual1[0][joins][Email][0][email]",
        label: "Email",
        group: "Individual 1: Email 1",
      },
    ]);
    // A suffixed field compares by the suffix's option key.
    const gender = choices.defns["Individual1[0][fields][gender_id:name]"];
    expect(Array.isArray(gender?.options) && gender.options.map((o) => o.id)).toEqual([
      "Female",
      "Male",
    ]);
  });
  // deviation:condition-join-block-index
  it("keys each join block by its place among the entity's blocks of that join", () => {
    const email = (children: ShallowElement["#children"]) => ({
      "#tag": "div",
      "af-join": "Email",
      "#children": children,
    });
    const afform: AfformDefinition = {
      type: "form",
      title: "Test",
      layout: [
        {
          "#tag": "af-form",
          ctrl: "afform",
          "#children": [
            { "#tag": "af-entity", type: "Individual", name: "Individual1", label: "Individual 1" },
            {
              "#tag": "fieldset",
              "af-fieldset": "Individual1",
              "#children": [
                email([{ "#tag": "af-field", name: "email" }]),
                email([{ "#tag": "p", "#children": [{ "#text": "No email field" }] }]),
              ],
            },
            {
              "#tag": "fieldset",
              "af-fieldset": "Individual1",
              "#children": [email([{ "#tag": "af-field", name: "email" }])],
            },
          ],
        },
      ],
    };
    const choices = fieldChoices({ afform, meta: META, entities: formEntities(afform, META) });
    expect(choices.options).toEqual([
      {
        id: "Individual1[0][joins][Email][0][email]",
        label: "Email",
        group: "Individual 1: Email 1",
      },
      {
        id: "Individual1[0][joins][Email][2][email]",
        label: "Email",
        group: "Individual 1: Email 3",
      },
    ]);
  });
});

function Harness({
  initial,
  children,
}: {
  initial: AfformDefinition;
  children: (api: EditorApi) => ReactNode;
}) {
  const [afform, setAfform] = useState(initial);
  const [dialog, setDialog] = useState<ReactNode>(null);
  const api: EditorApi = {
    meta: META,
    afform,
    entities: formEntities(afform, META),
    change: (update) => {
      setAfform(update);
    },
    selected: null,
    select: () => undefined,
    addMeta: () => undefined,
    removeEntity: () => undefined,
    saveBlocked: null,
    openDialog: (renderDialog) => {
      setDialog(
        renderDialog(() => {
          setDialog(null);
        }),
      );
    },
  };
  return (
    <EditorContext value={api}>
      {children(api)}
      {dialog}
    </EditorContext>
  );
}

const FIELD_PATH = [0, 1, 0];

function Item() {
  return (
    <Harness
      initial={form({
        ...FIELD,
        "af-if":
          "([[&quot;Individual1[0][fields][first_name]&quot;,&quot;==&quot;,&quot;\\&quot;Ada\\&quot;&quot;]])",
      })}
    >
      {(api) => <Entry api={api} />}
    </Harness>
  );
}

function Entry({ api }: { api: EditorApi }) {
  const node = api.afform.layout[0];
  const fieldset = node && "#children" in node ? node["#children"]?.[1] : undefined;
  const field = fieldset && "#children" in fieldset ? fieldset["#children"]?.[0] : undefined;
  if (!field || !("#tag" in field)) throw new Error("No field");
  const ops = useNodeOps(FIELD_PATH, field);
  return (
    <ul>
      <ConditionalMenuItem ops={ops} readOnlyField={false} />
      <li data-testid="af-if">{textAttribute(field, "af-if")}</li>
      <li data-testid="afreact-if">{textAttribute(field, "afreact-if")}</li>
      <li data-testid="defn">{textAttribute(field, "defn")}</li>
    </ul>
  );
}

describe("ConditionalMenuItem", () => {
  it("edits a rule core wrote, its legacy operator updated, and writes it back as JSON", async () => {
    render(<Item />);
    fireEvent.click(screen.getByRole("button", { name: /Edit Conditional Rules/ }));
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent.trim())).toEqual([
      "Visibility",
      "Required",
      "Disabled",
    ]);
    const operator = screen.getByRole("combobox", { name: "Operator for Given name" });
    expect(operator).toHaveValue("=");
    fireEvent.change(operator, { target: { value: "!=" } });
    expect(await screen.findByRole("textbox", { name: "Value for Given name" })).toHaveValue("Ada");
    fireEvent.click(screen.getByRole("button", { name: /Apply Changes/ }));
    expect(screen.getByTestId("af-if").textContent).toBe(
      '([["Individual1[0][fields][first_name]","!=","\\"Ada\\""]])',
    );
    // Only af-required and af-disabled replace a static setting.
    expect(screen.getByTestId("defn").textContent).toBe(FIELD.defn);
  });

  it("compares with another field and writes that rule to afreact-if", async () => {
    render(<Item />);
    fireEvent.click(screen.getByRole("button", { name: /Edit Conditional Rules/ }));
    const panel = screen.getAllByRole("tabpanel")[0]!;
    fireEvent.click(within(panel).getByRole("checkbox", { name: "Compare with a field" }));
    expect(
      await within(panel).findByRole("combobox", {
        name: "Field compared with Given name",
      }),
    ).toBeInTheDocument();
    expect(within(panel).queryByRole("textbox", { name: "Value for Given name" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Apply Changes/ }));
    expect(screen.getByTestId("af-if").textContent).toBe("");
    expect(screen.getByTestId("afreact-if").textContent).toBe(
      '[["[Individual1.0.first_name]","=","[Individual1.0.gender_id:name]"]]',
    );
  });

  it("keeps a field picked when another change follows before the pick is reported", async () => {
    render(<Item />);
    fireEvent.click(screen.getByRole("button", { name: /Edit Conditional Rules/ }));
    const panel = screen.getAllByRole("tabpanel")[0]!;
    const picker = await within(panel).findByRole("combobox", { name: "Select field" });
    fireEvent.click(picker);
    fireEvent.change(picker, { target: { value: "Gender" } });
    const option = await screen.findByRole("option", { name: /Gender/ });
    // The picker reports a pick from an effect; the group is added before that runs.
    act(() => {
      fireEvent.click(option);
      fireEvent.change(
        within(panel).getAllByRole("combobox", { name: "Add a group of clauses" })[0]!,
        {
          target: { value: "OR" },
        },
      );
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply Changes/ }));
    const rule: unknown = JSON.parse(
      (screen.getByTestId("af-if").textContent ?? "").replace(/^\(|\)$/g, ""),
    );
    expect(rule).toEqual([
      ["Individual1[0][fields][first_name]", "=", '"Ada"'],
      ["OR", []],
      ["Individual1[0][fields][gender_id:name]", "=", '""'],
    ]);
  });

  const twoRules = () => {
    const rule = (value: string) => ["Individual1[0][fields][first_name]", "=", `"${value}"`];
    const rules = [rule("Ada"), rule("Bea")];
    render(
      <Harness initial={form({ ...FIELD, "af-if": `(${JSON.stringify(rules)})` })}>
        {(api) => <Entry api={api} />}
      </Harness>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Edit Conditional Rules/ }));
    const panel = screen.getAllByRole("tabpanel")[0]!;
    const moveFirstDown = () => {
      fireEvent.click(within(panel).getAllByRole("button", { name: "Move Given name down" })[0]!);
    };
    return { rule, panel, moveFirstDown };
  };

  const appliedRule = (): unknown => {
    fireEvent.click(screen.getByRole("button", { name: /Apply Changes/ }));
    return JSON.parse((screen.getByTestId("af-if").textContent ?? "").replace(/^\(|\)$/g, ""));
  };

  it("keeps a field picked on a rule that is moved before the pick is reported", async () => {
    const { rule, panel, moveFirstDown } = twoRules();
    const picker = (await within(panel).findAllByRole("combobox", { name: "Field" }))[0]!;
    fireEvent.click(picker);
    fireEvent.change(picker, { target: { value: "Gender" } });
    const option = await screen.findByRole("option", { name: /Gender/ });
    act(() => {
      fireEvent.click(option);
      moveFirstDown();
    });
    expect(appliedRule()).toEqual([
      rule("Bea"),
      ["Individual1[0][fields][gender_id:name]", "=", '"Ada"'],
    ]);
  });

  it("keeps a field added before a move in the same update", async () => {
    const { rule, panel, moveFirstDown } = twoRules();
    const picker = await within(panel).findByRole("combobox", { name: "Select field" });
    fireEvent.click(picker);
    fireEvent.change(picker, { target: { value: "Gender" } });
    const option = await screen.findByRole("option", { name: /Gender/ });
    act(() => {
      fireEvent.click(option);
      // A change elsewhere renders the dialog, which reports the pick without applying it yet.
      const operator = within(panel).getAllByRole("combobox", { name: "Operator for Given name" });
      fireEvent.change(operator[1]!, { target: { value: "!=" } });
      moveFirstDown();
    });
    expect(appliedRule()).toEqual([
      ["Individual1[0][fields][first_name]", "!=", '"Bea"'],
      rule("Ada"),
      ["Individual1[0][fields][gender_id:name]", "=", '""'],
    ]);
  });

  // deviation:condition-clause-move-buttons
  it("moves a rule into the group below it with a button instead of dragging", () => {
    const rule = (value: string) => ["Individual1[0][fields][first_name]", "=", `"${value}"`];
    const rules = [rule("Ada"), ["OR", [rule("Bea")]]];
    render(
      <Harness initial={form({ ...FIELD, "af-if": `(${JSON.stringify(rules)})` })}>
        {(api) => <Entry api={api} />}
      </Harness>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Edit Conditional Rules/ }));
    fireEvent.click(screen.getAllByRole("button", { name: "Move Given name down" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: /Apply Changes/ }));
    expect(screen.getByTestId("af-if").textContent).toBe(
      `(${JSON.stringify([["OR", [rule("Ada"), rule("Bea")]]])})`,
    );
  });
});
