import { screen } from "@testing-library/react";
import { mockApi, renderWithQuery } from "../../test/render";
import { FormEditor, withLayout } from "./FormEditor";
import { META } from "./testMeta";

describe("withLayout", () => {
  const join = {
    "#tag": "div",
    "af-join": "Email",
    "#children": [{ "#tag": "af-field", name: "email" }],
  };
  const joinBlock = {
    "#tag": "div",
    "af-join": "Email",
    "#children": [{ "#tag": "afblock-email" }],
  };

  // deviation:block-join-kept
  it("backfills a form's entities and gives its joins and blocks their actions", () => {
    const afform = withLayout(
      { type: "form", title: "Test", layout: [] },
      [
        {
          "#tag": "af-form",
          ctrl: "afform",
          "#children": [
            { "#tag": "af-entity", type: "Individual", name: "Individual1" },
            {
              "#tag": "fieldset",
              "af-fieldset": "Individual1",
              "#children": [
                join,
                joinBlock,
                { "#tag": "afblock-name" },
                { "#tag": "div", "af-join": "Phone", actions: "{update: false}" },
              ],
            },
          ],
        },
      ],
      META,
    );
    const actions = "{update: true, delete: true}";
    expect(afform.layout).toEqual([
      {
        "#tag": "af-form",
        ctrl: "afform",
        "#children": [
          {
            "#tag": "af-entity",
            type: "Individual",
            name: "Individual1",
            actions: "{create: true, update: true}",
            security: "RBAC",
          },
          {
            "#tag": "fieldset",
            "af-fieldset": "Individual1",
            "#children": [
              { ...join, actions },
              { ...joinBlock, actions },
              { "#tag": "afblock-name", actions },
              { "#tag": "div", "af-join": "Phone", actions: "{update: false}" },
            ],
          },
        ],
      },
    ]);
  });

  it("works on a block's layout from the top, leaving its entities alone", () => {
    const entity = { "#tag": "af-entity", name: "A" };
    const afform = withLayout(
      { type: "block", title: "Test", layout: [] },
      [entity, { "#tag": "afblock-name" }],
      META,
    );
    expect(afform.layout).toEqual([
      entity,
      { "#tag": "afblock-name", actions: "{update: true, delete: true}" },
    ]);
  });
});

describe("FormEditor", () => {
  it("names a form that does not exist instead of failing on it", async () => {
    mockApi({
      "Afform.loadAdminData": () => [{ definition: null, entities: {}, fields: {}, blocks: [] }],
    });
    renderWithQuery(<FormEditor mode="edit" name="afformMissing" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "There is no form named afformMissing.",
    );
  });
});
