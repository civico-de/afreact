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
    const after = removeEntitySet(meta, params, 0);
    expect(after.select).toEqual(["key"]);
    expect(setsOf(after).map((set) => set[3].select)).toEqual([["id AS key"], ["id"]]);
    expect(removeEntitySet(meta, params, 2).select).toEqual(["id", "name"]);
  });

  // deviation:union-remove-first-renames-outer
  it("renames the outer references to the next set's columns when the first goes", () => {
    const after = removeEntitySet(
      meta,
      {
        select: ["id", "COUNT(name) AS n", "name"],
        where: [["name", "=", "Ada"]],
        groupBy: ["name"],
        orderBy: { name: "ASC" },
        sets: [
          ["UNION ALL", "Contact", "get", { select: ["id", "display_name AS name"] }],
          ["UNION ALL", "Activity", "get", { select: ["id", "subject"] }],
        ],
      },
      0,
    );
    expect(after).toMatchObject({
      select: ["id", "COUNT(subject) AS n", "subject"],
      where: [["subject", "=", "Ada"]],
      groupBy: ["subject"],
      orderBy: { subject: "ASC" },
    });
    expect(setsOf(after).map((set) => set[3].select)).toEqual([["id", "subject"]]);
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
        select: ["id", "name", "GROUP_CONCAT(DISTINCT name:label ORDER BY id) AS names"],
        where: [
          ["name", "=", "Ada"],
          [
            "OR",
            [
              ["name:label", "IS NULL"],
              ["id", "=", "name", true],
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
      select: ["id", "title", "GROUP_CONCAT(DISTINCT title:label ORDER BY id) AS names"],
      where: [
        ["title", "=", "Ada"],
        [
          "OR",
          [
            ["title:label", "IS NULL"],
            ["id", "=", "title", true],
          ],
        ],
      ],
      having: [["title", "IS NOT NULL"]],
      groupBy: ["title"],
      orderBy: { title: "ASC", id: "DESC" },
    });
  });

  it("renames the outer conditions by the field, whatever suffix the column changes to", () => {
    const gender = (select: string): ApiParams => ({
      version: 4,
      select: [select],
      where: [["gender_id", "=", 1]],
      groupBy: ["gender_id"],
      sets: [["UNION ALL", "Contact", "get", { select: [select] }]],
    });
    const labelled = setEntitySet(meta, gender("gender_id"), 0, { select: ["gender_id:label"] });
    expect(labelled).toMatchObject({
      select: ["gender_id:label"],
      where: [["gender_id", "=", 1]],
      groupBy: ["gender_id"],
    });
    const renamed = setEntitySet(meta, gender("gender_id:label"), 0, { select: ["display_name"] });
    expect(renamed).toMatchObject({
      select: ["display_name"],
      where: [["display_name", "=", 1]],
      groupBy: ["display_name"],
    });
  });

  it("leaves the references of a field that another column keeps", () => {
    const params = setEntitySet(
      meta,
      {
        select: ["gender_id", "gender_id:label"],
        where: [["gender_id", "=", 1]],
        orderBy: { gender_id: "ASC" },
        sets: [["UNION ALL", "Contact", "get", { select: ["gender_id", "gender_id:label"] }]],
      },
      0,
      { select: ["gender_id", "display_name"] },
    );
    expect(params).toMatchObject({
      select: ["gender_id", "display_name"],
      where: [["gender_id", "=", 1]],
      orderBy: { gender_id: "ASC" },
    });
  });

  it("renames an outer column with a suffix or alias of its own, and a function's without adding an alias", () => {
    const params = setEntitySet(
      meta,
      {
        select: ["gender_id:label", "gender_id AS g", "COUNT(gender_id)"],
        sets: [["UNION ALL", "Contact", "get", { select: ["gender_id"] }]],
      },
      0,
      { select: ["employer_id"] },
    );
    expect(params.select).toEqual(["employer_id:label", "employer_id AS g", "COUNT(employer_id)"]);
  });

  it("keeps a renamed function's own suffix, and a sort on an outer alias of the field's name", () => {
    const month = meta.functions.flatMap((fn) =>
      fn.name === "COUNT" ? [{ ...fn, name: "MONTH", options: [{ id: 1, label: "January" }] }] : [],
    );
    const params = setEntitySet(
      { ...meta, functions: [...meta.functions, ...month] },
      {
        select: ["MONTH(birth_date) AS m", "COUNT(id) AS birth_date"],
        orderBy: { birth_date: "ASC" },
        sets: [["UNION ALL", "Contact", "get", { select: ["birth_date", "id"] }]],
      },
      0,
      { select: ["employer_id", "id"] },
    );
    expect(params).toMatchObject({
      select: ["MONTH(employer_id) AS m", "COUNT(id) AS birth_date"],
      orderBy: { birth_date: "ASC" },
    });
  });

  it("renames swapped columns from their old names at once", () => {
    const params = setEntitySet(
      meta,
      { ...union(), select: ["id", "name"], orderBy: { id: "ASC", name: "DESC" } },
      0,
      { select: ["id AS name", "display_name AS id"] },
    );
    expect(params.select).toEqual(["name", "id"]);
    expect(params.orderBy).toEqual({ name: "ASC", id: "DESC" });
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
    // Core's faux function for equations claims "Number", which is no field type.
    const equation = meta.functions.flatMap((fn) =>
      fn.name === "COUNT"
        ? [
            {
              ...fn,
              name: "e",
              title: "Arithmetic",
              category: "math",
              data_type: "Number",
              params: [
                { label: "Value", min_expr: 1, max_expr: 1, must_be: ["SqlField", "SqlNumber"] },
              ],
            },
          ]
        : [],
    );
    const withE = { ...meta, functions: [...meta.functions, ...equation] };
    const sum: ApiParams = {
      version: 4,
      select: ["x"],
      sets: [["UNION ALL", "Contact", "get", { select: ["(id + 1) AS x"] }]],
    };
    const x = withEntitySetFields(withE, sum).schema.find((e) => e.name === "EntitySet")?.fields;
    expect(x?.map((f) => [f.name, f.data_type])).toEqual([["x", "Integer"]]);
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
