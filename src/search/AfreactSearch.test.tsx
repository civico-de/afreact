import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { apiError, mockApi, renderWithQuery } from "../test/render";
import { AfreactSearch, type DisplaySettings, type Row } from "./AfreactSearch";

const settings: DisplaySettings = {
  columns: [
    { type: "field", key: "sort_name", label: "Name", sortable: true },
    { type: "field", key: "email", label: "Email", sortable: true },
    { type: "field", key: "note", label: "Note" },
  ],
  limit: 2,
  sort: [["sort_name", "ASC"]],
  pager: { show_count: true },
  classes: ["table", "table-striped"],
};

const row = (id: number): Row => ({
  key: id,
  columns: [
    { val: `Name ${id}`, links: [{ url: `/civicrm/contact?id=${id}` }] },
    { val: [`a${id}@example.org`, "b"] },
    { val: null },
  ],
});

function runs(total: number) {
  return mockApi({
    "SearchDisplay.run": (params) => {
      if (params.return === "row_count") return Object.assign([], { count: total });
      const page = Number(String(params.return).replace("page:", ""));
      const ids = Array.from({ length: total }, (_, index) => index + 1).slice(
        (page - 1) * 2,
        page * 2,
      );
      return ids.map(row);
    },
  });
}

/** The pager marks the page on show as current. */
function currentPage(): Promise<HTMLElement> {
  return screen.findByText(/^\d+$/, { selector: "[aria-current=page]" });
}

