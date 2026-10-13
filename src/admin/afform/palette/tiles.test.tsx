import { screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { scrollAllIntoView } from "../../../test/intersection";
import { apiError, mockApi, renderWithQuery } from "../../../test/render";
import { EditorContext, formEntities, type EditorApi } from "../context";
import { addMeta, type AfformDefinition, type EditorMeta } from "../meta";
import { META } from "../testMeta";
import { ElementsTab } from "./ElementsTab";
import { EntityTab } from "./EntityTab";

const form: AfformDefinition = {
  type: "form",
  title: "Probe",
  layout: [
    {
      "#tag": "af-form",
      ctrl: "afform",
      "#children": [
        { "#tag": "af-entity", type: "Individual", name: "Individual1", security: "RBAC" },
        { "#tag": "fieldset", "af-fieldset": "Individual1", "#children": [] },
      ],
    },
  ],
};

/** A block listed without its layout, as loadAdminData lists blocks not on the form. */
const UNLOADED: EditorMeta = {
  ...META,
  blocks: {
    ...META.blocks,
    "afblock-pair": {
      name: "afblockPair",
      title: "Pair",
      directive_name: "afblock-pair",
      entity_type: "Contact",
    },
  },
};

function Harness({
  meta,
  tab,
  selected = null,
}: {
  meta: EditorMeta;
  tab: "entity" | "elements";
  selected?: string | null;
}) {
  const [current, setCurrent] = useState(meta);
  const entities = formEntities(form, current);
  const api: EditorApi = {
    meta: current,
    afform: form,
    entities,
    change: () => undefined,
    selected,
    select: () => undefined,
    addMeta: (data) => {
      setCurrent((before) => addMeta(before, data));
    },
    removeEntity: () => undefined,
    saveBlocked: null,
    openDialog: () => undefined,
  };
  const [entity] = entities;
  let content: ReactNode = <ElementsTab />;
  if (tab === "entity") content = entity && <EntityTab entity={entity} link={null} />;
  return <EditorContext value={api}>{content}</EditorContext>;
}

const tile = (name: string) => screen.getByRole("button", { name });

// deviation:palette-tiles
describe("palette tiles", () => {
  it("describe a field by its input type and settings", () => {
    renderWithQuery(<Harness meta={META} tab="entity" />);
    expect(tile("First Name")).toHaveAccessibleDescription("Text");
    expect(tile("Gender")).toHaveAccessibleDescription("Radio Female, Male");
  });

  it("list a block's fields once the tile is on show", () => {
    renderWithQuery(<Harness meta={META} tab="entity" />);
    expect(tile("Name")).toHaveAccessibleDescription("");
    scrollAllIntoView();
    expect(tile("Name")).toHaveAccessibleDescription("First Name, Last Name");
    expect(tile("Name").querySelector(".crm-i")).toHaveClass("fa-user");
  });

  it("load the layout of a block not on the form to list its fields", async () => {
    const calls = mockApi({
      "Afform.loadAdminData": () => [
        {
          definition: {
            type: "block",
            name: "afblockPair",
            title: "Pair",
            directive_name: "afblock-pair",
            entity_type: "Contact",
            layout: [
              { "#tag": "af-field", name: "last_name", defn: "{label: 'Surname'}" },
              { "#tag": "afblock-name" },
            ],
          },
        },
      ],
    });
    renderWithQuery(<Harness meta={UNLOADED} tab="entity" />);
    scrollAllIntoView();
    expect(tile("Pair")).toHaveAccessibleDescription("Loading…");
    // A field's own label comes first, an inner block goes by its title.
    expect(await screen.findByText("Surname, Name")).toBeInTheDocument();
    expect(calls.map(({ call }) => call)).toEqual(["Afform.loadAdminData"]);
  });

  it("tell why a block's fields could not be listed", async () => {
    mockApi({
      "Afform.loadAdminData": () => {
        throw apiError("Block gone");
      },
    });
    renderWithQuery(<Harness meta={UNLOADED} tab="entity" />);
    scrollAllIntoView();
    expect(await screen.findByText("Block gone")).toBeInTheDocument();
    expect(tile("Pair")).toHaveAccessibleDescription("Block gone");
  });

  it("load a failed block once, not again on each change to the editor", async () => {
    const calls = mockApi({
      "Afform.loadAdminData": () => {
        throw apiError("Block gone");
      },
    });
    const { rerender } = renderWithQuery(<Harness meta={UNLOADED} tab="entity" />);
    scrollAllIntoView();
    expect(await screen.findByText("Block gone")).toBeInTheDocument();
    rerender(<Harness meta={UNLOADED} tab="entity" selected="Individual1" />);
    rerender(<Harness meta={UNLOADED} tab="entity" selected={null} />);
    expect(screen.getByText("Block gone")).toBeInTheDocument();
    expect(calls).toHaveLength(1);
  });

  it.each([
    ["no definition", null],
    ["only the locale a multilingual site adds", { locale: ["en_US"] }],
  ])("tell of a block deleted since the editor opened, given %s", async (_, definition) => {
    mockApi({ "Afform.loadAdminData": () => [{ definition }] });
    renderWithQuery(<Harness meta={UNLOADED} tab="entity" />);
    scrollAllIntoView();
    expect(await screen.findByText("There is no block named afblockPair.")).toBeInTheDocument();
  });

  it("describe core's elements, a button with its own icon", () => {
    renderWithQuery(<Harness meta={META} tab="elements" />);
    expect(tile("Submit Button")).toHaveAccessibleDescription("Submits the form");
    expect(tile("Submit Button").querySelector(".crm-i")).toHaveClass("fa-check");
    expect(tile("Pages")).toHaveAccessibleDescription(
      "Splits the form into steps with Next and Back",
    );
  });
});
