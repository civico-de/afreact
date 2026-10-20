import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { renderWithQuery } from "../../../test/render";
import { CoreVersion } from "../../version";
import type { EditorSearch } from "../editor";
import { SettingsTab } from "./SettingsTab";

let latest: EditorSearch | undefined;

function Harness() {
  const [search, setSearch] = useState<EditorSearch>({
    api_entity: "Contact",
    api_params: { version: 4, select: ["id"] },
    label: "S",
    is_template: false,
    form_values: { join: {} },
    tag_id: [],
    groups: [],
    displays: [],
    timeout: 30,
  });
  latest = search;
  return (
    <SettingsTab
      search={search}
      canBeEntitySet={false}
      onChange={(change) => {
        setSearch((s) => ({ ...s, ...change }));
      }}
      onToggleEntitySet={() => undefined}
    />
  );
}

describe("SettingsTab timeout", () => {
  it.each(["-5", "1.5", "12"])(
    "keeps %s typed after clearing and marks it if invalid",
    async (text) => {
      renderWithQuery(<Harness />);
      const input = screen.getByRole("spinbutton", { name: "Query Timeout (seconds)" });
      await userEvent.clear(input);
      await userEvent.type(input, text);
      expect(input).toHaveValue(Number(text));
      expect(latest?.timeout).toBe(Number(text));
      // deviation:search-timeout-invalid-blocks-save
      expect(input.getAttribute("aria-invalid")).toBe(text === "12" ? null : "true");
    },
  );

  it("is not offered on a core without SavedSearch.timeout", () => {
    renderWithQuery(
      <CoreVersion value="6.19.0">
        <Harness />
      </CoreVersion>,
    );
    expect(screen.getByLabelText("Description")).toBeInTheDocument();
    expect(screen.queryByLabelText("Query Timeout (seconds)")).not.toBeInTheDocument();
  });
});

describe("SettingsTab description", () => {
  it("is trimmed as ngModel trims it, in three rows as core's", async () => {
    renderWithQuery(<Harness />);
    const input = screen.getByRole("textbox", { name: "Description" });
    expect(input).toHaveAttribute("rows", "3");
    await userEvent.type(input, "  Members only  ");
    expect(latest?.description).toBe("Members only");
    expect(input).toHaveValue("  Members only  ");
  });
});
