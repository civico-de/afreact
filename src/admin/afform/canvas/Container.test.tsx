import { render, screen } from "@testing-library/react";
import { EditorContext, type EditorApi } from "../context";
import type { EditorMeta } from "../meta";
import { META } from "../testMeta";
import { MultiToggle } from "./Container";

const email = META.gui.entities.Email;
if (!email) throw new Error("The test metadata has no Email entity.");

/** Email with core's unique fields: a location type and the primary flag. */
const meta: EditorMeta = {
  ...META,
  gui: {
    ...META.gui,
    entities: {
      ...META.gui.entities,
      Email: {
        ...email,
        unique_fields: ["location_type_id", "is_primary"],
        fields: {
          ...email.fields,
          is_primary: { name: "is_primary", label: "Is Primary", input_type: "CheckBox" },
        },
      },
    },
  },
};

const editor: EditorApi = {
  meta,
  afform: { type: "form", title: "Probe", layout: [] },
  entities: [],
  change: () => undefined,
  selected: null,
  select: () => undefined,
  addMeta: () => undefined,
  removeEntity: () => undefined,
  saveBlocked: null,
  openDialog: () => undefined,
};

describe("MultiToggle", () => {
  // deviation:block-toggle-first-value
  it("names a block after the first unique field its data sets", () => {
    const node = {
      "#tag": "div",
      "af-join": "Email",
      data: "{location_type_id: 2, is_primary: true}",
    };
    render(
      <EditorContext value={editor}>
        <MultiToggle
          ops={{ path: [0], node, edit: () => undefined, remove: () => undefined }}
          entityType="Email"
        />
      </EditorContext>,
    );
    expect(screen.getByRole("button", { name: "Toggle multi or single block" })).toHaveTextContent(
      /^\s*Work$/,
    );
  });
});
