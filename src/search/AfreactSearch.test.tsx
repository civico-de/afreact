import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { apiError, mockApi, renderWithQuery } from "../test/render";
import { memoryStore } from "../url/hash";
import { AfreactSearch } from "./AfreactSearch";
import type { DisplaySettings, Row } from "./types";

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
    { val: `Name ${id}`, links: [{ url: `/civicrm/contact?id=${id}`, text: `Name ${id}` }] },
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
    expect(screen.getAllByRole("cell")[1]).toHaveTextContent("a1@example.org, b");
    expect(await currentPage()).toHaveTextContent("1");
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "⬅Previous",
      "1",
      "2",
      "3",
      "⮕Next",
    ]);
    expect(screen.getByText("5 results")).toBeInTheDocument();
    const seed = calls[0]?.params.seed;
    expect(seed).toEqual(expect.any(Number));
    expect(calls.map(({ params }) => params)).toEqual([
      {
        savedSearch: "S",
        display: "D",
        limit: 2,
        seed,
        afform: "afsearchTest",
        filters: {},
        sort: [["sort_name", "ASC"]],
        return: "page:1",
      },
      {
        savedSearch: "S",
        display: "D",
        limit: 2,
        seed,
        afform: "afsearchTest",
        filters: {},
        return: "row_count",
      },
    ]);
    expect(table).toHaveClass("table table-striped", { exact: true });
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

  it("toggles the sort direction of a column and stays on the page, as core's setSort", async () => {
    const calls = runs(5);
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
    await currentPage();
    await userEvent.click(screen.getByRole("link", { name: "3" }));
    await waitFor(() => {
      expect(screen.getByText("3", { selector: "[aria-current]" })).toBeVisible();
    });
    const header = screen.getByRole("columnheader", { name: "Email" });
    await userEvent.click(within(header).getByRole("button"));
    await waitFor(() => {
      expect(header).toHaveAttribute("aria-sort", "ascending");
    });
    within(header).getByRole("button").focus();
    await userEvent.keyboard(" ");
    await waitFor(() => {
      expect(header).toHaveAttribute("aria-sort", "descending");
    });
    expect(screen.getByRole("columnheader", { name: "Name" })).not.toHaveAttribute("aria-sort");
    const pages = calls
      .filter(({ params }) => params.return !== "row_count")
      .map(({ params }) => [params.return, params.sort]);
    expect(pages).toEqual([
      ["page:1", [["sort_name", "ASC"]]],
      ["page:3", [["sort_name", "ASC"]]],
      ["page:3", [["email", "ASC"]]],
      ["page:3", [["email", "DESC"]]],
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
    await waitFor(() => {
      expect(email.querySelector(".crm-search-table-column-sort-icon")).toHaveClass("fa-sort-asc");
    });
    within(name).getByRole("button").focus();
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    await waitFor(() => {
      expect(name).toHaveAttribute("aria-sort", "descending");
    });
    expect(email).not.toHaveAttribute("aria-sort");
    await user.click(within(email).getByRole("button"));
    await waitFor(() => {
      expect(email).toHaveAttribute("aria-sort", "descending");
    });
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

  // deviation:row-count-keyed-filters
  it("never shows the count of earlier filters, also when it lands after they changed", async () => {
    let answerLate = (_count: number) => {};
    const calls = mockApi({
      "SearchDisplay.run": (params) => {
        if (params.return !== "row_count") return [row(1), row(2)];
        if (JSON.stringify(params.filters) !== JSON.stringify({ title: "a" }))
          return Object.assign([], { count: 4 });
        return new Promise((resolve) => {
          answerLate = (count) => {
            resolve(Object.assign([], { count }));
          };
        });
      },
    });
    const view = (filters: Record<string, unknown>) => (
      <AfreactSearch search="S" display="D" settings={settings} filters={filters} />
    );
    const { rerender } = renderWithQuery(view({ title: "a" }));
    await waitFor(() => {
      expect(calls.map(({ params }) => params.return)).toEqual(["page:1", "row_count"]);
    });
    rerender(view({ title: "b" }));
    answerLate(30);
    expect(await screen.findByText("4 results")).toBeInTheDocument();
    expect(screen.queryByText("30 results")).not.toBeInTheDocument();
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

  // deviation:angular-runtime-classes
  it("shows the display's empty text", async () => {
    runs(0);
    renderWithQuery(
      <AfreactSearch
        search="S"
        display="D"
        settings={{ ...settings, noResultsText: "Nobody here." }}
      />,
    );
    const cell = await screen.findByRole("cell", { name: "Nobody here." });
    // The binding class is what Riverlea's `td > p.alert.ng-binding` rule sizes the box by.
    expect(cell.firstElementChild).toHaveClass("alert alert-info text-center ng-binding");
  });

  it("shows no empty row when the display turns its text off", async () => {
    runs(0);
    renderWithQuery(
      <AfreactSearch search="S" display="D" settings={{ ...settings, noResultsText: false }} />,
    );
    const table = screen.getByRole("table");
    await waitFor(() => {
      expect(table).toHaveAttribute("aria-busy", "false");
    });
    expect(within(table).getAllByRole("row")).toHaveLength(1);
  });

  it("loads the display settings when the layout carries none", async () => {
    const calls = mockApi({
      "SearchDisplay.get": () => [
        { label: "Contacts table", type: "table", settings: { ...settings, pager: false } },
      ],
      "SearchDisplay.run": () => [row(1), row(2)],
    });
    renderWithQuery(<AfreactSearch search="S" display="D" />);
    expect(await screen.findByRole("table", { name: "Contacts table" })).toBeInTheDocument();
    await screen.findByRole("link", { name: "Name 2" });
    expect(calls.map(({ call }) => call)).toEqual(["SearchDisplay.get", "SearchDisplay.run"]);
    expect(calls[0]?.params).toEqual({
      select: ["label", "type", "settings"],
      where: [
        ["name", "=", "D"],
        ["saved_search_id.name", "=", "S"],
      ],
    });
  });

  it("fills in the default columns of a display in auto column mode, as core", async () => {
    const calls = mockApi({
      "SearchDisplay.get": () => [
        { label: "Auto", settings: { columnMode: "auto", columns: [], pager: false } },
      ],
      "SearchDisplay.getDefault": () => [{ settings: { columns: settings.columns } }],
      "SearchDisplay.run": () => [row(1)],
    });
    renderWithQuery(<AfreactSearch search="S" display="D" />);
    expect(await screen.findByRole("columnheader", { name: "Email" })).toBeInTheDocument();
    expect(calls[1]).toEqual({
      call: "SearchDisplay.getDefault",
      params: { savedSearch: "S", select: ["settings"] },
    });
  });

  it("keeps the table when only the count fails", async () => {
    mockApi({
      "SearchDisplay.run": (params) => {
        if (params.return === "row_count") throw apiError("Count failed");
        return [row(1), row(2)];
      },
    });
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Count failed");
    expect(screen.getByRole("link", { name: "Name 2" })).toBeInTheDocument();
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

  it("shows a failing run as a row of the table, without rows, count or pager", async () => {
    mockApi({
      "SearchDisplay.run": (params) => {
        if (params.return === "row_count") return Object.assign([], { count: 5 });
        if (params.return === "page:2") throw apiError("The search query timed out.");
        return [row(1), row(2)];
      },
    });
    renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />);
    expect(await screen.findByText("5 results")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Next" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The search query timed out.");
    expect(alert).toHaveClass("alert alert-warning text-center");
    expect(alert.closest("td")).toHaveAttribute("colspan", "3");
    expect(screen.getAllByRole("columnheader")).toHaveLength(3);
    expect(screen.queryByRole("link", { name: "Name 1" })).not.toBeInTheDocument();
    expect(screen.queryByText("None found.")).not.toBeInTheDocument();
    expect(screen.queryByText("5 results")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  describe("URL state", () => {
    const pageRequests = (calls: { params: Record<string, unknown> }[]) =>
      calls
        .filter(({ params }) => params.return !== "row_count")
        .map(({ params }) => [params.return, params.sort, params.limit]);

    it("keeps sort and page in the hash, without defaults, and restores them on reload", async () => {
      const store = memoryStore("#/tab?Individual1=7");
      runs(5);
      const { unmount } = renderWithQuery(
        <AfreactSearch search="S" display="D" settings={settings} />,
        store,
      );
      await currentPage();
      const name = screen.getByRole("columnheader", { name: "Name" });
      await userEvent.click(within(name).getByRole("button"));
      await waitFor(() => {
        expect(store.params().toString()).toBe("Individual1=7&_sort=-sort_name");
      });
      await userEvent.click(within(name).getByRole("button"));
      await waitFor(() => {
        expect(store.params().toString()).toBe("Individual1=7");
      });
      await userEvent.click(
        within(screen.getByRole("columnheader", { name: "Email" })).getByRole("button"),
      );
      await userEvent.click(await screen.findByRole("link", { name: "2" }));
      await waitFor(() => {
        expect(store.params().toString()).toBe("Individual1=7&_sort=email&_page=2");
      });
      await userEvent.click(screen.getByRole("link", { name: "1" }));
      await waitFor(() => {
        expect(store.params().get("_page")).toBeNull();
      });
      await userEvent.click(screen.getByRole("link", { name: "3" }));
      await waitFor(() => {
        expect(store.params().get("_page")).toBe("3");
      });
      unmount();

      const calls = runs(5);
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />, store);
      expect(await currentPage()).toHaveTextContent("3");
      expect(pageRequests(calls)).toEqual([["page:3", [["email", "ASC"]], 2]]);
    });

    it("opens a shared link with one page request", async () => {
      const calls = runs(5);
      renderWithQuery(
        <AfreactSearch search="S" display="D" settings={settings} />,
        memoryStore("#?_sort=-email,sort_name&_page=2&_limit=1"),
      );
      expect(await currentPage()).toHaveTextContent("2");
      expect(pageRequests(calls)).toEqual([
        [
          "page:2",
          [
            ["email", "DESC"],
            ["sort_name", "ASC"],
          ],
          1,
        ],
      ]);
    });

    it("ignores page numbers and sizes below 1", async () => {
      const calls = runs(5);
      renderWithQuery(
        <AfreactSearch search="S" display="D" settings={settings} />,
        memoryStore("#?_page=0&_limit=-3"),
      );
      await currentPage();
      expect(pageRequests(calls)).toEqual([["page:1", [["sort_name", "ASC"]], 2]]);
    });

    it("starts new filters on page 1 and searches with them", async () => {
      const calls = runs(5);
      const store = memoryStore("#?_page=2");
      const view = (filters: Record<string, unknown>) => (
        <AfreactSearch search="S" display="D" settings={settings} filters={filters} />
      );
      const { rerender } = renderWithQuery(view({ title: "a" }), store);
      expect(await currentPage()).toHaveTextContent("2");
      rerender(view({ title: "b" }));
      await waitFor(() => {
        expect(store.params().get("_page")).toBeNull();
      });
      expect(await currentPage()).toHaveTextContent("1");
      expect(
        calls
          .filter(({ params }) => params.return !== "row_count")
          .map(({ params }) => [params.return, params.filters]),
      ).toEqual([
        ["page:2", { title: "a" }],
        ["page:1", { title: "b" }],
      ]);
    });

    it("keeps the linked page while the filters settle before the first search", async () => {
      const calls = runs(5);
      const store = memoryStore("#?_page=2");
      const view = (filters: Record<string, unknown>, enabled: boolean) => (
        <AfreactSearch
          search="S"
          display="D"
          settings={settings}
          filters={filters}
          enabled={enabled}
        />
      );
      const { rerender } = renderWithQuery(view({}, false), store);
      await screen.findByRole("table");
      expect(calls).toEqual([]);
      rerender(view({ title: "saved" }, true));
      expect(await currentPage()).toHaveTextContent("2");
      expect(store.params().get("_page")).toBe("2");
      expect(calls.map(({ params }) => [params.return, params.filters])[0]).toEqual([
        "page:2",
        { title: "saved" },
      ]);
    });

    it("searches only on the search button's click, and again on every click", async () => {
      const calls = runs(1);
      renderWithQuery(
        <AfreactSearch
          search="S"
          display="D"
          settings={{ ...settings, button: "Search" }}
          filters={{ title: "x" }}
        />,
      );
      const button = await screen.findByRole("button", { name: "Search" });
      expect(button.querySelector(".crm-i")).toHaveClass("fa-search");
      expect(calls).toEqual([]);
      await userEvent.click(button);
      expect(await screen.findByRole("cell", { name: "Name 1" })).toBeInTheDocument();
      await userEvent.click(button);
      await waitFor(() => {
        expect(calls).toHaveLength(2);
      });
      expect(calls.map(({ params }) => params.filters)).toEqual([{ title: "x" }, { title: "x" }]);
    });

    it("changes the page size once typing pauses", async () => {
      const calls = runs(5);
      const store = memoryStore("");
      renderWithQuery(
        <AfreactSearch
          search="S"
          display="D"
          settings={{ ...settings, pager: { expose_limit: true } }}
        />,
        store,
      );
      await currentPage();
      const size = screen.getByRole("spinbutton", { name: "Page Size" });
      await userEvent.clear(size);
      await userEvent.type(size, "5");
      expect(size).toHaveValue(5);
      await waitFor(() => {
        expect(store.params().get("_limit")).toBe("5");
      });
      await waitFor(() => {
        expect(pageRequests(calls).at(-1)).toEqual(["page:1", [["sort_name", "ASC"]], 5]);
      });
      expect(pageRequests(calls)).toHaveLength(2);
      await userEvent.clear(size);
      await userEvent.type(size, "2");
      await waitFor(() => {
        expect(store.params().get("_limit")).toBeNull();
      });
    });

    it("prefixes its keys with the display name when the page holds other elements", async () => {
      runs(5);
      const store = memoryStore("#?_sort=email");
      renderWithQuery(<AfreactSearch search="S" display="D" settings={settings} />, store, false);
      await currentPage();
      expect(screen.getByRole("columnheader", { name: "Name" })).toHaveAttribute(
        "aria-sort",
        "ascending",
      );
      await userEvent.click(screen.getByRole("link", { name: "2" }));
      await waitFor(() => {
        expect(store.params().toString()).toBe("_sort=email&D._page=2");
      });
    });
  });
});
