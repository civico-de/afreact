import { createSqlName } from "./sqlName";

describe("createSqlName", () => {
  it("drops the suffix and munges short names", () => {
    expect(createSqlName("contact_type:label")).toBe("contact_type");
    expect(createSqlName("Contact_Email_contact_id_01.email")).toBe(
      "Contact_Email_contact_id_01_email",
    );
  });

  it("trims long names and appends a hash of the whole name, as Civi\\Search\\Meta does", () => {
    const key = `Contact_RelationshipCache_Contact_01.${"x".repeat(40)}`;
    // The server's name for this key, from PHP's munge and md5.
    expect(createSqlName(key)).toBe("Contact_RelationshipCache_Contact_01_xxxxx08a060bb45348e1c");
  });
});
