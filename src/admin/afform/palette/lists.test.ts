import { nodeDefn } from "../fields";
import type { AfformDefinition, EditorMeta, SearchDisplayMeta } from "../meta";
import { textAttribute } from "../model";
import { CONTRIBUTIONS, META } from "../testMeta";
import { nodeAt, type ShallowElement, type ShallowNode } from "../tree";
import {
  elementItems,
  entityBlockInUse,
  entityBlockItems,
  entityContains,
  entityFieldGroups,
  entityFieldInUse,
  extraFieldItems,
  globalBlockItems,
  placementFilters,
  placementRequiresRoute,
  searchPalette,
  unreadableFilters,
  withPlacement,
  type PaletteItem,
} from "./lists";

const form = (children: ShallowNode[] = [], extra: Partial<AfformDefinition> = {}) => ({
  type: "form",
  title: "Test",
  name: "afformTest",
  layout: [{ "#tag": "af-form", ctrl: "afform", "#children": children }],
  ...extra,
});

const withBlocks = (blocks: EditorMeta["blocks"]): EditorMeta => ({
  ...META,
  blocks: { ...META.blocks, ...blocks },
});

const named = (name: string) => (node: ShallowElement) =>
  node["#tag"] === "af-field" && textAttribute(node, "name") === name;

const field = (name: string): ShallowElement => ({ "#tag": "af-field", name });

const emailJoin = (...children: ShallowNode[]): ShallowElement => ({
  "#tag": "div",
  "af-join": "Email",
  "#children": children,
});

/** Individual1 with a field, a block in a container and an email join; Individual2 beside it. */
const CANVAS: ShallowNode[] = [
  { "#tag": "af-entity", type: "Individual", name: "Individual1" },
  { "#tag": "af-entity", type: "Individual", name: "Individual2" },
  {
    "#tag": "fieldset",
    "af-fieldset": "Individual1",
    "#children": [
      field("first_name"),
      { "#tag": "div", class: "af-container", "#children": [{ "#tag": "afblock-name" }] },
      emailJoin(field("email")),
    ],
  },
  { "#tag": "fieldset", "af-fieldset": "Individual2", "#children": [field("gender_id")] },
];

describe("palette elements", () => {
  it("offers the elements of the form's type, the fieldset aside", () => {
    expect(elementItems(META, form(), "")).toEqual([
      {
        key: "element:submit",
        element: "submit",
        title: "Submit Button",
        node: {
          "#tag": "button",
          class: "af-button btn btn-primary",
          "crm-icon": "fa-check",
          "ng-click": "afform.submit()",
          "ng-if": "afform.showSubmitButton",
          "#children": [{ "#text": "Submit" }],
        },
      },
      {
        key: "element:pages",
        element: "pages",
        title: "Pages",
        node: {
          "#tag": "af-tabset",
          "page-nav-buttons": "1",
          "#children": [
            { "#tag": "af-tab", title: "Page 1", "#children": [] },
            { "#tag": "af-tab", title: "Page 2", "#children": [] },
          ],
        },
      },
    ]);
    expect(elementItems(META, { ...form(), type: "search" }, "").map((item) => item.key)).toEqual([
      "element:pages",
    ]);
  });

  it("finds elements by name or title", () => {
    expect(elementItems(META, form(), "button").map((item) => item.key)).toEqual([
      "element:submit",
    ]);
    expect(elementItems(META, form(), "pages").map((item) => item.key)).toEqual(["element:pages"]);
    expect(elementItems(META, form(), "fieldset")).toEqual([]);
  });

  it("offers blocks for any entity, joins and the form itself aside", () => {
    const meta = withBlocks({
      "afblock-any-email": {
        name: "afblockAnyEmail",
        title: "Any Email",
        directive_name: "afblock-any-email",
        entity_type: "*",
        join_entity: "Email",
      },
    });
    expect(globalBlockItems(meta, form(), "")).toEqual([
      {
        key: "block:afblock-notice",
        title: "Notice",
        node: { "#tag": "afblock-notice" },
        block: "afblock-notice",
      },
    ]);
    expect(globalBlockItems(meta, form([], { name: "afblockNotice" }), "")).toEqual([]);
    expect(globalBlockItems(meta, form(), "notice")).toHaveLength(1);
    expect(globalBlockItems(meta, form(), "name")).toEqual([]);
  });
});

