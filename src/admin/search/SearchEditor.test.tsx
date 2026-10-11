import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listParam, mockApi, recordParam, renderWithQuery } from "../../test/render";
import { metadata } from "../../test/searchMetadata";
import { splitHash } from "../../url/hash";
import type { EditorSearch } from "./editor";
import { SearchEditor, structuralRisk } from "./SearchEditor";

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
  expect(recordParam(save?.params.chain).groups).toBeDefined();
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
      { id: 1, label: "Kept", type: "table" },
      { id: 2, label: "Gone", type: "table", trashed: true },
      { label: "New", type: "table" },
    ],
  });

  it("names the saved displays a column change can break", () => {
    expect(
      structuralRisk(search(["id"]), search(["id", "display_name"])).map((d) => d.label),
    ).toEqual(["Kept"]);
  });

  it("stays quiet when only the label changed", () => {
    expect(structuralRisk(search(["id"]), { ...search(["id"]), label: "T" })).toEqual([]);
  });
});
