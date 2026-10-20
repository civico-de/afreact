import { describe, expect, it } from "vitest";
import { metadata as meta } from "../../test/searchMetadata";
import type { SearchInfo } from "./expr";
import { addJoin, changeJoinType, joinEntities, removeJoin, setJoinLabel } from "./joins";

const search = (
  params: Partial<SearchInfo["api_params"]> = {},
  formJoin?: Record<string, string>,
): SearchInfo => ({
  api_entity: "Contact",
  api_params: { version: 4, select: ["id", "display_name"], ...params },
  ...(formJoin ? { form_values: { join: formJoin } } : {}),
});

const EMAIL = "Email AS Contact_Email_contact_id_01";
const DEEP = "Contact AS Contact_Email_contact_id_01_Email_Contact_contact_id_01";

describe("joinEntities", () => {
  it("offers the entity's joins numbered from one, without bridges as targets", () => {
    expect(joinEntities(meta, search()).map((o) => [o.id, o.label, o.group])).toEqual([
      [EMAIL, "Contact Emails", undefined],
      ["Group AS Contact_GroupContact_Group_01", "Contact Groups", undefined],
    ]);
  });

  it("numbers past an existing join and offers no single join back to the base entity", () => {
    const ids = joinEntities(meta, search({ join: [[EMAIL, "LEFT"]] })).map((o) => [
      o.id,
      o.label,
      o.group,
    ]);
    expect(ids).toEqual([
      ["Email AS Contact_Email_contact_id_02", "Contact Emails 2", undefined],
      ["Group AS Contact_GroupContact_Group_01", "Contact Groups", undefined],
    ]);
  });

  it("numbers a bridge join past the existing one", () => {
    const groups = joinEntities(
      meta,
      search({ join: [["Group AS Contact_GroupContact_Group_01", "LEFT", "GroupContact"]] }),
    );
    expect(groups.map((o) => o.id)).toEqual([EMAIL, "Group AS Contact_GroupContact_Group_02"]);
  });
});

describe("addJoin", () => {
  it("adds the conditions, defaults and the joined entity's search fields", () => {
    const params = addJoin(meta, search(), EMAIL, "LEFT");
    expect(params.join).toEqual([
      [
        EMAIL,
        "LEFT",
        ["id", "=", "Contact_Email_contact_id_01.contact_id"],
        ["Contact_Email_contact_id_01.is_primary", "=", true],
      ],
    ]);
    expect(params.select).toEqual(["id", "display_name", "Contact_Email_contact_id_01.email"]);
  });

  it("adds no columns for an excluding join and keeps a bridge's name", () => {
    const params = addJoin(meta, search(), "Group AS Contact_GroupContact_Group_01", "EXCLUDE");
    expect(params.select).toEqual(["id", "display_name"]);
    expect(params.join?.[0]?.slice(0, 3)).toEqual([
      "Group AS Contact_GroupContact_Group_01",
      "EXCLUDE",
      "GroupContact",
    ]);
  });

  it("refuses a join the metadata does not know", () => {
    expect(() => addJoin(meta, search(), "Nope AS Nope_01", "LEFT")).toThrow("Nope AS Nope_01");
  });
});

describe("removing and changing joins", () => {
  const joined = search(
    {
      select: [
        "id",
        "Contact_Email_contact_id_01.email",
        "Contact_Email_contact_id_01_Email_Contact_contact_id_01.id",
      ],
      join: [
        [EMAIL, "LEFT"],
        [DEEP, "LEFT"],
      ],
      where: [
        ["Contact_Email_contact_id_01.email", "IS NOT EMPTY"],
        [
          "OR",
          [
            ["Contact_Email_contact_id_01_Email_Contact_contact_id_01.id", ">", 1],
            ["id", ">", 2],
          ],
        ],
        ["id", ">", 3],
      ],
    },
    {
      Contact_Email_contact_id_01: "Mail",
      Contact_Email_contact_id_01_Email_Contact_contact_id_01: "Owner",
    },
  );

  it("takes nested joins, columns, conditions and labels along", () => {
    const after = removeJoin(meta, joined, 0);
    expect(after.api_params.join).toEqual([]);
    expect(after.api_params.select).toEqual(["id"]);
    expect(after.api_params.where).toEqual([["id", ">", 3]]);
    expect(after.form_values?.join).toEqual({});
  });

  // deviation:join-removal-prunes-expressions
  it("drops aggregated columns and groupings that use a removed join", () => {
    const grouped = search({
      select: [
        "id",
        "GROUP_CONCAT(DISTINCT Contact_Email_contact_id_01.email) AS GROUP_CONCAT_email",
        "COUNT(id) AS COUNT_id",
      ],
      join: [[EMAIL, "LEFT"]],
      groupBy: ["id", "Contact_Email_contact_id_01.location_type_id"],
    });
    const after = removeJoin(meta, grouped, 0);
    expect(after.api_params.select).toEqual(["id"]);
    expect(after.api_params.groupBy).toEqual(["id"]);
  });

  it("unwraps the aggregates that a removed join's grouping required", () => {
    const grouped = search({
      select: [
        "COUNT(id) AS COUNT_id",
        "GROUP_CONCAT(DISTINCT display_name) AS GROUP_CONCAT_display_name",
        "Contact_Email_contact_id_01.email",
      ],
      join: [[EMAIL, "LEFT"]],
      groupBy: ["Contact_Email_contact_id_01.email"],
    });
    const after = removeJoin(meta, grouped, 0);
    expect(after.api_params.select).toEqual(["id", "display_name"]);
    expect(after.api_params.groupBy).toEqual([]);
    expect(changeJoinType(meta, grouped, 0, "EXCLUDE").api_params.select).toEqual([
      "id",
      "display_name",
    ]);
  });

  it("keeps the parent when a nested join goes", () => {
    const after = removeJoin(meta, joined, 1);
    expect(after.api_params.join).toEqual([[EMAIL, "LEFT"]]);
    expect(after.api_params.select).toEqual(["id", "Contact_Email_contact_id_01.email"]);
    expect(after.form_values?.join).toEqual({ Contact_Email_contact_id_01: "Mail" });
  });

  it("strips an excluding join's parts and keeps its conditions", () => {
    const withCond = search({
      select: ["id", "Contact_Email_contact_id_01.email"],
      join: [[EMAIL, "LEFT", ["id", "=", "x"]]],
    });
    const after = changeJoinType(meta, withCond, 0, "EXCLUDE");
    expect(after.api_params.join).toEqual([[EMAIL, "EXCLUDE", ["id", "=", "x"]]]);
    expect(after.api_params.select).toEqual(["id"]);
    expect(changeJoinType(meta, withCond, 0, "INNER").api_params.select).toEqual(
      withCond.api_params.select,
    );
  });

  it("stores a custom label and drops the default one", () => {
    const info = search({ join: [[EMAIL, "LEFT"]] });
    expect(setJoinLabel(meta, info, EMAIL, "Mail")?.join).toEqual({
      Contact_Email_contact_id_01: "Mail",
    });
    const labelled = { ...info, form_values: { join: { Contact_Email_contact_id_01: "Mail" } } };
    expect(setJoinLabel(meta, labelled, EMAIL, "Contact Emails")?.join).toEqual({});
    expect(setJoinLabel(meta, labelled, EMAIL, "")?.join).toEqual({});
  });
});
