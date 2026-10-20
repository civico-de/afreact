import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listParam, mockApi, recordParam, renderWithQuery } from "../../test/render";
import { metadata } from "../../test/searchMetadata";
import { splitHash } from "../../url/hash";
import { newDisplay, removeDisplay, type EditorSearch } from "./editor";
import { mergeSaved, SearchEditor, structuralRisk } from "./SearchEditor";

const stored = {
  id: 5,
  name: "Members",
  label: "Members",
  api_entity: "Contact",
  api_params: { version: 4, select: ["id", "display_name"], where: [], orderBy: {} },
  form_values: [],
  is_template: false,
  tag_id: null,
  groups: [],
  displays: [
    {
      id: 9,
      name: "Members_Table",
      label: "Members Table",
      type: "table",
      settings: { pager: [] },
    },
  ],
};

beforeEach(() => {
  const store = new Map<string, unknown>([["searchMeta2en_US", { ...metadata, cacheKey: "k" }]]);
  window.CRM.vars = {
    afreactAdmin: { searchAdmin: { defaultPagerSize: 50, modules: {}, cacheKey: "k", tags: [] } },
  };
  window.CRM.config = { cid: 2, lcMessages: "en_US" };
  window.CRM.cache = {
    get: (name) => store.get(name),
    set: (name, value) => void store.set(name, value),
  };
});
afterEach(() => {
  delete window.CRM.vars;
  delete window.CRM.cache;
  window.location.hash = "";
});