describe("extra fields", () => {
  // deviation:extra-field-unique-name
  it("offers one per input type with a defn, numbered past the names on the form", () => {
    const afform = form([
      { "#tag": "af-field", defn: "{name: 'text1', input_type: 'Text'}" },
      { "#tag": "div", "#children": [{ "#tag": "af-field", defn: "{name: 'text2'}" }] },
    ]);
    const items = extraFieldItems(META, afform, "");
    expect(items.map((item) => item.key)).toEqual(["extra:Text", "extra:Select"]);
    expect(items[0]).toEqual({
      key: "extra:Text",
      title: "Text",
      node: {
        "#tag": "af-field",
        defn: "{data_type: 'String', label: 'Extra Text', input_type: 'Text', name: 'text3'}",
      },
      field: { name: "text3", label: "Extra Text", input_type: "Text" },
    });
    expect(nodeDefn(items[1]?.node ?? field(""))).toEqual({
      data_type: "String",
      options: [{ id: "1", label: "One" }],
      label: "Extra Select",
      input_type: "Select",
      name: "select1",
    });
  });

  it("are only for forms and follow the search", () => {
    expect(extraFieldItems(META, { ...form(), type: "block" }, "")).toEqual([]);
    expect(extraFieldItems(META, form(), "sel").map((item) => item.key)).toEqual(["extra:Select"]);
  });
});

describe("entityContains", () => {
  it("looks through the entity's fieldsets and containers, not into joins", () => {
    expect(entityContains(META, "Individual1", CANVAS, named("first_name"))).toBe(true);
    expect(entityContains(META, "Individual1", CANVAS, named("email"))).toBe(false);
  });

  it("skips other entities' fieldsets", () => {
    expect(entityContains(META, "Individual1", CANVAS, named("gender_id"))).toBe(false);
    expect(entityContains(META, "Individual2", CANVAS, named("gender_id"))).toBe(true);
    expect(entityContains(META, "Individual2", CANVAS, named("first_name"))).toBe(false);
  });

  it("looks into blocks' layouts", () => {
    expect(entityContains(META, "Individual1", CANVAS, named("last_name"))).toBe(true);
  });
});

describe("entityFieldInUse", () => {
  it("counts a field on the entity's part of the form or set as a value, its suffix ignored", () => {
    const inUse = (name: string, data: Record<string, unknown> = {}) =>
      entityFieldInUse(META, "Individual1", data, CANVAS, name, null);
    expect(inUse("first_name")).toBe(true);
    expect(inUse("last_name")).toBe(true);
    expect(inUse("gender_id:name")).toBe(false);
    expect(inUse("gender_id:name", { "gender_id:label": "Female" })).toBe(true);
    expect(inUse("email")).toBe(false);
  });

  it("counts a join's field only where every container of the join has it", () => {
    const inUse = (canvas: ShallowNode[], name: string) =>
      entityFieldInUse(META, "Individual1", {}, canvas, name, "Email");
    expect(inUse(CANVAS, "email")).toBe(true);
    expect(inUse(CANVAS, "location_type_id:name")).toBe(false);
    const fieldset = (...children: ShallowNode[]): ShallowNode => ({
      "#tag": "fieldset",
      "af-fieldset": "Individual1",
      "#children": children,
    });
    expect(inUse([fieldset(emailJoin(field("email")), emailJoin())], "email")).toBe(false);
    expect(inUse([fieldset(emailJoin({ "#tag": "afblock-email" }))], "email")).toBe(true);
    const other = { "#tag": "fieldset", "af-fieldset": "Individual2", "#children": [emailJoin()] };
    expect(inUse([fieldset(emailJoin(field("email"))), other], "email")).toBe(true);
  });
});

