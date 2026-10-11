import {
  consequences,
  deleteOrRevertCall,
  listingParams,
  NO_FILTERS,
  rowAccess,
  type ListedSearch,
  type Permissions,
} from "./listing";

const row = (over: Partial<ListedSearch> = {}): ListedSearch => ({
  id: 7,
  name: "s",
  label: "S",
  description: null,
  api_entity: "Contact",
  api_params: {},
  "api_entity:label": "Contacts",
  is_template: false,
  created_id: 2,
  "created_id.display_name": null,
  "modified_id.display_name": null,
  created_date: null,
  modified_date: null,
  expires_date: null,
  has_base: false,
  "base_module:label": null,
  local_modified_date: null,
  display_name: null,
  display_label: null,
  display_icon: null,
  display_acl_bypass: null,
  tag_id: null,
  group_id: null,
  groups: null,
  ...over,
});

const perms = (over: Partial<Permissions> = {}): Permissions => ({
  superAdmin: false,
  administer: true,
  manageOwn: false,
  communications: false,
  schedule: false,
  cid: 2,
  ...over,
});

describe("listingParams", () => {
  it("adds the tab's filter and each set filter, pages and sorts", () => {
    const params = listingParams(
      "custom",
      { label: " news ", author: "ann", modules: ["x"], entities: ["Contact"], tags: [3] },
      ["label", "ASC"],
      3,
      25,
      false,
    );
    expect(params.where).toEqual([
      ["api_entity", "IS NOT NULL"],
      ["is_current", "=", true],
      ["has_base", "=", false],
      ["label", "CONTAINS", "news"],
      [
        "OR",
        [
          ["created_id.display_name", "CONTAINS", "ann"],
          ["modified_id.display_name", "CONTAINS", "ann"],
        ],
      ],
      ["api_entity", "IN", ["Contact"]],
      ["tags", "IN", [3]],
    ]);
    expect(params.orderBy).toEqual({ label: "ASC" });
    expect(params.offset).toBe(50);
    expect(params.select).toContain("row_count");
    expect(params.select).not.toContain(expect.stringContaining("schedule"));
  });

  it("filters packaged searches by module and joins communications when enabled", () => {
    const params = listingParams(
      "packaged",
      { ...NO_FILTERS, modules: ["m"] },
      ["label", "DESC"],
      1,
      10,
      true,
    );
    expect(params.where).toContainEqual(["base_module", "IN", ["m"]]);
    expect(params.where).toContainEqual(["has_base", "=", true]);
    expect(params.select.some((s) => s.includes("schedule.id"))).toBe(true);
  });
});

describe("rowAccess", () => {
  it("follows onPostRun", () => {
    expect(rowAccess(row(), perms())).toEqual({ edit: true, remove: true });
    expect(rowAccess(row({ display_acl_bypass: [true] }), perms())).toEqual({
      edit: false,
      remove: false,
    });
    expect(rowAccess(row({ display_acl_bypass: [true] }), perms({ superAdmin: true }))).toEqual({
      edit: true,
      remove: true,
    });
    expect(
      rowAccess(row({ created_id: 3 }), perms({ administer: false, manageOwn: true })),
    ).toEqual({
      edit: false,
      remove: false,
    });
    expect(rowAccess(row({ "api_entity:label": null }), perms())).toEqual({
      edit: false,
      remove: true,
    });
    expect(rowAccess(row({ schedule_id: [1] }), perms({ communications: true }))).toEqual({
      edit: false,
      remove: true,
    });
  });
});

describe("deleteOrRevert", () => {
  it("lists what a delete removes", () => {
    const list = consequences(
      row({ display_label: ["A", "B"], groups: ["G"], schedule_title: ["C"] }),
      [{ title: "F", name: "f" }],
    );
    expect(list.map((c) => [c.text, c.severe])).toEqual([
      ["Includes 2 displays which will also be deleted.", false],
      ['Smart group "G" will also be deleted.', true],
      ['Communication "C" will also be deleted.', true],
      [
        'Form "F" will also be deleted because it contains an embedded display from this search.',
        true,
      ],
    ]);
    expect(deleteOrRevertCall(row())).toEqual([
      "SavedSearch",
      "delete",
      { where: [["id", "=", 7]] },
    ]);
  });

  it("lists what a revert resets", () => {
    const packaged = row({
      "base_module:label": "Pkg",
      display_label: ["A"],
      groups: ["G"],
      schedule_title: ["C"],
    });
    expect(consequences(packaged, [{ title: "F", name: "f" }]).map((c) => c.text)).toEqual([
      "Includes 1 display which will also be reverted.",
      'Smart group "G" will be reset to the packaged search criteria.',
      'Form "F" will be affected because it contains an embedded display from this search.',
    ]);
    expect(deleteOrRevertCall(packaged)[1]).toBe("revert");
  });
});
