import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { mockApi, renderWithQuery } from "../test/render";
import { memoryStore, type ParamStore } from "../url/hash";
import { AfreactForm } from "./AfreactForm";
import { layoutProblems, nodeKind } from "./support";
import { initialTab, tabForKey } from "./tabsets";
import type { FieldDefn, LayoutNode } from "./types";

const field = (name: string, defn: Partial<FieldDefn> = {}): LayoutNode => ({
  "#tag": "af-field",
  name,
  defn: { name, label: name, input_type: "Text", data_type: "String", ...defn },
});

const display = (name: string, extra: Record<string, unknown> = {}): LayoutNode => ({
  "#tag": "crm-search-display-table",
  "search-name": "Afform_Admin",
  "display-name": name,
  settings: { columns: [{ type: "field", key: "title", label: "Title" }] },
  ...extra,
});

/** afAdminFormList's shape: a search fieldset with a counted display in each named tab. */
const searchTab = (name: string, title: string, type: string): LayoutNode => ({
  "#tag": "af-tab",
  name,
  title,
  icon: "fa-list-alt",
  "#children": [
    {
      "#tag": "div",
      "af-fieldset": "",
      "#children": [
        field("title", { label: `${title} title` }),
        display(`${name}_table`, { filters: `{type: '${type}'}`, "total-count": "$parent.count" }),
      ],
    },
  ],
});

const searchTabs = (attributes: Record<string, unknown> = {}): LayoutNode[] => [
  {
    "#tag": "af-tabset",
    ...attributes,
    "#children": [
      { "#text": "\n  " },
      searchTab("form", "Submission Forms", "form"),
      searchTab("search", "Search Forms", "search"),
      searchTab("block", "Field Blocks", "block"),
    ],
  },
];

interface Setup {
  layout: LayoutNode[];
  type?: string;
  hash?: string;
  store?: ParamStore;
  submit?: (params: Record<string, unknown>) => unknown;
}

function renderTabs({ layout, type = "search", hash = "", store, submit }: Setup) {
  const calls = mockApi({
    "Afreact.getForm": () => [{ name: "afTabs", title: "Tabs", type, layout, strings: [] }],
    "Afform.prefill": () => [],
    "Afform.submit": submit ?? (() => []),
    "SearchDisplay.run": (params) =>
      params.return === "row_count"
        ? Object.assign([], { count: String(params.display).length })
        : [{ key: 1, columns: [{ val: `${String(params.display)} row` }] }],
  });
  const params = store ?? memoryStore(hash);
  renderWithQuery(<AfreactForm name="afTabs" location={{ search: "", hash }} />, params);
  const runs = () =>
    calls
      .filter(({ call, params: p }) => call === "SearchDisplay.run" && p.return !== "row_count")
      .map(({ params: p }) => p.display);
  return { calls, runs, store: params };
}

const tab = (name: string | RegExp) => screen.getByRole("tab", { name });

