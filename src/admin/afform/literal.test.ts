import {
  displayValue,
  encodeLiteral,
  looksLikeJs,
  parseAttribute,
  RawJs,
  TsCall,
  type Literal,
} from "./literal";

describe("literal", () => {
  it("encodes as CRM_Utils_JS::encode does", () => {
    // Expected strings are CRM_Utils_JS::encode's output for the same values.
    const cases: [Literal, string][] = [
      [
        { label: 'It\'s "x" / ü', required: true, n: 1.5, o: null },
        "{label: 'It\\'s \"x\" / ü', required: true, n: 1.5, o: null}",
      ],
      [{ "a-b": ["x", 2] }, "{'a-b': ['x', 2]}"],
      ["a\\b\nc", "'a\\\\b\\nc'"],
      [{ input_attrs: { placeholder: "Name" } }, "{input_attrs: {placeholder: 'Name'}}"],
    ];
    for (const [value, encoded] of cases) expect(encodeLiteral(value)).toBe(encoded);
  });

  it("reads back what it writes", () => {
    const value: Literal = {
      label: 'It\'s "x"',
      options: [{ id: 1, label: "One" }],
      "a-b": [true, false, null, -2.5e3],
    };
    expect(parseAttribute(encodeLiteral(value))).toEqual(value);
  });

  it("keeps ts() calls and expressions as written", () => {
    const parsed = parseAttribute(
      "{label: ts('First Name'), afform_default: options.search_query, help: ts('a %1', {1: x}), url: 'a' + b}",
    );
    expect(parsed).toEqual({
      label: new TsCall("ts('First Name')", "First Name"),
      afform_default: new RawJs("options.search_query"),
      help: new RawJs("ts('a %1', {1: x})"),
      url: new RawJs("'a' + b"),
    });
    expect(encodeLiteral(parsed ?? null)).toBe(
      "{label: ts('First Name'), afform_default: options.search_query, help: ts('a %1', {1: x}), url: 'a' + b}",
    );
    expect(displayValue(new TsCall("ts('First Name')", "First Name"))).toBe("First Name");
  });

  it("reads double quotes, quoted keys and escapes", () => {
    expect(parseAttribute(`{"a b": "x\\"y", 'c': 'it\\'s', d: "\\u00fc"}`)).toEqual({
      "a b": 'x"y',
      c: "it's",
      d: "ü",
    });
  });

  it("leaves plain text alone and names what it cannot read", () => {
    expect(looksLikeJs(" [1] ")).toBe(true);
    expect(looksLikeJs("Name")).toBe(false);
    expect(parseAttribute("Name")).toBe("Name");
    expect(parseAttribute("{a: }")).toBeUndefined();
    expect(parseAttribute("{a: 'x'}}")).toBeUndefined();
    // Core evaluates only text that opens and closes like JS.
    expect(parseAttribute("{a: 'x'")).toBe("{a: 'x'");
    expect(parseAttribute("[1] [2]")).toBeUndefined();
  });
});
