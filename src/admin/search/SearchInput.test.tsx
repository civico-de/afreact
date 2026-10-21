import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
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

  it("keeps a stored value no option has selected in a multi-select, once", async () => {
    const values: unknown[] = [];
    function Stored() {
      const [value, setValue] = useState<unknown>([7, 7]);
      return (
        <SearchInput
          id="gender"
          field={{ name: "gender_id", data_type: "Integer", options: true }}
          op="IN"
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
    const stray = screen.getAllByRole("option", { name: "7 (no such option)" });
    expect(stray).toHaveLength(1);
    expect(stray[0]).toHaveProperty("selected", true);
    await userEvent.selectOptions(screen.getByRole("listbox"), "Weiblich");
    expect(values).toEqual([[7, 1]]);
  });
});

describe("SearchInput location", () => {
  function Location() {
    const [value, setValue] = useState<unknown>({ distance: "5", distance_unit: "km" });
    latest = value;
    return (
      <SearchInput
        id="near"
        field={{ name: "proximity", data_type: "String", input_type: "Location" }}
        op="="
        value={value}
        onChange={setValue}
      />
    );
  }

  it("keeps a distance changed while the address is looked up", async () => {
    let answer: (rows: unknown[]) => void = () => undefined;
    vi.mocked(window.CRM.api4).mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    renderWithQuery(<Location />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox", { name: "Address" }), "Berlin");
    await user.tab();
    const distance = screen.getByRole("spinbutton", { name: "Distance" });
    await user.clear(distance);
    await user.type(distance, "20");
    await act(async () => {
      answer([{ geo_code_1: 52.5, geo_code_2: 13.4 }]);
      await Promise.resolve();
    });
    expect(latest).toEqual({
      distance: "20",
      distance_unit: "km",
      address: "Berlin",
      geo_code_1: 52.5,
      geo_code_2: 13.4,
    });
  });

  it("drops coordinates of an address that changed meanwhile", async () => {
    const answers: ((rows: unknown[]) => void)[] = [];
    vi.mocked(window.CRM.api4).mockImplementation(
      () =>
        new Promise((resolve) => {
          answers.push(resolve);
        }),
    );
    renderWithQuery(<Location />);
    const user = userEvent.setup();
    const address = screen.getByRole("textbox", { name: "Address" });
    await user.type(address, "Berlin");
    await user.tab();
    await user.clear(address);
    await user.type(address, "Hamburg");
    await user.tab();
    await act(async () => {
      answers[1]?.([{ geo_code_1: 53.5, geo_code_2: 10 }]);
      await Promise.resolve();
    });
    await act(async () => {
      answers[0]?.([{ geo_code_1: 52.5, geo_code_2: 13.4 }]);
      await Promise.resolve();
    });
    expect(latest).toMatchObject({ address: "Hamburg", geo_code_1: 53.5, geo_code_2: 10 });
  });
});
