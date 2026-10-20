import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { EditorContext, type EditorApi } from "../context";
import type { EditorMeta } from "../meta";
import { META } from "../testMeta";
import type { ShallowElement } from "../tree";
import { mockApi, renderWithQuery } from "../../../test/render";
import { MultiToggle, RepeatMenuItems, SaveBlockDialog } from "./Container";

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

describe("RepeatMenuItems", () => {
  let latest: ShallowElement | undefined;
  function Harness({ initial }: { initial: ShallowElement }) {
    const [node, setNode] = useState(initial);
    latest = node;
    return (
      <EditorContext value={editor}>
        <ul>
          <RepeatMenuItems
            ops={{ path: [0], node, edit: setNode, remove: () => undefined }}
            repeatMax={null}
          />
        </ul>
      </EditorContext>
    );
  }

  // deviation:repeat-bounds-on-blur
  it("keeps the minimum while a larger maximum is typed digit by digit", async () => {
    render(<Harness initial={{ "#tag": "div", "af-repeat": "Add", min: "2", max: "3" }} />);
    const max = screen.getByRole("spinbutton", { name: "Maximum" });
    await userEvent.clear(max);
    await userEvent.type(max, "12");
    await userEvent.tab();
    expect(latest).toMatchObject({ min: "2", max: "12" });
  });

  it("lowers the minimum to a smaller maximum once the maximum is left", async () => {
    render(<Harness initial={{ "#tag": "div", "af-repeat": "Add", min: "4", max: "5" }} />);
    const max = screen.getByRole("spinbutton", { name: "Maximum" });
    await userEvent.clear(max);
    await userEvent.type(max, "3");
    expect(latest).toMatchObject({ min: "4", max: "3" });
    await userEvent.tab();
    expect(latest).toMatchObject({ min: "3", max: "3" });
  });

  it("raises the maximum to a larger minimum once the minimum is left", async () => {
    render(<Harness initial={{ "#tag": "div", "af-repeat": "Add", min: "1", max: "2" }} />);
    const min = screen.getByRole("spinbutton", { name: "Minimum" });
    await userEvent.clear(min);
    await userEvent.type(min, "5");
    await userEvent.tab();
    expect(latest).toMatchObject({ min: "5", max: "5" });
  });

  it("treats a maximum of 0 as no limit", async () => {
    render(
      <Harness
        initial={{ "#tag": "div", "af-repeat": "Add", max: "0", "af-repeat-default": "4" }}
      />,
    );
    expect(screen.getByRole("spinbutton", { name: /Initially show/ })).toBeValid();
    const min = screen.getByRole("spinbutton", { name: "Minimum" });
    await userEvent.type(min, "2");
    await userEvent.tab();
    expect(latest).toMatchObject({ min: "2", max: "0" });
  });

  // deviation:repeat-default-within-max
  it("marks an initial count past the maximum invalid", () => {
    render(
      <Harness
        initial={{ "#tag": "div", "af-repeat": "Add", max: "3", "af-repeat-default": "4" }}
      />,
    );
    expect(screen.getByRole("spinbutton", { name: /Initially show/ })).toBeInvalid();
  });
});

describe("SaveBlockDialog", () => {
  it("saves the block under its title trimmed and takes no title of spaces alone", async () => {
    const calls = mockApi({
      "Afform.convert": () => [{ layout: "" }],
      "Afform.save": () => [{ name: "afblockProbe", directive_name: "afblock-probe" }],
    });
    renderWithQuery(
      <EditorContext value={editor}>
        <SaveBlockDialog
          initial={{ type: "block", layout: [], entity_type: "Individual" }}
          original={null}
          onSaved={() => undefined}
          onClose={() => undefined}
        />
      </EditorContext>,
    );
    const title = screen.getByRole("textbox", { name: /Title/ });
    const save = screen.getByRole("button", { name: "Save" });
    await userEvent.type(title, "   ");
    expect(save).toBeDisabled();
    await userEvent.type(title, "Probe  ");
    await userEvent.click(save);
    const saved = calls.find((c) => c.call === "Afform.save");
    expect(saved?.params).toMatchObject({ records: [{ title: "Probe" }] });
  });
});
