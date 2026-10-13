import { vi } from "vitest";
import { emptyData } from "./model";
import {
  defaultValue,
  hasTokens,
  initialiseData,
  joinOffsets,
  repeatMinimum,
  refersToItself,
  replaceTokens,
  routeValue,
  staticDefault,
  tokenValues,
} from "./structure";
import type { ElementNode, FieldDefn } from "./types";

const field = (name: string, defn: Partial<FieldDefn> = {}): ElementNode => ({
  "#tag": "af-field",
  name,
  defn: { name, input_type: "Text", data_type: "String", ...defn },
});
const email = (): ElementNode => ({
  "#tag": "div",
  "af-join": "Email",
  "#children": [field("email")],
});

describe("joinOffsets", () => {
  it("counts non-repeating joins per fieldset", () => {
    const first = email();
    const second = email();
    const other = email();
    const repeating: ElementNode = { ...email(), "af-repeat": "Add" };
    const offsets = joinOffsets([
      { "#tag": "fieldset", "af-fieldset": "Individual1", "#children": [first, repeating, second] },
      { "#tag": "fieldset", "af-fieldset": "Individual2", "#children": [other] },
    ]);
    expect([
      offsets.get(first),
      offsets.get(second),
      offsets.get(other),
      offsets.get(repeating),
    ]).toEqual([0, 1, 0, undefined]);
  });
});

describe("repeatMinimum", () => {
  it("follows af-repeat-default and min like afRepeat", () => {
    expect(repeatMinimum({ "#tag": "div" })).toBe(1);
    expect(repeatMinimum({ "#tag": "div", min: "3" })).toBe(3);
    expect(repeatMinimum({ "#tag": "div", "af-repeat-default": "0" })).toBe(0);
    expect(repeatMinimum({ "#tag": "div", "af-repeat-default": "" })).toBe(1);
    expect(repeatMinimum({ "#tag": "div", "af-repeat-default": "2", min: "1" })).toBe(2);
  });

  // deviation:repeat-default-within-max
  it("shows no more items at first than the maximum allows", () => {
    expect(repeatMinimum({ "#tag": "div", "af-repeat-default": "4", max: "3" })).toBe(3);
    expect(repeatMinimum({ "#tag": "div", "af-repeat-default": "2", max: "3" })).toBe(2);
    expect(repeatMinimum({ "#tag": "div", "af-repeat-default": "4", max: "" })).toBe(4);
    expect(repeatMinimum({ "#tag": "div", "af-repeat-default": "4", max: "0" })).toBe(4);
  });
});

describe("staticDefault", () => {
  it("skips token defaults, which afField calculates live", () => {
    const defn = { name: "x", input_type: "Text", data_type: "String" };
    expect(
      staticDefault({ ...defn, afform_default: "Dear [Individual1.0.first_name]" }),
    ).toBeUndefined();
    // afForm's identifyTokens() only knows [Entity.index.field].
    expect(staticDefault({ ...defn, afform_default: "[user_contact_id]" })).toBe(
      "[user_contact_id]",
    );
    expect(
      staticDefault({
        name: "x",
        input_type: "Text",
        data_type: "String",
        afform_default: "Hello",
      }),
    ).toBe("Hello");
    expect(staticDefault(undefined)).toBeUndefined();
  });
});

describe("replaceTokens", () => {
  // deviation:token-null-empty
  it("fills [Entity.index.field] tokens from the form data, unset ones empty", () => {
    const data = { Individual1: [{ fields: { first_name: "Ada", age: 36 } }] };
    expect(
      replaceTokens("[Individual1.0.first_name] ([Individual1.0.age]) [Individual1.0.x]", data),
    ).toBe("Ada (36) ");
    expect(
      replaceTokens("[Individual1.0.tags]", { Individual1: [{ fields: { tags: [1, null, 3] } }] }),
    ).toBe("1,,3");
    expect(replaceTokens("[Individual1.0.x]", { Individual1: [{ fields: { x: {} } }] })).toBe(
      "[object Object]",
    );
    // afForm writes "null" here; an emptied field adds nothing to a default.
    expect(replaceTokens("[Individual1.0.x]", { Individual1: [{ fields: { x: null } }] })).toBe("");
    expect(hasTokens("[Individual1.0.first_name]")).toBe(true);
    expect(hasTokens("[user_contact_id]")).toBe(false);
    expect(hasTokens(5)).toBe(false);
  });
});

