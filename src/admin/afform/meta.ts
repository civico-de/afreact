import type { AttributeTypes } from "../../afform/bundle";
import { adminVars } from "../vars";
import type { ShallowNode } from "./tree";

/** A node of core's element metadata, its attributes evaluated (`deep`). */
export interface DeepElement {
  "#tag": string;
  "#children"?: DeepNode[];
  "#markup"?: string | false;
  [attribute: string]: unknown;
}
export type DeepNode = DeepElement | { "#text": string } | { "#comment": string };

/** An entity of `CRM.afGuiEditor.entities`, with the fields loadAdminData adds. */
export interface GuiEntity {
  entity: string;
  label: string;
  icon?: string;
  type?: string;
  /** A JS expression on the editor's scope, as core evaluates it with $parse. */
  defaults?: string;
  boilerplate?: DeepNode[] | false;
  fields?: Record<string, GuiField>;
  submissionTokens?: { token: string; label: string; description?: string }[];
  /** Fields of which a form holds at most one record per value, as `is_primary`. */
  unique_fields?: Record<string, string> | string[];
  /** How often a join may repeat; empty for no limit. */
  repeat_max?: number | string | null;
  /** The template of the entity's options in core's editor; core's generic one if absent. */
  options_tpl?: string;
}

export interface GuiField {
  name: string;
  label?: string | null;
  input_type?: string | null;
  data_type?: string | null;
  fk_entity?: string | null;
  options?: { id: unknown; label: string; [key: string]: unknown }[] | false;
  required?: boolean;
  [key: string]: unknown;
}

export interface GuiElement {
  title: string;
  afform_type?: string[];
  element: DeepElement;
  directive?: string;
  admin_tpl?: string;
}

export interface InputTypeMeta {
  name: string;
  label: string;
  extra_defn?: Record<string, unknown>;
  admin_template?: string;
  admin_module?: string;
}

export interface PermissionOption {
  id: string;
  text: string;
  description?: string | null;
}

/** `CRM.afGuiEditor`: AfformAdminMeta::getModuleSettings(). */
export interface GuiEditorSettings {
  entities: Record<string, GuiEntity>;
  elements: Record<string, GuiElement>;
  styles: Record<string, string>;
  /** Grouped by extension or component, as select2 takes them. */
  permissions: { text: string; children: PermissionOption[] }[];
  dateRanges: { id: string; label: string }[];
  searchDisplayTags: string[];
  inputTypes: InputTypeMeta[];
}

export interface AfformFieldSpec {
  name: string;
  label?: string;
  options?: { id: string; label: string; description?: string; icon?: string }[];
  [key: string]: unknown;
}

/** `CRM.afAdmin`: AfformAdminMeta::getAdminSettings(). */
export interface AfAdminSettings {
  afform_fields: Record<string, AfformFieldSpec>;
  afform_placement: {
    id: string;
    text: string;
    grouping?: string;
    filter?: boolean;
    icon?: string;
  }[];
  afform_container_style: { value: string; label: string }[];
  field_styles: { name: string; label: string; value: string; grouping?: string }[];
  placement_entities: Record<string, Record<string, string>>;
  placement_filters: Record<string, unknown>;
  search_operators: Record<string, string>;
  /** The languages a form may be made for; empty on a single-language site. */
  locales: { id: string; text: string }[];
}

/** A form record as the editor holds it: its layout `shallow`, every attribute as text. */
export interface AfformDefinition {
  name?: string;
  type: string;
  title: string;
  layout: ShallowNode[];
  directive_name?: string;
  entity_type?: string | null;
  join_entity?: string | null;
  server_route?: string | null;
  navigation?: { parent: string | null; label: string; weight: number } | null;
  placement?: string[];
  placement_filters?: Record<string, unknown> | unknown[];
  [key: string]: unknown;
}

export interface BlockMeta {
  name: string;
  title: string;
  directive_name: string;
  entity_type?: string | null;
  join_entity?: string | null;
  layout?: ShallowNode[];
  repeat?: boolean;
}

export interface SearchDisplayMeta {
  name?: string;
  label: string;
  "saved_search_id.name": string;
  "saved_search_id.api_entity": string;
  "saved_search_id.api_params": { join?: unknown[][]; [key: string]: unknown };
  "saved_search_id.form_values"?: { join?: Record<string, string> };
  "type:icon"?: string;
  calc_fields?: { name: string; label: string }[];
  [key: string]: unknown;
}