describe("AfreactSearch", () => {
  it("shows SearchKit placeholders, then rows, pages and the count", async () => {
    const calls = runs(5);
    renderWithQuery(
      <AfreactSearch search="S" display="D" settings={settings} afform="afsearchTest" />,
    );
    const table = screen.getByRole("table");
    expect(table).toHaveAttribute("aria-busy", "true");
    expect(table.querySelectorAll(".crm-search-loading-placeholder")).toHaveLength(15);

    expect(await screen.findByRole("link", { name: "Name 1" })).toHaveAttribute(
      "href",
      "/civicrm/contact?id=1",
    );
    expect(table).toHaveAttribute("aria-busy", "false");
    expect(screen.getByText("a1@example.org, b")).toBeInTheDocument();
    expect(await currentPage()).toHaveTextContent("1");
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "⬅Previous",
      "1",
      "2",
      "3",
      "⮕Next",
    ]);
    expect(screen.getByText("5 results")).toBeInTheDocument();
    expect(calls.map(({ params }) => params)).toEqual([
      {
        savedSearch: "S",
        display: "D",
        limit: 2,
        afform: "afsearchTest",
        sort: [["sort_name", "ASC"]],
        return: "page:1",
      },
      { savedSearch: "S", display: "D", limit: 2, afform: "afsearchTest", return: "row_count" },
    ]);
  });

  it("pages forward and back, answering known pages from the cache", async () => {
    const calls = runs(5);
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
    await currentPage();
    expect(screen.queryByRole("link", { name: "Previous" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Next" }));
    expect(await screen.findByRole("link", { name: "Name 3" })).toBeInTheDocument();
    expect(await currentPage()).toHaveTextContent("2");
    await userEvent.click(screen.getByRole("link", { name: "Previous" }));
    expect(await screen.findByRole("link", { name: "Name 1" })).toBeInTheDocument();
    expect(calls.map(({ params }) => params.return)).toEqual(["page:1", "row_count", "page:2"]);
  });

  it("toggles the sort direction of a column and returns to page 1", async () => {
    const calls = runs(5);
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
    await currentPage();
    await userEvent.click(screen.getByRole("link", { name: "3" }));
    await waitFor(() =>
      expect(screen.getByText("3", { selector: "[aria-current]" })).toBeVisible(),
    );
    const header = screen.getByRole("columnheader", { name: "Email" });
    await userEvent.click(within(header).getByRole("button"));
    await waitFor(() => expect(header).toHaveAttribute("aria-sort", "ascending"));
    within(header).getByRole("button").focus();
    await userEvent.keyboard(" ");
    await waitFor(() => expect(header).toHaveAttribute("aria-sort", "descending"));
    expect(screen.getByRole("columnheader", { name: "Name" })).not.toHaveAttribute("aria-sort");
    const pages = calls
      .filter(({ params }) => params.return !== "row_count")
      .map(({ params }) => [params.return, params.sort]);
    expect(pages).toEqual([
      ["page:1", [["sort_name", "ASC"]]],
      ["page:3", [["sort_name", "ASC"]]],
      ["page:1", [["email", "ASC"]]],
      ["page:1", [["email", "DESC"]]],
    ]);
  });

  it("adds columns to the sort with Shift, as SearchKit does", async () => {
    const calls = runs(5);
    const user = userEvent.setup();
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
    await currentPage();
    const name = screen.getByRole("columnheader", { name: "Name" });
    const email = screen.getByRole("columnheader", { name: "Email" });
    await user.keyboard("{Shift>}");
    await user.click(within(email).getByRole("button"));
    await user.keyboard("{/Shift}");
    await waitFor(() =>
      expect(email.querySelector(".crm-search-table-column-sort-icon")).toHaveClass("fa-sort-asc"),
    );
    within(name).getByRole("button").focus();
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    await waitFor(() => expect(name).toHaveAttribute("aria-sort", "descending"));
    expect(email).not.toHaveAttribute("aria-sort");
    await user.click(within(email).getByRole("button"));
    await waitFor(() => expect(email).toHaveAttribute("aria-sort", "descending"));
    expect(email).toHaveAttribute(
      "title",
      "Click to sort results (shift-click to sort by multiple).",
    );
    expect(
      calls.filter(({ params }) => params.return !== "row_count").map(({ params }) => params.sort),
    ).toEqual([
      [["sort_name", "ASC"]],
      [
        ["sort_name", "ASC"],
        ["email", "ASC"],
      ],
      [
        ["sort_name", "DESC"],
        ["email", "ASC"],
      ],
      [["email", "DESC"]],
    ]);
  });

  it("takes a short first page as the whole result without a count call", async () => {
    const calls = runs(1);
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
    expect(await screen.findByText("1 result")).toBeInTheDocument();
    expect(await currentPage()).toHaveTextContent("1");
    expect(calls).toHaveLength(1);
  });

  it("hides the page links of a single page when the display asks to", async () => {
    runs(1);
    renderWithQuery(
      <AfreactSearch
        search="S"
        display="D"
        settings={{ ...settings, pager: { show_count: true, hide_single: true } }}
      />,
    );
    expect(await screen.findByText("1 result")).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("shows the display's empty text", async () => {
    runs(0);
    renderWithQuery(
      <AfreactSearch
        search="S"
        display="D"
        settings={{ ...settings, noResultsText: "Nobody here." }}
      />,
    );
    expect(await screen.findByRole("cell", { name: "Nobody here." })).toBeInTheDocument();
  });

  it("loads the display settings when the layout carries none", async () => {
    const calls = mockApi({
      "SearchDisplay.get": () => [
        { label: "Contacts table", settings: { ...settings, pager: false } },
      ],
      "SearchDisplay.run": () => [row(1), row(2)],
    });
    renderWithQuery(<AfreactSearch search="S" display="D" />);
    expect(await screen.findByRole("table", { name: "Contacts table" })).toBeInTheDocument();
    await screen.findByRole("link", { name: "Name 2" });
    expect(calls.map(({ call }) => call)).toEqual(["SearchDisplay.get", "SearchDisplay.run"]);
    expect(calls[0]?.params).toEqual({
      select: ["label", "settings"],
      where: [
        ["name", "=", "D"],
        ["saved_search_id.name", "=", "S"],
      ],
    });
  });

  it("shows values as Angular's interpolation does: objects as JSON", async () => {
    mockApi({
      "SearchDisplay.run": () => [
        { key: 1, columns: [{ val: { a: 1 } }, { val: false }, { val: 0 }] },
      ],
    });
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
    expect(await screen.findByRole("cell", { name: '{"a":1}' })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "false" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "0" })).toBeInTheDocument();
  });

  it("reports stored settings without columns", async () => {
    mockApi({ "SearchDisplay.get": () => [{ label: "Broken", settings: { limit: 5 } }] });
    renderWithQuery(<AfreactSearch search="S" display="D" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Search display S.D has no columns.",
    );
  });

  it("reports a missing display and a failing run", async () => {
    mockApi({ "SearchDisplay.get": () => [] });
    const { unmount } = renderWithQuery(<AfreactSearch search="S" display="D" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Search display S.D not found.");
    unmount();
    mockApi({ "SearchDisplay.run": () => Promise.reject(apiError("Access denied")) });
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Access denied");
  });
});
