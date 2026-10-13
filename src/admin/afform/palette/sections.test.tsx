import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { apiError, mockApi, renderWithQuery } from "../../../test/render";
import { EditorContext, formEntities, type EditorApi } from "../context";
import type { AfformDefinition } from "../meta";
import { META } from "../testMeta";
import { Palette } from "./Palette";

const individual = (name: string, label: string, more: Record<string, string> = {}) => ({
  "#tag": "af-entity",
  type: "Individual",
  name,
  label,
  actions: "{create: true, update: false}",
  security: "RBAC",
  data: "{first_name: 'Probe'}",
  ...more,
});

const form: AfformDefinition = {
  type: "form",
  title: "Probe",
  layout: [
    {
      "#tag": "af-form",
      ctrl: "afform",
      "#children": [
        individual("Individual1", "Applicant"),
        individual("Individual2", "Spouse"),
        { "#tag": "fieldset", "af-fieldset": "Individual1", "#children": [] },
        { "#tag": "fieldset", "af-fieldset": "Individual2", "#children": [] },
      ],
    },
  ],
};

let latest = form;

function Harness({ initial = form }: { initial?: AfformDefinition }) {
  const [afform, setAfform] = useState(initial);
  const [selected, setSelected] = useState<string | null>("Individual1");
  latest = afform;
  const api: EditorApi = {
    meta: META,
    afform,
    entities: formEntities(afform, META),
    change: setAfform,
    selected,
    select: setSelected,
    addMeta: () => undefined,
    removeEntity: () => undefined,
    saveBlocked: null,
    openDialog: () => undefined,
  };
  return (
    <EditorContext value={api}>
      <Palette
        displays={[]}
        loading={[]}
        link={null}
        onAddEntity={() => undefined}
        onAddSearch={() => undefined}
      />
    </EditorContext>
  );
}

const section = (name: string) => {
  const found = screen.getByRole("button", { name }).closest("section");
  if (!found) throw new Error(`No section ${name}`);
  return found;
};

