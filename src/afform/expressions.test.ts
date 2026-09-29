import { evaluateExpression, interpolate, literal, type ExpressionContext } from "./expressions";

const context: ExpressionContext = {
  translate: (text) => (text === "Save" ? "Speichern" : text),
  url: (path, query = {}) => {
    const search = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]));
    return search.size ? `/${path}?${search.toString()}` : `/${path}`;
  },
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

  it("leaves every other expression unsupported", () => {
    expect(evaluateExpression("total", context)).toBeNull();
    expect(evaluateExpression("ts('%1 found', {1: n})", context)).toBeNull();
    expect(evaluateExpression("crmUrl('a', {x: y})", context)).toBeNull();
    expect(evaluateExpression("crmUrl(path)", context)).toBeNull();
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
