import { META } from "../testMeta";
import { blockContents, blockIcon, elementSummary, fieldSummary } from "./summary";

// deviation:palette-tiles
describe("fieldSummary", () => {
  it("names the input type and its settings, the first three options", () => {
    const summary = fieldSummary(META, {
      name: "colour",
      label: "Colour",
      input_type: "Select",
      required: true,
      serialize: 1,
      readonly: true,
      options: ["Red", "Green", "Blue", "Black"].map((label, id) => ({ id, label })),
    });
    expect(summary).toEqual({
      icon: "fa-square-caret-down",
      kind: "Select",
      details: ["Required", "Several values", "Read only", "Red, Green, Blue, …"],
    });
  });

  it("takes a reference's icon from its target and names it, a length limit too", () => {
    const summary = fieldSummary(META, {
      name: "contact_id",
      label: "Contact",
      input_type: "EntityRef",
      fk_entity: "Individual",
      input_attrs: { maxlength: 64 },
    });
    expect(summary).toEqual({
      icon: "fa-user",
      kind: "EntityRef",
      details: ["Refers to Individual", "Up to 64 characters"],
    });
  });

  it("says nothing extra of a plain field", () => {
    expect(fieldSummary(META, { name: "x", label: "X", input_type: "Text" })).toEqual({
      icon: "fa-font",
      kind: "Text",
      details: [],
    });
  });
});

describe("elementSummary", () => {
  it("takes a button's own icon and tells what core's elements do", () => {
    expect(elementSummary("submit", { "#tag": "button", "crm-icon": "fa-arrow-right" })).toEqual({
      icon: "fa-arrow-right",
      text: "Submits the form",
    });
    expect(elementSummary("tabset", { "#tag": "div" })).toEqual({
      icon: "fa-folder",
      text: "Tabs, each holding its own elements",
    });
  });

  it("gives an extension's element a generic icon and no text", () => {
    expect(elementSummary("captcha", { "#tag": "div" })).toEqual({
      icon: "fa-puzzle-piece",
      text: null,
    });
  });
});

describe("blockIcon", () => {
  const block = (entity: string, join?: string) => ({
    name: "b",
    title: "B",
    directive_name: "b",
    entity_type: entity,
    join_entity: join,
  });

  it("prefers the join's icon, then the block's entity, then the palette's", () => {
    const meta = {
      ...META,
      gui: {
        ...META.gui,
        entities: {
          ...META.gui.entities,
          Email: { ...META.gui.entities.Email, entity: "Email", label: "Email", icon: "fa-at" },
        },
      },
    };
    expect(blockIcon(meta, block("Individual", "Email"), undefined)).toBe("fa-at");
    expect(blockIcon(meta, block("Individual"), "Email")).toBe("fa-user");
    expect(blockIcon(meta, block("Contact"), "Individual")).toBe("fa-user");
    expect(blockIcon(meta, block("*"), undefined)).toBe("fa-cubes");
  });
});

describe("blockContents", () => {
  it("lists own labels, the entity's labels, bare names and inner blocks' titles", () => {
    const contents = blockContents(
      META,
      {
        name: "b",
        title: "B",
        directive_name: "b",
        layout: [
          { "#tag": "af-field", name: "first_name", defn: "{label: 'Given'}" },
          {
            "#tag": "div",
            "#children": [
              { "#tag": "af-field", name: "last_name" },
              { "#tag": "af-field", name: "nickname" },
            ],
          },
          { "#tag": "afblock-email" },
        ],
      },
      () => "Individual",
    );
    expect(contents).toEqual(["Given", "Last Name", "nickname", "Email Block"]);
  });
});
