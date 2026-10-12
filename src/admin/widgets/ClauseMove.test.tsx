import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { ClauseMoveButtons } from "./ClauseMove";

/** Two clauses and a group, each with its move buttons named after its first value. */
function Harness() {
  const [root, setRoot] = useState<unknown[]>([
    ["a", "=", 1],
    ["b", "=", 2],
    ["OR", [["c", "=", 3]]],
  ]);
  const rows = (clauses: unknown[], path: number[]): React.ReactNode[] =>
    clauses.map((clause, index) => {
      if (!Array.isArray(clause)) return null;
      const head = String(clause[0]);
      const tree = { root, path, skip: 0, onChange: setRoot };
      return (
        <div key={index}>
          <ClauseMoveButtons tree={tree} index={index} name={head} />
          {head === "OR" && Array.isArray(clause[1]) && rows(clause[1], [...path, index])}
        </div>
      );
    });
  return <>{rows(root, [])}</>;
}

describe("ClauseMoveButtons", () => {
  it("keeps the focus on the moved clause, into a group and on its other button at the end", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Move b down" }));
    // b entered the group, at its near end.
    expect(screen.getByRole("button", { name: "Move b down" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Move a down" }));
    expect(screen.getByRole("button", { name: "Move a down" })).toHaveFocus();
    // Out of the group again, a is first, so only its down button is left.
    await userEvent.click(screen.getByRole("button", { name: "Move a up" }));
    expect(screen.getByRole("button", { name: "Move a up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move a down" })).toHaveFocus();
  });
});
