import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SEARCH_DELAY_MS } from "../search/filters";
import { mockApi, renderWithQuery } from "../test/render";
import { memoryStore, pageStore, type ParamStore } from "../url/hash";
import { AfreactForm } from "./AfreactForm";
import type { FieldDefn, LayoutNode } from "./types";

const field = (name: string, defn: Partial<FieldDefn>): LayoutNode => ({
  "#tag": "af-field",
  name,
  defn: { name, label: name, input_type: "Text", data_type: "String", ...defn },
});

const display = (name: string, extra: Record<string, unknown> = {}): LayoutNode => ({
  "#tag": "crm-search-display-table",
  "search-name": "Groups_search",
  "display-name": name,
  settings: {
    columns: [{ type: "field", key: "title", label: "Title" }],
    limit: 5,
    pager: false,
  },
  ...extra,
});

function searchForm(
  fieldset: Record<string, unknown> = {},
  displays = [display("Groups")],
  extra: LayoutNode[] = [],
): LayoutNode[] {
  return [
    {
      "#tag": "div",
      "af-fieldset": "",
      ...fieldset,
      "#children": [
        field("title", { label: "Title", search_operator: "CONTAINS" }),
        field("is_active", {
          label: "Enabled",
          input_type: "Radio",
          data_type: "Boolean",
          afform_default: "1",
          options: [
            { id: true, label: "Yes" },
            { id: false, label: "No" },
          ],
        }),
        ...extra,
        ...displays,
      ],
    },
  ];
}

function renderSearch(
  hash: string,
  layout: LayoutNode[] = searchForm(),
  extra = {},
  store: ParamStore = memoryStore(hash),
) {
  const calls = mockApi({
    "Afreact.getForm": () => [
      {
        name: "afsearchGroups",
        title: "Groups",
        type: "search",
        layout,
        strings: [],
      },
    ],
    "SearchDisplay.run": () => [{ key: 1, columns: [{ val: "Row" }] }],
    ...extra,
  });
  const view = renderWithQuery(
    <AfreactForm name="afsearchGroups" location={{ search: "", hash }} />,
    store,
  );
  const runs = () =>
    calls.filter(({ call }) => call === "SearchDisplay.run").map(({ params }) => params.filters);
  return { store, calls, runs, view };
}

