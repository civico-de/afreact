import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { renderWithQuery } from "../../../test/render";
import { metadata as meta } from "../../../test/searchMetadata";
import { changeFilterField, ColumnTypeFields, filterMode } from "./ColumnFields";
import type { AdminColumn, DisplayContext } from "./model";

const ctx: DisplayContext = {
  meta,
  search: {
    api_entity: "Contact",
    api_params: { version: 4, select: ["id", "display_name", "birth_date", "gender_id:label"] },
  },
  defaultPagerSize: 50,
  entityIndex: true,
};

let saved: AdminColumn | undefined;

/** One column's settings, every edit kept as the display editor keeps it. */
function Column({ initial, context = ctx }: { initial: AdminColumn; context?: DisplayContext }) {
  const [col, setCol] = useState(initial);
  saved = col;
  return (
    <ColumnTypeFields
      ctx={context}
      col={col}
      links={[]}
      dateFormats={meta.dateFormats}
      editCol={(change) => {
        setCol((current) => {
          const next = structuredClone(current);
          change(next);
          return next;
        });
      }}
    />
  );
}

const renderColumn = (initial: AdminColumn, context?: DisplayContext) =>
  renderWithQuery(<Column initial={initial} context={context} />);

describe("changeFilterField", () => {
  const filters = [
    { subsearch_field: "contact_id", parent_field: "id" },
    { subsearch_field: "status_id", value: 1 },
  ];

  // deviation:subsearch-filter-change
  it("keeps a filter whose field changes and removes one whose field is cleared", () => {
    expect(changeFilterField(filters, 1, "activity_type_id")).toEqual([
      { subsearch_field: "contact_id", parent_field: "id" },
      { subsearch_field: "activity_type_id", value: 1 },
    ]);
    expect(changeFilterField(filters, 0, null)).toEqual([
      { subsearch_field: "status_id", value: 1 },
    ]);
  });
});

describe("filterMode", () => {
  it("reads a filter with a value and a null parent field as a value, as $onInit does", () => {
    expect(filterMode({ subsearch_field: "s", value: "Completed", parent_field: null })).toBe(
      "value",
    );
    expect(filterMode({ subsearch_field: "s", value: null, parent_field: null })).toBe("field");
    expect(filterMode({ subsearch_field: "s", value: 1, parent_field: "id" })).toBe("field");
    expect(filterMode({ subsearch_field: "s", value: 1 })).toBe("value");
  });
});

describe("ColumnTypeFields", () => {
  describe("text taken on leaving the input, as core's updateOn: 'blur'", () => {
    it("keeps the tooltip's input while it is emptied and typed anew", async () => {
      renderColumn({ type: "field", key: "display_name", title: "Display Name" });
      const input = screen.getByRole("textbox", { name: "Tooltip" });
      await userEvent.clear(input);
      await userEvent.type(input, "Full name");
      await userEvent.tab();
      expect(saved?.title).toBe("Full name");
    });

    it("keeps a rewrite's text while it is emptied and typed anew", async () => {
      renderColumn({ type: "field", key: "display_name" });
      await userEvent.click(screen.getByRole("checkbox", { name: "Rewrite Text" }));
      const input = screen.getByRole("textbox", { name: "Rewrite Text" });
      expect(input).toHaveValue("[display_name]");
      await userEvent.clear(input);
      await userEvent.type(input, "Name: ");
      await userEvent.tab();
      expect(saved?.rewrite).toBe("Name: ");
    });

    it("drops an emptied placeholder once its input is left", async () => {
      renderColumn({ type: "field", key: "display_name", empty_value: "None" });
      await userEvent.clear(screen.getByRole("textbox", { name: "Empty placeholder" }));
      expect(screen.getByRole("textbox", { name: "Empty placeholder" })).toBeInTheDocument();
      await userEvent.tab();
      expect(saved?.empty_value).toBe("");
      expect(screen.queryByRole("textbox", { name: "Empty placeholder" })).toBeNull();
    });
  });
});
