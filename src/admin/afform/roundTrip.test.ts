import { describe, expect, it } from "vitest";
import { formRoundTrip } from "./roundTrip";

const entity = { "#tag": "af-entity", name: "Individual1", type: "Individual" };
const join = { "#tag": "div", "af-join": "Email" };
const block = { "#tag": "afblock-name-individual" };
const stored = {
  name: "afformProbe",
  type: "form",
  title: "Probe",
  icon: null,
  placement: [],
  placement_filters: [],
  permission_operator: null,
  confirmation_type: null,
  server_route: null,
  manual_processing: true,
  create_submission: false,
  layout: [{ "#tag": "af-form", ctrl: "afform", "#children": [entity, join, block] }],
};
const CONTEXT = {
  blocks: ["afblock-name-individual"],
  confirmationType: "show_confirmation_message",
};

describe("formRoundTrip", () => {
  it("finds nothing but core's own fill-ins in an unedited form", () => {
    const sent = {
      ...stored,
      icon: "fa-list-alt",
      placement_filters: {},
      permission_operator: "AND",
      confirmation_type: "show_confirmation_message",
      server_route: "",
      create_submission: true,
      layout: [
        {
          "#tag": "af-form",
          ctrl: "afform",
          "#children": [
            {
              ...entity,
              actions: "{create: true, update: true}",
              security: "RBAC",
            },
            { ...join, actions: "{update: true, delete: true}" },
            { ...block, actions: "{update: true, delete: true}" },
          ],
        },
      ],
    };
    expect(formRoundTrip(stored, sent, CONTEXT)).toEqual({
      differs: [],
      expected: [
        "icon",
        "placement_filters",
        "permission_operator",
        "confirmation_type",
        "server_route",
        "create_submission",
        "layout.0.#children.0.actions",
        "layout.0.#children.0.security",
        "layout.0.#children.1.actions",
        "layout.0.#children.2.actions",
      ],
    });
  });

  it("names a changed attribute, a filled-in key that was set, and backfills off their nodes", () => {
    const set = {
      ...stored,
      icon: "fa-star",
      layout: [{ ...stored.layout[0], "#children": [] }],
    };
    const sent = {
      ...set,
      icon: "fa-list-alt",
      layout: [
        {
          ...set.layout[0],
          actions: "{create: true}",
          "#children": [{ ...join, security: "RBAC" }],
        },
      ],
    };
    const withJoin = {
      ...set,
      layout: [{ ...set.layout[0], "#children": [join] }],
    };
    expect(formRoundTrip(withJoin, sent, CONTEXT).differs).toEqual([
      "icon",
      "layout.0.#children.0.security",
      "layout.0.actions",
    ]);
  });

  it("names a fill-in with a value core's editor does not set", () => {
    const sent = {
      ...stored,
      icon: "fa-star",
      server_route: "civicrm/x",
      layout: [
        {
          "#tag": "af-form",
          ctrl: "afform",
          "#children": [
            { ...entity, actions: "{create: false}", security: "FBAC" },
            { ...join, actions: "{update: false}" },
            block,
          ],
        },
      ],
    };
    expect(formRoundTrip(stored, sent, CONTEXT).differs).toEqual([
      "icon",
      "server_route",
      "layout.0.#children.0.actions",
      "layout.0.#children.0.security",
      "layout.0.#children.1.actions",
    ]);
  });

  it("names an entity's backfill on a form type core does not backfill", () => {
    const blockForm = { ...stored, type: "block" };
    const sent = {
      ...blockForm,
      layout: [
        {
          ...stored.layout[0],
          "#children": [{ ...entity, actions: "{create: true, update: true}" }, join, block],
        },
      ],
    };
    expect(formRoundTrip(blockForm, sent, CONTEXT).differs).toContain(
      "layout.0.#children.0.actions",
    );
  });

  it("names a node whose attributes would be written in another order", () => {
    const sent = {
      ...stored,
      layout: [{ ctrl: "afform", "#tag": "af-form", "#children": [entity, join, block] }],
    };
    expect(formRoundTrip(stored, sent, CONTEXT).differs).toEqual(["layout.0 order"]);
  });
});