describe("entityBlockInUse", () => {
  const [nameBlock, emailBlock] = entityBlockItems(META, form(), "Individual", "");

  it("counts a block whose fields are on the entity's part of the form", () => {
    if (!nameBlock) throw new Error("No name block.");
    expect(entityBlockInUse(META, "Individual1", CANVAS, nameBlock.node)).toBe(true);
    expect(entityBlockInUse(META, "Individual2", CANVAS, nameBlock.node)).toBe(false);
  });

  it("counts a join block by its join, unless that join is for one location type", () => {
    if (!emailBlock) throw new Error("No email block.");
    expect(entityBlockInUse(META, "Individual1", CANVAS, emailBlock.node)).toBe(true);
    expect(entityBlockInUse(META, "Individual2", CANVAS, emailBlock.node)).toBe(false);
    const located = [
      {
        "#tag": "fieldset",
        "af-fieldset": "Individual1",
        "#children": [{ ...emailJoin(), data: "{location_type_id: 1}" }],
      },
    ];
    expect(entityBlockInUse(META, "Individual1", located, emailBlock.node)).toBe(false);
  });

  it("never counts a block without fields", () => {
    const canvas = [
      {
        "#tag": "fieldset",
        "af-fieldset": "Individual1",
        "#children": [{ "#tag": "afblock-notice" }],
      },
    ];
    expect(entityBlockInUse(META, "Individual1", canvas, { "#tag": "afblock-notice" })).toBe(false);
  });
});

describe("entityBlockItems", () => {
  it("offers the entity type's blocks, a join's wrapped in its repeat container", () => {
    expect(entityBlockItems(META, form(), "Individual", "")).toEqual([
      {
        key: "block:afblock-name",
        title: "Name",
        node: { "#tag": "afblock-name" },
        block: "afblock-name",
      },
      {
        key: "block:afblock-email",
        block: "afblock-email",
        title: "Email Block",
        node: {
          "#tag": "div",
          "af-join": "Email",
          "af-repeat": "Add",
          "af-copy": "Copy",
          min: "1",
          "#children": [{ "#tag": "afblock-email" }],
        },
      },
      {
        key: "block:afblock-phone",
        block: "afblock-phone",
        title: "Phone Block",
        node: {
          "#tag": "div",
          "af-join": "Phone",
          "af-repeat": "Add",
          "af-copy": "Copy",
          min: "1",
          max: "3",
          "#children": [{ "#tag": "afblock-phone" }],
        },
      },
      {
        key: "block:afblock-address",
        block: "afblock-address",
        title: "Address Block",
        node: { "#tag": "div", "af-join": "Address", "#children": [{ "#tag": "afblock-address" }] },
      },
    ]);
  });

  it("matches contact blocks to each contact type, not to other entities", () => {
    const meta = withBlocks({
      "afblock-org": {
        name: "afblockOrg",
        title: "Organization",
        directive_name: "afblock-org",
        entity_type: "Organization",
      },
      "afblock-unknown-join": {
        name: "afblockUnknownJoin",
        title: "Unknown Join",
        directive_name: "afblock-unknown-join",
        entity_type: "Contact",
        join_entity: "Website",
      },
    });
    const keys = (type: string, afform = form()) =>
      entityBlockItems(meta, afform, type, "").map((item) => item.key);
    expect(keys("Organization")).toEqual([
      "block:afblock-name",
      "block:afblock-email",
      "block:afblock-phone",
      "block:afblock-address",
      "block:afblock-org",
    ]);
    expect(keys("Contribution")).toEqual([]);
    expect(keys("Individual", form([], { name: "afblockName" }))).not.toContain(
      "block:afblock-name",
    );
    expect(entityBlockItems(meta, form(), "Individual", "phone")).toHaveLength(1);
  });
});

/** The entries without the field each carries, which the tests check by name. */
const withoutFields = <T extends { items: PaletteItem[] }>(group: T) => ({
  ...group,
  items: group.items.map(({ key, title, node }) => ({ key, title, node })),
});

describe("entityFieldGroups", () => {
  it("lists the entity's fields, then each join placed in its fieldsets", () => {
    const groups = entityFieldGroups(META, "Individual1", "Individual", CANVAS, "");
    for (const item of groups.flatMap((group) => group.items))
      expect(item.key.endsWith(`:${item.field?.name ?? "?"}`)).toBe(true);
    expect(groups.map(withoutFields)).toEqual([
      {
        entityName: "Individual1",
        entityType: "Individual",
        afJoin: null,
        label: "Individual Fields",
        items: [
          {
            key: "Individual1:first_name",
            title: "First Name",
            node: { "#tag": "af-field", name: "first_name" },
          },
          {
            key: "Individual1:last_name",
            title: "Last Name",
            node: { "#tag": "af-field", name: "last_name" },
          },
          {
            key: "Individual1:gender_id",
            title: "Gender",
            node: { "#tag": "af-field", name: "gender_id:name" },
          },
        ],
      },
      {
        entityName: "Individual1-join-Email",
        entityType: "Email",
        afJoin: "Email",
        label: "Email Fields",
        items: [
          {
            key: "Individual1-join-Email:email",
            title: "Email",
            node: { "#tag": "af-field", name: "email" },
          },
          {
            key: "Individual1-join-Email:location_type_id",
            title: "Location Type",
            node: { "#tag": "af-field", name: "location_type_id:name" },
          },
        ],
      },
    ]);
  });

  it("leaves out joins of other entities and fields the search does not match", () => {
    const groups = entityFieldGroups(META, "Individual2", "Individual", CANVAS, "");
    expect(groups.map((group) => group.entityName)).toEqual(["Individual2"]);
    const found = entityFieldGroups(META, "Individual1", "Individual", CANVAS, "name");
    expect(found.map((group) => group.items.map((item) => item.key))).toEqual([
      ["Individual1:first_name", "Individual1:last_name"],
      [],
    ]);
    expect(() => entityFieldGroups(META, "Event1", "Event", CANVAS, "")).toThrow(
      "No metadata for entity Event.",
    );
  });
});

