import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { renderWithQuery } from "../../test/render";
import { SearchInput } from "./SearchInput";

let latest: unknown;

function Harness() {
  const [value, setValue] = useState<unknown>("now - 5 day");
  latest = value;
  return (
    <>
      <span id="date-label">Birth Date</span>
      <SearchInput
        id="date"
        field={{ name: "birth_date", data_type: "Date", input_type: "Date" }}
        op="="
        value={value}
        onChange={setValue}
      />
    </>
  );
}

describe("SearchInput relative date", () => {
  // deviation:relative-date-offset-draft
  it.each(["12", "3"])("keeps %s typed into a cleared offset", async (text) => {
    renderWithQuery(<Harness />);
    const offset = screen.getByRole("spinbutton");
    await userEvent.clear(offset);
    await userEvent.type(offset, text);
    expect(offset).toHaveDisplayValue(text);
    await userEvent.tab();
    expect(latest).toBe(`now - ${text} day`);
  });

  it.each(["1.5", "-5"])("shows %s while typing and keeps the last whole offset", async (text) => {
    renderWithQuery(<Harness />);
    const offset = screen.getByRole("spinbutton");
    await userEvent.clear(offset);
    await userEvent.type(offset, text);
    expect(offset).toHaveDisplayValue(text);
    await userEvent.tab();
    const kept = text === "1.5" ? "1" : "5";
    expect(latest).toBe(`now - ${kept} day`);
    expect(offset).toHaveDisplayValue(kept);
  });

  it("does not store a zero offset for a cleared input", async () => {
    renderWithQuery(<Harness />);
    const offset = screen.getByRole("spinbutton");
    await userEvent.clear(offset);
    expect(offset).toHaveDisplayValue("");
    await userEvent.tab();
    expect(latest).toBe("now - 5 day");
    expect(offset).toHaveDisplayValue("5");
  });
});

describe("SearchInput options", () => {
  // deviation:option-key-attribute
  it("keys options by the attribute the field compares, offering only those that have it", async () => {
    let stored: unknown;
    renderWithQuery(
      <SearchInput
        id="state"
        field={{ name: "state_province_id", data_type: "Integer", options: true }}
        op="="
        optionKey="abbr"
        options={[
          { id: 5, name: "California", label: "California", abbr: "CA" },
          { id: 6, name: "Nowhere", label: "Nowhere", abbr: null },
        ]}
        value={null}
        onChange={(value) => {
          stored = value;
        }}
      />,
    );
    expect(screen.queryByRole("option", { name: "Nowhere" })).toBeNull();
    await userEvent.selectOptions(screen.getByRole("combobox"), "California");
    expect(stored).toBe("CA");
  });
});

describe("SearchInput stored values", () => {
  // deviation:option-value-unknown-shown
  it("shows and keeps a stored value that no option has", async () => {
    const values: unknown[] = [];
    function Stored() {
      const [value, setValue] = useState<unknown>("Female");
      return (
        <SearchInput
          id="gender"
          field={{ name: "gender_id", data_type: "Integer", options: true }}
          op="="
          options={[{ id: 1, name: "Female", label: "Weiblich" }]}
          value={value}
          onChange={(next) => {
            values.push(next);
            setValue(next);
          }}
        />
      );
    }
    renderWithQuery(<Stored />);
    const select = screen.getByRole("combobox");
    expect(select).toHaveDisplayValue("Female (no such option)");
    await userEvent.selectOptions(select, "Weiblich");
    expect(values).toEqual([1]);
    expect(screen.queryByRole("option", { name: "Female (no such option)" })).toBeNull();
  });
});