// deviation:palette-sections
describe("palette sections", () => {
  it("show the values and the add list, the options shut with their settings in the heading", () => {
    renderWithQuery(<Harness />);
    const values = screen.getByRole("button", { name: "Values" });
    expect(values).toHaveAttribute("aria-expanded", "true");
    expect(values).toHaveAccessibleDescription("1 value");
    const options = screen.getByRole("button", { name: "Options" });
    expect(options).toHaveAttribute("aria-expanded", "false");
    expect(options).toHaveAccessibleDescription("User-Based · Create");
    expect(within(section("Options")).queryByRole("combobox")).not.toBeInTheDocument();
    expect(within(section("Add")).getByRole("button", { name: "First Name" })).toBeVisible();
  });

  it("keep a section shut or open in the other entity's tab", async () => {
    renderWithQuery(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Values" }));
    await userEvent.click(screen.getByRole("button", { name: "Options" }));
    await userEvent.click(screen.getByRole("tab", { name: "Spouse" }));
    expect(screen.getByRole("button", { name: "Values" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(within(section("Values")).getByText("First Name:")).not.toBeVisible();
    expect(screen.getByRole("button", { name: "Options" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(within(section("Options")).getByRole("checkbox", { name: "Create" })).toBeVisible();
  });

  it("keep each tab's search term to itself", async () => {
    renderWithQuery(<Harness />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search fields" }), "Last");
    expect(screen.queryByRole("button", { name: "First Name" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Spouse" }));
    expect(screen.getByRole("searchbox", { name: "Search fields" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "First Name" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Applicant" }));
    expect(screen.getByRole("searchbox", { name: "Search fields" })).toHaveValue("Last");
    expect(screen.queryByRole("button", { name: "First Name" })).not.toBeInTheDocument();
  });

  // deviation:palette-search-none
  it("say when nothing matches a search, and only then", async () => {
    renderWithQuery(<Harness />);
    const search = screen.getByRole("searchbox", { name: "Search fields" });
    const status = within(section("Add")).getByRole("status");
    await userEvent.type(search, "Last");
    expect(status).toBeEmptyDOMElement();
    await userEvent.type(search, "zz");
    expect(status).toHaveTextContent("Nothing matches “Lastzz”.");
    await userEvent.clear(search);
    expect(status).toBeEmptyDOMElement();
    expect(screen.getByRole("button", { name: "First Name" })).toBeInTheDocument();
  });
});

// deviation:palette-sections
describe("shut palette sections", () => {
  it("keep each kind of tab to itself", async () => {
    renderWithQuery(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await userEvent.click(screen.getByRole("tab", { name: "Elements" }));
    expect(screen.getByRole("button", { name: "Add" })).toHaveAttribute("aria-expanded", "true");
  });

  it("tell of a missing or invalid value they hide", async () => {
    renderWithQuery(<Harness initial={{ ...form, server_route: "not a route" }} />);
    await userEvent.click(screen.getByRole("tab", { name: "Settings" }));
    const placement = screen.getByRole("button", { name: "Placement Options" });
    expect(placement).toHaveAccessibleDescription("not a route");
    await userEvent.click(placement);
    expect(placement).toHaveAccessibleDescription("A value is missing or invalid");
  });

  it("tell of a required value left empty", async () => {
    mockApi({ "Navigation.get": () => [] });
    renderWithQuery(
      <Harness
        initial={{
          ...form,
          server_route: "civicrm/probe",
          icon: "fa-star",
          navigation: { parent: "Contacts", label: "", weight: 0 },
        }}
      />,
    );
    await userEvent.click(screen.getByRole("tab", { name: "Settings" }));
    const placement = screen.getByRole("button", { name: "Placement Options" });
    await userEvent.click(placement);
    expect(placement).toHaveAccessibleDescription("A value is missing or invalid");
  });

  it("tell of an error that arrives while they are shut", async () => {
    let fail: (error: Error) => void = () => undefined;
    mockApi({
      "Navigation.get": () =>
        new Promise((_, reject) => {
          fail = reject;
        }),
    });
    renderWithQuery(
      <Harness
        initial={{
          ...form,
          server_route: "civicrm/probe",
          icon: "fa-star",
          navigation: { parent: "Contacts", label: "Probe", weight: 0 },
        }}
      />,
    );
    await userEvent.click(screen.getByRole("tab", { name: "Settings" }));
    const placement = screen.getByRole("button", { name: "Placement Options" });
    await userEvent.click(placement);
    expect(placement).toHaveAccessibleDescription("civicrm/probe");
    act(() => {
      fail(apiError("The menu cannot be read"));
    });
    await waitFor(() => {
      expect(placement).toHaveAccessibleDescription("A value is missing or invalid");
    });
  });

  it("keep a healthy section's summary when shut", async () => {
    mockApi({ "Navigation.get": () => [] });
    renderWithQuery(
      <Harness
        initial={{
          ...form,
          server_route: "civicrm/probe",
          icon: "fa-star",
          navigation: { parent: "Contacts", label: "Probe", weight: 0 },
        }}
      />,
    );
    await userEvent.click(screen.getByRole("tab", { name: "Settings" }));
    const placement = screen.getByRole("button", { name: "Placement Options" });
    await userEvent.click(placement);
    expect(placement).toHaveAccessibleDescription("civicrm/probe");
  });

  it("keep the warning on records opened by their id in view", async () => {
    const exposed = individual("Individual1", "Applicant", {
      actions: "{create: true, update: true}",
      security: "FBAC",
      "url-autofill": "1",
    });
    const layout = [{ "#tag": "af-form", ctrl: "afform", "#children": [exposed] }];
    renderWithQuery(<Harness initial={{ ...form, layout }} />);
    const options = screen.getByRole("button", { name: "Options" });
    expect(options).toHaveAttribute("aria-expanded", "false");
    expect(options).toHaveAccessibleDescription("Form-Based · Create · Update · ID from URL");
    expect(screen.getByText(/by changing the id in the URL/)).toBeVisible();
    await userEvent.click(options);
    expect(screen.getAllByText(/by changing the id in the URL/)).toHaveLength(1);
  });
});

// deviation:entity-label-in-panel-head
describe("palette panel head", () => {
  it("names each entity in full in its tab and renames the open one in the panel's head", async () => {
    renderWithQuery(<Harness />);
    const tabs = screen.getByRole("tablist", { name: "Form parts" });
    expect(within(tabs).getByRole("tab", { name: "Applicant" })).toHaveTextContent("Applicant");
    expect(within(tabs).getByRole("tab", { name: "Spouse" })).toHaveTextContent("Spouse");
    expect(within(tabs).queryByRole("textbox")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Spouse" }));
    const rename = screen.getByRole("textbox", { name: "Label of Individual2" });
    // jsdom types into no contenteditable, so the text is set as typing leaves it.
    rename.textContent = "Partner";
    fireEvent.blur(rename);
    expect(JSON.stringify(latest.layout)).toContain('"label":"Partner"');
    expect(within(tabs).getByRole("tab", { name: "Partner" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("button", { name: "Remove Partner" })).toBeInTheDocument();
  });
});