export interface Behavior {
  key: string;
  title: string;
  description?: string;
  template?: string;
  default_mode?: string;
  modes: {
    name: string;
    label: string;
    description?: string;
    icon?: string;
    /** A relationship autofill's contact type. */
    contact_type?: string | null;
  }[];
  [key: string]: unknown;
}

/** Afform.loadAdminData's result. */
export interface AdminData {
  definition: AfformDefinition;
  blocks?: BlockMeta[];
  entities?: Record<string, GuiEntity>;
  fields?: Record<string, Record<string, GuiField>>;
  search_displays?: SearchDisplayMeta[];
  behaviors?: Record<string, Behavior[]>;
}

/** What the editor knows besides the form: core's settings and what loadAdminData added. */
export interface EditorMeta {
  gui: GuiEditorSettings;
  admin: AfAdminSettings;
  types: AttributeTypes;
  blocks: Record<string, BlockMeta>;
  searchDisplays: Record<string, SearchDisplayMeta>;
  behaviors: Record<string, Behavior[]>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Core's settings factory output, recognised by the keys the editor reads first. */
const isGuiSettings = (value: unknown): value is GuiEditorSettings =>
  isRecord(value) &&
  isRecord(value.entities) &&
  isRecord(value.elements) &&
  Array.isArray(value.inputTypes) &&
  Array.isArray(value.searchDisplayTags);

const isAdminSettings = (value: unknown): value is AfAdminSettings =>
  isRecord(value) && isRecord(value.afform_fields) && Array.isArray(value.afform_placement);

/** The page's settings, or an error naming what is missing. */
export function pageMeta(): Pick<EditorMeta, "gui" | "admin" | "types"> {
  const { afGuiEditor: gui, afAdmin: admin, attributeTypes: types } = adminVars();
  if (!isGuiSettings(gui) || !types)
    throw new Error(ts("The FormBuilder settings are not loaded."));
  // getAdminSettings() returns [] to a user who may not manage forms.
  if (!isAdminSettings(admin)) throw new Error(ts("You do not have permission to edit forms."));
  return { gui, admin, types };
}

/** afGui.addMeta(): merges what loadAdminData returned into the editor's metadata. */
export function addMeta(meta: EditorMeta, data: AdminData): EditorMeta {
  const entities = { ...meta.gui.entities };
  for (const [name, entity] of Object.entries(data.entities ?? {})) entities[name] ??= entity;
  for (const [name, fields] of Object.entries(data.fields ?? {})) {
    const entity = entities[name];
    if (entity) entities[name] = { ...entity, fields };
  }
  const blocks = { ...meta.blocks };
  const definition = data.definition;
  if (definition.type === "block" && definition.name && definition.directive_name)
    blocks[definition.directive_name] = {
      name: definition.name,
      title: definition.title,
      directive_name: definition.directive_name,
      entity_type: definition.entity_type ?? null,
      join_entity: definition.join_entity ?? null,
      layout: definition.layout,
    };
  for (const block of data.blocks ?? [])
    // An incomplete record does not replace a complete one.
    if (!blocks[block.directive_name] || block.layout) blocks[block.directive_name] = block;
  const searchDisplays = { ...meta.searchDisplays };
  for (const display of data.search_displays ?? [])
    searchDisplays[displayKey(display["saved_search_id.name"], display.name)] = display;
  return {
    ...meta,
    gui: { ...meta.gui, entities },
    blocks,
    searchDisplays,
    behaviors: { ...meta.behaviors, ...data.behaviors },
  };
}

/** afGui.resetMeta() and addMeta() for a form opened: no fields or blocks of an earlier one. */
export function initialMeta(data: AdminData): EditorMeta {
  const page = pageMeta();
  const entities = Object.fromEntries(
    Object.entries(page.gui.entities).map(([name, entity]) => {
      // The "*" pseudo-entity keeps its empty field list.
      if (name === "*") return [name, entity];
      const { fields: _dropped, ...rest } = entity;
      return [name, rest];
    }),
  );
  return addMeta(
    {
      ...page,
      gui: { ...page.gui, entities },
      blocks: {},
      searchDisplays: {},
      behaviors: {},
    },
    data,
  );
}

export const displayKey = (searchName: string, displayName?: string | null) =>
  searchName + (displayName ? `.${displayName}` : "");

/** afGui.getField(): a field's metadata, its suffix ignored, a join prefix tried away. */
export function getField(
  meta: EditorMeta,
  entityName: string,
  fieldName: string,
): GuiField | undefined {
  const fields = meta.gui.entities[entityName]?.fields ?? {};
  const name = fieldName.split(":")[0] ?? fieldName;
  return fields[name] ?? fields[name.slice(name.indexOf(".") + 1)];
}
