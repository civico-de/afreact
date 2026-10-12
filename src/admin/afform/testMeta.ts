import type { DeepNode, EditorMeta, GuiEditorSettings, SearchDisplayMeta } from "./meta";

/** Editor metadata for the FormBuilder's unit tests, shaped as core's settings and loadAdminData. */
export const TYPES = {
  "af-entity": { data: "js", actions: "js" },
  "af-field": { defn: "js" },
  "*": { "*": "text" },
};

export const SUBMIT: DeepNode = {
  "#tag": "button",
  class: "af-button btn btn-primary",
  "crm-icon": "fa-check",
  "ng-click": "afform.submit()",
  "ng-if": "afform.showSubmitButton",
  "#children": [{ "#text": "Submit" }],
};

const LOCATION_TYPES = [
  { id: 1, name: "Home", label: "Home" },
  { id: 2, name: "Work", label: "Work" },
];

export const GUI: GuiEditorSettings = {
  entities: {
    Individual: {
      entity: "Individual",
      label: "Individual",
      icon: "fa-user",
      defaults: "{\n    data: {\n      source: afform.title\n    }\n  }",
      boilerplate: [
        { "#tag": "af-field", name: "first_name" },
        { "#tag": "af-field", name: "last_name" },
      ],
      fields: {
        first_name: { name: "first_name", label: "First Name", input_type: "Text" },
        last_name: { name: "last_name", label: "Last Name", input_type: "Text" },
        gender_id: {
          name: "gender_id",
          label: "Gender",
          input_type: "Radio",
          options: [
            { id: 1, name: "Female", label: "Female" },
            { id: 2, name: "Male", label: "Male" },
          ],
          suffixes: ["name", "label"],
        },
      },
    },
    Contribution: {
      entity: "Contribution",
      label: "Contribution",
      defaults:
        "{\n    data: {\n      contact_id: 'user_contact_id',\n      financial_type_id: 1\n    },\n    actions: {\n      create: true,\n      update: false,\n    }\n  }",
      boilerplate: [
        {
          "#tag": "af-field",
          name: "default_contribution_amount.contribution_amount",
          defn: { label: "Contribution Amount" },
        },
        { "#tag": "af-field", name: "source" },
      ],
      fields: {
        contact_id: {
          name: "contact_id",
          label: "Contact",
          input_type: "EntityRef",
          fk_entity: "Contact",
        },
        financial_type_id: {
          name: "financial_type_id",
          label: "Financial Type",
          input_type: "Select",
          options: [{ id: 1, name: "Donation", label: "Donation" }],
          suffixes: ["name", "label"],
        },
        receive_date: { name: "receive_date", label: "Date Received", input_type: "Date" },
        contribution_status_id: {
          name: "contribution_status_id",
          label: "Status",
          input_type: "Radio",
          options: [{ id: 1, label: "Completed" }],
        },
      },
    },
    Relationship: {
      entity: "Relationship",
      label: "Relationship",
      defaults: "{\n    security: 'FBAC'\n  }",
      boilerplate: false,
    },
    Email: {
      entity: "Email",
      label: "Email",
      repeat_max: "",
      fields: {
        email: { name: "email", label: "Email", input_type: "Email" },
        location_type_id: {
          name: "location_type_id",
          label: "Location Type",
          input_type: "Select",
          options: LOCATION_TYPES,
          suffixes: ["name", "label"],
        },
      },
    },
    Phone: {
      entity: "Phone",
      label: "Phone",
      repeat_max: 3,
      fields: { phone: { name: "phone", label: "Phone", input_type: "Text" } },
    },
    Address: {
      entity: "Address",
      label: "Address",
      repeat_max: 1,
      fields: { city: { name: "city", label: "City", input_type: "Text" } },
    },
  },
  elements: {
    submit: { title: "Submit Button", afform_type: ["form"], element: SUBMIT },
    fieldset: {
      title: "Fieldset",
      element: {
        "#tag": "fieldset",
        "af-fieldset": null,
        class: "af-container",
        "af-title": "Enter title",
        "#children": [],
      },
    },
    pages: {
      title: "Pages",
      element: {
        "#tag": "af-tabset",
        "#children": [
          { "#tag": "af-tab", title: "Page 1", "#children": [] },
          { "#tag": "af-tab", title: "Page 2", "#children": [] },
        ],
        "page-nav-buttons": true,
      },
    },
  },
  styles: {},
  permissions: [],
  dateRanges: [],
  searchDisplayTags: ["crm-search-display-table"],
  inputTypes: [
    { name: "Text", label: "Text", extra_defn: { data_type: "String" } },
    {
      name: "Select",
      label: "Select",
      extra_defn: { data_type: "String", options: [{ id: "1", label: "One" }] },
    },
    { name: "ChainSelect", label: "Chain-Select" },
  ],
};

