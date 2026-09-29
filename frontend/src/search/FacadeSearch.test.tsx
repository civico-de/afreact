import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockApi, renderWithQuery } from "../test/render";
import { FacadeSearch, type DisplaySettings, type Row } from "./FacadeSearch";

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

describe("FacadeSearch", () => {
  it("shows SearchKit placeholders, then rows, pages and the count", async () => {
    const calls = runs(5);
    renderWithQuery(
      <FacadeSearch search="S" display="D" settings={settings} afform="afsearchTest" />,
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
    expect(await screen.findByText("Page 1 of 3")).toBeInTheDocument();
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
    renderWithQuery(<FacadeSearch search="S" display="D" settings={settings} />);
    await screen.findByText("Page 1 of 3");
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("link", { name: "Name 3" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(await screen.findByRole("link", { name: "Name 1" })).toBeInTheDocument();
    expect(calls.map(({ params }) => params.return)).toEqual(["page:1", "row_count", "page:2"]);
  });

  it("toggles the sort direction of a column and returns to page 1", async () => {
    const calls = runs(5);
    renderWithQuery(<FacadeSearch search="S" display="D" settings={settings} />);
    await screen.findByText("Page 1 of 3");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Page 2 of 3");
    const header = screen.getByRole("columnheader", { name: "Email" });
    await userEvent.click(within(header).getByRole("button"));
    await waitFor(() => expect(header).toHaveAttribute("aria-sort", "ascending"));
    await userEvent.click(within(header).getByRole("button"));
    await waitFor(() => expect(header).toHaveAttribute("aria-sort", "descending"));
    expect(screen.getByRole("columnheader", { name: "Name" })).not.toHaveAttribute("aria-sort");
    const pages = calls
      .filter(({ params }) => params.return !== "row_count")
      .map(({ params }) => [params.return, params.sort]);
    expect(pages).toEqual([
      ["page:1", [["sort_name", "ASC"]]],
      ["page:2", [["sort_name", "ASC"]]],
      ["page:1", [["email", "ASC"]]],
      ["page:1", [["email", "DESC"]]],
    ]);
  });

  it("takes a short first page as the whole result without a count call", async () => {
    const calls = runs(1);
    renderWithQuery(<FacadeSearch search="S" display="D" settings={settings} />);
    expect(await screen.findByText("1 results")).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(calls).toHaveLength(1);
  });

  it("shows the display's empty text", async () => {
    runs(0);
    renderWithQuery(
      <FacadeSearch
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
    renderWithQuery(<FacadeSearch search="S" display="D" />);
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

  it("reports a missing display and a failing run", async () => {
    mockApi({ "SearchDisplay.get": () => [] });
    const { unmount } = renderWithQuery(<FacadeSearch search="S" display="D" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Search display S.D not found.");
    unmount();
    mockApi({ "SearchDisplay.run": () => Promise.reject({ error_message: "Access denied" }) });
    renderWithQuery(<FacadeSearch search="S" display="D" settings={settings} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Access denied");
  });
});
