import {
  compileBundle,
  decodeAttribute,
  decodeJs,
  htmlToLayout,
  type BundleVars,
  type ModuleFile,
} from "./bundle";

const TYPES: BundleVars["attributeTypes"] = {
  "*": { "*": "text", data: "js", actions: "js" },
  "af-field": { name: "text", defn: "js" },
  "af-entity": { actions: "js", data: "text" },
};
const DECODING = { types: TYPES, translate: (text: string) => `[${text}]` };

describe("decodeJs", () => {
  it("reads JS literal notation as CRM_Utils_JS::decode does", () => {
    expect(
      decodeJs(
        "{required: true, 'label': 'It\\'s', n: 2.5, none: null, options: [{id: 1, label: 'A, B'}], nested: {a: [1, [2]]}}",
      ),
    ).toEqual({
      required: true,
      label: "It's",
      n: 2.5,
      none: null,
      options: [{ id: 1, label: "A, B" }],
      nested: { a: [1, [2]] },
    });
  });

  it("keeps quotes, colons and brackets inside strings", () => {
    expect(decodeJs(`{a: 'x: {y}', "b": "say \\"hi\\""}`)).toEqual({
      a: "x: {y}",
      b: 'say "hi"',
    });
  });

  it("gives expressions null and empty objects the shape of an empty PHP array", () => {
    expect(decodeJs("{id: routeParams.cid, ok: 1}")).toEqual({
      id: null,
      ok: 1,
    });
    expect(decodeJs("{}")).toEqual([]);
    expect(decodeJs("{0: 'a', 1: 'b'}")).toEqual(["a", "b"]);
    expect(decodeJs("'unterminated ' quote'")).toBeNull();
  });
});

describe("decodeAttribute", () => {
  it("translates ts() with a string literal at any depth, as Angular evaluates it", () => {
    expect(
      decodeAttribute(
        String.raw`{help_pre: ts('It\'s'), input_attrs: {placeholder: ts( "Say \"hi\"" )}, list: [ts('a')]}`,
        DECODING.translate,
      ),
    ).toEqual({ help_pre: "[It's]", input_attrs: { placeholder: '[Say "hi"]' }, list: ["[a]"] });
  });

  it("leaves string literals and other calls as CRM_Utils_JS::decode reads them", () => {
    expect(
      decodeAttribute(`{label: 'ts(x)', other: ts(name), more: ts('a', {1: 'b'})}`, (t) => t),
    ).toEqual({ label: "ts(x)", other: null, more: null });
  });
});

describe("htmlToLayout", () => {
  it("converts markup to ArrayHtml's format with typed attributes", () => {
    expect(
      htmlToLayout(
        `<af-form ctrl="afform"><af-entity data="{source: 'Web'}" actions="{update: false}" name="A"></af-entity>
<div class="af-container"><af-field name="x" defn="{label: 'X'}"></af-field><div></div></div><!-- note --><p>a b</p></af-form>`,
        DECODING,
      ),
    ).toEqual([
      {
        "#tag": "af-form",
        ctrl: "afform",
        "#children": [
          {
            "#tag": "af-entity",
            data: "{source: 'Web'}",
            actions: { update: false },
            name: "A",
          },
          { "#text": "\n" },
          {
            "#tag": "div",
            class: "af-container",
            "#children": [
              { "#tag": "af-field", name: "x", defn: { label: "X" } },
              { "#tag": "div", "#children": [] },
            ],
          },
          { "#comment": " note " },
          { "#tag": "p", "#children": [{ "#text": "a&nbsp;b" }] },
        ],
      },
    ]);
  });

  it("gives valueless HTML 4 boolean attributes their name as libxml does", () => {
    expect(htmlToLayout(`<input disabled checked af-fieldset required>`, DECODING)).toEqual([
      {
        "#tag": "input",
        disabled: "disabled",
        checked: "checked",
        "af-fieldset": "",
        required: "",
      },
    ]);
  });
});

describe("compileBundle", () => {
  const vars: BundleVars = {
    url: "/bundle.json",
    forms: { afformA: { module: "afformA", title: "A", type: "form", autosave_draft: true } },
    blocks: { "afblock-b": "afblockB" },
    attributeTypes: TYPES,
  };
  const partial = (module: string, html: string) => ({
    partials: { [`~/${module}/${module}.aff.html`]: html },
  });
  // As afform_admin appends it to every partial.
  const admin = `  <div class="btn-group crm-admin-block-context-dropdown dropup"><button>Configure</button></div>\n`;

  it("inlines blocks, decodes display settings and drops afform_admin's edit menu", () => {
    const file: ModuleFile = {
      afformA: partial(
        "afformA",
        `<afblock-b></afblock-b><crm-search-display-table settings="{limit: 10}"></crm-search-display-table>\n${admin}`,
      ),
      afblockB: {
        ...partial("afblockB", `<p>block</p>\n${admin}`),
        strings: { Block: "Baustein" },
      },
      afformUnrelated: { ...partial("afformUnrelated", ""), strings: { Other: "Andere" } },
    };
    expect(compileBundle(vars, file, "afformA")).toEqual({
      name: "afformA",
      title: "A",
      type: "form",
      autosave_draft: true,
      strings: { Block: "Baustein" },
      layout: [
        {
          "#tag": "afblock-b",
          "#children": [{ "#tag": "p", "#children": [{ "#text": "block" }] }, { "#text": "\n" }],
        },
        { "#tag": "crm-search-display-table", settings: { limit: 10 } },
        { "#text": "\n" },
      ],
    });
  });

  it("translates ts() in field definitions with the strings of the module it is in", () => {
    const file: ModuleFile = {
      afformA: partial("afformA", `<afblock-b></afblock-b>`),
      afblockB: {
        ...partial("afblockB", `<af-field name="x" defn="{help_pre: ts('Help')}"></af-field>`),
        strings: { Help: "Hilfe" },
      },
    };
    expect(compileBundle(vars, file, "afformA").layout).toEqual([
      {
        "#tag": "afblock-b",
        "#children": [{ "#tag": "af-field", name: "x", defn: { help_pre: "Hilfe" } }],
      },
    ]);
  });

  it("rejects forms the page did not hand over and blocks that include themselves", () => {
    const file: ModuleFile = {
      afformA: partial("afformA", "<afblock-b></afblock-b>"),
    };
    expect(() => compileBundle(vars, file, "afformZ")).toThrow(
      'Form "afformZ" does not exist or you may not open it.',
    );
    file.afblockB = partial("afblockB", "<div><afblock-b></afblock-b></div>");
    expect(() => compileBundle(vars, file, "afformA")).toThrow(
      "Afform block afblockB includes itself.",
    );
    expect(() => compileBundle(vars, { afformA: { partials: {} } }, "afformA")).toThrow(
      "No layout for Afform module afformA.",
    );
  });
});
