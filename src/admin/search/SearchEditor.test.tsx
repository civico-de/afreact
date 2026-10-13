import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listParam, mockApi, recordParam, renderWithQuery } from "../../test/render";
import { metadata } from "../../test/searchMetadata";
import { splitHash } from "../../url/hash";
import type { EditorSearch } from "./editor";
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
      { label: "New", type: "list" },
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
    expect(merged.displays).toEqual([
      { label: "Renamed", type: "list", id: 2, name: "new" },
      { label: "Added", type: "grid" },
    ]);
    expect(merged.groups).toHaveLength(1);
  });
});
