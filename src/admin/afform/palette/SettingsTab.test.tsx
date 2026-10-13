import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { mockApi, renderWithQuery } from "../../../test/render";
import { EditorContext, formEntities, type EditorApi } from "../context";
import type { AfformDefinition, EditorMeta } from "../meta";
import { META } from "../testMeta";
import { SettingsTab } from "./SettingsTab";

let latest: AfformDefinition | undefined;
let replace: (afform: AfformDefinition) => void = () => undefined;
let hide: () => void = () => undefined;

function Harness({ initial, meta = META }: { initial: AfformDefinition; meta?: EditorMeta }) {
  const [afform, setAfform] = useState(initial);
  const [shown, setShown] = useState(true);
  latest = afform;
  replace = setAfform;
  hide = () => {
    setShown(false);
  };
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
  return <EditorContext value={api}>{shown && <SettingsTab />}</EditorContext>;
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

  // deviation:route-paste-replaces-offer
  it("takes a whole path pasted into the offered start of a page route", async () => {
    renderWithQuery(<Harness initial={{ type: "form", title: "Probe", layout: [] }} />);
    const route = screen.getByTitle('Path must begin with "civicrm/"');
    await userEvent.click(route);
    expect(route).toHaveValue("civicrm/");
    await userEvent.paste("civicrm/probe-page");
    expect(route).toHaveValue("civicrm/probe-page");
    await userEvent.clear(route);
    await userEvent.tab();
    await userEvent.click(route);
    await userEvent.keyboard("probe");
    expect(route).toHaveValue("civicrm/probe");
  });

  it("keeps a route typed just before the settings give way to another tab", async () => {
    renderWithQuery(<Harness initial={{ type: "form", title: "Probe", layout: [] }} />);
    const route = screen.getByTitle('Path must begin with "civicrm/"');
    await userEvent.click(route);
    await userEvent.keyboard("probe");
    expect(latest?.server_route).toBeUndefined();
    act(() => {
      hide();
    });
    expect(latest?.server_route).toBe("civicrm/probe");
  });

  // deviation:navigation-weight-negative
  it("takes a negative menu order, as core's own forms store one, and lets it be typed", async () => {
    renderWithQuery(
      <Harness
        initial={{
          type: "form",
          title: "Probe",
          layout: [],
          server_route: "civicrm/probe",
          navigation: { label: "Probe menu", parent: null, weight: -1 },
        }}
      />,
    );
    const order = screen.getByRole("spinbutton", { name: "Order" });
    expect(order).toHaveValue(-1);
    expect(order).toBeValid();
    await userEvent.clear(order);
    expect(order).toHaveValue(null);
    expect(latest?.navigation?.weight).toBe(-1);
    await userEvent.type(order, "-3");
    expect(order).toHaveValue(-3);
    expect(latest?.navigation?.weight).toBe(-3);
  });

  it("shows the order an undo brings back while the order input keeps focus", async () => {
    const initial: AfformDefinition = {
      type: "form",
      title: "Probe",
      layout: [],
      server_route: "civicrm/probe",
      navigation: { label: "Probe menu", parent: null, weight: 2 },
    };
    renderWithQuery(<Harness initial={initial} />);
    const order = screen.getByRole("spinbutton", { name: "Order" });
    await userEvent.type(order, "5");
    expect(order).toHaveValue(25);
    act(() => {
      replace(initial);
    });
    expect(order).toHaveFocus();
    expect(order).toHaveValue(2);
  });

  it("keeps a fraction typed as the order on show and does not store it", async () => {
    renderWithQuery(
      <Harness
        initial={{
          type: "form",
          title: "Probe",
          layout: [],
          server_route: "civicrm/probe",
          navigation: { label: "Probe menu", parent: null, weight: 2 },
        }}
      />,
    );
    const order = screen.getByRole("spinbutton", { name: "Order" });
    await userEvent.clear(order);
    await userEvent.type(order, "1.5");
    expect(order).toHaveValue(1.5);
    // The "1" typed on the way is stored; the fraction is not.
    expect(latest?.navigation?.weight).toBe(1);
  });

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