describe("SearchFieldset", () => {
  afterEach(() => {
    delete window.CRM.cache;
  });

  it("searches once with the field defaults on first load", async () => {
    const { runs } = renderSearch("");
    expect(await screen.findByRole("cell", { name: "Row" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Yes" })).toBeChecked();
    expect(runs()).toEqual([{ is_active: true }]);
  });

  it("takes the first search's filters from the URL, the fieldset's key first", async () => {
    const { runs } = renderSearch("#?title=Plain&Groups.title=News&is_active=0");
    expect(await screen.findByRole("cell", { name: "Row" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("News");
    expect(screen.getByRole("radio", { name: "No" })).toBeChecked();
    expect(runs()).toEqual([{ title: { CONTAINS: "News" }, is_active: false }]);
  });

  it("starts from stored values and stores every change", async () => {
    const set = vi.fn<(name: string, value: unknown) => void>();
    window.CRM.cache = {
      get: () => ({ title: { CONTAINS: "Kept" }, is_active: false }),
      set,
    };
    const { runs } = renderSearch("", searchForm({ "store-values": "1" }));
    expect(await screen.findByRole("cell", { name: "Row" })).toBeInTheDocument();
    expect(runs()).toEqual([{ title: { CONTAINS: "Kept" }, is_active: false }]);
    await userEvent.click(screen.getByRole("radio", { name: "Yes" }));
    await waitFor(() => {
      expect(set).toHaveBeenLastCalledWith("afform:afsearchGroupsGroups", {
        title: { CONTAINS: "Kept" },
        is_active: true,
      });
    });
  });

  it("reads no stored values without store-values", async () => {
    const get = vi.fn(() => ({ title: { CONTAINS: "Kept" } }));
    window.CRM.cache = {
      get,
      set: vi.fn<(name: string, value: unknown) => void>(),
    };
    const { runs } = renderSearch("");
    expect(await screen.findByRole("cell", { name: "Row" })).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
    expect(runs()).toEqual([{ is_active: true }]);
  });

  it("waits for a saved filter set, then searches once with it", async () => {
    const { calls, runs } = renderSearch("#?_s=4&is_active=1", searchForm(), {
      "SearchParamSet.get": () => [{ filters: { title: { CONTAINS: "Set" }, is_active: false } }],
    });
    expect(await screen.findByRole("cell", { name: "Row" })).toBeInTheDocument();
    expect(calls.map(({ call }) => call)).toEqual([
      "Afreact.getForm",
      "SearchParamSet.get",
      "SearchDisplay.run",
    ]);
    expect(calls[1]?.params).toEqual({
      where: [
        ["id", "=", "4"],
        ["afform_name", "=", "afsearchGroups"],
      ],
      select: ["filters", "columns"],
    });
    expect(runs()).toEqual([{ title: { CONTAINS: "Set" }, is_active: true }]);
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Set");
  });

  it("keeps a loaded filter set's values when the fieldset mounts again", async () => {
    const { runs, view } = renderSearch("#?_s=4", searchForm(), {
      "SearchParamSet.get": () => [{ filters: { title: { CONTAINS: "Set" }, is_active: false } }],
    });
    await screen.findByRole("cell", { name: "Row" });
    view.rerender(
      <AfreactForm key="again" name="afsearchGroups" location={{ search: "", hash: "#?_s=4" }} />,
    );
    await screen.findByRole("cell", { name: "Row" });
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Set");
    // A new display instance searches again with its own seed.
    expect(runs()).toEqual([
      { title: { CONTAINS: "Set" }, is_active: false },
      { title: { CONTAINS: "Set" }, is_active: false },
    ]);
  });

  it("keeps typed values out of the URL until a filter set has loaded, which then wins", async () => {
    let resolveSet = (rows: unknown[]) => rows;
    const { store, runs } = renderSearch("#?_s=4", searchForm(), {
      "SearchParamSet.get": () =>
        new Promise((resolve) => {
          resolveSet = (rows) => {
            resolve(rows);
            return rows;
          };
        }),
    });
    const title = await screen.findByRole("textbox", { name: "Title" });
    await userEvent.type(title, "Ne");
    // Lets the search delay pass while the set is still loading.
    await act(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, SEARCH_DELAY_MS + 100);
        }),
    );
    expect(store.params().toString()).toBe("_s=4");
    act(() => {
      resolveSet([{ filters: { title: { CONTAINS: "Set" } } }]);
    });
    await screen.findByRole("cell", { name: "Row" });
    expect(title).toHaveValue("Set");
    expect(runs()).toEqual([{ title: { CONTAINS: "Set" } }]);
    expect(store.params().toString()).toBe("_s=4");
  });

  it("searches with typed values once typing pauses and writes them to the URL", async () => {
    const { store, runs } = renderSearch("#?_s=4&other=x", searchForm(), {
      "SearchParamSet.get": () => [],
    });
    await screen.findByRole("cell", { name: "Row" });
    await userEvent.type(screen.getByRole("textbox", { name: "Title" }), "Ne");
    expect(runs()).toHaveLength(1);
    await waitFor(
      () => {
        expect(runs()).toHaveLength(2);
      },
      { timeout: 2000 },
    );
    expect(runs()[1]).toEqual({ title: { CONTAINS: "Ne" } });
    await waitFor(() => {
      expect(store.params().toString()).toBe("other=x&title=Ne&is_active=");
    });
  });

  it("searches with the typed values when the search button is clicked before the pause", async () => {
    const withButton = display("Groups", {
      settings: {
        columns: [{ type: "field", key: "title", label: "Title" }],
        limit: 5,
        pager: false,
        button: "Search",
      },
    });
    const { runs } = renderSearch("", searchForm({}, [withButton]));
    await userEvent.type(await screen.findByRole("textbox", { name: "Title" }), "Smith");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByRole("cell", { name: "Row" });
    expect(runs()).toEqual([{ title: { CONTAINS: "Smith" }, is_active: true }]);
  });

  it("leaves defaults out of the URL", async () => {
    const { store, runs } = renderSearch("#?is_active=0");
    await screen.findByRole("cell", { name: "Row" });
    await userEvent.click(screen.getByRole("radio", { name: "Yes" }));
    await waitFor(
      () => {
        expect(runs()).toHaveLength(2);
      },
      { timeout: 2000 },
    );
    await waitFor(() => {
      expect(store.params().toString()).toBe("");
    });
  });

  it("writes the fieldset's keys when the form has more than one display", async () => {
    const { store } = renderSearch(
      "#?title=Old",
      searchForm({}, [display("Groups"), display("Other")]),
    );
    await waitFor(() => {
      expect(screen.getAllByRole("cell", { name: "Row" })).toHaveLength(2);
    });
    const title = screen.getByRole("textbox", { name: "Title" });
    await userEvent.clear(title);
    await userEvent.type(title, "New");
    await waitFor(
      () => {
        expect(store.params().toString()).toBe("Groups.title=New");
      },
      {
        timeout: 2000,
      },
    );
  });

  it("adds the display's own filters from the route, which win on the same key", async () => {
    const { runs } = renderSearch(
      "#?job_type=import&title=x",
      searchForm({}, [
        display("Groups", {
          filters: "{job_type: routeParams.job_type, is_active: false}",
        }),
      ]),
    );
    await screen.findByRole("cell", { name: "Row" });
    expect(runs()).toEqual([{ title: { CONTAINS: "x" }, is_active: false, job_type: "import" }]);
  });

  it("shows no display whose filters it cannot read", async () => {
    const { runs } = renderSearch(
      "",
      searchForm({}, [display("Groups", { filters: "{a: routeParams.b + 1}" })]),
    );
    expect(await screen.findByRole("note")).toHaveTextContent('filters="{a: routeParams.b + 1}"');
    expect(runs()).toEqual([]);
  });

  it("keeps the note for filter inputs it cannot render, and still searches with their values", async () => {
    const layout = searchForm(
      {},
      [display("Groups")],
      [
        field("created_id", {
          label: "Created By",
          input_type: "EntityRef",
          data_type: "Integer",
          fk_entity: "Contact",
          afform_default: "user_contact_id",
        }),
        field("state", { label: "State", input_type: "ChainSelect" }),
        field("created_date", {
          label: "Created",
          input_type: "Date",
          search_range: true,
        }),
      ],
    );
    window.CRM.config = { cid: 3 };
    const { runs } = renderSearch("", layout);
    await screen.findByRole("cell", { name: "Row" });
    expect(
      screen.getAllByRole("note").map((note) => note.textContent?.replace(/^.*: /, "")),
    ).toEqual([
      "field type EntityRef (Created By)",
      "field type ChainSelect (State)",
      "search range (Created)",
    ]);
    expect(runs()).toEqual([{ is_active: true, created_id: 3 }]);
    delete window.CRM.config;
  });

  it("offers the operators a field exposes and searches with the chosen one", async () => {
    const layout: LayoutNode[] = [
      {
        "#tag": "div",
        "af-fieldset": "",
        "#children": [
          field("title", {
            label: "Title",
            search_operator: "CONTAINS",
            expose_operator: true,
            operators: { CONTAINS: "Contains", "=": "Is" },
          }),
          display("Groups"),
        ],
      },
    ];
    const { runs } = renderSearch("", layout);
    await screen.findByRole("cell", { name: "Row" });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Operator" }), "=");
    await userEvent.type(screen.getByRole("textbox", { name: "Title" }), "A");
    await waitFor(
      () => {
        expect(runs().at(-1)).toEqual({ title: { "=": "A" } });
      },
      { timeout: 2000 },
    );
  });

  it("follows a hash changed by a link, with the new values at once", async () => {
    window.history.replaceState(null, "", "/civicrm/group#?title=Old");
    const { runs } = renderSearch("", searchForm(), {}, pageStore);
    await screen.findByRole("cell", { name: "Row" });
    act(() => {
      window.history.replaceState(null, "", "/civicrm/group#?title=New");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("New");
    await waitFor(() => {
      expect(runs()).toHaveLength(2);
    });
    expect(runs()[1]).toEqual({ title: { CONTAINS: "New" }, is_active: true });
    window.history.replaceState(null, "", "/");
  });

  it("follows a link back to the hash it started from after writing its own", async () => {
    window.history.replaceState(null, "", "/civicrm/group#?title=Old");
    renderSearch(
      "",
      searchForm(),
      {
        "SearchDisplay.run": ({ filters }: { filters?: { title?: { CONTAINS?: string } } }) => [
          {
            key: 1,
            columns: [{ val: `Row ${filters?.title?.CONTAINS ?? ""}` }],
          },
        ],
      },
      pageStore,
    );
    await screen.findByRole("cell", { name: "Row Old" });
    const title = screen.getByRole("textbox", { name: "Title" });
    await userEvent.clear(title);
    await userEvent.type(title, "New");
    await waitFor(
      () => {
        expect(window.location.hash).toBe("#?title=New");
      },
      { timeout: 2000 },
    );
    act(() => {
      window.history.replaceState(null, "", "/civicrm/group#?title=Old");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(title).toHaveValue("Old");
    expect(await screen.findByRole("cell", { name: "Row Old" })).toBeInTheDocument();
    window.history.replaceState(null, "", "/");
  });

  it("shows no display filtered by placement options when there are none", async () => {
    const layout = searchForm({}, [
      display("Groups", { filters: "{contact_id: options.contact_id}" }),
    ]);
    const { runs } = renderSearch("", layout);
    expect(await screen.findByRole("note")).toHaveTextContent(
      "display filters from options outside a placement",
    );
    expect(runs()).toEqual([]);
  });

  it("filters by placement options where a placement provides them", async () => {
    const layout = searchForm({}, [
      display("Groups", { filters: "{contact_id: options.contact_id}" }),
    ]);
    const calls = mockApi({
      "Afreact.getForm": () => [
        {
          name: "afsearchGroups",
          title: "Groups",
          type: "search",
          layout,
          strings: [],
        },
      ],
      "SearchDisplay.run": () => [{ key: 1, columns: [{ val: "Row" }] }],
    });
    renderWithQuery(
      <AfreactForm
        name="afsearchGroups"
        location={{ search: "", hash: "" }}
        options={{ contact_id: 8 }}
      />,
    );
    await screen.findByRole("cell", { name: "Row" });
    expect(calls.find(({ call }) => call === "SearchDisplay.run")?.params.filters).toEqual({
      is_active: true,
      contact_id: 8,
    });
  });
});
