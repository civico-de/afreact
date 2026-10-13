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
  it("keeps the decimal point of a number typed digit by digit", async () => {
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: "Amount" });
    await userEvent.type(input, "1.05");
    expect(input).toHaveValue("1.05");
    expect(latest).toBe(1.05);
  });
});
