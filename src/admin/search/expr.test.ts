import { describe, expect, it } from "vitest";
import { metadata as meta } from "../../test/searchMetadata";
import {
  createSqlName,
  fieldToColumn,
  getAllFields,
  getDefaultLabel,
  getJoin,
  getSmartGroupColumns,
  mustAggregate,
  parseExpr,
  reconcileAggregateColumns,
  type SearchInfo,
} from "./expr";

const search = (
  params: Partial<SearchInfo["api_params"]> = {},
  entity = "Contact",
): SearchInfo => ({
  api_entity: entity,
  api_params: { version: 4, select: ["id", "display_name"], ...params },
});

describe("getJoin", () => {
  it("numbers a join's label and its conditions by the alias", () => {
    const join = getJoin(meta, search(), "Email AS Contact_Email_contact_id_02");
    expect(join?.label).toBe("Contact Emails 2");
    expect(join?.conditions).toEqual([["id", "=", "Contact_Email_contact_id_02.contact_id"]]);
    expect(join?.defaults).toEqual([["Contact_Email_contact_id_02.is_primary", "=", true]]);
  });

  it("prefixes a deep join's references with the join it hangs from", () => {
    const join = getJoin(
      meta,
      search({}, "Contact"),
      "Contact_Email_contact_id_01_Email_Contact_contact_id_01",
    );
    expect(join?.defaultLabel).toBe("Contact Emails - Email Contact");
    expect(join?.baseEntity).toBe("Email");
    expect(join?.conditions).toEqual([
      [
        "Contact_Email_contact_id_01.contact_id",
        "=",
        "Contact_Email_contact_id_01_Email_Contact_contact_id_01.id",
      ],
    ]);
  });

  it("keeps a bridge join's bridge name and takes a label from form_values", () => {
    const info = {
      ...search(),
      form_values: { join: { Contact_GroupContact_Group_01: "Member of" } },
    };
    const join = getJoin(meta, info, "Contact_GroupContact_Group_01");
    expect(join?.conditions[0]).toBe("GroupContact");
    expect(join?.label).toBe("Member of");
    expect(join?.defaultLabel).toBe("Contact Groups");
  });

  it("finds nothing for an alias no join matches", () => {
    expect(getJoin(meta, search(), "Nope_01")).toBeUndefined();
  });
});

describe("parseExpr", () => {
  it("reads a field through a join with its suffix", () => {
    const info = parseExpr(
      meta,
      "Contact_Email_contact_id_01.email",
      search({ join: [["Email AS Contact_Email_contact_id_01", "LEFT"]] }),
    );
    expect(info.args[0]).toMatchObject({
      type: "field",
      path: "Contact_Email_contact_id_01.email",
      prefix: "Contact_Email_contact_id_01.",
      suffix: "",
    });
    expect(info.args[0]?.field?.name).toBe("email");
    expect(parseExpr(meta, "gender_id:label", search()).args[0]?.suffix).toBe(":label");
  });

  it("reads a function's flags, named arguments and alias", () => {
    const info = parseExpr(
      meta,
      "GROUP_CONCAT(DISTINCT display_name ORDER BY id DESC) AS names",
      search(),
    );
    expect(info.fn?.name).toBe("GROUP_CONCAT");
    expect(info.alias).toBe("names");
    expect(info.args.map((a) => [a.value, a.flag_before, a.name, a.flag_after])).toEqual([
      ["display_name", "DISTINCT", undefined, undefined],
      ["id", undefined, "ORDER BY", "DESC"],
    ]);
  });

  it("reads a flag-only parameter and several arguments", () => {
    const extract = parseExpr(meta, "EXTRACT(YEAR FROM birth_date) AS year", search());
    expect(extract.args.map((a) => [a.type, a.value, a.flag_before, a.name])).toEqual([
      [null, "", "YEAR", undefined],
      ["field", "birth_date", undefined, "FROM"],
    ]);
    const concat = parseExpr(meta, 'CONCAT(display_name, " - ", id) AS both', search());
    expect(concat.args.map((a) => [a.type, a.value])).toEqual([
      ["field", "display_name"],
      ["string", " - "],
      ["field", "id"],
    ]);
    expect(concat.data_type).toBe("String");
  });

  it("takes a pseudo field with parentheses as a field", () => {
    expect(parseExpr(meta, "result_row_num", search()).args[0]?.field?.type).toBe("Pseudo");
  });
});

