import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockApi, renderWithQuery } from "../test/render";
import { AdminListMenu } from "./AdminListMenu";
import { layoutProblems } from "./support";

const ADMIN = {
  afAdmin: {
    afform_fields: {
      type: {
        options: [
          { name: "form", label: "Submission Form", icon: "fa-list-alt" },
          { name: "search", label: "Search Form", icon: "fa-search" },
          { name: "block", label: "Field Block", icon: "fa-th-large" },
        ],
      },
    },
  },
  afGuiEditor: {
    entities: {
      "*": { label: "Content Block", icon: "fa-pencil-square-o" },
      Organization: {
        label: "Organization",
        icon: "fa-building",
        type: "primary",
      },
      Activity: { label: "Activity", icon: "fa-tasks", type: "primary" },
      Contact: { label: "Contact", icon: null },
      Individual: { label: "Individual", icon: "fa-user", type: "primary" },
    },
  },
};

function renderMenu(tab: string) {
  window.CRM.vars = { afreactAdmin: ADMIN };
  renderWithQuery(
    <AdminListMenu
      node={{
        "#tag": "af-admin-list-menu",
        tab,
        class: "form-group pull-right",
      }}
    />,
  );
}

const list = () => {
  const popup = document.querySelector<HTMLElement>("ul.dropdown-menu");
  if (!popup) throw new Error("No popup list.");
  return popup;
};
const items = () =>
  within(list())
    .getAllByRole("link", { hidden: true })
    .map((item) => [item.textContent.trim(), item.getAttribute("href")]);

afterEach(() => {
  delete window.CRM.vars;
});

describe("AdminListMenu", () => {
  // deviation:new-form-choices-sorted
  it("creates a form for Individuals and lists the primary entities by label", async () => {
    renderMenu("form");
    expect(screen.getByRole("link", { name: "New Submission Form" })).toHaveAttribute(
      "href",
      "#create/form/Individual",
    );
    await userEvent.click(screen.getByRole("button", { name: "New Submission Form" }));
    expect(items()).toEqual([
      ["Activity", "#create/form/Activity"],
      ["Individual", "#create/form/Individual"],
      ["Organization", "#create/form/Organization"],
    ]);
    expect(screen.getByRole("searchbox", { name: "Filter", hidden: true })).toHaveFocus();
  });

  // deviation:content-block-first
  it("puts the content block first and a divider after it", async () => {
    renderMenu("block");
    expect(screen.queryByRole("link", { name: "New Field Block" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "New Field Block" }));
    expect(items().map(([text]) => text)).toEqual([
      "Content Block",
      "Activity",
      "Contact",
      "Individual",
      "Organization",
    ]);
    // A list with a filter is no menu: plain links, which a menu may not hold beside an input.
    expect(screen.queryByRole("menu", { hidden: true })).toBeNull();
    expect(list().querySelectorAll(".divider")).toHaveLength(1);
    expect(list().querySelector(".divider")?.previousElementSibling?.textContent.trim()).toBe(
      "Content Block",
    );
    expect(list().querySelector("a[href='#create/block/Contact'] .crm-i")).toHaveClass("fa-cog");
  });

  it("filters the choices by label, starting empty on each opening", async () => {
    const user = userEvent.setup();
    renderMenu("block");
    const button = screen.getByRole("button", { name: "New Field Block" });
    await user.click(button);
    await user.keyboard("or");
    expect(items().map(([text]) => text)).toEqual(["Organization"]);
    expect(list().querySelector(".divider")).toBeNull();
    await user.keyboard(" x");
    expect(screen.getByRole("searchbox", { name: "Filter", hidden: true })).toHaveValue("or x");
    await user.keyboard("{Escape}");
    expect(button).toHaveFocus();
    await user.click(button);
    expect(screen.getByRole("searchbox", { name: "Filter", hidden: true })).toHaveValue("");
    const filter = screen.getByRole("searchbox", { name: "Filter", hidden: true });
    const first = screen.getByRole("link", { name: "Content Block", hidden: true });
    await user.keyboard("{ArrowDown}");
    expect(first).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(filter).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("link", { name: "Organization", hidden: true })).toHaveFocus();
  });

  it("loads the searches and their displays once opened", async () => {
    const calls = mockApi({
      "SavedSearch.get": () => [
        {
          name: "A",
          label: "Alpha",
          "display.name": "T",
          "display.label": "Table",
          "display.type:icon": "fa-table",
        },
        {
          name: "A",
          label: "Alpha",
          "display.name": "G",
          "display.label": "Grid",
          "display.type:icon": "fa-th",
        },
        {
          name: "B",
          label: "Beta",
          "display.name": null,
          "display.label": null,
          "display.type:icon": null,
        },
      ],
    });
    renderMenu("search");
    expect(calls).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "New Search Form" }));
    // The filter takes the focus once the list has loaded.
    expect(await screen.findByRole("searchbox", { name: "Filter", hidden: true })).toHaveFocus();
    expect(items()).toEqual([
      ["Alpha: Search results table", "#create/search/A"],
      ["Alpha: Table", "#create/search/A.T"],
      ["Alpha: Grid", "#create/search/A.G"],
      ["Beta: Search results table", "#create/search/B"],
    ]);
  });

  // deviation:search-choices-load-error
  it("shows a failed load and tries again on the next opening", async () => {
    let fail = true;
    mockApi({
      "SavedSearch.get": () => {
        if (fail) throw new Error("Boom");
        return [];
      },
    });
    const user = userEvent.setup();
    renderMenu("search");
    const button = screen.getByRole("button", { name: "New Search Form" });
    await user.click(button);
    expect(await screen.findByText("Boom")).toBeInTheDocument();
    fail = false;
    await user.keyboard("{Escape}");
    await user.click(button);
    expect(await screen.findByText("None Found")).toBeInTheDocument();
  });

  it("says when no search exists to start from", async () => {
    mockApi({ "SavedSearch.get": () => [] });
    renderMenu("search");
    await userEvent.click(screen.getByRole("button", { name: "New Search Form" }));
    expect(await screen.findByText("None Found")).toBeInTheDocument();
    expect(screen.queryByRole("searchbox", { hidden: true })).toBeNull();
  });

  it("notes a tab it does not know and a page without FormBuilder's settings", () => {
    window.CRM.vars = {};
    renderWithQuery(<AdminListMenu node={{ "#tag": "af-admin-list-menu", tab: "form" }} />);
    expect(screen.getByRole("note")).toHaveTextContent(
      "Not supported by the React renderer: af-admin-list-menu outside FormBuilder's listing",
    );
    // Pages the support report describes never carry FormBuilder's settings.
    window.CRM.vars = { afreactAdmin: ADMIN };
    expect(layoutProblems([{ "#tag": "af-admin-list-menu", tab: "form" }])).toEqual([
      "af-admin-list-menu outside FormBuilder's listing",
    ]);
    expect(layoutProblems([{ "#tag": "af-admin-list-menu", tab: "system" }])).toEqual([
      'af-admin-list-menu tab="system"',
    ]);
  });
});