/** A table of contributions, joined to their contact's email. */
export const CONTRIBUTIONS: SearchDisplayMeta = {
  name: "table",
  label: "Contributions Table",
  "saved_search_id.name": "contributions",
  "saved_search_id.api_entity": "Contribution",
  "saved_search_id.api_params": { join: [["Email AS email", "LEFT"]] },
  "saved_search_id.form_values": { join: { email: "Donor Email" } },
  calc_fields: [{ name: "GROUP_COUNT_id", label: "Count" }],
};

export const META: EditorMeta = {
  gui: GUI,
  admin: {
    afform_fields: {
      confirmation_type: {
        name: "confirmation_type",
        options: [{ id: "show_confirmation_message", label: "Message" }],
      },
    },
    afform_placement: [
      { id: "dashboard_dashlet", text: "Dashboard Dashlet" },
      {
        id: "contact_summary_tab",
        text: "Contact Summary Tab",
        grouping: "Contact Summary",
        filter: true,
      },
      { id: "event_manage_tab", text: "Manage Event Tab", grouping: "Event", filter: true },
    ],
    afform_container_style: [],
    field_styles: [],
    placement_entities: {
      contact_summary_tab: { contact_id: "Contact" },
      event_manage_tab: { event_id: "Event" },
    },
    placement_filters: {
      Contact: {
        name: "contact_type",
        label: "Contact Type",
        options: [{ id: "Individual", text: "Individual" }],
      },
    },
    search_operators: {},
    locales: [],
  },
  types: TYPES,
  blocks: {
    "afblock-name": {
      name: "afblockName",
      title: "Name",
      directive_name: "afblock-name",
      entity_type: "Contact",
      layout: [
        { "#tag": "af-field", name: "first_name" },
        { "#tag": "af-field", name: "last_name" },
      ],
    },
    "afblock-email": {
      name: "afblockEmail",
      title: "Email Block",
      directive_name: "afblock-email",
      entity_type: "Contact",
      join_entity: "Email",
      layout: [{ "#tag": "af-field", name: "email" }],
    },
    "afblock-phone": {
      name: "afblockPhone",
      title: "Phone Block",
      directive_name: "afblock-phone",
      entity_type: "Contact",
      join_entity: "Phone",
      layout: [{ "#tag": "af-field", name: "phone" }],
    },
    "afblock-address": {
      name: "afblockAddress",
      title: "Address Block",
      directive_name: "afblock-address",
      entity_type: "Contact",
      join_entity: "Address",
      layout: [{ "#tag": "af-field", name: "city" }],
    },
    "afblock-notice": {
      name: "afblockNotice",
      title: "Notice",
      directive_name: "afblock-notice",
      entity_type: "*",
      layout: [{ "#tag": "p", class: "af-text", "#children": [{ "#text": "Notice" }] }],
    },
  },
  searchDisplays: { "contributions.table": CONTRIBUTIONS },
  behaviors: {
    Individual: [{ key: "autofill", title: "Autofill", modes: [] }],
    Relationship: [{ key: "dedupe", title: "Dedupe", modes: [], default_mode: "ignore" }],
  },
};