describe("labels and columns", () => {
  it("labels a column by function, join and field", () => {
    const info = search({ join: [["Email AS Contact_Email_contact_id_01", "LEFT"]] });
    expect(getDefaultLabel(meta, "COUNT(Contact_Email_contact_id_01.id) AS c", info)).toBe(
      "(Count) Contact Emails: Email ID",
    );
    expect(getDefaultLabel(meta, "display_name", info)).toBe("Display Name");
  });

  it("colours an option field by its color suffix", () => {
    expect(
      fieldToColumn(meta, "gender_id:label", { label: true, sortable: true }, search()),
    ).toEqual({
      type: "field",
      key: "gender_id:label",
      label: "Gender",
      sortable: true,
      colors: [{ field: "gender_id:color" }],
    });
  });

  it("names long columns as the server does", () => {
    expect(createSqlName("Contact_Email_contact_id_01.email:label")).toBe(
      "Contact_Email_contact_id_01_email",
    );
    const long = createSqlName(`GROUP_CONCAT_${"x".repeat(60)}`);
    expect(long).toHaveLength(58);
    expect(long.startsWith("GROUP_CONCAT_")).toBe(true);
  });
});

describe("grouping", () => {
  const grouped = search({
    select: ["gender_id:label", "id", "display_name"],
    groupBy: ["gender_id"],
  });

  it("requires aggregation only for ungrouped fields", () => {
    expect(mustAggregate(meta, "gender_id:label", grouped)).toBe(false);
    expect(mustAggregate(meta, "display_name", grouped)).toBe(true);
    expect(mustAggregate(meta, "display_name", search({ groupBy: ["id"] }))).toBe(false);
  });

  it("aggregates ungrouped columns and unwraps them again without grouping", () => {
    const select = reconcileAggregateColumns(meta, grouped);
    expect(select).toEqual([
      "gender_id:label",
      "COUNT(id) AS COUNT_id",
      "GROUP_CONCAT(DISTINCT display_name) AS GROUP_CONCAT_display_name",
    ]);
    expect(reconcileAggregateColumns(meta, search({ select, groupBy: [] }))).toEqual([
      "gender_id:label",
      "id",
      "display_name",
    ]);
  });
});

describe("field lists", () => {
  const joined = search({
    join: [
      ["Email AS Contact_Email_contact_id_01", "LEFT"],
      ["Group AS Contact_GroupContact_Group_01", "LEFT", "GroupContact"],
    ],
  });

  it("groups fields by entity and join, with bridge fields and suffixes", () => {
    const fields = getAllFields(meta, joined, ":label", ["Field", "Custom", "Extra", "Pseudo"]);
    expect(fields.find((f) => f.id === "gender_id:label")?.group).toBe("Contacts");
    expect(fields.find((f) => f.id === "result_row_num")?.group).toBe("Extra");
    expect(fields.find((f) => f.id === "Contact_Email_contact_id_01.email")?.group).toBe(
      "Contact Emails",
    );
    expect(fields.map((f) => f.id)).toContain("Contact_GroupContact_Group_01.status:label");
    expect(fields.map((f) => f.id)).not.toContain("Contact_GroupContact_Group_01.group_id");
    expect(fields.map((f) => f.id)).not.toContain("groups");
  });

  it("puts a join's own fields first for its conditions", () => {
    const fields = getAllFields(
      meta,
      joined,
      ":name",
      ["Field"],
      undefined,
      "Email AS Contact_Email_contact_id_01",
    );
    expect(fields[0]?.group).toBe("Contact Emails");
  });

  it("offers contact IDs of the entity and its joins for a smart group", () => {
    expect(getSmartGroupColumns(meta, joined).map((c) => c.id)).toEqual([
      "id",
      "employer_id",
      "Contact_Email_contact_id_01.contact_id",
    ]);
  });
});