describe("tokenValues and refersToItself", () => {
  it("reads each distinct token once and spots a default that refers to its own field", () => {
    const data = { Individual1: [{ fields: { first_name: "Ada" } }] };
    expect(
      tokenValues("[Individual1.0.first_name] [Individual1.0.first_name] [Individual1.0.x]", data),
    ).toEqual(["Ada", ""]);
    const scope = { entity: "Individual1", index: 0 };
    expect(refersToItself("[Individual1.0.nick_name]x", scope, "nick_name")).toBe(true);
    expect(refersToItself("[Individual1.0.first_name]", scope, "nick_name")).toBe(false);
    expect(refersToItself("[Individual1.0.email]", { ...scope, join: "Email" }, "email")).toBe(
      false,
    );
  });
});

describe("defaultValue", () => {
  it("types a default as afField's setValue() does", () => {
    const typed = (defn: Partial<FieldDefn>, value: unknown) =>
      defaultValue({ name: "x", input_type: "Text", data_type: "String", ...defn }, value);
    expect(typed({ data_type: "Integer" }, "42")).toBe(42);
    expect(typed({ data_type: "Float" }, ["1.5", null])).toEqual([1.5, null]);
    expect(typed({ data_type: "Boolean" }, "1")).toBe(true);
    expect(typed({ data_type: "Boolean" }, "true")).toBe(false);
    expect(typed({ input_type: "Number" }, "7")).toBe(7);
    expect(
      typed({ input_type: "Select", data_type: "Integer", input_attrs: { multiple: true } }, "1,2"),
    ).toEqual([1, 2]);
    expect(typed({ input_type: "CheckBox" }, "a,b")).toEqual(["a", "b"]);
    expect(typed({ input_type: "DisplayOnly", data_type: "Integer" }, "42")).toBe("42");
    expect(typed({}, "a,b")).toBe("a,b");
  });

  // deviation:current-user-multiple-default
  it("fills the current user and relative dates as afField's setValue() does", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 0, 30, 9, 5, 7));
    window.CRM.config = { cid: 7 };
    const contact = {
      name: "x",
      input_type: "EntityRef",
      data_type: "Integer",
      fk_entity: "Contact",
    };
    const date = { name: "x", input_type: "Date", data_type: "Date" };
    expect(defaultValue(contact, "user_contact_id")).toBe(7);
    const contacts = { ...contact, input_attrs: { multiple: true } };
    expect(defaultValue(contacts, "user_contact_id")).toEqual([7]);
    expect(defaultValue(date, "now")).toBe("2026-01-30");
    expect(defaultValue(date, "now +1 day")).toBe("2026-01-31");
    expect(defaultValue({ ...date, input_attrs: { time: true } }, "now -1 week")).toBe(
      "2026-01-23 09:05:07",
    );
    expect(defaultValue({ ...date, input_type: "Text" }, "now")).toBe("now");
    delete window.CRM.config;
    vi.useRealTimers();
  });
});

describe("initialiseData", () => {
  it("leaves out what a false or unreadable af-if hides", () => {
    const firstNameIs = (value: string) =>
      `(${JSON.stringify([["Individual1[0][fields][first_name]", "=", JSON.stringify(value)]])})`;
    const shownIf = (condition: string, child: ElementNode): ElementNode => ({
      "#tag": "div",
      "af-if": condition,
      "#children": [child],
    });
    const layout: ElementNode[] = [
      {
        "#tag": "fieldset",
        "af-fieldset": "Individual1",
        "#children": [
          field("first_name", { afform_default: "Ada" }),
          shownIf(firstNameIs("bob"), field("nick_name", { afform_default: "B" })),
          shownIf(firstNameIs("ada"), field("last_name", { afform_default: "L" })),
          shownIf("(nope)", field("job_title", { afform_default: "J" })),
        ],
      },
      shownIf(firstNameIs("bob"), {
        "#tag": "div",
        "af-fieldset": "Individual2",
        "#children": [field("source")],
      }),
    ];
    expect(initialiseData(layout, emptyData(["Individual1", "Individual2"]))).toEqual({
      Individual1: [{ fields: { first_name: "Ada", last_name: "L" }, joins: {} }],
      Individual2: [],
    });
  });

  // deviation:defaults-keep-loaded-values
  it("pads repeats, marks a primary record and fills defaults into empty fields only", () => {
    const layout: ElementNode[] = [
      {
        "#tag": "fieldset",
        "af-fieldset": "Individual1",
        "#children": [
          field("first_name", { afform_default: "Ada" }),
          field("last_name", { afform_default: "Default" }),
          {
            "#tag": "div",
            "af-join": "Email",
            "af-repeat": "Add",
            min: "2",
            "#children": [
              field("email"),
              field("is_primary"),
              field("location_type_id", { afform_default: 1 }),
            ],
          },
        ],
      },
    ];
    const start = { Individual1: [{ fields: { last_name: "Prefilled" }, joins: {} }] };
    const data = initialiseData(layout, start);
    expect(data.Individual1?.[0]?.fields).toEqual({ first_name: "Ada", last_name: "Prefilled" });
    expect(data.Individual1?.[0]?.joins?.Email).toEqual([
      { is_primary: true, location_type_id: 1 },
      { is_primary: false, location_type_id: 1 },
    ]);
  });

  it("pads a repeating fieldset and fills each item", () => {
    const layout: ElementNode[] = [
      {
        "#tag": "fieldset",
        "af-fieldset": "Individual1",
        "af-repeat": "Add",
        min: "2",
        "#children": [field("source", { afform_default: "Web" })],
      },
    ];
    expect(
      initialiseData(layout, emptyData(["Individual1"])).Individual1?.map((item) => item.fields),
    ).toEqual([{ source: "Web" }, { source: "Web" }]);
  });

  it("creates the item of an untouched fieldset, but none for a search filter fieldset", () => {
    const layout: ElementNode[] = [
      { "#tag": "fieldset", "af-fieldset": "Individual1", "#children": [field("source")] },
      { "#tag": "div", "af-fieldset": "", "#children": [field("first_name")] },
    ];
    expect(initialiseData(layout, emptyData(["Individual1"]))).toEqual({
      Individual1: [{ fields: {}, joins: {} }],
    });
  });

  it("writes a non-repeating join at its offset", () => {
    const layout: ElementNode[] = [
      {
        "#tag": "fieldset",
        "af-fieldset": "Individual1",
        "#children": [
          email(),
          {
            "#tag": "div",
            "af-join": "Email",
            "#children": [field("email", { afform_default: "second@example.org" })],
          },
        ],
      },
    ];
    expect(
      initialiseData(layout, emptyData(["Individual1"])).Individual1?.[0]?.joins?.Email?.[1],
    ).toEqual({ email: "second@example.org" });
  });
});

