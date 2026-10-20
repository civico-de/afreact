import { evaluateExpression, interpolate, literal, type ExpressionContext } from "./expressions";

const context: ExpressionContext = {
  translate: (text) => (text === "Save" ? "Speichern" : text),
  url: (path, query = {}) => {
    const search = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]));
    return search.size ? `/${path}?${search.toString()}` : `/${path}`;
  },
  routeParams: { event: "12" },
};

describe("literal", () => {
  it("reads single- and double-quoted JS strings", () => {
    expect(literal("'contacts\\' location'")).toBe("contacts' location");
    expect(literal("'say \"hi\"'")).toBe('say "hi"');
    expect(literal('"a\\"b"')).toBe('a"b');
  });
});

describe("evaluateExpression", () => {
  it("translates ts() literals, one-time or not", () => {
    expect(evaluateExpression(":: ts('Save')", context)).toBe("Speichern");
    expect(evaluateExpression(' ts("Learn more...") ', context)).toBe("Learn more...");
  });

  it("builds crmUrl() links with and without query parameters", () => {
    expect(evaluateExpression(":: crmUrl('civicrm/admin/x?reset=1')", context)).toBe(
      "/civicrm/admin/x?reset=1",
    );
    expect(evaluateExpression("crmUrl('civicrm/a', {reset: 1, 'b': 'c d'})", context)).toBe(
      "/civicrm/a?reset=1&b=c+d",
    );
    expect(evaluateExpression("crmUrl('civicrm/a', {})", context)).toBe("/civicrm/a");
  });

  it("fills ts() parameters given as literals, with the plural form past one", () => {
    expect(evaluateExpression("ts('%1 found', {1: 3})", context)).toBe("3 found");
    expect(evaluateExpression("ts('Save', {'escape': 'js'})", context)).toBe("Speichern");
    expect(evaluateExpression("ts('%1 of %2%', {1: '100%', 2: 5})", context)).toBe("100% of 5%");
    const plural = "ts('%count item', {count: 2, plural: '%count items'})";
    expect(evaluateExpression(plural, context)).toBe("2 items");
    expect(evaluateExpression(plural.replace("count: 2", "count: 1"), context)).toBe("1 item");
  });

  it("reads route parameters, empty where the route has none", () => {
    expect(evaluateExpression(" routeParams.event ", context)).toBe("12");
    expect(evaluateExpression("routeParams.missing", context)).toBe("");
    expect(evaluateExpression("routeParams.toString", context)).toBe("");
  });

  it("leaves every other expression unsupported", () => {
    expect(evaluateExpression("total", context)).toBeNull();
    expect(evaluateExpression("ts('%1 found', {1: n})", context)).toBeNull();
    expect(evaluateExpression("crmUrl('a', {x: y})", context)).toBeNull();
    expect(evaluateExpression("crmUrl(path)", context)).toBeNull();
    expect(evaluateExpression(":: routeParams.event", context)).toBeNull();
    expect(evaluateExpression("routeParams.event | uppercase", context)).toBeNull();
    expect(evaluateExpression("routeParams['event']", context)).toBeNull();
  });
});

describe("interpolate", () => {
  it("replaces every expression in a text", () => {
    expect(interpolate("{{:: ts('Save') }} or {{ ts('Cancel') }}", context)).toEqual({
      text: "Speichern or Cancel",
    });
  });

  it("names the first expression it cannot resolve", () => {
    expect(interpolate("{{ ts('Save') }} {{ total }} {{ count }}", context)).toEqual({
      unsupported: "{{ total }}",
    });
  });
});
