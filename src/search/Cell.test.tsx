import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { onTestFinished, vi } from "vitest";
import { mockApi, renderWithQuery } from "../test/render";
import { memoryStore } from "../url/hash";
import { Cell, type CellProps } from "./Cell";
import { onLinkClick } from "./links";
import type { CellData, Column, Link } from "./types";

function cell(column: Column, data: CellData, extra: Partial<CellProps> = {}) {
  const clicked = vi.fn<CellProps["onLinkClick"]>();
  const { container } = render(
    <Cell column={column} cell={data} subsearch={{}} onLinkClick={clicked} {...extra} />,
  );
  return { container, clicked };
}

const icons = (container: HTMLElement) =>
  [...container.querySelectorAll(".crm-i")].map((icon) => icon.className);

describe("field columns", () => {
  // deviation:single-value-right-icon
  it("shows a value between its icons, the right one read at the value's position", () => {
    const { container } = cell(
      { type: "field", key: "name" },
      { val: "Ada", icons: { left: ["fa-user"], right: ["fa-star"] } },
    );
    expect(container).toHaveTextContent("Ada");
    expect(icons(container)).toEqual(["crm-i fa-user", "crm-i fa-star"]);
    expect(container.querySelector(".crm-search-field-value")).not.toHaveClass("badge");
  });

  it("shows a coloured value as a badge in a contrasting colour", () => {
    const { container } = cell(
      { type: "field", key: "status" },
      { val: "Open", colors: ["#fff000"] },
    );
    const badge = container.querySelector(".crm-search-field-value.badge");
    expect(badge).toHaveAttribute("style", "background-color: rgb(255, 240, 0); color: white;");
  });

  it("joins several values with commas, leaving them out between badges", () => {
    expect(cell({ type: "field" }, { val: ["a", "b", 3] }).container).toHaveTextContent("a, b, 3");
    const badges = cell({ type: "field" }, { val: ["a", "b"], colors: ["red", "blue"] });
    expect(badges.container).toHaveTextContent(/^\s*a\s*b\s*$/);
  });

  it("shows objects as JSON, as Angular interpolates them", () => {
    expect(cell({ type: "field" }, { val: { a: 1 } }).container).toHaveTextContent('{"a":1}');
  });

  it("links each value with its own target, title and icons", () => {
    const { container } = cell(
      { type: "field", key: "name" },
      {
        val: ["Ada", "Ben"],
        icons: { left: ["fa-user"], right: ["fa-star"] },
        links: [
          { url: "/a", text: "Ada", target: "_blank", title: "View Ada" },
          { url: "/b", text: "Ben", style: "text-danger" },
        ],
      },
    );
    const [ada, ben] = screen.getAllByRole("link");
    expect(ada).toHaveAttribute("href", "/a");
    expect(ada).toHaveAttribute("target", "_blank");
    expect(ada).toHaveAttribute("title", "View Ada");
    expect(ben).toHaveClass("text-danger");
    // No space between a value and its comma.
    expect(container.textContent?.replace(/\s+/g, " ").trim()).toBe("Ada, Ben");
    expect(icons(container)).toEqual(["crm-i fa-user", "crm-i fa-star"]);
  });
});

