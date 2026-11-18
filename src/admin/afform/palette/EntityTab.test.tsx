import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { mockApi, renderWithQuery } from "../../../test/render";
import { EditorContext, formEntities, type EditorApi } from "../context";
import { RELATIONSHIP_BEHAVIOR } from "../editable";
import type { AfformDefinition, EditorMeta } from "../meta";
import { META } from "../testMeta";
import { EntityTab } from "./EntityTab";

let latest: AfformDefinition | undefined;

function Harness({
  initial,
  meta = META,
  remove = () => undefined,
}: {
  initial: AfformDefinition;
  meta?: EditorMeta;
  remove?: (name: string) => void;
}) {
  const [afform, setAfform] = useState(initial);
  latest = afform;
  const entities = formEntities(afform, meta);
  const api: EditorApi = {
    meta,
    afform,
    entities,
    change: (update) => {
      setAfform(update);
    },
    selected: null,
    select: () => undefined,
    addMeta: () => undefined,
    removeEntity: remove,
    saveBlocked: null,
    openDialog: () => undefined,
  };
  const [entity] = entities;
  return (
    <EditorContext value={api}>{entity && <EntityTab entity={entity} link={null} />}</EditorContext>
  );
}

const individual = (attributes: Record<string, string> = {}) => ({
  "#tag": "af-entity",
  type: "Individual",
  name: "Individual1",
  actions: "{create: true, update: true}",
  security: "RBAC",
  ...attributes,
});

const form = (entity = individual()): AfformDefinition => ({
  type: "form",
  title: "Probe",
  layout: [
    {
      "#tag": "af-form",
      ctrl: "afform",
      "#children": [
        entity,
        {
          "#tag": "fieldset",
          "af-fieldset": "Individual1",
          "#children": [{ "#tag": "af-field", name: "first_name" }],
        },
      ],
    },
  ],
});

/** The relationship autofill as civi_contact's behavior offers it, with a default mode. */
const AUTOFILL: EditorMeta = {
  ...META,
  behaviors: {
    Individual: [
      {
        key: "autofill",
        title: "Autofill",
        template: RELATIONSHIP_BEHAVIOR,
        default_mode: "user",
        modes: [{ name: "user", label: "Current User" }],
      },
    ],
  },
};

describe("EntityTab", () => {
  beforeEach(() => {
    latest = undefined;
    mockApi({});
  });

  // deviation:entity-add-value-omits-used
  it("offers as a value only the fields the form does not use yet", async () => {
    renderWithQuery(<Harness initial={form()} />);
    await userEvent.click(await screen.findByRole("combobox", { name: "Add value" }));
    const offered = (await screen.findAllByRole("option")).map((option) => option.textContent);
    expect(offered).toContain("Last Name");
    expect(offered).not.toContain("First Name");
  });

  it("lets the relationship autofill be cleared, though it has a default mode", async () => {
    renderWithQuery(<Harness meta={AUTOFILL} initial={form(individual({ autofill: "user" }))} />);
    await userEvent.click(screen.getByRole("button", { name: "Options" }));
    await userEvent.click(await screen.findByRole("button", { name: "Clear Autofill" }));
    const [root] = latest?.layout ?? [];
    expect(JSON.stringify(root)).not.toContain('"autofill"');
  });

  // deviation:behaviors-only-on-forms
  it("shows behaviors for a form's entity, not for a block's stand-in", async () => {
    const { unmount } = renderWithQuery(<Harness meta={AUTOFILL} initial={form()} />);
    await userEvent.click(screen.getByRole("button", { name: "Options" }));
    expect(await screen.findByRole("combobox", { name: "Autofill" })).toBeInTheDocument();
    unmount();
    renderWithQuery(
      <Harness
        meta={AUTOFILL}
        initial={{ type: "block", title: "Probe", entity_type: "Individual", layout: [] }}
      />,
    );
    expect(screen.getByRole("group", { name: "Individual Fields" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Autofill")).not.toBeInTheDocument();
  });
});

// deviation:remove-entity-references
describe("removing the entity", () => {
  it("removes an entity nothing else names at once", async () => {
    const remove = vi.fn<(name: string) => void>();
    renderWithQuery(<Harness initial={form()} remove={remove} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove Individual1" }));
    expect(remove).toHaveBeenCalledWith("Individual1");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("names where the form still refers to the entity before removing it", async () => {
    const remove = vi.fn<(name: string) => void>();
    const initial = form();
    const [root] = initial.layout;
    if (!root || !("#children" in root) || !Array.isArray(root["#children"])) throw new Error();
    root["#children"].push({ "#tag": "div", "af-if": '[["Individual1.0.first_name","=","A"]]' });
    renderWithQuery(<Harness initial={initial} remove={remove} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove Individual1" }));
    const dialog = screen.getByRole("dialog", { name: "Remove Individual1" });
    expect(dialog).toHaveTextContent("div af-if");
    expect(remove).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(remove).toHaveBeenCalledWith("Individual1");
  });
});
