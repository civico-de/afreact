import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CoreVersion } from "../../version";
import { EditorContext, formEntities, type EditorApi } from "../context";
import type { AfformDefinition } from "../meta";
import { META } from "../testMeta";
import { FormTokenSelect } from "./TokenSelect";

const afform: AfformDefinition = {
  type: "form",
  title: "Email",
  layout: [
    {
      "#tag": "af-form",
      ctrl: "afform",
      "#children": [
        { "#tag": "af-entity", type: "Individual", name: "Individual1", label: "Person" },
        {
          "#tag": "fieldset",
          "af-fieldset": "Individual1",
          "#children": [
            { "#tag": "af-field", name: "first_name" },
            {
              "#tag": "div",
              "af-join": "Email",
              "#children": [{ "#tag": "af-field", name: "email" }],
            },
          ],
        },
      ],
    },
  ],
};

const editor: EditorApi = {
  meta: META,
  afform,
  entities: formEntities(afform, META),
  change: () => undefined,
  selected: null,
  select: () => undefined,
  addMeta: () => undefined,
  removeEntity: () => undefined,
  saveBlocked: null,
  openDialog: () => undefined,
};

/** Opens the token menu on `version`; jsdom keeps the popover out of the accessibility tree. */
async function openMenu(version: string) {
  const view = render(
    <CoreVersion value={version}>
      <EditorContext value={editor}>
        <FormTokenSelect value="" onChange={() => undefined} />
      </EditorContext>
    </CoreVersion>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Insert Token" }));
  const list = within(await screen.findByRole("listbox", { hidden: true }));
  await list.findByRole("group", { name: "Person", hidden: true });
  return { list, view };
}

describe("FormTokenSelect", () => {
  it("offers a join block's tokens only on a core whose submission fills them", async () => {
    const older = await openMenu("6.20.0");
    expect(older.list.queryByRole("group", { name: "Person: Email 1", hidden: true })).toBeNull();
    older.view.unmount();
    const { list } = await openMenu("6.21.alpha1");
    const email = list.getByRole("group", { name: "Person: Email 1", hidden: true });
    expect(within(email).getByRole("option", { name: "Email", hidden: true })).toBeInTheDocument();
  });
});