describe("other column types", () => {
  it("renders the markup of an html column", () => {
    const { container } = cell({ type: "html", key: "x" }, { val: "<em>Ada</em>" });
    expect(container.querySelector("em")).toHaveTextContent("Ada");
  });

  it("links an image with its size and alt text", () => {
    cell(
      { type: "image", key: "image_URL" },
      {
        val: "Photo of Ada",
        img: { src: "/p.png", width: 16, height: 16 },
        links: [{ url: "/a" }],
      },
    );
    const image = screen.getByRole("img", { name: "Photo of Ada" });
    expect(image).toHaveAttribute("src", "/p.png");
    expect(image).toHaveAttribute("width", "16");
    expect(image.closest("a")).toHaveAttribute("href", "/a");
  });

  // deviation:image-task-link
  it("runs an image's task link on a click or Enter", async () => {
    const link: Link = { task: "delete", text: "Delete", title: "Delete Contact" };
    const { clicked } = cell(
      { type: "image", key: "image_URL" },
      { val: "Photo of Ada", img: { src: "/p.png" }, links: [link] },
    );
    const button = screen.getByRole("button", { name: "Photo of Ada" });
    await userEvent.click(button);
    button.focus();
    await userEvent.keyboard("{Enter}");
    expect(clicked).toHaveBeenCalledTimes(2);
    expect(clicked.mock.calls[0]?.[0]).toBe(link);
  });

  it("renders nothing for an image column without an image", () => {
    expect(cell({ type: "image" }, { val: null }).container).toBeEmptyDOMElement();
  });

  const links: Link[] = [
    { url: "/view", text: "View", icon: "fa-eye", style: "info", target: "" },
    { url: "/edit", text: "Edit", style: "warning", target: "crm-popup", title: "Edit it" },
  ];

  it("styles links as text and spaces them as core's template", () => {
    const { container } = cell({ type: "links" }, { links });
    const [view, edit] = screen.getAllByRole("link");
    expect(view).toHaveClass("text-info");
    expect(edit).toHaveClass("text-warning");
    expect(edit).toHaveAttribute("target", "crm-popup");
    expect(edit).toHaveAttribute("title", "Edit it");
    expect(container.textContent).toBe(" View  Edit ");
  });

  it("styles buttons with the column's size", () => {
    cell({ type: "buttons", size: "btn-xs" }, { links });
    expect(screen.getByRole("link", { name: "View" })).toHaveClass("btn btn-xs btn-info");
  });

  // deviation:link-title-names-link
  it("names each row's link by its title where the title says more than the text", () => {
    const rowLinks: Link[] = [
      { url: "/1", text: "Edit", icon: "fa-pencil", title: "Edit Berlin donors" },
      { url: "/2", text: "Edit", title: "Change segment 2" },
      { url: "/3", text: "View", title: "View" },
      { url: "/4", text: "Explain" },
      { url: "/5", icon: "fa-trash", title: "Delete Berlin donors" },
    ];
    const names = [
      "Edit Berlin donors",
      "Edit: Change segment 2",
      "View",
      "Explain",
      "Delete Berlin donors",
    ];
    for (const type of ["links", "buttons"]) {
      const { container } = cell({ type }, { links: rowLinks });
      const anchors = names.map((name) => screen.getByRole("link", { name }));
      // The visible text, the tooltip and the hidden icons stay as core writes them.
      expect(anchors.map((link) => link.textContent.trim())).toEqual([
        "Edit",
        "Edit",
        "View",
        "Explain",
        "",
      ]);
      expect(anchors[0]).toHaveAttribute("title", "Edit Berlin donors");
      expect(anchors[2]).not.toHaveAttribute("aria-label");
      expect(anchors[3]).not.toHaveAttribute("aria-label");
      expect(container.querySelector(".crm-i")).toHaveAttribute("aria-hidden", "true");
      container.remove();
    }
    const field = cell(
      { type: "field" },
      { val: ["Ada"], links: [{ url: "/a", text: "Ada", title: "View Contact" }] },
    );
    expect(screen.getByRole("link", { name: "Ada: View Contact" })).toHaveTextContent("Ada");
    field.container.remove();
    cell({ type: "menu" }, { text: "Actions", links: rowLinks });
    for (const name of names)
      expect(screen.getByRole("menuitem", { name, hidden: true })).toBeInTheDocument();
  });

  it("makes a task link a focusable button that runs on click, Enter and Space", async () => {
    const { clicked } = cell({ type: "links" }, { links: [{ task: "delete", text: "Delete" }] });
    const link = screen.getByRole("button", { name: "Delete" });
    expect(link).toHaveAttribute("tabindex", "0");
    await userEvent.click(link);
    link.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(clicked).toHaveBeenCalledTimes(3);
    expect(clicked).toHaveBeenCalledWith({ task: "delete", text: "Delete" }, expect.anything());
  });

  it("keeps task links from navigating in field, links and button columns alike", () => {
    const task: Link = { task: "enable", text: "Enable" };
    for (const type of ["field", "links", "buttons"]) {
      const { container } = render(
        <Cell
          column={{ type }}
          cell={{ val: "Enable", links: [task, { url: "/view", text: "View" }] }}
          subsearch={{}}
          onLinkClick={onLinkClick}
        />,
      );
      const [taskLink, urlLink] = [...container.querySelectorAll("a")];
      // Recorded after React's handlers, then stopped, since jsdom cannot navigate.
      const prevented: boolean[] = [];
      const record = (event: Event) => {
        prevented.push(event.defaultPrevented);
        event.preventDefault();
      };
      document.addEventListener("click", record);
      for (const link of [taskLink, urlLink])
        link?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      document.removeEventListener("click", record);
      const clicks = prevented;
      expect(clicks, type).toEqual([true, false]);
      container.remove();
    }
  });

  it("shows a row menu button with core's label and hidden text", () => {
    cell(
      { type: "menu", icon: "fa-bars", size: "btn-xs", style: "default", alignment: "text-right" },
      { text: "Actions", links },
    );
    const button = screen.getByRole("button", { name: "Actions Row Actions" });
    expect(button).toHaveClass("dropdown-toggle btn btn-xs btn-default");
    expect(button.closest(".btn-group")).toHaveAttribute("role", "group");
    const menu = screen.getByRole("menu", { hidden: true });
    expect(menu).toHaveClass("dropdown-menu dropdown-menu-right");
    expect(
      within(menu)
        .getAllByRole("none", { hidden: true })
        .map((item) => item.className),
    ).toEqual(["bg-info", "bg-warning"]);
  });

  it("renders no menu without links", () => {
    expect(cell({ type: "menu" }, { text: "Actions", links: [] }).container).toBeEmptyDOMElement();
  });

  it("renders FormBuilder's placement column from the row's values", () => {
    const url = vi
      .spyOn(window.CRM, "url")
      .mockImplementation((path, _query, mode) => `/${mode ?? ""}/${path}`);
    onTestFinished(() => {
      url.mockRestore();
    });
    const placement = { type: "include", path: "~/afAdmin/afListPlacementColumn.html" };
    const { container } = cell(
      placement,
      {},
      {
        data: {
          server_route: "civicrm/my-form",
          is_public: true,
          "placement:label": ["Contact Summary Tab", "Dashboard"],
          "placement:icon": ["fa-address-card-o", null],
        },
      },
    );
    const link = screen.getByRole("link", { name: "civicrm/my-form" });
    expect(link).toHaveAttribute("href", "/front/civicrm/my-form");
    expect(link).toHaveAttribute("target", "_blank");
    expect([...container.querySelectorAll("li")].map((item) => item.textContent)).toEqual([
      " civicrm/my-form",
      " Contact Summary Tab",
      " Dashboard",
    ]);
    expect(icons(container)).toEqual([
      "crm-i fa-external-link",
      "crm-i fa-address-card-o",
      "crm-i fa-cog",
    ]);
  });

  it("flags an include column with another template", () => {
    cell({ type: "include", path: "~/x.html" }, {});
    expect(screen.getByRole("note")).toHaveTextContent("include column ~/x.html");
  });

  it("flags an unknown column type", () => {
    cell({ type: "chart" }, {});
    expect(screen.getByRole("note")).toHaveTextContent("column type chart");
  });
});

