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
    expect(formTokens(editor, false).map((group) => group.text)).toEqual([
      "Individual1",
      "Individual2",
      "Partner",
    ]);
  });
});
