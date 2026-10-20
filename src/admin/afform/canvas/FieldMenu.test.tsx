import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { EditorContext } from "../context";
import type { FieldApi } from "./Field";
import { DefaultItems, EntityRefItems, FieldMenu, MinMaxItem } from "./FieldMenu";
import { mockApi, renderWithQuery } from "../../../test/render";
import { getValue, withLocal } from "./fieldModel";
import { fieldApi } from "./testField";

let latest: FieldApi["state"] | undefined;

function Harness({ local }: { local: FieldApi["state"]["local"] }) {
  const base = fieldApi(
    { name: "amount", input_type: "Number", data_type: "Integer", input_attrs: {} },
    local,
  );
  const [state, setState] = useState(base.state);
  latest = state;
  return (
    <ul>
      <MinMaxItem api={{ ...base, state, update: setState }} />
    </ul>
  );
}

describe("MinMaxItem", () => {
  // deviation:field-bounds-on-blur
  it("keeps a maximum typed digit by digit past a smaller first digit", async () => {
    render(<Harness local={{ input_attrs: { min: 10 } }} />);
    const max = screen.getByRole("spinbutton", { name: "Maximum:" });
    await userEvent.type(max, "20");
    await userEvent.tab();
    expect(latest?.local.input_attrs).toEqual({ min: 10, max: 20 });
  });

  it("brings a bound past the other one back to it once its input is left", async () => {
    render(<Harness local={{ input_attrs: { max: 9 } }} />);
    const min = screen.getByRole("spinbutton", { name: "Minimum:" });
    await userEvent.type(min, "12");
    expect(latest?.local.input_attrs).toEqual({ min: 12, max: 9 });
    await userEvent.tab();
    expect(latest?.local.input_attrs).toEqual({ min: 9, max: 9 });
  });
});

describe("DefaultItems", () => {
  function DateHarness() {
    const base = fieldApi(
      { name: "start", input_type: "Date", data_type: "Date", input_attrs: {} },
      { afform_default: "now +5 day" },
    );
    const [state, setState] = useState(base.state);
    latest = state;
    return (
      <ul>
        <DefaultItems
          api={{
            ...base,
            state,
            hasDefault: true,
            set: (key, value) => {
              setState((current) => withLocal(current, [key], value));
            },
          }}
        />
      </ul>
    );
  }

  // deviation:date-offset-minus
  it("keeps a lone minus on show and takes the negative offset that follows", () => {
    render(<DateHarness />);
    const offset = screen.getByRole("spinbutton", { name: /Now/ });
    // A browser reports a number input holding only "-" as empty.
    fireEvent.change(offset, { target: { value: "" } });
    expect(offset).toHaveValue(null);
    expect(latest?.local.afform_default).toBe("now +5 day");
    fireEvent.change(offset, { target: { value: "-3" } });
    expect(latest?.local.afform_default).toBe("now -3 day");
  });
});

describe("EntityRefItems", () => {
  afterEach(() => {
    delete window.CRM.config?.quickAdd;
  });

  it("keeps both quick-add removals batched into one render", async () => {
    window.CRM.config = {
      ...window.CRM.config,
      quickAdd: [
        { entity: "Individual", path: "civicrm/quick/person", title: "New Person", icon: "" },
        { entity: "Organization", path: "civicrm/quick/org", title: "New Org", icon: "" },
      ],
    };
    let state: FieldApi["state"] | undefined;
    function Quick() {
      const base = fieldApi(
        { name: "contact_id", input_type: "EntityRef", data_type: "Integer", input_attrs: {} },
        { input_attrs: { quickAdd: ["civicrm/quick/person", "civicrm/quick/org"] } },
      );
      const [current, setCurrent] = useState(base.state);
      state = current;
      return (
        <ul>
          <EntityRefItems
            api={{
              ...base,
              state: current,
              update: setCurrent,
              fkEntity: { entity: "Contact", label: "Contact" },
            }}
          />
        </ul>
      );
    }
    mockApi({});
    renderWithQuery(<Quick />);
    const first = await screen.findByRole("button", { name: "Remove New Person" });
    const second = screen.getByRole("button", { name: "Remove New Org" });
    act(() => {
      fireEvent.click(first);
      fireEvent.click(second);
    });
    expect(state && getValue(state, "input_attrs.quickAdd")).toBe("");
    expect(screen.queryByRole("button", { name: /^Remove New/ })).not.toBeInTheDocument();
  });
});

describe("FieldMenu", () => {
  const renderMenu = (api: FieldApi) =>
    renderWithQuery(
      <EditorContext value={api.editor}>
        <FieldMenu api={api} close={() => undefined} />
      </EditorContext>,
    );
  const textField = () =>
    fieldApi({ name: "nick_name", input_type: "Text", data_type: "String", input_attrs: {} }, {});

  it("leaves out a maximum length below 1 or between whole numbers and keeps it on show", () => {
    const api = textField();
    renderMenu(api);
    const length = screen.getByRole("spinbutton", { name: "Max Length:" });
    for (const typed of ["0", "-3", "1.5"]) {
      fireEvent.change(length, { target: { value: typed } });
      expect(api.set).toHaveBeenLastCalledWith("input_attrs.maxlength", undefined);
      expect(length).toHaveValue(Number(typed));
    }
    fireEvent.change(length, { target: { value: "12" } });
    expect(api.set).toHaveBeenLastCalledWith("input_attrs.maxlength", 12);
  });

  it("takes another CSS class trimmed once its input is left", () => {
    const api = textField();
    renderMenu(api);
    fireEvent.change(screen.getByRole("combobox", { name: /style/i }), {
      target: { value: "_other_" },
    });
    const classes = screen.getByRole("textbox", { name: "CSS class(es)" });
    fireEvent.change(classes, { target: { value: " big-input " } });
    fireEvent.blur(classes);
    expect(api.set).toHaveBeenLastCalledWith("input_style", "big-input");
  });
});