describe("subsearch columns", () => {
  const settings = { columns: [{ type: "field", key: "email", label: "Email" }], pager: false };
  const subsearch = { "Emails.Table": { type: "table", api_entity: "Email", settings } };
  const info = (mode: "dropdown" | "collapsed" | "inline", id: number): CellData => ({
    val: "Emails",
    subsearch: {
      search: "Emails",
      display: "Table",
      search_and_display: "Emails.Table",
      filters: { contact_id: id },
      subsearch_mode: mode,
    },
  });

  function subsearchCells(data: CellData[], sent = subsearch, store = memoryStore("")) {
    const calls = mockApi({
      "SearchDisplay.run": (params) => [
        { key: 1, columns: [{ val: `mail of ${JSON.stringify(params.filters)}` }] },
      ],
    });
    renderWithQuery(
      <table className="crm-search-display crm-search-display-table">
        <tbody>
          <tr>
            {data.map((entry, index) => (
              <td key={index}>
                <Cell
                  column={{ type: "subsearch" }}
                  cell={entry}
                  subsearch={sent}
                  afform="afsearchTest"
                  onLinkClick={vi.fn<CellProps["onLinkClick"]>()}
                />
              </td>
            ))}
          </tr>
        </tbody>
      </table>,
      store,
    );
    return calls;
  }

  it("loads a dropdown's display on first open with the row's filters", async () => {
    const calls = subsearchCells([info("dropdown", 4)]);
    const details = screen.getByText("Emails").closest("details");
    expect(details).toHaveClass("crm-search-display-subsearch-dropdown");
    expect(calls).toEqual([]);
    await userEvent.click(screen.getByText("Emails"));
    expect(await screen.findByText('mail of {"contact_id":4}')).toBeInTheDocument();
    expect(calls[0]?.params).toMatchObject({
      savedSearch: "Emails",
      display: "Table",
      afform: "afsearchTest",
      filters: { contact_id: 4 },
    });
  });

  it("closes the other dropdowns of the display when one opens", async () => {
    subsearchCells([info("dropdown", 4), info("dropdown", 5)]);
    const [first, second] = screen.getAllByText("Emails");
    if (!first || !second) throw new Error("two summaries expected");
    await userEvent.click(first);
    await userEvent.click(second);
    const [one, two] = [first.closest("details"), second.closest("details")];
    expect(one?.open).toBe(false);
    expect(two?.open).toBe(true);
  });

  it("keeps accordions open side by side", async () => {
    subsearchCells([info("collapsed", 4), info("collapsed", 5)]);
    const summaries = screen.getAllByText("Emails");
    for (const summary of summaries) await userEvent.click(summary);
    expect(summaries.map((summary) => summary.closest("details")?.open)).toEqual([true, true]);
    expect(summaries[0]?.closest("details")).toHaveClass("crm-search-display-subsearch-accordion");
  });

  it("shows an inline display at once under its heading", async () => {
    subsearchCells([info("inline", 4)]);
    expect(await screen.findByText('mail of {"contact_id":4}')).toBeInTheDocument();
    expect(screen.getByText("Emails")).toHaveClass("crm-search-display-subsearch-inline-header");
  });

  it("keeps a nested display's sort out of the page's URL", async () => {
    const sortable = {
      ...settings,
      columns: [{ type: "field", key: "email", label: "Email", sortable: true }],
    };
    const page = memoryStore("");
    const calls = subsearchCells(
      [info("inline", 4)],
      { "Emails.Table": { ...subsearch["Emails.Table"], settings: sortable } },
      page,
    );
    await screen.findByText('mail of {"contact_id":4}');
    const header = screen.getByRole("columnheader", { name: "Email" });
    await userEvent.click(within(header).getByRole("button"));
    await waitFor(() => expect(header).toHaveAttribute("aria-sort", "ascending"));
    expect(calls.at(-1)?.params.sort).toEqual([["email", "ASC"]]);
    expect(page.params().toString()).toBe("");
  });

  it("flags a nested display of a type React does not render", () => {
    subsearchCells([info("inline", 4)], {
      "Emails.Table": { ...subsearch["Emails.Table"], type: "map" },
    });
    expect(screen.getByRole("note")).toHaveTextContent("subsearch display type map");
  });

  it("renders a nested display of another type as that type", async () => {
    subsearchCells([info("inline", 4)], {
      "Emails.Table": { ...subsearch["Emails.Table"], type: "list" },
    });
    const item = (await screen.findByText('mail of {"contact_id":4}')).closest("li");
    expect(item).toHaveClass("crm-search-display-listitem");
    expect(item?.closest(".crm-search-display")).toHaveClass("crm-search-display-list");
  });
});
