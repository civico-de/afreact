import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithQuery, mockApi } from "../../../test/render";
import { metadata } from "../../../test/searchMetadata";
import { ClauseEditor } from "./ClauseEditor";

describe("ClauseEditor", () => {
  it("offers a joined field's options, loaded from the joined entity", async () => {
    const calls = mockApi({
      "Contact.getFields": () => [
        { name: "gender_id", options: [{ id: 2, name: "Male", label: "Male" }] },
      ],
    });
    renderWithQuery(
      <ClauseEditor
        meta={metadata}
        search={{
          api_entity: "Email",
          api_params: {
            version: 4,
            select: ["id"],
            join: [["Contact AS Email_Contact_contact_id_01", "LEFT"]],
          },
        }}
        clauses={[["Email_Contact_contact_id_01.gender_id:name", "=", ""]]}
        onChange={() => undefined}
        fields={[]}
        op="AND"
      />,
    );
    const value = await screen.findByRole("combobox", { name: /^Value for .*Gender$/ });
    expect(await within(value).findByRole("option", { name: "Male" })).toBeInTheDocument();
    expect(calls.map((c) => c.call)).toEqual(["Contact.getFields"]);
  });
});
