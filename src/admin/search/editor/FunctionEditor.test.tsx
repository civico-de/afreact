import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { metadata } from "../../../test/searchMetadata";
import { FunctionEditor } from "./FunctionEditor";

const search = { api_entity: "Contact", api_params: { version: 4, select: ["id"] } };

describe("FunctionEditor", () => {
  it("keeps the spaces of a text argument, as core's ng-trim=false input does", async () => {
    const onChange = vi.fn<(expr: string) => void>();
    render(
      <FunctionEditor
        meta={metadata}
        search={search}
        expr={'CONCAT(display_name, "-")'}
        mode="clause"
        onChange={onChange}
      />,
    );
    const arg = screen.getByRole("textbox", { name: "And" });
    await userEvent.clear(arg);
    await userEvent.type(arg, " - ");
    await userEvent.tab();
    expect(onChange).toHaveBeenLastCalledWith('CONCAT(display_name, " - ")');
  });
});
