import {
  entityReferences,
  addEntity,
  backfillEntities,
  canvasPath,
  entityDefaults,
  initialForm,
  newEntityName,
  removeEntity,
  retitle,
  savePayload,
  toShallow,
} from "./model";
import type { AdminData } from "./meta";
import { GUI, META, SUBMIT, TYPES } from "./testMeta";
import type { ShallowNode } from "./tree";

/** The server's shallow output drops empty children; the HTML it writes is the same. */
const tidy = (nodes: ShallowNode[]): ShallowNode[] =>
  nodes.map((node) => {
    if (!("#tag" in node)) return node;
    const { "#children": children, ...rest } = node;
    return children?.length ? { ...rest, "#children": tidy(children) } : rest;
  });

const NEW_FORM: AdminData = {
  definition: {
    type: "form",
    title: "",
    permission: ["access CiviCRM"],
    layout: [{ "#tag": "af-form", ctrl: "afform", "#children": [] }],
  },
};

describe("FormBuilder model", () => {
  it("writes core's elements as the server writes them", () => {
    // Afform.convert's deep-to-shallow output for the same elements.
    expect(
      tidy([SUBMIT, GUI.elements.pages?.element ?? SUBMIT].map((node) => toShallow(TYPES, node))),
    ).toEqual([
      {
        "#tag": "button",
        class: "af-button btn btn-primary",
        "crm-icon": "fa-check",
        "ng-click": "afform.submit()",
        "ng-if": "afform.showSubmitButton",
        "#children": [{ "#text": "Submit" }],
      },
      {
        "#tag": "af-tabset",
        "page-nav-buttons": "1",
        "#children": [
          { "#tag": "af-tab", title: "Page 1" },
          { "#tag": "af-tab", title: "Page 2" },
        ],
      },
    ]);
  });

  it("opens a new form with its entity, fieldset and submit button", () => {
    const afform = initialForm(NEW_FORM, META, "create", "Contribution");
    expect(afform).toMatchObject({
      icon: "fa-list-alt",
      placement: [],
      placement_filters: {},
      permission_operator: "AND",
      confirmation_type: "show_confirmation_message",
      submit_enabled: true,
      create_submission: true,
    });
    expect(tidy(afform.layout)).toEqual([
      {
        "#tag": "af-form",
        ctrl: "afform",
        "#children": [
          {
            "#tag": "af-entity",
            data: "{contact_id: 'user_contact_id', financial_type_id: 1}",
            actions: "{create: true, update: false}",
            type: "Contribution",
            name: "Contribution1",
            label: "Contribution 1",
            security: "RBAC",
          },
          {
            "#tag": "fieldset",
            "af-fieldset": "Contribution1",
            class: "af-container",
            "af-title": "Contribution 1",
            "#children": [
              {
                "#tag": "af-field",
                name: "default_contribution_amount.contribution_amount",
                defn: "{label: 'Contribution Amount'}",
              },
              { "#tag": "af-field", name: "source" },
            ],
          },
          toShallow(TYPES, SUBMIT),
        ],
      },
    ]);
  });

  it("numbers entities, takes the title into the defaults and adds behaviors' default modes", () => {
    let afform = { ...initialForm(NEW_FORM, META, "edit"), title: "My form" };
    afform = addEntity(afform, META, "Individual").afform;
    const second = addEntity(afform, META, "Individual");
    expect(second.name).toBe("Individual2");
    const relationship = addEntity(second.afform, META, "Relationship").afform;
    const children = tidy(relationship.layout)[0];
    expect(children && "#children" in children ? children["#children"] : []).toEqual([
      expect.objectContaining({ name: "Individual1", data: "{source: 'My form'}" }),
      expect.objectContaining({ name: "Individual2" }),
      {
        "#tag": "af-entity",
        security: "FBAC",
        type: "Relationship",
        name: "Relationship1",
        label: "Relationship 1",
        actions: "{create: true, update: true}",
        dedupe: "ignore",
      },
      expect.objectContaining({ "af-fieldset": "Individual1" }),
      expect.objectContaining({ "af-fieldset": "Individual2" }),
    ]);
    const removed = removeEntity(relationship, "Individual1");
    expect(JSON.stringify(removed.layout)).not.toContain("Individual1");
    expect(canvasPath(removed)).toEqual([0]);
  });

  it("refuses defaults it cannot evaluate", () => {
    expect(() =>
      entityDefaults({ entity: "X", label: "X", defaults: "{a: window.x}" }, NEW_FORM.definition),
    ).toThrow('Cannot evaluate "window.x"');
  });

  it("clones without name, route and navigation, and backfills older entities", () => {
    const afform = initialForm(
      {
        definition: {
          type: "form",
          name: "afformX",
          title: "X",
          server_route: "civicrm/x",
          navigation: { parent: null, label: "X", weight: 0 },
          placement_filters: [],
          layout: [
            {
              "#tag": "af-form",
              "#children": [{ "#tag": "af-entity", name: "Individual1", type: "Individual" }],
            },
          ],
        },
      },
      META,
      "clone",
    );
    expect(afform.name).toBeUndefined();
    expect(afform.server_route).toBeUndefined();
    expect(afform.navigation).toBeUndefined();
    expect(afform.title).toBe("X (copy)");
    expect(afform.placement_filters).toEqual({});
    expect(JSON.stringify(afform.layout)).toContain('"actions":"{create: true, update: true}"');
  });

  // deviation:placement-filters-list
  it("keeps placement filters stored as a filled list, which only an empty list is not", () => {
    const filters = [{ contact_type: "Organization" }];
    const open = (placement_filters: unknown[]) =>
      initialForm(
        { definition: { type: "search", title: "X", layout: [], placement_filters } },
        META,
        "edit",
      ).placement_filters;
    expect(open(filters)).toEqual(filters);
    expect(open([])).toEqual({});
  });

  it("lets data.source follow the title it equals", () => {
    const afform = {
      ...NEW_FORM.definition,
      title: "Old",
      layout: [
        { "#tag": "af-entity", name: "A", data: "{source: 'Old', x: ts('Y')}" },
        { "#tag": "af-entity", name: "B", data: "{source: 'Other'}" },
      ],
    };
    expect(retitle(afform, "New").layout).toEqual([
      { "#tag": "af-entity", name: "A", data: "{source: 'New', x: ts('Y')}" },
      { "#tag": "af-entity", name: "B", data: "{source: 'Other'}" },
    ]);
  });

  it("saves the route as '' and a submission where processing needs one", () => {
    expect(
      savePayload({
        ...NEW_FORM.definition,
        server_route: null,
        manual_processing: true,
        create_submission: false,
      }),
    ).toMatchObject({ server_route: "", create_submission: true });
  });

  it("names a new entity by its type and the first free number", () => {
    const afform = {
      ...NEW_FORM.definition,
      layout: [
        {
          "#tag": "af-form",
          "#children": [
            { "#tag": "af-entity", type: "Individual", name: "Individual1" },
            {
              "#tag": "div",
              "#children": [{ "#tag": "af-entity", type: "Individual", name: "Individual3" }],
            },
            { "#tag": "fieldset", "af-fieldset": "Individual2" },
          ],
        },
      ],
    };
    expect(newEntityName(afform, "Individual")).toBe("Individual2");
    expect(newEntityName(afform, "Contribution")).toBe("Contribution1");
  });

  it("backfills actions and security of every entity on the canvas, keeping set ones", () => {
    const afform = backfillEntities({
      ...NEW_FORM.definition,
      layout: [
        {
          "#tag": "af-form",
          ctrl: "afform",
          "#children": [
            { "#tag": "af-entity", name: "A" },
            {
              "#tag": "div",
              "#children": [
                { "#tag": "af-entity", name: "B", actions: "{create: false}", security: "FBAC" },
              ],
            },
            { "#tag": "af-field", name: "source" },
          ],
        },
      ],
    });
    expect(afform.layout).toEqual([
      {
        "#tag": "af-form",
        ctrl: "afform",
        "#children": [
          {
            "#tag": "af-entity",
            name: "A",
            actions: "{create: true, update: true}",
            security: "RBAC",
          },
          {
            "#tag": "div",
            "#children": [
              { "#tag": "af-entity", name: "B", actions: "{create: false}", security: "FBAC" },
            ],
          },
          { "#tag": "af-field", name: "source" },
        ],
      },
    ]);
    expect(() => backfillEntities({ ...NEW_FORM.definition, layout: [] })).toThrow(
      "This form has no af-form element, so the builder cannot edit it.",
    );
  });

  // deviation:form-without-af-form
  it("refuses a form without af-form with a message instead of drawing it", () => {
    expect(() =>
      canvasPath({ ...NEW_FORM.definition, layout: [{ "#tag": "crm-monaco" }] }),
    ).toThrow("This form has no af-form element, so the builder cannot edit it.");
    expect(canvasPath({ ...NEW_FORM.definition, type: "block", layout: [] })).toEqual([]);
  });
});

