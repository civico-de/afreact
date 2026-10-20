import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useRef } from "react";
import { SEARCH_DELAY_MS } from "../search/filters";
import { apiError, mockApi, renderWithQuery } from "../test/render";
import { fakeTimeouts, passTime } from "../test/timers";
import { memoryStore, pageStore, type ParamStore } from "../url/hash";
import { AfreactForm } from "./AfreactForm";
import { filterFields, SearchFieldset, useSearchFieldset } from "./SearchFieldset";
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
    delete window.CRM.config;
    vi.useRealTimers();
    window.history.replaceState(null, "", "/");
  });

  it("applies af-required and af-disabled on a filter", async () => {
    const holds = JSON.stringify([["1", "=", "1"]]);
    renderSearch(
      "",
      searchForm(
        {},
        [display("Groups")],
        [{ ...field("name", { label: "Name" }), "af-required": holds, "af-disabled": holds }],
      ),
    );
    const input = await screen.findByRole("textbox", { name: "Name" });
    expect(input).toBeRequired();
    expect(input).toBeDisabled();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("disables a filter FormBuilder disabled, unless an af-disabled condition fails", async () => {
    const fails = JSON.stringify([["1", "=", "2"]]);
    renderSearch(
      "",
      searchForm(
        {},
        [display("Groups")],
        [
          field("name", { label: "Name", disabled: true }),
          {
            ...field("description", { label: "Description", disabled: true }),
            "af-disabled": fails,
          },
        ],
      ),
    );
    expect(await screen.findByRole("textbox", { name: "Name" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Description" })).toBeEnabled();
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

  // deviation:saved-filter-set-kept
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

  // deviation:param-set-load-error-shown
  it("says why a saved filter set failed to load and searches as for an id that names no set", async () => {
    const { store, runs } = renderSearch("#?_s=4&title=Old", searchForm(), {
      "SearchParamSet.get": () => {
        throw apiError("Permission denied");
      },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Permission denied");
    expect(await screen.findByRole("cell", { name: "Row" })).toBeInTheDocument();
    // The URL's values stand; the fields it leaves out take their defaults.
    const title = screen.getByRole("textbox", { name: "Title" });
    expect(title).toHaveValue("Old");
    expect(screen.getByRole("radio", { name: "Yes" })).toBeChecked();
    expect(runs()).toEqual([{ title: { CONTAINS: "Old" }, is_active: true }]);
    fakeTimeouts();
    fireEvent.change(title, { target: { value: "Ne" } });
    passTime(SEARCH_DELAY_MS);
    expect(runs().at(-1)).toEqual({ title: { CONTAINS: "Ne" }, is_active: true });
    // The id stays for a reload; only what differs from the defaults is written.
    expect(store.params().toString()).toBe("_s=4&title=Ne");
  });

  it("shows the columns a saved filter set picked for its display", async () => {
    const picking = display("Groups", {
      settings: {
        columns: [
          { type: "field", key: "title", label: "Title" },
          { type: "field", key: "description", label: "Description" },
        ],
        limit: 5,
        pager: false,
        toggleColumns: true,
      },
    });
    const { calls } = renderSearch("#?_s=4", searchForm({}, [picking]), {
      "SearchParamSet.get": () => [
        {
          filters: {},
          columns: {
            "Groups_search.Groups": { description: "Description" },
            "Groups_search.Other": { title: "Title" },
          },
        },
      ],
      "SearchDisplay.run": () => [{ key: 1, columns: [null, { val: "About" }] }],
    });
    expect(await screen.findByRole("cell", { name: "About" })).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent.trim())).toEqual([
      "Description",
    ]);
    expect(screen.getByRole("checkbox", { name: "Title" })).not.toBeChecked();
    const run = calls.find(({ call }) => call === "SearchDisplay.run");
    expect(run?.params.toggleColumns).toEqual([1]);
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
    fakeTimeouts();
    fireEvent.change(title, { target: { value: "Ne" } });
    // The search delay passes while the set is still loading.
    passTime(SEARCH_DELAY_MS);
    vi.useRealTimers();
    expect(store.params().toString()).toBe("_s=4");
    act(() => {
      resolveSet([{ filters: { title: { CONTAINS: "Set" } } }]);
    });
    await screen.findByRole("cell", { name: "Row" });
    expect(title).toHaveValue("Set");
    expect(runs()).toEqual([{ title: { CONTAINS: "Set" } }]);
    expect(store.params().toString()).toBe("_s=4");
  });

  // deviation:param-set-edits-in-url
  it("searches with typed values once typing pauses and writes them to the URL", async () => {
    const { store, runs } = renderSearch("#?_s=4&other=x", searchForm(), {
      "SearchParamSet.get": () => [],
    });
    await screen.findByRole("cell", { name: "Row" });
    fakeTimeouts();
    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), { target: { value: "Ne" } });
    passTime(SEARCH_DELAY_MS - 1);
    expect(runs()).toHaveLength(1);
    expect(store.params().toString()).toBe("_s=4&other=x");
    passTime(1);
    // The id stays in the URL; only what differs from the defaults is written.
    expect(store.params().toString()).toBe("_s=4&other=x&title=Ne");
    expect(runs()).toHaveLength(2);
    // The id names no set, so the fields keep their defaults, as after afFormReset.
    expect(runs()[1]).toEqual({ is_active: true, title: { CONTAINS: "Ne" } });
  });

  // deviation:search-filter-minlength
  it("filters by text shorter than the field's minlength", async () => {
    const short = field("name", { label: "Name", input_attrs: { minlength: 4 } });
    const { runs } = renderSearch("", searchForm({}, [display("Groups")], [short]));
    await screen.findByRole("cell", { name: "Row" });
    fakeTimeouts();
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "ab" } });
    passTime(SEARCH_DELAY_MS);
    expect(runs()).toHaveLength(2);
    expect(runs()[1]).toEqual({ is_active: true, name: "ab" });
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
    fakeTimeouts();
    fireEvent.click(screen.getByRole("radio", { name: "Yes" }));
    passTime(SEARCH_DELAY_MS);
    expect(runs()).toHaveLength(2);
    expect(store.params().toString()).toBe("");
  });

  it("writes the fieldset's keys when the form has more than one display", async () => {
    const { store } = renderSearch(
      "#?title=Old",
      searchForm({}, [display("Groups"), display("Other")]),
    );
    await waitFor(() => {
      expect(screen.getAllByRole("cell", { name: "Row" })).toHaveLength(2);
    });
    fakeTimeouts();
    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), { target: { value: "New" } });
    passTime(SEARCH_DELAY_MS);
    expect(store.params().toString()).toBe("Groups.title=New");
  });

  it("leaves typed filters out of a hash that a pick replaced right after they committed", () => {
    mockApi({ "SearchParamSet.get": () => [] });
    const nodes = [field("title", { label: "Title", search_operator: "CONTAINS" })];
    const [title] = filterFields(nodes);
    if (!title) throw new Error("fixture");
    // A child's effects run before the fieldset's: the pick lands after the commit renders.
    const PickOnCommit = () => {
      const fieldset = useSearchFieldset();
      const picked = useRef(false);
      useEffect(() => {
        if (fieldset?.state.commits !== 1 || picked.current) return;
        picked.current = true;
        fieldset.select(4);
      });
      return (
        <button
          type="button"
          onClick={() => fieldset?.dispatch({ type: "input", field: title, value: "Ne" })}
        >
          Type
        </button>
      );
    };
    const store = memoryStore("");
    renderWithQuery(
      <SearchFieldset node={{ "#tag": "div", "#children": nodes }} formName="afsearchGroups">
        <PickOnCommit />
      </SearchFieldset>,
      store,
    );
    fakeTimeouts();
    fireEvent.click(screen.getByRole("button", { name: "Type" }));
    passTime(SEARCH_DELAY_MS);
    expect(store.params().toString()).toBe("_s=4");
  });

  it("gives a filter under a failing af-if no value, and its default once the rule holds", () => {
    const rule = JSON.stringify([["Individual1[0][fields][advanced]", "=", "true"]]);
    const node: LayoutNode = {
      "#tag": "div",
      "#children": [
        field("title", { afform_default: "x" }),
        { "#tag": "div", "af-if": rule, "#children": [field("status", { afform_default: "1" })] },
      ],
    };
    const Applied = () => <output>{JSON.stringify(useSearchFieldset()?.state.applied)}</output>;
    const view = (advanced: boolean) => (
      <SearchFieldset
        node={node}
        formName="afsearchGroups"
        data={{ Individual1: [{ fields: { advanced } }] }}
      >
        <Applied />
      </SearchFieldset>
    );
    const { rerender } = renderWithQuery(view(false), memoryStore("#?status=2"));
    expect(screen.getByRole("status")).toHaveTextContent('{"title":"x"}');
    rerender(view(true));
    expect(screen.getByRole("status")).toHaveTextContent('{"title":"x","status":"2"}');
    rerender(view(false));
    expect(screen.getByRole("status")).toHaveTextContent('{"title":"x"}');
  });

  it("drops a typed value when an af-if hides its filter, but keeps a display-only one", () => {
    const rule = JSON.stringify([["Individual1[0][fields][advanced]", "=", "true"]]);
    const statusNode = field("status", {});
    const [status] = filterFields([statusNode]);
    if (!status) throw new Error("fixture");
    const node: LayoutNode = {
      "#tag": "div",
      "#children": [
        {
          "#tag": "div",
          "af-if": rule,
          "#children": [statusNode, field("note", { input_type: "DisplayOnly" })],
        },
      ],
    };
    const Values = () => {
      const fieldset = useSearchFieldset();
      return (
        <button
          type="button"
          onClick={() => fieldset?.dispatch({ type: "input", field: status, value: "4" })}
        >
          {JSON.stringify(fieldset?.state.values)}
        </button>
      );
    };
    const view = (advanced: boolean) => (
      <SearchFieldset
        node={node}
        formName="afsearchGroups"
        data={{ Individual1: [{ fields: { advanced } }] }}
      >
        <Values />
      </SearchFieldset>
    );
    const { rerender } = renderWithQuery(view(true), memoryStore("#?note=a"));
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveTextContent('{"note":"a","status":"4"}');
    rerender(view(false));
    expect(screen.getByRole("button")).toHaveTextContent('{"note":"a"}');
  });

  it("gives a filter an af-if shows after a saved set loaded the set's value", async () => {
    mockApi({ "SearchParamSet.get": () => [{ filters: { status: "7" } }] });
    const rule = JSON.stringify([["Individual1[0][fields][advanced]", "=", "true"]]);
    const node: LayoutNode = {
      "#tag": "div",
      "#children": [
        field("title", {}),
        { "#tag": "div", "af-if": rule, "#children": [field("status", { afform_default: "1" })] },
      ],
    };
    const Applied = () => {
      const fieldset = useSearchFieldset();
      return <output>{fieldset?.ready ? JSON.stringify(fieldset.state.applied) : ""}</output>;
    };
    const view = (advanced: boolean) => (
      <SearchFieldset
        node={node}
        formName="afsearchGroups"
        data={{ Individual1: [{ fields: { advanced } }] }}
      >
        <Applied />
      </SearchFieldset>
    );
    const { rerender } = renderWithQuery(view(false), memoryStore("#?_s=4"));
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent('{"title":null}');
    });
    rerender(view(true));
    expect(screen.getByRole("status")).toHaveTextContent('{"title":null,"status":"7"}');
  });

  it("keeps the hash to the filters an af-if shows, as each shows or hides", () => {
    const rule = JSON.stringify([["Individual1[0][fields][advanced]", "=", "true"]]);
    const titleNode = field("title", {});
    const [title] = filterFields([titleNode]);
    if (!title) throw new Error("fixture");
    const node: LayoutNode = {
      "#tag": "div",
      "#children": [
        titleNode,
        { "#tag": "div", "af-if": rule, "#children": [field("status", {})] },
      ],
    };
    const Type = () => {
      const fieldset = useSearchFieldset();
      return (
        <button
          type="button"
          onClick={() => fieldset?.dispatch({ type: "input", field: title, value: "Ne" })}
        >
          Type
        </button>
      );
    };
    const view = (advanced: boolean) => (
      <SearchFieldset
        node={node}
        formName="afsearchGroups"
        data={{ Individual1: [{ fields: { advanced } }] }}
      >
        <Type />
      </SearchFieldset>
    );
    const store = memoryStore("#?status=5");
    const { rerender } = renderWithQuery(view(false), store);
    fakeTimeouts();
    fireEvent.click(screen.getByRole("button", { name: "Type" }));
    passTime(SEARCH_DELAY_MS);
    expect(store.params().toString()).toBe("title=Ne");
    // Shown, the filter takes the link's value, which the hash carries again.
    rerender(view(true));
    expect(store.params().toString()).toBe("title=Ne&status=5");
    rerender(view(false));
    expect(store.params().toString()).toBe("title=Ne");
  });

  it("gives a filter its default once an af-if shows it, and a stored value read at load", () => {
    const rule = JSON.stringify([["Individual1[0][fields][advanced]", "=", "true"]]);
    const children = [
      field("title", {}),
      { "#tag": "div", "af-if": rule, "#children": [field("status", { afform_default: "1" })] },
    ];
    const Applied = () => <output>{JSON.stringify(useSearchFieldset()?.state.applied)}</output>;
    const view = (stored: boolean, advanced: boolean) => (
      <SearchFieldset
        node={{ "#tag": "div", "#children": children, ...(stored && { "store-values": "1" }) }}
        formName="afsearchGroups"
        data={{ Individual1: [{ fields: { advanced } }] }}
      >
        <Applied />
      </SearchFieldset>
    );
    const first = renderWithQuery(view(false, false), memoryStore(""));
    first.rerender(view(false, true));
    expect(screen.getByRole("status")).toHaveTextContent('{"status":"1"}');
    first.unmount();
    // A cache that hands back what was last stored, as CRM.cache does.
    let cached: unknown = { title: "t", status: "3" };
    window.CRM.cache = {
      get: () => cached,
      set: (_name: string, value: unknown) => {
        cached = value;
      },
    };
    const { rerender } = renderWithQuery(view(true, false), memoryStore(""));
    expect(screen.getByRole("status")).toHaveTextContent('{"title":"t"}');
    rerender(view(true, true));
    expect(screen.getByRole("status")).toHaveTextContent('{"title":"t","status":"3"}');
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
        field("state", { label: "State", input_type: "File" }),
        // Radio has no range template in core.
        field("created_date", {
          label: "Created",
          input_type: "Radio",
          search_range: true,
        }),
      ],
    );
    window.CRM.config = { cid: 3 };
    const { runs, calls } = renderSearch("", layout, {
      "Contact.autocomplete": () => [{ id: 3, label: "Admin" }],
    });
    await screen.findByRole("cell", { name: "Row" });
    expect(
      screen.getAllByRole("note").map((note) => note.textContent?.replace(/^.*: /, "")),
    ).toEqual(["file upload outside a form (State)", "search range (Created)"]);
    expect(runs()).toEqual([{ is_active: true, created_id: 3 }]);
    // The default contact's label comes from the field's autocomplete.
    expect(await screen.findByRole("combobox", { name: "Created By" })).toHaveValue("Admin");
    expect(calls.find(({ call }) => call === "Contact.autocomplete")?.params).toMatchObject({
      quickEdit: false,
      formName: "afform:afsearchGroups",
      fieldName: "Groups:created_id",
      values: { created_id: 3 },
      ids: [3],
    });
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
    const store = memoryStore("");
    const { runs } = renderSearch("", layout, {}, store);
    await screen.findByRole("cell", { name: "Row" });
    fakeTimeouts();
    fireEvent.change(screen.getByRole("combobox", { name: "Operator" }), {
      target: { value: "=" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), { target: { value: "A" } });
    passTime(SEARCH_DELAY_MS);
    expect(runs().at(-1)).toEqual({ title: { "=": "A" } });
    // The URL keeps the chosen operator, so a reload or a shared link searches the same.
    expect(store.params().get("title")).toBe('{"=":"A"}');
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
    fakeTimeouts();
    fireEvent.change(title, { target: { value: "New" } });
    passTime(SEARCH_DELAY_MS);
    vi.useRealTimers();
    expect(window.location.hash).toBe("#?title=New");
    expect(await screen.findByRole("cell", { name: "Row New" })).toBeInTheDocument();
    act(() => {
      window.history.replaceState(null, "", "/civicrm/group#?title=Old");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(title).toHaveValue("Old");
    expect(await screen.findByRole("cell", { name: "Row Old" })).toBeInTheDocument();
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
