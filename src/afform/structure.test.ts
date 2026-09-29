import { emptyData } from "./model";
import { initialiseData, joinOffsets, repeatMinimum, staticDefault } from "./structure";
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
});

describe("staticDefault", () => {
  it("skips token defaults, which Angular calculates live", () => {
    expect(
      staticDefault({
        name: "x",
        input_type: "Text",
        data_type: "String",
        afform_default: "[user_contact_id]",
      }),
    ).toBeUndefined();
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

describe("initialiseData", () => {
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
