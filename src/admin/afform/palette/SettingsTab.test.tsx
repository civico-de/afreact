import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { mockApi, renderWithQuery } from "../../../test/render";
import { EditorContext, formEntities, type EditorApi } from "../context";
import type { AfformDefinition, EditorMeta } from "../meta";
import { META } from "../testMeta";
import { SettingsTab } from "./SettingsTab";

let latest: AfformDefinition | undefined;

function Harness({ initial, meta = META }: { initial: AfformDefinition; meta?: EditorMeta }) {
  const [afform, setAfform] = useState(initial);
  latest = afform;
  const api: EditorApi = {
    meta,
    afform,
    entities: formEntities(afform, meta),
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
  return (
    <EditorContext value={api}>
      <SettingsTab />
    </EditorContext>
  );
}

describe("SettingsTab", () => {
  beforeEach(() => {
    latest = undefined;
    mockApi({ "Navigation.get": () => [] });
  });

  it("checks the post-submit page by the pattern browsers apply", () => {
    renderWithQuery(
      <Harness
        initial={{
          type: "form",
          title: "Probe",
          layout: [],
          submit_enabled: true,
          confirmation_type: "redirect_to_url",
          redirect: "nonsense",
        }}
      />,
    );
    const redirect = screen.getByTitle(/^Post-Submit Page must be/);
    if (!(redirect instanceof HTMLInputElement))
      throw new Error("The post-submit page is no input.");
    expect(redirect.validity.patternMismatch).toBe(true);
  });

  // deviation:menu-item-title-label
  it("labels the menu item's title apart from the form's", () => {
    renderWithQuery(
      <Harness
        initial={{
          type: "form",
          title: "Probe",
          layout: [],
          server_route: "civicrm/probe",
          navigation: { label: "Probe menu", parent: null, weight: 0 },
        }}
      />,
    );
    expect(screen.getByRole("textbox", { name: "Menu item title" })).toHaveValue("Probe menu");
    // Only the form's own title answers to its name, not the menu item's placeholder.
    expect(screen.getAllByRole("textbox", { name: /^title/i })).toHaveLength(1);
  });

  // deviation:placement-filters-list
  it("warns of placement filters stored as a list and replaces them once a filter is chosen", async () => {
    renderWithQuery(
      <Harness
        initial={{
          type: "search",
          title: "Probe",
          layout: [],
          placement: ["contact_summary_tab"],
          placement_filters: ["Individual"],
        }}
      />,
    );
    expect(screen.getByText(/stored placement filters are a list/)).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("combobox", { name: "Contact Type" }));
    await userEvent.click(await screen.findByRole("option", { name: "Individual" }));
    expect(latest?.placement_filters).toEqual({ contact_type: ["Individual"] });
    expect(screen.queryByText(/stored placement filters are a list/)).not.toBeInTheDocument();
  });

  // deviation:placement-rows-with-filter
  it("shows a filter row only for a placement entity with a filter", () => {
    renderWithQuery(
      <Harness
        initial={{
          type: "search",
          title: "Probe",
          layout: [],
          placement: ["contact_summary_tab", "event_manage_tab"],
        }}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Contact Type" })).toBeInTheDocument();
    expect(screen.queryAllByRole("combobox", { name: "" })).toEqual([]);
  });

  // deviation:locale-setting-label
  it("labels the locale with the locale field's title", () => {
    const meta: EditorMeta = {
      ...META,
      admin: {
        ...META.admin,
        afform_fields: {
          ...META.admin.afform_fields,
          locale: { name: "locale", title: "Language" },
        },
        locales: [{ id: "de_DE", text: "German" }],
      },
    };
    renderWithQuery(<Harness meta={meta} initial={{ type: "form", title: "Probe", layout: [] }} />);
    expect(screen.getByRole("combobox", { name: /^Language/ })).toBeInTheDocument();
  });
});
