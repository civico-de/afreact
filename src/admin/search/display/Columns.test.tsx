import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { metadata as meta } from "../../../test/searchMetadata";
import { Columns } from "./Columns";
import type { DisplayContext, Draft } from "./model";

const ctx: DisplayContext = {
  meta,
  search: { api_entity: "Contact", api_params: { version: 4, select: ["id", "display_name"] } },
  defaultPagerSize: 50,
  entityIndex: true,
};

function Harness() {
  const [draft, setDraft] = useState<Draft>({
    label: "T",
    type: "table",
    settings: {
      columns: [
        { type: "field", key: "id" },
        { type: "field", key: "display_name" },
        { type: "field", key: "display_name" },
      ],
    },
  });
  return (
    <Columns
      ctx={ctx}
      draft={draft}
      edit={(change) => {
        setDraft((d) => {
          const next = structuredClone(d);
          change(next);
          return next;
        });
      }}
      links={[]}
      defaults={{}}
      head={() => null}
    />
  );
}

describe("columns", () => {
  // deviation:builder-reorder-buttons
  it("keeps focus on the moved column's buttons so it can be moved again by keyboard", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Move Contact ID down" }));
    expect(screen.getByRole("button", { name: "Move Contact ID down" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Move Contact ID up" })).toHaveFocus();
  });
});
