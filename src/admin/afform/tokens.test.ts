import { describe, expect, it } from "vitest";
import { formEntities } from "./context";
import type { AfformDefinition } from "./meta";
import { META } from "./testMeta";
import { formTokens } from "./tokens";

const person = (name: string, label?: string) => [
  { "#tag": "af-entity", type: "Individual", name, ...(label && { label }) },
  {
    "#tag": "fieldset",
    "af-fieldset": name,
    "#children": [{ "#tag": "af-field", name: "first_name" }],
  },
];

describe("formTokens", () => {
  // deviation:token-groups-by-entity-name
  it("names a group by the entity's label, else by its name, so two unlabelled ones differ", () => {
    const afform: AfformDefinition = {
      type: "form",
      title: "Two people",
      layout: [
        {
          "#tag": "af-form",
          ctrl: "afform",
          "#children": [
            ...person("Individual1"),
            ...person("Individual2"),
            ...person("Individual3", "Partner"),
          ],
        },
      ],
    };
    const editor = { afform, meta: META, entities: formEntities(afform, META) };
    expect(formTokens(editor, false, true).map((group) => group.text)).toEqual([
      "Individual1",
      "Individual2",
      "Partner",
    ]);
  });

  it("offers each join block's fields, and its id with the submission, where core has them", () => {
    const email = {
      "#tag": "div",
      "af-join": "Email",
      "#children": [{ "#tag": "af-field", name: "email" }],
    };
    const afform: AfformDefinition = {
      type: "form",
      title: "Two emails",
      layout: [
        {
          "#tag": "af-form",
          ctrl: "afform",
          "#children": [
            { "#tag": "af-entity", type: "Individual", name: "Individual1", label: "Person" },
            {
              "#tag": "fieldset",
              "af-fieldset": "Individual1",
              "#children": [{ "#tag": "af-field", name: "first_name" }, email, email],
            },
          ],
        },
      ],
    };
    const editor = { afform, meta: META, entities: formEntities(afform, META) };
    const work = {
      text: "Person: Email 2",
      children: [{ id: "Individual1.0.Email.1.email", text: "Email" }],
    };
    expect(formTokens(editor, false, true).slice(1)).toEqual([
      { text: "Person: Email 1", children: [{ id: "Individual1.0.Email.0.email", text: "Email" }] },
      work,
    ]);
    expect(formTokens(editor, true, true)[2]).toEqual({
      ...work,
      children: [{ id: "Individual1.0.Email.1.id", text: "Email ID" }, ...work.children],
    });
    expect(formTokens(editor, false, false).map((group) => group.text)).toEqual(["Person"]);
  });
});
