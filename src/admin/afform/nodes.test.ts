import { textAttribute } from "./model";
import {
  layoutOf,
  LAYOUTS,
  modifyClasses,
  parseDisplayFilters,
  readDisplayFilters,
  setStyle,
  stringifyDisplayFilters,
  withLayout,
  type DisplayFilter,
  type LayoutClass,
} from "./nodes";

describe("display filters", () => {
  const FILTERS: DisplayFilter[] = [
    { name: "financial_type_id", mode: "val", value: 1 },
    { name: "status", mode: "val", value: "Completed" },
    { name: "is_test", mode: "val", value: false },
    { name: "contact_id", mode: "options", value: "contact_id" },
    { name: "event_id", mode: "routeParams", value: "event" },
    { name: "contact_id.display_name", mode: "routeParams", value: "display-name" },
  ];
  // afGui.stringifyDisplayFilters()'s output for the same filters.
  const TEXT =
    "{financial_type_id: 1, status: 'Completed', is_test: false, contact_id: options.contact_id, " +
    "event_id: routeParams.event, 'contact_id.display_name': routeParams['display-name']}";

  it("writes each mode in core's notation and reads it back", () => {
    expect(stringifyDisplayFilters(FILTERS)).toBe(TEXT);
    expect(parseDisplayFilters(TEXT)).toEqual(FILTERS);
  });

  it("double-quotes a value holding a single quote", () => {
    const filters: DisplayFilter[] = [{ name: "last_name", mode: "val", value: "O'Brien" }];
    expect(stringifyDisplayFilters(filters)).toBe(`{last_name: "O'Brien"}`);
    expect(parseDisplayFilters(`{last_name: "O'Brien"}`)).toEqual(filters);
    expect(parseDisplayFilters(`{"a'b": 1}`)).toEqual([{ name: "a'b", mode: "val", value: 1 }]);
  });

  it("reads key notation whatever its spacing or quotes", () => {
    expect(parseDisplayFilters("{ a :  options['x y'] , b:routeParams.c }")).toEqual([
      { name: "a", mode: "options", value: "x y" },
      { name: "b", mode: "routeParams", value: "c" },
    ]);
  });

  // deviation:display-filters-read-back
  it("reads back arrays, times and quotes after another filter, which core cannot", () => {
    const filters: DisplayFilter[] = [
      { name: "tag", mode: "val", value: [1, 2] },
      { name: "receive_date", mode: "val", value: "2024-01-01 10:00:00" },
      { name: "a", mode: "val", value: 1 },
      { name: "last_name", mode: "val", value: "O'Brien" },
      { name: "note", mode: "val", value: 'say "a, b: c"' },
    ];
    const text = stringifyDisplayFilters(filters) ?? "";
    expect(text).toBe(
      `{tag: [1,2], receive_date: '2024-01-01 10:00:00', a: 1, last_name: "O'Brien", ` +
        `note: "say \\"a, b: c\\""}`,
    );
    expect(parseDisplayFilters(text)).toEqual(filters);
  });

  it("has no text for no filters", () => {
    expect(stringifyDisplayFilters([])).toBeNull();
    expect(parseDisplayFilters(undefined)).toEqual([]);
    expect(parseDisplayFilters("")).toEqual([]);
    expect(parseDisplayFilters("{}")).toEqual([]);
  });

  // deviation:display-filter-escapes
  it("reads back backslashes and line breaks unchanged, where core doubles them each pass", () => {
    const filters: DisplayFilter[] = [
      { name: "a\\b", mode: "val", value: "c:\\temp\nline" },
      { name: "x", mode: "routeParams", value: "y\\z" },
    ];
    const text = stringifyDisplayFilters(filters) ?? "";
    expect(text).toBe(String.raw`{'a\\b': 'c:\\temp\nline', x: routeParams['y\\z']}`);
    expect(parseDisplayFilters(text)).toEqual(filters);
    expect(stringifyDisplayFilters(parseDisplayFilters(text))).toBe(text);
  });

  // deviation:display-filter-digit-names
  it("quotes a name starting with a digit, which AngularJS cannot read bare", () => {
    const filters: DisplayFilter[] = [{ name: "1abc", mode: "routeParams", value: "2x" }];
    const text = stringifyDisplayFilters(filters) ?? "";
    expect(text).toBe("{'1abc': routeParams['2x']}");
    expect(parseDisplayFilters(text)).toEqual(filters);
  });

  it("refuses an expression beyond literals, routeParams and options", () => {
    expect(() => parseDisplayFilters("{contact_id: user_contact_id}")).toThrow();
    expect(readDisplayFilters("{contact_id: user_contact_id}")).toHaveProperty("error");
    expect(readDisplayFilters("{a: 1}")).toEqual({
      filters: [{ name: "a", mode: "val", value: 1 }],
    });
  });
});

describe("withLayout", () => {
  const container = (className: string) => ({ "#tag": "div", class: className });
  const layouts = Object.keys(LAYOUTS).filter((name): name is LayoutClass => name in LAYOUTS);

  it("sets af-container with the layout class, rows without one", () => {
    expect(withLayout(container("af-container af-layout-cols custom"), "af-layout-rows")).toEqual(
      container("af-container custom"),
    );
    expect(withLayout(container("custom"), "af-layout-inline")).toEqual(
      container("custom af-container af-layout-inline"),
    );
    expect(withLayout(container("af-container af-layout-cols"), "af-layout-inline")).toEqual(
      container("af-container af-layout-inline"),
    );
  });

  it("reads back the layout it set", () => {
    for (const layout of layouts)
      expect(layoutOf(withLayout({ "#tag": "div" }, layout))).toBe(layout);
    expect(textAttribute(withLayout({ "#tag": "div" }, "af-layout-rows"), "class")).toBe(
      "af-container",
    );
  });
});

describe("styles and classes", () => {
  // deviation:style-value-colon-kept
  it("keeps a style value with a colon whole when another style changes", () => {
    const node = {
      "#tag": "div",
      style: "background-image: url(https://example.org/a.png); color: red",
    };
    expect(setStyle(node, "color", "blue").style).toBe(
      "background-image: url(https://example.org/a.png); color: blue",
    );
  });

  it("keeps the class and style attributes in their place", () => {
    const node = { "#tag": "div", class: "af-container", style: "color: red", "af-title": "X" };
    expect(Object.keys(modifyClasses(node, "af-container", "af-layout-inline"))).toEqual(
      Object.keys(node),
    );
    expect(Object.keys(setStyle(node, "color", "blue"))).toEqual(Object.keys(node));
  });
});
