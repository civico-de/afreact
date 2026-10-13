import { describe, expect, it } from "vitest";
import { metadata as meta } from "../../test/searchMetadata";
import {
  addDisplay,
  cloneDisplay,
  cloneSearch,
  loadParams,
  newSearch,
  normalize,
  removeDisplay,
  savePayload,
  toggleEntitySet,
  validate,
  withSelect,
  type EditorSearch,
} from "./editor";

const saved = (over: Partial<EditorSearch> = {}): EditorSearch => ({
  id: 7,
  name: "s",
  label: "Members",
  api_entity: "Contact",
  api_params: { version: 4, select: ["id", "display_name"] },
  is_template: false,
  form_values: { join: {} },
  tag_id: [],
  groups: [],
  displays: [{ id: 3, name: "t", label: "Table", type: "table", settings: {} }],
  ...over,
});

describe("loading", () => {
  it("chains groups and displays for editing, only display basics for cloning", () => {
    const edit = loadParams(7, "edit", "6.20.0");
    expect(edit).toMatchObject({ where: [["id", "=", 7]], groupBy: ["id"] });
    expect(JSON.stringify(edit)).toContain('"groups":["Group","get"');
    const clone = loadParams(7, "clone", "6.20.0");
    expect(JSON.stringify(clone)).not.toContain("groups");
    expect(JSON.stringify(clone)).toContain('"select":["label","type","settings"]');
  });

  it("fills missing lists and turns an empty pager list back into an object", () => {
    const search = normalize({
      api_entity: "Contact",
      api_params: { select: ["id"] },
      label: "x",
      tag_id: ["4"],
      displays: [{ label: "T", type: "table", settings: { pager: [] } }],
    });
    expect(search.form_values).toEqual({ join: {} });
    expect(search.groups).toEqual([]);
    expect(search.tag_id).toEqual([4]);
    expect(search.displays[0]?.settings).toEqual({ pager: {} });
    expect(() => normalize({ api_entity: "Contact" })).toThrow();
  });
});

describe("creating and cloning", () => {
  it("starts from the entity's default columns and the params it supports", () => {
    const search = newSearch(meta, "Contact", { label: "New" });
    expect(search.api_params).toEqual({
      version: 4,
      select: ["id", "display_name"],
      orderBy: {},
      where: [],
      groupBy: [],
      join: [],
      having: [],
    });
    expect(search.label).toBe("New");
    expect(() => newSearch(meta, "Nope")).toThrow("Nope");
  });

  it("copies a search with (copy), and a search from a template unnamed", () => {
    const copy = cloneSearch(saved(), false);
    expect(copy.id).toBeUndefined();
    expect(copy.label).toBe("Members (copy)");
    expect(copy.displays[0]).toEqual({
      name: "t",
      label: "Table (copy)",
      type: "table",
      settings: {},
      acl_bypass: false,
    });
    const fromTemplate = cloneSearch(saved({ is_template: true }), false);
    expect(fromTemplate.label).toBe("");
    expect(fromTemplate.displays[0]?.label).toBe("Table");
    expect(cloneSearch(saved(), true).label).toBe("Members");
  });
});

describe("saving", () => {
  it("requires labels and the group title", () => {
    const errors = validate(
      saved({ label: "", displays: [{ label: "", type: "table" }], groups: [] }),
      true,
    );
    expect(errors.map((e) => e.tab)).toEqual([undefined, "group", "display_0"]);
    expect(validate(saved(), false)).toEqual([]);
  });

  it("deletes groups, displays and tags that are gone", () => {
    const calls = savePayload(
      saved({ displays: [{ id: 3, label: "T", type: "table", trashed: true }] }),
      false,
    );
    expect(calls.deleteGroup).toEqual([
      "Group",
      "delete",
      { where: [["saved_search_id", "=", 7]] },
    ]);
    expect(calls.deleteDisplays).toEqual([
      "SearchDisplay",
      "delete",
      { where: [["saved_search_id", "=", 7]] },
    ]);
    const [, , save] = calls.saved ?? [];
    expect(save).toMatchObject({
      records: [{ id: 7, label: "Members" }],
      chain: { tag_id: ["EntityTag", "delete", expect.anything()] },
    });
    expect(JSON.stringify(save)).not.toContain("displays");
  });

  it("chains the group, displays and tags of a new search", () => {
    const calls = savePayload(
      saved({
        id: undefined,
        tag_id: [2],
        groups: [{ title: "G", description: "", visibility: "Public Pages", group_type: [] }],
      }),
      true,
    );
    expect(Object.keys(calls)).toEqual(["saved"]);
    expect(calls.saved?.[2]).toMatchObject({
      chain: {
        groups: ["Group", "save", { records: [{ title: "G" }] }],
        displays: ["SearchDisplay", "replace", expect.anything()],
        tag_id: ["EntityTag", "replace", { records: [{ tag_id: 2 }] }],
      },
    });
  });
});

describe("editing", () => {
  // deviation:removed-column-prunes-sort
  it("drops a removed column from orderBy and having, which core leaves behind", () => {
    const params = {
      version: 4,
      select: ["id", "COUNT(id) AS n"],
      orderBy: { n: "DESC", id: "ASC" },
      having: [
        ["n", ">", 1],
        ["OR", [["n", "<", 9]]],
        ["id", ">", 0],
      ],
    };
    expect(withSelect(params, ["id", "id"])).toEqual({
      version: 4,
      select: ["id"],
      orderBy: { id: "ASC" },
      having: [["id", ">", 0]],
    });
  });

  it("numbers new displays, toggles saved ones and copies without identity", () => {
    expect(addDisplay(meta, saved(), "table").at(-1)).toEqual({
      type: "table",
      label: "Members Table 2",
    });
    expect(() => addDisplay(meta, saved(), "nope")).toThrow();
    const trashed = removeDisplay(saved().displays, 0);
    expect(trashed[0]?.trashed).toBe(true);
    expect(removeDisplay(trashed, 0)[0]?.trashed).toBe(false);
    expect(removeDisplay([{ label: "x", type: "table" }], 0)).toEqual([]);
    expect(cloneDisplay(saved().displays, 0).at(-1)).toEqual({
      label: "Table (copy)",
      type: "table",
      settings: {},
    });
  });

  it("turns a search into a union and back", () => {
    const search = {
      api_entity: "Contact",
      api_params: { version: 4, select: ["id", "COUNT(id) AS n"], having: [] },
    };
    const set = toggleEntitySet(search);
    expect(set.api_params).toEqual({
      version: 4,
      select: ["id", "n"],
      sets: [["UNION ALL", "Contact", "get", { select: ["id", "COUNT(id) AS n"] }]],
    });
    expect(toggleEntitySet(set)).toEqual({
      api_entity: "Contact",
      api_params: { select: ["id", "COUNT(id) AS n"], version: 4 },
    });
  });
});