describe("af-tabset", () => {
  afterEach(() => {
    delete window.CRM.cache;
  });

  it("writes afTabset.html's markup with the ARIA tabs pattern", async () => {
    renderTabs({ layout: searchTabs() });
    const list = await screen.findByRole("tablist");
    expect(list).toHaveClass("nav", "nav-tabs", "crm-tab-list");
    expect(list.parentElement?.tagName).toBe("AF-TABSET");
    expect(list.parentElement).toHaveClass("crm-tabset");
    const first = tab(/Submission Forms/);
    expect(first).toHaveAttribute("aria-selected", "true");
    expect(first).toHaveAttribute("tabindex", "0");
    expect(first.parentElement).toHaveClass("crm-tab-button", "active");
    expect(first.parentElement).toHaveAttribute("role", "presentation");
    expect(first.parentElement).toHaveAttribute("data-name", "form");
    expect(first.querySelector("i.crm-i.fa-list-alt")).toHaveAttribute("aria-hidden", "true");
    expect(tab(/Search Forms/)).toHaveAttribute("aria-selected", "false");
    expect(tab(/Search Forms/)).toHaveAttribute("tabindex", "-1");
    const panel = screen.getByRole("tabpanel", { name: /Submission Forms/ });
    expect(first).toHaveAttribute("aria-controls", panel.id);
    expect(panel.parentElement?.tagName).toBe("AF-TAB");
    expect(panel.closest(".crm-tab-panel")).not.toBeNull();
    // Hidden panels stay in the document, out of the accessibility tree.
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(
      screen.getByRole("textbox", { name: "Field Blocks title", hidden: true }),
    ).not.toBeVisible();
  });

  it("moves and selects with the arrow keys, Home and End, and selects on click", async () => {
    renderTabs({ layout: searchTabs() });
    await userEvent.click(await screen.findByRole("tab", { name: /Search Forms/ }));
    expect(tab(/Search Forms/)).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: /Search Forms/ })).toBeVisible();
    await userEvent.keyboard("{ArrowRight}");
    expect(tab(/Field Blocks/)).toHaveFocus();
    expect(tab(/Field Blocks/)).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowRight}");
    expect(tab(/Submission Forms/)).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(tab(/Field Blocks/)).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(tab(/Submission Forms/)).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{End}");
    expect(tab(/Field Blocks/)).toHaveAttribute("aria-selected", "true");
    expect(tab(/Field Blocks/)).toHaveAttribute("tabindex", "0");
    expect(tab(/Submission Forms/)).toHaveAttribute("tabindex", "-1");
    // Tab leaves the tab list for the panel's first control.
    await userEvent.tab();
    expect(screen.getByRole("textbox", { name: "Field Blocks title" })).toHaveFocus();
  });

  it("runs a display only once its tab is shown, and counts every tab's rows", async () => {
    const { runs, calls } = renderTabs({ layout: searchTabs() });
    expect(await screen.findByRole("cell", { name: "form_table row" })).toBeInTheDocument();
    await waitFor(() => {
      expect(tab(/Field Blocks/)).toHaveTextContent("Field Blocks 11");
    });
    expect(tab(/Submission Forms/).querySelector(".badge")).toHaveTextContent("10");
    expect(runs()).toEqual(["form_table"]);
    // The count leaves the form's filters out, as searchDisplayBaseTrait's own count.
    const counts = calls.filter(({ params }) => params.return === "row_count");
    expect(counts.map(({ params }) => params)).toContainEqual({
      savedSearch: "Afform_Admin",
      display: "block_table",
      afform: "afTabs",
      filters: { type: "block" },
      return: "row_count",
    });
    await userEvent.click(tab(/Search Forms/));
    expect(await screen.findByRole("cell", { name: "search_table row" })).toBeInTheDocument();
    expect(runs()).toEqual(["form_table", "search_table"]);
  });

  it("selects the tab named in url-arg and writes the user's choice there", async () => {
    const store = memoryStore("#?tab=block&other=1");
    renderTabs({ layout: searchTabs({ "url-arg": "tab" }), store });
    expect(await screen.findByRole("tab", { name: /Field Blocks/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await userEvent.click(tab(/Search Forms/));
    await waitFor(() => {
      expect(store.params().toString()).toBe("tab=search&other=1");
    });
    act(() => {
      store.write(new URLSearchParams("tab=form"));
    });
    expect(tab(/Submission Forms/)).toHaveAttribute("aria-selected", "true");
  });

  it("skips a tab name that no longer exists, in the URL or remembered", async () => {
    window.CRM.cache = { get: () => "gone", set: vi.fn() };
    renderTabs({
      layout: searchTabs({ "url-arg": "tab", "remember-selection": "true" }),
      hash: "#?tab=gone",
    });
    expect(await screen.findByRole("tab", { name: /Submission Forms/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tabpanel")).toBeVisible();
  });

  it("remembers the selection under the form's name, the URL first", async () => {
    const set = vi.fn<(name: string, value: unknown) => void>();
    const get = vi.fn(() => "block");
    window.CRM.cache = { get, set };
    renderTabs({ layout: searchTabs({ "remember-selection": "true" }) });
    expect(await screen.findByRole("tab", { name: /Field Blocks/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(get).toHaveBeenCalledWith("afTabsSelectedTab");
    await userEvent.click(tab(/Search Forms/));
    expect(set).toHaveBeenLastCalledWith("afTabsSelectedTab", "search");
  });

  it("keeps fields of hidden tabs in the form, submits them, and shows the tab of an invalid one", async () => {
    const submit = vi.fn((_params: Record<string, unknown>) => []);
    const layout: LayoutNode[] = [
      {
        "#tag": "af-form",
        ctrl: "afform",
        "#children": [
          { "#tag": "af-entity", type: "Contact", name: "Individual1" },
          {
            "#tag": "af-tabset",
            "#children": [
              {
                "#tag": "af-tab",
                title: "Name",
                "#children": [
                  {
                    "#tag": "div",
                    "af-fieldset": "Individual1",
                    "#children": [field("first_name", { label: "First", afform_default: "Ada" })],
                  },
                ],
              },
              {
                "#tag": "af-tab",
                title: "More",
                "#children": [
                  {
                    "#tag": "div",
                    "af-fieldset": "Individual1",
                    "#children": [
                      field("nick_name", { label: "Nick", required: true }),
                      field("is_opt_out", {
                        label: "Opt out",
                        input_type: "Toggle",
                        data_type: "Boolean",
                      }),
                    ],
                  },
                ],
              },
            ],
          },
          { "#tag": "button", "ng-click": "afform.submit()", "#children": [{ "#text": "Save" }] },
        ],
      },
    ];
    renderTabs({ layout, type: "form", submit });
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
    // The required field sits in the hidden tab: its tab opens and it takes the focus.
    expect(tab("More")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("textbox", { name: /Nick/ })).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent("Please fill all required fields.");
    await userEvent.type(screen.getByRole("textbox", { name: /Nick/ }), "Lovelace");
    await userEvent.click(screen.getByRole("switch", { name: "Opt out" }));
    await userEvent.click(tab("Name"));
    expect(screen.getByRole("switch", { name: "Opt out", hidden: true })).not.toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(submit).toHaveBeenCalledTimes(1);
    });
    expect(submit.mock.calls[0]?.[0]).toMatchObject({
      values: {
        Individual1: [{ fields: { first_name: "Ada", nick_name: "Lovelace", is_opt_out: true } }],
      },
    });
  });

  it("shows the tab of a required checkbox list with nothing checked", async () => {
    const submit = vi.fn((_params: Record<string, unknown>) => []);
    const layout: LayoutNode[] = [
      {
        "#tag": "af-form",
        ctrl: "afform",
        "#children": [
          { "#tag": "af-entity", type: "Contact", name: "Individual1" },
          {
            "#tag": "af-tabset",
            "#children": [
              { "#tag": "af-tab", title: "Name", "#children": [] },
              {
                "#tag": "af-tab",
                title: "More",
                "#children": [
                  {
                    "#tag": "div",
                    "af-fieldset": "Individual1",
                    "#children": [
                      field("preferred_communication_method", {
                        label: "Contact by",
                        input_type: "CheckBox",
                        required: true,
                        options: [
                          { id: "1", label: "Phone" },
                          { id: "2", label: "Email" },
                        ],
                      }),
                    ],
                  },
                ],
              },
            ],
          },
          { "#tag": "button", "ng-click": "afform.submit()", "#children": [{ "#text": "Save" }] },
        ],
      },
    ];
    renderTabs({ layout, type: "form", submit });
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
    expect(tab("More")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("checkbox", { name: "Phone" })).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent("Please fill all required fields.");
    expect(submit).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("checkbox", { name: "Email" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(submit).toHaveBeenCalledTimes(1);
    });
    expect(submit.mock.calls[0]?.[0]).toMatchObject({
      values: { Individual1: [{ fields: { preferred_communication_method: ["2"] } }] },
    });
  });

  it("shows the tab of a prefilled value shorter than its minlength before focusing it", async () => {
    const layout: LayoutNode[] = [
      {
        "#tag": "af-form",
        ctrl: "afform",
        "#children": [
          { "#tag": "af-entity", type: "Contact", name: "Individual1" },
          {
            "#tag": "af-tabset",
            "#children": ["Name", "More"].map((title) => ({
              "#tag": "af-tab",
              title,
              "#children": [
                {
                  "#tag": "div",
                  "af-fieldset": "Individual1",
                  "#children": [
                    title === "Name"
                      ? field("first_name", { label: "First" })
                      : field("nick_name", { label: "Nick", input_attrs: { minlength: 3 } }),
                  ],
                },
              ],
            })),
          },
          { "#tag": "button", "ng-click": "afform.submit()", "#children": [{ "#text": "Save" }] },
        ],
      },
    ];
    const submit = vi.fn(() => []);
    mockApi({
      "Afreact.getForm": () => [
        { name: "afTabs", title: "Tabs", type: "form", layout, strings: [] },
      ],
      "Afform.prefill": () => [{ name: "Individual1", values: [{ fields: { nick_name: "Al" } }] }],
      "Afform.submit": submit,
    });
    renderWithQuery(<AfreactForm name="afTabs" location={{ search: "", hash: "" }} />);
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
    expect(tab("More")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("textbox", { name: "Nick" })).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent("Nick must be at least 3 characters.");
    expect(submit).not.toHaveBeenCalled();
  });

  it("names unnamed tabs tab0, tab1 … as afTab does on a page with one tab set", async () => {
    const store = memoryStore("#?t=tab1");
    renderTabs({
      layout: [
        {
          "#tag": "af-tabset",
          "url-arg": "t",
          "#children": ["Campaigns", "Surveys"].map((title) => ({
            "#tag": "af-tab",
            title,
            "#children": [{ "#text": `${title} text` }],
          })),
        },
      ],
      store,
    });
    expect(await screen.findByRole("tab", { name: /Surveys/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Surveys text");
  });
});

/** afsearchLabelFormats: crm-ui-tab on the fieldsets themselves, titles as ts() expressions. */
const uiTabs: LayoutNode[] = [
  {
    "#tag": "div",
    "crm-ui-tab-set": "",
    "#children": [
      ["Mailing Labels", "tab-mailinglabels", "label_format"],
      ["Name Badges", "tab-namebadge", "name_badge"],
    ].map(([title, id, group]) => ({
      "#tag": "div",
      "af-fieldset": "",
      "crm-ui-tab": "",
      "crm-title": `ts('${String(title)}')`,
      id,
      "#children": [
        {
          "#tag": "div",
          class: "af-markup",
          "#children": [
            display(`${String(group)}_table`, {
              filters: `{'option_group_id:name': '${String(group)}'}`,
            }),
          ],
        },
      ],
    })),
  },
];

describe("crm-ui-tab-set", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("writes the markup of tabset.html after jQuery UI's tabs(), with the ARIA tabs pattern", async () => {
    const { runs } = renderTabs({ layout: uiTabs });
    const list = await screen.findByRole("tablist");
    expect(list).toHaveClass("crm-tab-list", "ui-tabs-nav", "ui-widget-header");
    expect(list.parentElement).toHaveClass("crm-tabset", "ui-tabs", "ui-widget");
    // jQuery UI's classes stay on the item; its link is the tab, with nothing focusable inside.
    const first = tab("Mailing Labels");
    expect(first.tagName).toBe("A");
    expect(first).toHaveClass("ui-tabs-anchor");
    expect(first).toHaveAttribute("href", "#tab-mailinglabels");
    expect(first).toHaveAttribute("tabindex", "0");
    expect(first).toHaveAttribute("aria-controls", "tab-mailinglabels");
    expect(first.parentElement).toHaveAttribute("role", "presentation");
    expect(first.parentElement).toHaveClass(
      "crm-tab-button",
      "ui-tabs-tab",
      "ui-tabs-active",
      "ui-state-active",
    );
    expect(tab("Name Badges")).toHaveAttribute("tabindex", "-1");
    expect(within(list).queryAllByRole("link")).toEqual([]);
    const panel = screen.getByRole("tabpanel", { name: "Mailing Labels" });
    expect(panel).toHaveAttribute("id", "tab-mailinglabels");
    expect(panel).toHaveClass("ui-tabs-panel", "ui-widget-content");
    // The fieldset inside keeps its other attributes, not the tab's.
    expect(panel.firstElementChild).not.toHaveAttribute("id");
    // Both displays run at once: jQuery UI hides the panels only after they started.
    expect(await screen.findByRole("cell", { name: "label_format_table row" })).toBeInTheDocument();
    expect(
      await screen.findByRole("cell", { name: "name_badge_table row", hidden: true }),
    ).not.toBeVisible();
    expect(runs()).toEqual(["label_format_table", "name_badge_table"]);
    await userEvent.click(within(tab("Name Badges")).getByText("Name Badges"));
    expect(tab("Name Badges")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("cell", { name: "name_badge_table row" })).toBeVisible();
    expect(runs()).toEqual(["label_format_table", "name_badge_table"]);
    await userEvent.keyboard("{ArrowLeft}");
    expect(tab("Mailing Labels")).toHaveFocus();
    expect(tab("Mailing Labels")).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{End}");
    expect(tab("Name Badges")).toHaveAttribute("aria-selected", "true");
  });

  it("opens the tab named by the URL fragment, as jQuery UI does", async () => {
    window.history.replaceState(null, "", "/#tab-namebadge");
    renderTabs({ layout: uiTabs });
    expect(await screen.findByRole("tab", { name: "Name Badges" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("shows a tab's count, from its attribute or a display's total-count", async () => {
    const counted = structuredClone(uiTabs);
    const [set] = counted as unknown as [{ "#children": Record<string, unknown>[] }];
    const [labels, badges] = set["#children"] as [Record<string, unknown>, Record<string, unknown>];
    labels.count = "3";
    const inner = (badges["#children"] as [{ "#children": Record<string, unknown>[] }])[0];
    (inner["#children"][0] as Record<string, unknown>)["total-count"] = "$parent.count";
    renderTabs({ layout: counted });
    const item = async (name: string) => (await screen.findByRole("tab", { name })).parentElement;
    expect(await item("Mailing Labels 3")).toHaveClass("crm-count-3");
    expect(await item("Name Badges 16")).toHaveClass("crm-count-16");
    expect(layoutProblems(counted)).toEqual([]);
  });
});

describe("support for tab sets", () => {
  it("dispatches both kinds of tab set", () => {
    expect(nodeKind({ "#tag": "af-tabset" })).toBe("tabset");
    expect(nodeKind({ "#tag": "div", "crm-ui-tab-set": "" })).toBe("tabset");
    expect(nodeKind({ "#tag": "af-tab" })).toBe("tab");
    expect(nodeKind({ "#tag": "div", "crm-ui-tab": "", id: "x" })).toBe("unknown");
  });

  it("finds nothing in core's tabbed forms", () => {
    expect(layoutProblems(searchTabs({ "url-arg": "tab", "remember-selection": "true" }))).toEqual(
      [],
    );
    expect(layoutProblems(uiTabs)).toEqual([]);
  });

  /** Everything of a tab set the renderer flags. */
  const gappy: LayoutNode[] = [
    {
      "#tag": "af-tabset",
      "page-nav-buttons": "true",
      "remember-selection": "options.remember",
      "#children": [
        {
          "#tag": "af-tab",
          title: "{{ tab.title }}",
          "ng-if": "x",
          "#children": [display("a", { "total-count": "count" })],
        },
      ],
    },
    { "#tag": "af-tab", title: "Lost", "#children": [{ "#tag": "marquee" }] },
    {
      "#tag": "div",
      "crm-ui-tab-set": "",
      "#children": [{ "#tag": "div", "crm-ui-tab": "", "crm-title": "Plain", id: "p" }],
    },
    { "#tag": "div", "crm-ui-tab": "", "crm-title": "ts('Alone')", id: "q" },
    display("b", { "total-count": "$parent.count" }),
  ];

  it("names every part it cannot show, as the rendered form does", async () => {
    const report = layoutProblems(gappy);
    expect(report).toEqual([
      "page-nav-buttons on <af-tabset>",
      'remember-selection="options.remember"',
      "ng-if on <af-tab>",
      "Angular expression {{ tab.title }}",
      'total-count="count"',
      "<af-tab> outside its tab set",
      "<marquee>",
      'crm-title="Plain"',
      "crm-ui-tab, crm-title",
      'total-count="$parent.count"',
    ]);
    renderTabs({ layout: gappy });
    await screen.findAllByRole("tablist");
    await screen.findAllByRole("cell", { hidden: true });
    const shown = screen
      .getAllByRole("note", { hidden: true })
      .map((note) => note.textContent?.replace("Not supported by the React renderer: ", ""));
    expect([...new Set(shown)].sort()).toEqual([...report].sort());
  });
});

describe("tab helpers", () => {
  it("picks the first known name, else the first tab", () => {
    expect(initialTab(["a", "b"], [null, "b"])).toBe("b");
    expect(initialTab(["a", "b"], ["x", undefined])).toBe("a");
    expect(initialTab([], ["x"])).toBeNull();
  });

  it("maps the tab keys and wraps around", () => {
    expect(tabForKey("ArrowRight", 2, 3)).toBe(0);
    expect(tabForKey("ArrowDown", 0, 3)).toBe(1);
    expect(tabForKey("ArrowUp", 0, 3)).toBe(2);
    expect(tabForKey("End", 0, 3)).toBe(2);
    expect(tabForKey("a", 0, 3)).toBeNull();
  });
});