describe("routeValue", () => {
  const scope = { entity: "Individual1", index: 0 };
  it("takes the entity-prefixed name over the plain one", () => {
    const params = { "Individual1.first_name": "Ada", first_name: "Bob" };
    expect(routeValue(params, scope, "first_name")).toBe("Ada");
    expect(routeValue({ first_name: "Bob" }, scope, "first_name")).toBe("Bob");
    expect(routeValue({ "Individual2.first_name": "Ada" }, scope, "first_name")).toBeUndefined();
  });

  it("numbers later items n + 1 and names the join", () => {
    const params = { "Individual12.first_name": "Second", "Individual1.Email.email": "a@x.org" };
    expect(routeValue(params, { ...scope, index: 1 }, "first_name")).toBe("Second");
    expect(routeValue(params, scope, "first_name")).toBeUndefined();
    expect(routeValue(params, { ...scope, join: "Email", joinIndex: 1 }, "email")).toBe("a@x.org");
  });

  it("ignores inherited object properties", () => {
    expect(routeValue({}, scope, "constructor")).toBeUndefined();
  });
});

describe("initialiseData with route parameters", () => {
  const layout: ElementNode[] = [
    {
      "#tag": "fieldset",
      "af-fieldset": "Individual1",
      "af-repeat": "Add",
      min: "2",
      "#children": [
        field("first_name", { afform_default: "Default" }),
        field("last_name", { afform_default: "Default" }),
        field("age", { input_type: "Number", data_type: "Integer" }),
        field("tags", { input_type: "Hidden", serialize: 1 }),
        { "#tag": "div", "af-join": "Email", "#children": [field("email")] },
      ],
    },
    { "#tag": "div", "af-fieldset": "", "#children": [field("source")] },
  ];

  it("fills fields over their default, converted like a default", () => {
    const params = {
      first_name: "Url",
      "Individual12.last_name": "Second",
      age: "42",
      tags: "1,2",
      "Individual1.Email.email": "a@example.org",
      source: "ignored",
    };
    const data = initialiseData(layout, emptyData(["Individual1"]), params);
    expect(data.Individual1?.map((item) => item.fields)).toEqual([
      { first_name: "Url", last_name: "Default", age: 42, tags: ["1", "2"] },
      { first_name: "Url", last_name: "Second", age: 42, tags: ["1", "2"] },
    ]);
    expect(data.Individual1?.[0]?.joins?.Email).toEqual([{ email: "a@example.org" }]);
    expect(Object.keys(data)).toEqual(["Individual1"]);
  });

  it("leaves prefilled values alone", () => {
    const start = { Individual1: [{ fields: { first_name: "Prefilled", age: null }, joins: {} }] };
    const data = initialiseData(layout, start, { first_name: "Url", age: "3" });
    expect(data.Individual1?.[0]?.fields).toMatchObject({ first_name: "Prefilled", age: null });
  });
});
