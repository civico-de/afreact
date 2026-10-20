import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { fieldApi } from "./canvas/testField";
import { EditorContext } from "./context";
import { FieldValue } from "./FieldValue";

let latest: unknown;

function Harness() {
  const { editor } = fieldApi({ name: "amount", data_type: "Float", input_attrs: {} }, {});
  const [value, setValue] = useState<unknown>(undefined);
  latest = value;
  return (
    <EditorContext.Provider value={editor}>
      <label htmlFor="amount">Amount</label>
      <FieldValue
        id="amount"
        field={{ name: "amount", data_type: "Float" }}
        value={value}
        onChange={setValue}
      />
    </EditorContext.Provider>
  );
}

describe("FieldValue", () => {
  // deviation:date-time-by-type
  it.each([
    ["Timestamp", "datetime-local"],
    ["Date", "date"],
  ])("takes a %s default without a time setting in a %s input", (dataType, type) => {
    const { editor } = fieldApi({ name: "created", data_type: dataType, input_attrs: {} }, {});
    render(
      <EditorContext.Provider value={editor}>
        <label htmlFor="created">Created</label>
        <FieldValue
          id="created"
          field={{ name: "created", data_type: dataType, input_type: "Date" }}
          value={undefined}
          onChange={() => undefined}
        />
      </EditorContext.Provider>,
    );
    expect(screen.getByLabelText("Created")).toHaveAttribute("type", type);
  });

  it("keeps the decimal point of a number typed digit by digit", async () => {
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: "Amount" });
    await userEvent.type(input, "1.05");
    expect(input).toHaveValue("1.05");
    expect(latest).toBe(1.05);
  });
});
