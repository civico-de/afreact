import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockApi, renderWithQuery } from "../../test/render";
import { SearchList } from "./SearchList";

const counted = <T,>(rows: T[], countMatched: number) => Object.assign(rows, { countMatched });

const metadata = {
  cacheKey: "k",
  schema: [
    {
      name: "Contact",
      title: "Contact",
      title_plural: "Contacts",
      searchable: "primary",
      primary_key: ["id"],
      fields: [{ name: "id", label: "ID", data_type: "Integer" }],
    },
  ],
  joins: {},
  operators: [{ key: "=", value: "=" }],
};

const search = {
  id: 7,
  name: "news",
  label: "Newsletter",
  description: "Monthly",
  api_entity: "Contact",
  api_params: { version: 4, select: ["id"] },
  "api_entity:label": "Contacts",
  is_template: false,
  created_id: 2,
  "created_id.display_name": "Author",
  "modified_id.display_name": "Author",
  created_date: "2026-01-02 10:00:00",
  modified_date: "2026-02-03 10:00:00",
  expires_date: null,
  has_base: false,
  "base_module:label": null,
  local_modified_date: null,
  display_name: ["table"],
  display_label: ["Table"],
  display_icon: ["fa-table"],
  display_acl_bypass: [false],
  tag_id: null,
  group_id: [4],
  groups: ["News group"],
};

beforeEach(() => {
  const store = new Map<string, unknown>([["searchMeta2en_US", metadata]]);
  window.CRM.vars = {
    afreactAdmin: {
      searchAdmin: {
        defaultPagerSize: 50,
        modules: { "org.civicrm.afform": "FormBuilder" },
        cacheKey: "k",
        tags: [],
      },
    },
  };
  window.CRM.config = { cid: 2, lcMessages: "en_US" };
  window.CRM.cache = {
    get: (name) => store.get(name),
    set: (name, value) => void store.set(name, value),
  };
  window.location.hash = "#/list";
});
afterEach(() => {
  delete window.CRM.vars;
  delete window.CRM.cache;
});

describe("SearchList", () => {
  it("lists the tab's searches with counts and deletes one after confirming what goes with it", async () => {
    vi.mocked(window.CRM.checkPerm).mockImplementation((perm) => perm === "administer search_kit");
    let deleted = false;
    const calls = mockApi({
      "SavedSearch.get": (params) =>
        params.select && Array.isArray(params.select) && params.select.length === 1
          ? counted([], 3)
          : counted(deleted ? [] : [search], deleted ? 0 : 1),
      "SearchSegment.get": () => counted([], 0),
      "Tag.get": () => [],
      "Afform.get": () => [{ name: "f", title: "News form", search_displays: ["news.table"] }],
      "SavedSearch.delete": () => {
        deleted = true;
        return [{ id: 7 }];
      },
    });
    const user = userEvent.setup();
    renderWithQuery(<SearchList />);
    expect(await screen.findByRole("cell", { name: /Newsletter/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Saved Searches/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("cell", { name: "News group" })).toBeInTheDocument();
    expect(screen.getByText("2026-01-02 10:00:00 as date by Author")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Row Actions/ }));
    await user.click(screen.getByRole("menuitem", { name: /Delete/, hidden: true }));
    const dialog = await screen.findByRole("dialog", { name: "Delete Newsletter" });
    expect(
      await within(dialog).findByText(/Form "News form" will also be deleted/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText('Smart group "News group" will also be deleted.'),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(calls.some((c) => c.call === "SavedSearch.delete")).toBe(true);
    });
    expect(await screen.findByText(/Welcome to SearchKit/)).toBeInTheDocument();
  });

  // deviation:search-listing-a11y
  it("switches tabs with the arrow keys and keeps the tab in the hash", async () => {
    mockApi({
      "SavedSearch.get": () => counted([], 0),
      "SearchSegment.get": () => counted([], 0),
    });
    const user = userEvent.setup();
    renderWithQuery(<SearchList />);
    const first = screen.getByRole("tab", { name: /Saved Searches/ });
    first.focus();
    await user.keyboard("{ArrowRight}");
    const templates = screen.getByRole("tab", { name: /Search Templates/ });
    expect(templates).toHaveAttribute("aria-selected", "true");
    expect(templates).toHaveFocus();
    expect(screen.getByRole("link", { name: /New Template/ })).toHaveAttribute(
      "href",
      "#/create/Contact?is_template=1",
    );
  });

  it("edits a label in place", async () => {
    vi.mocked(window.CRM.checkPerm).mockImplementation((perm) => perm === "administer search_kit");
    const calls = mockApi({
      "SavedSearch.get": () => counted([search], 1),
      "SearchSegment.get": () => counted([], 0),
      "Tag.get": () => [],
      "SavedSearch.update": () => [{ id: 7 }],
    });
    const user = userEvent.setup();
    renderWithQuery(<SearchList />);
    await user.click(await screen.findByRole("button", { name: /Newsletter/ }));
    const input = screen.getByRole("textbox", { name: "Edit Label" });
    await user.clear(input);
    await user.type(input, "Digest{Enter}");
    await waitFor(() => {
      expect(calls.find((c) => c.call === "SavedSearch.update")?.params).toEqual({
        where: [["id", "=", 7]],
        values: { label: "Digest" },
      });
    });
  });
});