describe("searchPalette", () => {
  it("makes filter fields multi-selects or date ranges, with the join's prefix", () => {
    const palette = searchPalette(META, CONTRIBUTIONS, "");
    for (const item of [...palette.calculated, ...palette.groups.flatMap((group) => group.items)])
      expect(item.key.endsWith(`:${item.field?.name ?? "?"}`)).toBe(true);
    expect(withoutFields({ items: palette.calculated }).items).toEqual([
      {
        key: ":GROUP_COUNT_id",
        title: "Count",
        node: { "#tag": "af-field", name: "GROUP_COUNT_id" },
      },
    ]);
    expect(palette.groups.map(withoutFields)).toEqual([
      {
        entityName: "",
        entityType: "Contribution",
        afJoin: null,
        label: "Contribution Fields",
        items: [
          {
            key: ":contact_id",
            title: "Contact",
            node: { "#tag": "af-field", name: "contact_id" },
          },
          {
            key: ":financial_type_id",
            title: "Financial Type",
            node: {
              "#tag": "af-field",
              name: "financial_type_id:name",
              defn: "{input_attrs: {multiple: true}}",
            },
          },
          {
            key: ":receive_date",
            title: "Date Received",
            node: {
              "#tag": "af-field",
              name: "receive_date",
              defn: "{input_type: 'Select', search_range: true}",
            },
          },
          {
            key: ":contribution_status_id",
            title: "Status",
            node: {
              "#tag": "af-field",
              name: "contribution_status_id",
              defn: "{input_type: 'Select', input_attrs: {multiple: true}}",
            },
          },
        ],
      },
      {
        entityName: "",
        entityType: "Email",
        afJoin: null,
        label: "Donor Email Fields",
        items: [
          {
            key: "email.:email",
            title: "Email",
            node: { "#tag": "af-field", name: "email.email" },
          },
          {
            key: "email.:location_type_id",
            title: "Location Type",
            node: {
              "#tag": "af-field",
              name: "email.location_type_id:name",
              defn: "{input_attrs: {multiple: true}}",
            },
          },
        ],
      },
    ]);
    expect(palette.blocks.map((item) => item.key)).toEqual(
      Object.keys(META.blocks).map((directive) => `block:${directive}`),
    );
  });

  it("filters calculated fields, fields and blocks by the search", () => {
    const palette = searchPalette(META, CONTRIBUTIONS, "email");
    expect(palette.calculated).toEqual([]);
    expect(palette.groups.map((group) => group.items.map((item) => item.key))).toEqual([
      [],
      ["email.:email"],
    ]);
    expect(palette.blocks.map((item) => item.key)).toEqual(["block:afblock-email"]);
  });
});

