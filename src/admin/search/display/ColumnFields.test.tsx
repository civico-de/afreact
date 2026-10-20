import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { mockApi, renderWithQuery } from "../../../test/render";
import { metadata as meta } from "../../../test/searchMetadata";
import { changeFilterField, ColumnTypeFields, filterMode } from "./ColumnFields";
import { buildLinks, type AdminColumn, type DisplayContext, type LinkItem } from "./model";

const ctx: DisplayContext = {
  meta,
  search: {
    api_entity: "Contact",
    api_params: { version: 4, select: ["id", "display_name", "birth_date", "gender_id:label"] },
  },
  defaultPagerSize: 50,
  entityIndex: true,
  customDateFormat: true,
};

let saved: AdminColumn | undefined;

/** One column's settings, every edit kept as the display editor keeps it. */
function Column({
  initial,
  context = ctx,
  links = [],
}: {
  initial: AdminColumn;
  context?: DisplayContext;
  links?: LinkItem[];
}) {
  const [col, setCol] = useState(initial);
  saved = col;
  return (
    <ColumnTypeFields
      ctx={context}
      col={col}
      links={links}
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

  describe("text trimmed as ngModel trims it", () => {
    it("trims a tooltip", async () => {
      renderColumn({ type: "field", key: "display_name", title: "Display Name" });
      const input = screen.getByRole("textbox", { name: "Tooltip" });
      await userEvent.clear(input);
      await userEvent.type(input, "  Full name ");
      await userEvent.tab();
      expect(saved?.title).toBe("Full name");
    });

    it("trims an HTML column's rewrite, which unlike a field's has no ng-trim=false", async () => {
      renderColumn({ type: "html", key: "display_name", rewrite: "[display_name]" });
      await userEvent.type(screen.getByRole("textbox", { name: "Rewrite HTML" }), "<br> ");
      await userEvent.tab();
      expect(saved?.rewrite).toBe("[display_name]<br>");
    });

    it("trims an image's alt text with every keystroke, keeping what is typed on show", async () => {
      renderColumn({ type: "image", key: "display_name", image: { alt: "" } });
      const input = screen.getByRole("textbox", { name: "Alt Text" });
      await userEvent.type(input, "Photo of ");
      expect(saved?.image).toEqual({ alt: "Photo of" });
      expect(input).toHaveValue("Photo of ");
      await userEvent.type(input, "[[display_name]");
      expect(saved?.image).toEqual({ alt: "Photo of [display_name]" });
    });

    // deviation:date-format-custom-on-blur
    it("keeps a custom date format's input while it is emptied, and trims the format", async () => {
      renderColumn({ type: "field", key: "birth_date" });
      await userEvent.selectOptions(screen.getByRole("combobox", { name: "Format" }), "other");
      const input = screen.getByRole("textbox", { name: "Custom date format" });
      expect(saved?.format).toBe("%Y-%m-%d");
      await userEvent.clear(input);
      await userEvent.type(input, " %d.%m.%Y ");
      await userEvent.tab();
      expect(saved?.format).toBe("%d.%m.%Y");
    });

    it("trims a template path", async () => {
      renderColumn({ type: "include", path: "" });
      await userEvent.type(
        screen.getByRole("textbox", { name: /Template File/ }),
        " ~/my/row.html ",
      );
      expect(saved?.path).toBe("~/my/row.html");
    });

    it("trims a link's own path, which an untrimmed space would put into the address", async () => {
      renderColumn({ type: "field", key: "display_name" });
      await userEvent.click(screen.getByRole("checkbox", { name: "Link" }));
      const path = screen.getByRole("textbox", { name: /^Path of/ });
      await userEvent.clear(path);
      await userEvent.type(path, "civicrm/contact/view?cid=[[id] ");
      await userEvent.tab();
      expect(saved?.link?.path).toBe("civicrm/contact/view?cid=[id]");
    });

    it("keeps a menu's text as typed, as crm-ui-editable does", async () => {
      renderColumn({ type: "menu", text: "Actions", style: "default", size: "btn-sm", links: [] });
      await userEvent.type(screen.getByRole("textbox", { name: "Menu Text" }), " ");
      await userEvent.tab();
      expect(saved?.text).toBe("Actions ");
    });
  });

  describe("an image's size, as core's number input with min 1 takes it", () => {
    it("saves an emptied width as null", async () => {
      renderColumn({ type: "image", key: "display_name", image: { alt: "", width: 100 } });
      await userEvent.clear(screen.getByRole("spinbutton", { name: "Width" }));
      expect(saved?.image).toEqual({ alt: "", width: null });
    });

    it("leaves out a height below 1, keeping it on show", async () => {
      renderColumn({ type: "image", key: "display_name", image: { alt: "", height: 40 } });
      const height = screen.getByRole("spinbutton", { name: "Height" });
      await userEvent.clear(height);
      await userEvent.type(height, "0");
      expect(saved?.image).toEqual({ alt: "" });
      expect(height).toHaveValue(0);
      await userEvent.type(height, "8");
      expect(saved?.image).toEqual({ alt: "", height: 8 });
    });
  });

  describe("a field column's settings, as core's field.html saves them", () => {
    const extra = (name: string, label: string, data_type: string, more: object = {}) => ({
      name,
      label,
      data_type,
      type: "Field",
      entity: "Contact",
      fieldName: name,
      ...more,
    });
    const richer: DisplayContext = {
      meta: {
        ...meta,
        schema: meta.schema.map((entity) =>
          entity.name === "Contact"
            ? {
                ...entity,
                fields: [
                  ...entity.fields,
                  extra("total", "Total", "Money"),
                  extra("score", "Score", "Float"),
                  extra("contact_type", "Contact Type", "String", {
                    options: true,
                    suffixes: ["name", "label", "icon"],
                  }),
                ],
              }
            : entity,
        ),
      },
      search: {
        api_entity: "Contact",
        api_params: {
          version: 4,
          select: ["id", "display_name", "gender_id:label", "total", "score", "contact_type"],
        },
      },
      defaultPagerSize: 50,
      entityIndex: true,
      customDateFormat: true,
    };

    it("turns into an HTML column without link, in-place edit and icons, and back", async () => {
      renderColumn({
        type: "field",
        key: "display_name",
        editable: true,
        link: { path: "civicrm/x" },
        icons: [{ field: "contact_type:icon", side: "left" }],
      });
      await userEvent.click(screen.getByRole("checkbox", { name: "Allow HTML" }));
      expect(saved).toEqual({ type: "html", key: "display_name" });
      await userEvent.click(screen.getByRole("checkbox", { name: "Allow HTML" }));
      expect(saved).toEqual({ type: "field", key: "display_name" });
    });

    it("switches an option field between its formats by the key's suffix", async () => {
      renderColumn({ type: "field", key: "gender_id:label" });
      const format = screen.getByRole("combobox", { name: "Format" });
      await userEvent.selectOptions(format, "Raw Value");
      expect(saved?.key).toBe("gender_id");
      await userEvent.selectOptions(format, "Machine Name");
      expect(saved?.key).toBe("gender_id:name");
    });

    it("formats money as a number or as currency", async () => {
      renderColumn({ type: "field", key: "total" }, richer);
      const format = screen.getByRole("combobox", { name: "Format" });
      await userEvent.selectOptions(format, "Number");
      expect(saved?.format).toBe("number");
      await userEvent.selectOptions(format, "Currency");
      expect(saved?.format).toBe("");
    });

    it("keeps a decimal's number attributes, an emptied one as null", async () => {
      renderColumn({ type: "field", key: "score" }, richer);
      const places = screen.getByRole("spinbutton", { name: "Max Decimal Places" });
      await userEvent.type(places, "2");
      expect(saved?.format).toEqual({ 6: 2 });
      await userEvent.clear(places);
      expect(saved?.format).toEqual({ 6: null });
    });

    it("shows line breaks and edits in place, until it is a link", async () => {
      renderColumn({ type: "field", key: "display_name" });
      await userEvent.click(screen.getByRole("checkbox", { name: "Show Linebreaks" }));
      expect(saved?.show_linebreaks).toBe(true);
      const edit = screen.getByRole("checkbox", { name: "In-Place Edit" });
      await userEvent.click(edit);
      expect(saved?.editable).toBe(true);
      await userEvent.click(edit);
      expect(saved).not.toHaveProperty("editable");
      await userEvent.click(edit);
      await userEvent.click(screen.getByRole("checkbox", { name: "Link" }));
      expect(saved).not.toHaveProperty("editable");
      expect(screen.getByRole("checkbox", { name: "In-Place Edit" })).toBeDisabled();
      expect(screen.queryByRole("checkbox", { name: "Show Linebreaks" })).toBeNull();
      await userEvent.selectOptions(
        screen.getByRole("combobox", { name: "Open link in" }),
        "New tab",
      );
      expect(saved?.link?.target).toBe("_blank");
    });

    it("adds, moves and removes an icon of a field", async () => {
      renderColumn({ type: "field", key: "display_name" }, richer);
      await userEvent.selectOptions(
        screen.getByRole("combobox", { name: "Icon" }),
        "Contact - Contact Type",
      );
      expect(saved?.icons).toEqual([{ field: "contact_type:icon", side: "left" }]);
      await userEvent.selectOptions(
        screen.getByRole("combobox", { name: "Side of Icon 1" }),
        "Align right",
      );
      expect(saved?.icons).toEqual([{ field: "contact_type:icon", side: "right" }]);
      await userEvent.click(screen.getByRole("button", { name: "Remove icon" }));
      expect(saved?.icons).toEqual([]);
    });

    it("shows an option field as a badge of its colour", async () => {
      renderColumn({ type: "field", key: "gender_id:label" });
      const color = screen.getByRole("checkbox", { name: "Use Gender color" });
      await userEvent.click(color);
      expect(saved?.colors).toEqual([{ field: "gender_id:color" }]);
      await userEvent.click(color);
      expect(saved).not.toHaveProperty("colors");
    });
  });

  describe("a field's link", () => {
    const joined: DisplayContext = {
      ...ctx,
      search: {
        api_entity: "Contact",
        api_params: { version: 4, select: ["id", "display_name", "employer_id.display_name"] },
      },
    };
    const allLinks = () => buildLinks(joined, true);

    it("removes the tooltip its own link set, though the main entity has a link of that action", async () => {
      renderWithQuery(
        <Column
          initial={{ type: "field", key: "employer_id.display_name" }}
          context={joined}
          links={allLinks()}
        />,
      );
      await userEvent.click(screen.getByRole("checkbox", { name: "Link" }));
      expect(saved?.link).toMatchObject({ action: "view", join: "employer_id" });
      expect(saved?.title).toBe("View Current Employer");
      await userEvent.click(screen.getByRole("checkbox", { name: "Link" }));
      expect(saved).toEqual({ type: "field", key: "employer_id.display_name" });
    });
  });

  describe("a menu column", () => {
    const styled: DisplayContext = {
      ...ctx,
      meta: {
        ...meta,
        styles: [
          { key: "default", value: "Default" },
          { key: "primary", value: "Primary" },
        ],
      },
    };

    it("gives a menu without a style the default one once it is chosen", async () => {
      renderColumn({ type: "menu", text: "Actions", size: "btn-sm", links: [] }, styled);
      const style = screen.getByRole("combobox", { name: "Style" });
      expect(style).toHaveValue("");
      await userEvent.selectOptions(style, "Default");
      expect(saved?.style).toBe("default");
    });

    it("gives buttons of a size it does not offer one it does once chosen", async () => {
      renderColumn({ type: "buttons", size: "btn-md", links: [] }, styled);
      const size = screen.getByRole("combobox", { name: "Button Size" });
      expect(size).toHaveValue("btn-md");
      await userEvent.selectOptions(size, "Large");
      expect(saved?.size).toBe("btn-lg");
    });
  });

  describe("a subsearch column", () => {
    const members = {
      label: "Members",
      api_entity: "Contact",
      api_params: { version: 4, select: ["id", "display_name"] },
    };
    const column = (search: string): AdminColumn => ({
      type: "subsearch",
      label: "Members",
      rewrite: "Members",
      subsearch: {
        search,
        display: "Members_table",
        filters: [{ subsearch_field: "id", parent_field: "id" }],
        subsearch_mode: "dropdown",
      },
    });

    beforeEach(() => {
      window.CRM.vars = {
        ...window.CRM.vars,
        afreactAdmin: { searchDisplay: { viewableDisplayTypes: { table: "Table" } } },
      };
    });

    afterEach(() => {
      window.CRM.vars = { ...window.CRM.vars, afreactAdmin: {} };
    });

    // deviation:subsearch-cleared-drops-filters
    it("lets its saved search be cleared, dropping the display and filters with it", async () => {
      mockApi({
        "SavedSearch.get": () => [members],
        "SearchDisplay.get": () => [{ name: "Members_table", label: "Members table" }],
      });
      renderColumn(column("Members"));
      await screen.findByRole("columnheader", { name: "Filter Subsearch Display" });
      await userEvent.click(screen.getByRole("button", { name: "Clear" }));
      expect(saved?.subsearch).toEqual({ display: null, filters: [], subsearch_mode: "dropdown" });
      expect(screen.queryByRole("columnheader", { name: "Filter Subsearch Display" })).toBeNull();
    });

    it("switches a filter between a value and a parent field, and embeds the chosen display", async () => {
      mockApi({
        "SavedSearch.get": () => [members],
        "SearchDisplay.get": () => [{ name: "Members_table", label: "Members table" }],
      });
      renderColumn(column("Members"));
      const kind = await screen.findByRole("combobox", { name: "Kind of Value of filter 1" });
      await userEvent.selectOptions(kind, "Value");
      expect(saved?.subsearch?.filters).toEqual([{ subsearch_field: "id", value: null }]);
      await userEvent.selectOptions(kind, "Field");
      expect(saved?.subsearch?.filters).toEqual([{ subsearch_field: "id", parent_field: null }]);
      const display = screen.getByRole("combobox", { name: "Display" });
      await userEvent.selectOptions(display, "Search results table");
      expect(saved?.subsearch?.display).toBeNull();
      await userEvent.selectOptions(display, "Members table");
      expect(saved?.subsearch?.display).toBe("Members_table");
    });

    // deviation:subsearch-missing-search-kept
    it("keeps a saved search that no longer exists, saying so", async () => {
      mockApi({ "SavedSearch.get": () => [], "SearchDisplay.get": () => [] });
      const initial = column("Gone");
      renderColumn(initial);
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "The saved search Gone no longer exists; choose another one.",
      );
      expect(saved).toEqual(initial);
    });
  });

  // deviation:include-path-kept
  it("keeps a template path that is not yet valid, which core's validators drop", async () => {
    renderColumn({ type: "include", path: "" });
    const path = screen.getByRole("textbox", { name: /Template File/ });
    await userEvent.type(path, "~/my");
    expect(path).toBeInvalid();
    expect(saved?.path).toBe("~/my");
  });
});
