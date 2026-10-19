import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { metadata as meta } from "../../../test/searchMetadata";
import { IconsConfig } from "./ColumnFields";
import { Columns } from "./Columns";
import type { DisplayContext, Draft } from "./model";

const ctx: DisplayContext = {
  meta,
  search: { api_entity: "Contact", api_params: { version: 4, select: ["id", "display_name"] } },
  defaultPagerSize: 50,
  entityIndex: true,
  customDateFormat: true,
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

const dated: DisplayContext = {
  ...ctx,
  search: { api_entity: "Contact", api_params: { version: 4, select: ["birth_date"] } },
};

function DateColumn({ context, format }: { context: DisplayContext; format?: string }) {
  const [draft, setDraft] = useState<Draft>({
    label: "T",
    type: "table",
    settings: { columns: [{ type: "field", key: "birth_date", format }] },
  });
  return (
    <Columns
      ctx={context}
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

describe("date format", () => {
  const formats = async () => {
    await userEvent.click(screen.getByText("Birth Date", { selector: "summary" }));
    return within(screen.getByRole("combobox", { name: "Format" }))
      .getAllByRole("option")
      .map((option) => option.textContent);
  };

  it("offers a format of its own only where core formats with it", async () => {
    render(<DateColumn context={{ ...dated, customDateFormat: false }} />);
    expect(await formats()).not.toContain("Other...");
    cleanup();
    render(<DateColumn context={dated} />);
    expect(await formats()).toContain("Other...");
  });

  it("keeps a stored format of its own in view where core ignores it", async () => {
    render(<DateColumn context={{ ...dated, customDateFormat: false }} format="%Y-%m" />);
    expect(await formats()).toContain("Other...");
    expect(screen.getByRole("combobox", { name: "Format" })).toHaveValue("other");
    expect(screen.getByRole("textbox", { name: "Custom date format" })).toHaveValue("%Y-%m");
  });
});

describe("icons", () => {
  it("keeps a field icon until an icon is picked, as pickIcon() does", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(icons: unknown[]) => void>();
    render(
      <IconsConfig
        ctx={ctx}
        icons={[{ field: "contact_type:icon", side: "left" }]}
        onChange={onChange}
      />,
    );
    await user.selectOptions(screen.getByRole("combobox", { name: "Source of Icon 1" }), "");
    expect(onChange).not.toHaveBeenCalled();
  });
});
