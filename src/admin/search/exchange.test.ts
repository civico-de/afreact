import { mockApi } from "../../test/render";
import {
  exportOutput,
  loadExport,
  parseImport,
  previewImport,
  runImport,
  typeLabel,
} from "./exchange";

const counted = <T>(rows: T[], countMatched: number) => Object.assign(rows, { countMatched });

describe("export", () => {
  it("groups SavedSearch.export by entity and adds the embedding forms' writable fields", async () => {
    mockApi({
      "SavedSearch.export": () => [
        { entity: "SavedSearch", params: { values: { name: "s" }, match: ["name"] } },
        {
          entity: "SearchDisplay",
          params: { values: { name: "d1" }, match: ["name", "saved_search_id"] },
        },
        {
          entity: "SearchDisplay",
          params: { values: { name: "d2" }, match: ["name", "saved_search_id"] },
        },
      ],
      "Afform.getFields": () => [{ name: "name" }, { name: "layout" }],
      "Afform.get": (params) => {
        expect(params.where).toEqual([
          ["type", "=", "search"],
          [
            "OR",
            [
              ["search_displays", "CONTAINS", "s"],
              ["search_displays", "CONTAINS", "s.d1"],
            ],
          ],
        ]);
        return [{ name: "f", layout: "<div/>", title: null, readonly_field: 1 }];
      },
    });
    const types = await loadExport({ id: 1, name: "s", display_name: ["d1"] }, true);
    expect(types.map((t) => [t.entity, t.enabled, typeLabel(t)])).toEqual([
      ["SavedSearch", true, "Saved Search"],
      ["SearchDisplay", true, "2 Displays"],
      ["Group", false, "0 Smart Groups"],
      ["Afform", true, "1 Form"],
    ]);
    expect(types[3]?.values).toEqual([{ name: "f", layout: "<div/>" }]);
    const output: unknown = JSON.parse(exportOutput(types));
    expect(output).toEqual([
      ["SavedSearch", "save", { records: [{ name: "s" }], match: ["name"] }],
      [
        "SearchDisplay",
        "save",
        { records: [{ name: "d1" }, { name: "d2" }], match: ["name", "saved_search_id"] },
      ],
      ["Afform", "save", { records: [{ name: "f", layout: "<div/>" }] }],
    ]);
  });
});

describe("import", () => {
  it("accepts only save calls on known entities, each once", () => {
    expect(() => parseImport("{", false)).toThrow("not valid JSON");
    expect(() => parseImport('[["SavedSearch","delete",{}]]', false)).toThrow('only "save"');
    expect(() =>
      parseImport('[["SavedSearch","save",{"records":[],"chain":{"a":1}}]]', false),
    ).toThrow('only "save"');
    expect(() =>
      parseImport(
        '[["SavedSearch","save",{"records":[],"chain":[["Contact","delete",{}]]}]]',
        false,
      ),
    ).toThrow('only "save"');
    expect(() => parseImport('[["Afform","save",{"records":[{"name":"f"}]}]]', false)).toThrow(
      'Unsupported API entity "Afform".',
    );
    expect(() =>
      parseImport(
        '[["Group","save",{"records":[{"name":"a"}]}],["Group","save",{"records":[]}]]',
        false,
      ),
    ).toThrow('Duplicate API entity "Group".');
    expect(() => parseImport('[["Group","save",{"records":[]}]]', false)).toThrow(
      "No records to import.",
    );
  });

  it("counts existing displays by their name within their own search", () => {
    const check = parseImport(
      JSON.stringify([
        [
          "SearchDisplay",
          "save",
          {
            records: [
              { name: "a", "saved_search_id.name": "s1" },
              { name: "b", "saved_search_id.name": "s2" },
            ],
          },
        ],
      ]),
      false,
    );
    expect(check.counts.SearchDisplay?.params).toEqual({
      select: ["row_count"],
      where: [
        [
          "OR",
          [
            [
              "AND",
              [
                ["name", "=", "a"],
                ["saved_search_id.name", "=", "s1"],
              ],
            ],
            [
              "AND",
              [
                ["name", "=", "b"],
                ["saved_search_id.name", "=", "s2"],
              ],
            ],
          ],
        ],
      ],
    });
  });

  it("refuses to recreate existing records without match and previews the rest", async () => {
    mockApi({
      "Entity.get": () => [
        { name: "SavedSearch", title: "Saved Search", title_plural: "Saved Searches" },
        { name: "Group", title: "Group", title_plural: "Groups" },
      ],
      "SavedSearch.get": () => counted([], 1),
      "Group.get": () => counted([], 1),
    });
    const check = parseImport(
      JSON.stringify([
        ["SavedSearch", "save", { records: [{ name: "a" }, { name: "b" }], match: ["name"] }],
        ["Group", "save", { records: [{ name: "g" }] }],
      ]),
      false,
    );
    expect(await previewImport(check)).toEqual({
      error:
        'Cannot create 1 Group because an existing one with the same name already exists. To update existing records, include "match" in the API params.',
      preview: "1 existing Saved Search will be updated. 1 new Saved Search will be created.",
    });
  });

  it("saves the calls in order and counts the saved records", async () => {
    const calls = mockApi({
      "SavedSearch.save": () => [{ id: 1 }],
      "SearchDisplay.save": () => [{ id: 2 }, { id: 3 }],
    });
    const check = parseImport(
      JSON.stringify([
        ["SavedSearch", "save", { records: [{ name: "a" }] }],
        ["SearchDisplay", "save", { records: [{ name: "d", "saved_search_id.name": "a" }] }],
      ]),
      false,
    );
    expect(await runImport(check)).toBe(3);
    expect(calls.map((c) => c.call)).toEqual(["SavedSearch.save", "SearchDisplay.save"]);
  });
});
