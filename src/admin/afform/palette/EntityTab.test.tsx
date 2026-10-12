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

function Harness({ initial, meta = META }: { initial: AfformDefinition; meta?: EditorMeta }) {
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
    removeEntity: () => undefined,
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

  // deviation:relationship-autofill-clearable
  it("lets the relationship autofill be cleared, though it has a default mode", async () => {
    renderWithQuery(<Harness meta={AUTOFILL} initial={form(individual({ autofill: "user" }))} />);
    await userEvent.click(await screen.findByRole("button", { name: "Clear Autofill" }));
    const [root] = latest?.layout ?? [];
    expect(JSON.stringify(root)).not.toContain('"autofill"');
  });

  // deviation:behaviors-only-on-forms
  it("shows behaviors for a form's entity, not for a block's stand-in", async () => {
    const { unmount } = renderWithQuery(<Harness meta={AUTOFILL} initial={form()} />);
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