describe("placements", () => {
  const SEARCH: AfformDefinition = {
    type: "search",
    title: "Contributions",
    layout: [
      {
        "#tag": "div",
        "af-fieldset": "",
        "#children": [
          {
            "#tag": "crm-search-display-table",
            "search-name": "contributions",
            "display-name": "table",
            filters: "{financial_type_id: 1}",
          },
        ],
      },
    ],
  };
  const displayFilters = (afform: AfformDefinition) => {
    const node = nodeAt(afform.layout, [0, 0]);
    return node && "#tag" in node ? textAttribute(node, "filters") : undefined;
  };
  const placed = (placement: string[]) => ({ ...SEARCH, placement });
  const withLayout = (afform: AfformDefinition, filters: string): AfformDefinition => ({
    ...afform,
    layout: [
      {
        "#tag": "div",
        "af-fieldset": "",
        "#children": [
          {
            "#tag": "crm-search-display-table",
            "search-name": "contributions",
            "display-name": "table",
            filters,
          },
        ],
      },
    ],
  });

  it("names the last chosen placement that needs a route", () => {
    expect(placementRequiresRoute(META, SEARCH)).toBeNull();
    expect(placementRequiresRoute(META, placed(["dashboard_dashlet"]))).toBeNull();
    expect(placementRequiresRoute(META, placed(["contact_summary_tab"]))).toBe(
      "Contact Summary Tab",
    );
    expect(
      placementRequiresRoute(META, placed(["contact_summary_tab", "event_manage_tab", "x"])),
    ).toBe("Manage Event Tab");
  });

  // deviation:placement-filter-once
  it("filters a display by the placement's entity on its reference field or id", () => {
    const tab = placed(["contact_summary_tab"]);
    expect(placementFilters(META, tab, CONTRIBUTIONS, undefined)).toBe(
      "{contact_id: options.contact_id}",
    );
    expect(placementFilters(META, tab, CONTRIBUTIONS, "{contact_id: options.contact_id}")).toBe(
      "{contact_id: options.contact_id}",
    );
    const contacts: SearchDisplayMeta = {
      ...CONTRIBUTIONS,
      "saved_search_id.api_entity": "Contact",
      "saved_search_id.api_params": {},
    };
    expect(placementFilters(META, tab, contacts, undefined)).toBe("{id: options.contact_id}");
  });

  it("drops the filters of placements no longer chosen and keeps the others", () => {
    expect(
      placementFilters(
        META,
        placed(["event_manage_tab"]),
        CONTRIBUTIONS,
        "{contact_id: options.contact_id, financial_type_id: 1, campaign_id: options.campaign}",
      ),
    ).toBe("{financial_type_id: 1, campaign_id: options.campaign}");
    expect(
      placementFilters(META, placed([]), CONTRIBUTIONS, "{contact_id: options.contact_id}"),
    ).toBeNull();
  });

  // deviation:placement-filters-emptied
  it("keeps placement_filters while a placement has entities and empties them after", () => {
    const tab = withPlacement(SEARCH, META, ["contact_summary_tab"]);
    expect(tab.placement).toEqual(["contact_summary_tab"]);
    expect(tab.placement_filters).toEqual({});
    expect(displayFilters(tab)).toBe("{financial_type_id: 1, contact_id: options.contact_id}");
    expect(
      withPlacement({ ...SEARCH, placement_filters: { Contact: "Individual" } }, META, [
        "contact_summary_tab",
      ]).placement_filters,
    ).toEqual({ Contact: "Individual" });
    const dashlet = withPlacement(
      { ...tab, placement_filters: { contact_type: ["Individual"] } },
      META,
      ["dashboard_dashlet"],
    );
    // Left out, Afform.save would keep the stored filters.
    expect(dashlet.placement_filters).toEqual({});
    expect(displayFilters(dashlet)).toBe("{financial_type_id: 1}");
  });

  it("names the displays whose filters cannot be read, so the placement is not changed under them", () => {
    expect(unreadableFilters(SEARCH, META)).toEqual([]);
    const odd = withLayout(SEARCH, "{contact_id: user_contact_id}");
    expect(unreadableFilters(odd, META).map((display) => display.key)).toEqual([
      "contributions.table",
    ]);
  });

  it("removes a display's filters once none are left", () => {
    const bare = withPlacement(
      {
        ...SEARCH,
        layout: [
          {
            "#tag": "div",
            "af-fieldset": "",
            "#children": [
              {
                "#tag": "crm-search-display-table",
                "search-name": "contributions",
                "display-name": "table",
                filters: "{contact_id: options.contact_id}",
              },
            ],
          },
        ],
      },
      META,
      [],
    );
    expect(nodeAt(bare.layout, [0, 0])).toEqual({
      "#tag": "crm-search-display-table",
      "search-name": "contributions",
      "display-name": "table",
    });
  });

  it("only sets the placement of a form", () => {
    const afform = form([], { placement_filters: { x: 1 } });
    expect(withPlacement(afform, META, ["contact_summary_tab"])).toEqual({
      ...afform,
      placement: ["contact_summary_tab"],
    });
  });
});
