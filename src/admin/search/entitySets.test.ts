import { describe, expect, it } from "vitest";
import { metadata as meta } from "../../test/searchMetadata";
import {
  addEntitySet,
  addEntitySetRow,
  realign,
  removeEntitySet,
  removeEntitySetRow,
  setEntitySet,
  setsOf,
  withEntitySetFields,
} from "./entitySets";
import type { ApiParams } from "./expr";

const union = (): ApiParams => ({
  version: 4,
  select: ["id", "name"],
  sets: [
    ["UNION ALL", "Contact", "get", { select: ["id", "display_name AS name"] }],
    ["UNION ALL", "Activity", "get", { select: ["id", "subject AS name"] }],
  ],
});

describe("entity sets", () => {
  it("adds a set with the first set's operation and only the columns its entity has", () => {
    const params = addEntitySet(
      meta,
      {
        version: 4,
        select: ["id"],
        sets: [["UNION", "Contact", "get", { select: ["id", "display_name"] }]],
      },
      "Activity",
    );
    expect(params.sets?.[1]).toEqual([
      "UNION",
      "Activity",
      "get",
      { select: ["id", null], where: [] },
    ]);
  });

  it("adds a row to the outer search and to each set that has the field", () => {
    const params = addEntitySetRow(meta, union(), "subject");
    expect(params.select).toEqual(["id", "name", "subject"]);
    expect(setsOf(params).map((set) => set[3].select.at(-1))).toEqual([null, "subject"]);
  });

  it("removes a row everywhere, with the outer column built on it", () => {
    const params = removeEntitySetRow(meta, union(), 1);
    expect(params.select).toEqual(["id"]);
    expect(setsOf(params).map((set) => set[3].select)).toEqual([["id"], ["id"]]);
  });

  it("lets the next set name the columns when the first goes, without its empty rows", () => {
    const params: ApiParams = {
      select: ["id", "name"],
      sets: [
        ["UNION ALL", "Contact", "get", { select: ["id", "display_name AS name"] }],
        ["UNION ALL", "Activity", "get", { select: ["id AS key", null] }],
        ["UNION ALL", "Email", "get", { select: ["id", "email"] }],
      ],
    };
    const after = removeEntitySet(params, 0);
    expect(after.select).toEqual(["key"]);
    expect(setsOf(after).map((set) => set[3].select)).toEqual([["id AS key"], ["id"]]);
    expect(removeEntitySet(params, 2).select).toEqual(["id", "name"]);
  });

  it("renames the outer column with the first set's alias", () => {
    const params = setEntitySet(meta, union(), 0, { select: ["id", "display_name AS title"] });
    expect(params.select).toEqual(["id", "title"]);
    expect(setEntitySet(meta, union(), 1, { select: ["id", "subject AS other"] }).select).toEqual([
      "id",
      "name",
    ]);
  });

  // deviation:union-rename-outer-references
  it("renames the outer conditions, grouping and sorting with the first set's column", () => {
    const params = setEntitySet(
      meta,
      {
        ...union(),
        where: [
          ["name", "=", "Ada"],
          [
            "OR",
            [
              ["name:label", "IS NULL"],
              ["id", ">", 1],
            ],
          ],
        ],
        having: [["name", "IS NOT NULL"]],
        groupBy: ["name"],
        orderBy: { name: "ASC", id: "DESC" },
      },
      0,
      { select: ["id", "display_name AS title"] },
    );
    expect(params).toMatchObject({
      select: ["id", "title"],
      where: [
        ["title", "=", "Ada"],
        [
          "OR",
          [
            ["title:label", "IS NULL"],
            ["id", ">", 1],
          ],
        ],
      ],
      having: [["title", "IS NOT NULL"]],
      groupBy: ["title"],
      orderBy: { title: "ASC", id: "DESC" },
    });
  });

  it("gives the outer search the first set's columns, labelled across sets", () => {
    const fields = withEntitySetFields(meta, union()).schema.find(
      (e) => e.name === "EntitySet",
    )?.fields;
    expect(fields?.map((f) => [f.name, f.label, f.data_type])).toEqual([
      ["id", "Contact ID / ID", "Integer"],
      ["name", "Display Name / Subject", "String"],
    ]);
  });

  // deviation:union-function-column-type
  it("types a function column by the function's result, not by its field", () => {
    const params: ApiParams = {
      version: 4,
      select: ["n", "birth_date"],
      sets: [
        [
          "UNION ALL",
          "Contact",
          "get",
          { select: ["COUNT(birth_date) AS n", "birth_date"], groupBy: ["id"] },
        ],
      ],
    };
    const fields = withEntitySetFields(meta, params).schema.find(
      (e) => e.name === "EntitySet",
    )?.fields;
    expect(fields?.map((f) => [f.name, f.data_type])).toEqual([
      ["n", "Integer"],
      ["birth_date", "Date"],
    ]);
  });

  // deviation:union-join-keeps-rows
  it("keeps a set's rows in place when its joins add or remove columns", () => {
    expect(
      realign(["id", null, "subject"], ["id", "subject", "Activity_Contact_01.display_name"]),
    ).toEqual(["id", null, "subject"]);
    expect(realign(["id", "Activity_Contact_01.display_name"], ["id"])).toEqual(["id", null]);
    expect(realign(["id", "subject"], ["COUNT(id) AS COUNT_id", "subject"])).toEqual([
      "COUNT(id) AS COUNT_id",
      "subject",
    ]);
  });

  it("refuses a malformed set", () => {
    expect(() => setsOf({ select: [], sets: [["UNION", "Contact"]] })).toThrow("1");
  });
});