describe("SearchEditor", () => {
  it("saves an edited search as core's batch and shows it saved", async () => {
    window.location.hash = "#/edit/5";
    const calls = mockApi({
      "SavedSearch.get": () => [stored],
      "Group.delete": () => [],
      "SavedSearch.save": (params) => [
        { ...recordParam(listParam(params.records)[0]), displays: stored.displays },
      ],
    });
    renderWithQuery(<SearchEditor mode="edit" id={5} />);
    const label = await screen.findByRole("textbox", { name: "Saved Search label" });
    expect(screen.getByRole("button", { name: "Saved" })).toBeDisabled();
    fireEvent.change(label, { target: { value: "All members" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("button", { name: "Saved" })).toBeDisabled();
    const save = calls.find((c) => c.call === "SavedSearch.save");
    expect(recordParam(listParam(save?.params.records)[0])).toMatchObject({
      id: 5,
      label: "All members",
    });
    expect(recordParam(save?.params.chain).displays).toBeDefined();
    expect(calls.some((c) => c.call === "Group.delete")).toBe(true);
  });

  it("stops at a missing label and names it", async () => {
    window.location.hash = "#/edit/5";
    mockApi({ "SavedSearch.get": () => [stored] });
    renderWithQuery(<SearchEditor mode="edit" id={5} />);
    fireEvent.change(await screen.findByRole("textbox", { name: "Saved Search label" }), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Search Label is a required field.");
  });

  it("binds a new search to the address and opens its edit route once saved", async () => {
    window.location.hash = "#/create/Contact?label=Fresh";
    mockApi({ "SavedSearch.save": () => [{ id: 12, name: "Fresh", displays: [] }] });
    renderWithQuery(<SearchEditor mode="create" entity="Contact" />);
    expect(await screen.findByRole("textbox", { name: "Saved Search label" })).toHaveValue("Fresh");
    await waitFor(() => {
      expect(splitHash(window.location.hash).params.get("params")).toContain('"display_name"');
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(window.location.hash).toBe("#/edit/12");
    });
  });
});

it("counts a new smart group as saved once the save went through", async () => {
  window.location.hash = "#/edit/5";
  const calls = mockApi({
    "SavedSearch.get": () => [stored],
    "SavedSearch.save": (params) => [
      {
        ...recordParam(listParam(params.records)[0]),
        groups: [{ id: 3 }],
        displays: stored.displays,
      },
    ],
  });
  renderWithQuery(<SearchEditor mode="edit" id={5} />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Add..." }));
  await user.click(screen.getByRole("menuitem", { name: "Smart Group", hidden: true }));
  fireEvent.change(screen.getByRole("textbox", { name: /Group Title/ }), {
    target: { value: "G" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByRole("button", { name: "Saved" })).toBeDisabled();
  const save = calls.find((c) => c.call === "SavedSearch.save");
  const groups = listParam(recordParam(save?.params.chain).groups);
  expect(recordParam(groups[2]).records).toEqual([expect.objectContaining({ title: "G" })]);
});

// deviation:smart-group-column-leads
it("keeps a contact ID leading a smart group's columns when the join that held it goes", async () => {
  window.location.hash = "#/edit/5";
  const calls = mockApi({
    "SavedSearch.get": () => [
      {
        ...stored,
        api_params: {
          version: 4,
          select: ["Contact_Email_contact_id_01.contact_id", "display_name", "id"],
          join: [["Email AS Contact_Email_contact_id_01", "LEFT"]],
        },
        groups: [{ id: 3, title: "G", description: "", visibility: "User and User Admin Only" }],
      },
    ],
    "SavedSearch.save": (params) => [
      {
        ...recordParam(listParam(params.records)[0]),
        groups: [{ id: 3 }],
        displays: stored.displays,
      },
    ],
  });
  renderWithQuery(<SearchEditor mode="edit" id={5} />);
  fireEvent.click(await screen.findByRole("button", { name: /^Remove join/ }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByRole("button", { name: "Saved" })).toBeDisabled();
  const save = calls.find((c) => c.call === "SavedSearch.save");
  expect(recordParam(listParam(save?.params.records)[0]).api_params).toMatchObject({
    select: ["id", "display_name"],
    join: [],
  });
});

describe("text trimmed as ngModel trims it", () => {
  it("saves the label trimmed, keeping what is typed on show", async () => {
    window.location.hash = "#/edit/5";
    const calls = mockApi({
      "SavedSearch.get": () => [stored],
      "Group.delete": () => [],
      "SavedSearch.save": (params) => [
        { ...recordParam(listParam(params.records)[0]), displays: stored.displays },
      ],
    });
    renderWithQuery(<SearchEditor mode="edit" id={5} />);
    const label = await screen.findByRole("textbox", { name: "Saved Search label" });
    fireEvent.change(label, { target: { value: "  All members  " } });
    expect(label).toHaveValue("  All members  ");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("button", { name: "Saved" })).toBeDisabled();
    const save = calls.find((c) => c.call === "SavedSearch.save");
    expect(recordParam(listParam(save?.params.records)[0])).toMatchObject({ label: "All members" });
  });

  it("stops at a label made of spaces as at a missing one", async () => {
    window.location.hash = "#/edit/5";
    const calls = mockApi({ "SavedSearch.get": () => [stored] });
    renderWithQuery(<SearchEditor mode="edit" id={5} />);
    fireEvent.change(await screen.findByRole("textbox", { name: "Saved Search label" }), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Search Label is a required field.");
    expect(calls.some((c) => c.call === "SavedSearch.save")).toBe(false);
  });

  it("trims a smart group's title and description", async () => {
    window.location.hash = "#/edit/5";
    const calls = mockApi({
      "SavedSearch.get": () => [stored],
      "SavedSearch.save": (params) => [
        {
          ...recordParam(listParam(params.records)[0]),
          groups: [{ id: 3 }],
          displays: stored.displays,
        },
      ],
    });
    renderWithQuery(<SearchEditor mode="edit" id={5} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Add..." }));
    await user.click(screen.getByRole("menuitem", { name: "Smart Group", hidden: true }));
    await user.type(screen.getByRole("textbox", { name: /Group Title/ }), " G ");
    await user.type(screen.getByRole("textbox", { name: "Description" }), " About ");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("button", { name: "Saved" })).toBeDisabled();
    const save = calls.find((c) => c.call === "SavedSearch.save");
    const groups = listParam(recordParam(save?.params.chain).groups);
    expect(recordParam(groups[2]).records).toEqual([
      expect.objectContaining({ title: "G", description: "About" }),
    ]);
  });

  it("stops at a smart group title made of spaces", async () => {
    window.location.hash = "#/edit/5";
    mockApi({ "SavedSearch.get": () => [stored] });
    renderWithQuery(<SearchEditor mode="edit" id={5} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Add..." }));
    await user.click(screen.getByRole("menuitem", { name: "Smart Group", hidden: true }));
    fireEvent.change(screen.getByRole("textbox", { name: /Group Title/ }), {
      target: { value: "  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Group Title is a required field.");
  });

  it("trims the label of a display the React builder cannot edit", async () => {
    window.location.hash = "#/edit/5";
    const calls = mockApi({
      "SavedSearch.get": () => [
        { ...stored, displays: [{ id: 9, name: "Odd", label: "Odd", type: "odd", settings: {} }] },
      ],
      "Group.delete": () => [],
      "SavedSearch.save": (params) => [
        { ...recordParam(listParam(params.records)[0]), displays: [] },
      ],
    });
    renderWithQuery(<SearchEditor mode="edit" id={5} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Odd" }));
    const label = screen.getByRole("textbox", { name: "Display Label" });
    await user.clear(label);
    await user.type(label, "   ");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Display Label is a required field.",
    );
    await user.type(label, "Wide ");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("button", { name: "Saved" })).toBeDisabled();
    const save = calls.find((c) => c.call === "SavedSearch.save");
    expect(listParam(recordParam(save?.params.chain).displays)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          records: [expect.objectContaining({ label: "Wide" })],
        }),
      ]),
    );
  });
});

it("offers to save a clone before anything in it changed", async () => {
  window.location.hash = "#/clone/5";
  mockApi({ "SavedSearch.get": () => [stored] });
  renderWithQuery(<SearchEditor mode="clone" id={5} />);
  expect(await screen.findByRole("textbox", { name: "Saved Search label" })).toHaveValue(
    "Members (copy)",
  );
  expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
});

describe("structuralRisk", () => {
  const search = (select: string[]): EditorSearch => ({
    id: 5,
    label: "S",
    api_entity: "Contact",
    api_params: { version: 4, select },
    is_template: false,
    form_values: { join: {} },
    tag_id: [],
    groups: [],
    displays: [
      { id: 1, label: "Kept", type: "afreact-probe" },
      { id: 2, label: "Gone", type: "afreact-probe", trashed: true },
      { id: 3, label: "Editable", type: "table" },
      { label: "New", type: "afreact-probe" },
    ],
  });

  it("asks nothing when columns are only added or reordered", () => {
    expect(
      structuralRisk(search(["id", "label"]), search(["label", "id", "display_name"])),
    ).toEqual([]);
  });

  it("names the saved displays without a React editor that a removed column can break", () => {
    expect(
      structuralRisk(search(["id", "display_name"]), search(["id"])).map((d) => d.label),
    ).toEqual(["Kept"]);
  });

  it("stays quiet when only the label changed", () => {
    expect(structuralRisk(search(["id"]), { ...search(["id"]), label: "T" })).toEqual([]);
  });
});

describe("mergeSaved", () => {
  const base: EditorSearch = {
    label: "S",
    api_entity: "Contact",
    api_params: { version: 4, select: ["id"] },
    is_template: false,
    form_values: { join: {} },
    tag_id: [],
    groups: [],
    displays: [
      { id: 1, name: "old", label: "Old", type: "table", trashed: true },
      newDisplay({ label: "New", type: "list" }),
    ],
  };
  const result = {
    id: 5,
    name: "S",
    displays: [{ id: 2, name: "new", label: "New", type: "list" }],
  };

  it("takes the saved displays and drops the deleted ones", () => {
    expect(mergeSaved(base, base, false, result).displays).toEqual(result.displays);
  });

  it("keeps a display renamed or added while saving, with its new id", () => {
    const [, sentNew] = base.displays;
    const later = {
      ...base,
      displays: [
        ...base.displays.slice(0, 1),
        { ...sentNew, label: "Renamed", type: "list" },
        { label: "Added", type: "grid" },
      ],
      groups: [{ title: "G", description: "", visibility: "", group_type: [] }],
    };
    const merged = mergeSaved(later, base, false, result);
    expect(structuredClone(merged.displays)).toEqual([
      { label: "Renamed", type: "list", id: 2, name: "new" },
      { label: "Added", type: "grid" },
    ]);
    expect(merged.groups).toHaveLength(1);
  });

  it("gives an edited new display its own id when an earlier unsaved one went meanwhile", () => {
    const sent = {
      ...base,
      displays: [
        newDisplay({ label: "T1", type: "table" }),
        newDisplay({ label: "T2", type: "table" }),
      ],
    };
    const removed = removeDisplay(sent.displays, 0);
    const later = { ...sent, displays: removed.map((d) => ({ ...d, label: "T2 edited" })) };
    const merged = mergeSaved(later, sent, false, {
      id: 5,
      displays: [
        { id: 11, name: "T1_n", label: "T1", type: "table" },
        { id: 12, name: "T2_n", label: "T2", type: "table" },
      ],
    });
    expect(structuredClone(merged.displays)).toEqual([
      { label: "T2 edited", type: "table", id: 12, name: "T2_n" },
    ]);
  });
});