// deviation:remove-entity-references
describe("entityReferences", () => {
  const layout = (children: ShallowNode[]) => ({
    type: "form",
    title: "Probe",
    layout: [{ "#tag": "af-form", ctrl: "afform", "#children": children }],
  });
  const individual2 = [
    { "#tag": "af-entity", type: "Individual", name: "Individual2" },
    { "#tag": "fieldset", "af-fieldset": "Individual2", "#children": [] },
  ];

  it("lists entity data, conditions and tokens that name the entity", () => {
    const afform = layout([
      ...individual2,
      {
        "#tag": "af-entity",
        type: "Activity",
        name: "Activity1",
        data: "{source_contact_id: 'Individual2'}",
      },
      {
        "#tag": "fieldset",
        "af-fieldset": "Activity1",
        "#children": [
          { "#tag": "div", "af-if": '[["Individual2.0.first_name","=","A"]]', "#children": [] },
          { "#tag": "p", "#children": [{ "#text": "Hello [Individual2.0.first_name]" }] },
        ],
      },
    ]);
    expect(entityReferences(afform, "Individual2")).toEqual([
      "af-entity Activity1 data",
      "div af-if",
      "text",
    ]);
  });

  it("finds nothing once only the entity's own elements name it", () => {
    const afform = layout([
      ...individual2,
      {
        "#tag": "af-entity",
        type: "Individual",
        name: "Individual20",
        data: "{x: 'Individual20'}",
      },
    ]);
    expect(entityReferences(afform, "Individual2")).toEqual([]);
  });
});
