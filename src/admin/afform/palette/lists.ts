import { nodeDefn, plainLiteral } from "../fields";
import { encodeLiteral, isLiteralObject, toLiteral } from "../literal";
import type { AfformDefinition, EditorMeta, GuiField, SearchDisplayMeta } from "../meta";
import { editNode } from "../context";
import { findElements, jsAttribute, textAttribute, toShallow } from "../model";
import {
  parseDisplayFilters,
  readDisplayFilters,
  searchDisplaysOnForm,
  stringifyDisplayFilters,
  withoutAttributes,
  type DisplayFilter,
} from "../nodes";
import { searchDisplayEntities } from "../searchDisplay";
import { isElement, nodeAt, type ShallowElement, type ShallowNode } from "../tree";

/** A palette entry: what it adds, and its title. */
export interface PaletteItem {
  key: string;
  title: string;
  node: ShallowElement;
  /** What the entry adds, which its tile describes: a field, a block's directive or an element. */
  field?: GuiField;
  block?: string;
  element?: string;
  /** Where the entry may be dropped, when not where its list's entries may; null for anywhere. */
  entity?: string | null;
}

export interface FieldGroup {
  /** The data-entity its fields may be dropped into. */
  entityName: string;
  entityType: string;
  afJoin: string | null;
  label: string;
  items: PaletteItem[];
}

const matches = (search: string, ...texts: (string | null | undefined)[]) =>
  !search || texts.some((text) => (text ?? "").toLowerCase().includes(search));

const unsuffixed = (name: string) => name.split(":")[0] ?? name;

/** A field's palette name: with `:name` where its options have names, for portable forms. */
function paletteName(field: GuiField, prefix = ""): string {
  const named = !!field.options && Array.isArray(field.suffixes) && field.suffixes.includes("name");
  return prefix + field.name + (named ? ":name" : "");
}

const fieldTitle = (field: GuiField) => field.label ?? field.name;

/** afGuiElements' elements: those of the form's type, the entity fieldset aside. */
export function elementItems(
  meta: EditorMeta,
  afform: AfformDefinition,
  search: string,
): PaletteItem[] {
  return Object.entries(meta.gui.elements).flatMap(([name, element]) =>
    (!element.afform_type || element.afform_type.includes(afform.type)) &&
    name !== "fieldset" &&
    matches(search, name, element.title)
      ? [
          {
            key: `element:${name}`,
            title: element.title,
            node: toShallowElement(meta, element.element),
            element: name,
          },
        ]
      : [],
  );
}

function toShallowElement(meta: EditorMeta, deep: Parameters<typeof toShallow>[1]) {
  const node = toShallow(meta.types, structuredClone(deep));
  if (!isElement(node)) throw new Error("A palette element is no element.");
  return node;
}

const blockMatches = (search: string, directive: string, name: string, title: string) =>
  !search ||
  directive.includes(search) ||
  name.toLowerCase().includes(search) ||
  title.toLowerCase().includes(search);

/** afGuiElements' blocks: those for any entity, the form itself aside. */
export function globalBlockItems(
  meta: EditorMeta,
  afform: AfformDefinition,
  search: string,
): PaletteItem[] {
  return Object.entries(meta.blocks).flatMap(([directive, block]) =>
    blockMatches(search, directive, block.name, block.title) &&
    block.entity_type === "*" &&
    !block.join_entity &&
    block.name !== afform.name
      ? [
          {
            key: `block:${directive}`,
            title: block.title,
            node: { "#tag": directive },
            block: directive,
          },
        ]
      : [],
  );
}

/** The af-field names in use by extra fields: their defn's `name`. */
function extraFieldNames(afform: AfformDefinition): Set<string> {
  const names = findElements(
    afform.layout,
    (node) => node["#tag"] === "af-field" && !textAttribute(node, "name"),
  ).flatMap(({ node }) => {
    const name = nodeDefn(node).name;
    return typeof name === "string" && name ? [name] : [];
  });
  return new Set(names);
}

/** afGuiElements' extra fields: one per input type with an extra_defn, its name unused. */
export function extraFieldItems(
  meta: EditorMeta,
  afform: AfformDefinition,
  search: string,
): PaletteItem[] {
  if (afform.type !== "form") return [];
  // deviation:extra-field-unique-name
  const taken = extraFieldNames(afform);
  return meta.gui.inputTypes.flatMap((type) => {
    if (!type.extra_defn || !matches(search, type.label)) return [];
    const base = type.name.toLowerCase();
    let count = 1;
    while (taken.has(`${base}${String(count)}`)) count++;
    const defn = {
      ...structuredClone(type.extra_defn),
      label: ts("Extra %1", { 1: type.label }),
      input_type: type.name,
      name: `${base}${String(count)}`,
    };
    return [
      {
        key: `extra:${type.name}`,
        title: type.label,
        node: { "#tag": "af-field", defn: encodeLiteral(toLiteral(defn)) },
        field: { name: defn.name, label: defn.label, input_type: type.name },
      },
    ];
  });
}

/**
 * afGuiEntity's check(): whether `nodes` hold a match, inside joins and other entities'
 * fieldsets aside, blocks' layouts included.
 */
export function entityContains(
  meta: EditorMeta,
  entityName: string,
  nodes: ShallowNode[],
  test: (node: ShallowElement) => boolean,
): boolean {
  if (nodes.some((node) => isElement(node) && test(node))) return true;
  return nodes.some((node) => {
    if (!isElement(node)) return false;
    const fieldset = textAttribute(node, "af-fieldset");
    if (
      !textAttribute(node, "af-join") &&
      (!fieldset || fieldset === entityName) &&
      node["#children"]
    )
      return entityContains(meta, entityName, node["#children"], test);
    const block = meta.blocks[node["#tag"]];
    return !!block && entityContains(meta, entityName, block.layout ?? [], test);
  });
}

/** afGui.getFormElements(): matches below `nodes`, not descending past `stop`. */
function formElements(
  nodes: ShallowNode[],
  test: (node: ShallowElement) => boolean,
  stop: (node: ShallowElement) => boolean,
): ShallowElement[] {
  return nodes.flatMap((node) => {
    if (!isElement(node)) return [];
    if (test(node)) return [node];
    if (stop(node)) return [];
    return formElements(node["#children"] ?? [], test, stop);
  });
}

const isFieldNamed = (name: string) => (node: ShallowElement) =>
  node["#tag"] === "af-field" && unsuffixed(textAttribute(node, "name") ?? "") === name;

/** afGuiEntity.fieldInUse(): on the form or set as a value; for a join, in all its containers. */
export function entityFieldInUse(
  meta: EditorMeta,
  entityName: string,
  data: Record<string, unknown>,
  canvas: ShallowNode[],
  fieldName: string,
  join: string | null,
): boolean {
  const name = unsuffixed(fieldName);
  if (!join)
    return (
      Object.keys(data).some((key) => unsuffixed(key) === name) ||
      entityContains(meta, entityName, canvas, isFieldNamed(name))
    );
  const containers = formElements(
    canvas,
    (node) => textAttribute(node, "af-join") === join,
    (node) =>
      !!textAttribute(node, "af-join") ||
      (!!textAttribute(node, "af-fieldset") && textAttribute(node, "af-fieldset") !== entityName),
  );
  return containers.every((container) =>
    entityContains(meta, entityName, container["#children"] ?? [], isFieldNamed(name)),
  );
}

/** The af-field names a block's layout holds. */
const blockFieldNames = (meta: EditorMeta, directive: string) =>
  findElements(meta.blocks[directive]?.layout ?? [], (node) => node["#tag"] === "af-field").map(
    ({ node }) => textAttribute(node, "name") ?? "",
  );

/** afGuiEntity.blockInUse(): its join on the form, or one of its fields; field-less blocks never. */
export function entityBlockInUse(
  meta: EditorMeta,
  entityName: string,
  canvas: ShallowNode[],
  item: ShallowElement,
): boolean {
  const join = textAttribute(item, "af-join");
  if (join)
    return entityContains(meta, entityName, canvas, (node) => {
      const data = jsAttribute(node, "data");
      return (
        textAttribute(node, "af-join") === join &&
        !(isLiteralObject(data) && plainLiteral(data.location_type_id ?? null))
      );
    });
  const fields = blockFieldNames(meta, item["#tag"]);
  return entityContains(
    meta,
    entityName,
    canvas,
    (node) => node["#tag"] === "af-field" && fields.includes(textAttribute(node, "name") ?? ""),
  );
}

const CONTACT_TYPES = ["Individual", "Household", "Organization"];

/** afGuiEntity's blocks: those for the entity's type, a join's wrapped in its repeat container. */
export function entityBlockItems(
  meta: EditorMeta,
  afform: AfformDefinition,
  entityType: string,
  search: string,
): PaletteItem[] {
  return Object.entries(meta.blocks).flatMap(([directive, block]): PaletteItem[] => {
    if (
      !blockMatches(search, directive, block.name, block.title) ||
      !(
        block.entity_type === entityType ||
        (block.entity_type === "Contact" && CONTACT_TYPES.includes(entityType))
      ) ||
      block.name === afform.name
    )
      return [];
    const key = `block:${directive}`;
    if (!block.join_entity)
      return [{ key, title: block.title, node: { "#tag": directive }, block: directive }];
    const joinEntity = meta.gui.entities[block.join_entity];
    if (!joinEntity) return [];
    const node: ShallowElement = {
      "#tag": "div",
      "af-join": block.join_entity,
      "#children": [{ "#tag": directive }],
    };
    if (joinEntity.repeat_max !== 1) {
      node["af-repeat"] = ts("Add");
      node["af-copy"] = ts("Copy");
      node.min = "1";
      if (typeof joinEntity.repeat_max === "number") node.max = String(joinEntity.repeat_max);
    }
    return [{ key, title: block.title, node, block: directive }];
  });
}

/** afGuiEntity's fields: the entity's, and those of each join placed in its fieldsets. */
export function entityFieldGroups(
  meta: EditorMeta,
  entityName: string,
  entityType: string,
  canvas: ShallowNode[],
  search: string,
): FieldGroup[] {
  const filter = (fields: Record<string, GuiField> | undefined, prefix: string) =>
    Object.values(fields ?? {}).flatMap((field) =>
      !search || field.name.includes(search) || fieldTitle(field).toLowerCase().includes(search)
        ? [
            {
              key: `${prefix}:${field.name}`,
              title: fieldTitle(field),
              node: { "#tag": "af-field", name: paletteName(field) },
              field,
            },
          ]
        : [],
    );
  const entity = meta.gui.entities[entityType];
  if (!entity) throw new Error(`No metadata for entity ${entityType}.`);
  const groups: FieldGroup[] = [
    {
      entityName,
      entityType,
      afJoin: null,
      label: ts("%1 Fields", { 1: entity.label }),
      items: filter(entity.fields, entityName),
    },
  ];
  for (const [joinName, join] of Object.entries(meta.gui.entities))
    if (
      entityContains(
        meta,
        entityName,
        canvas,
        (node) => textAttribute(node, "af-join") === joinName,
      )
    )
      groups.push({
        entityName: `${entityName}-join-${joinName}`,
        entityType: joinName,
        afJoin: joinName,
        label: ts("%1 Fields", { 1: join.label }),
        items: filter(join.fields, `${entityName}-join-${joinName}`),
      });
  return groups;
}

/** afGuiEntity's fieldset element, offered where the entity's settings may change. */
export function entityFieldsetItem(
  meta: EditorMeta,
  entityName: string,
  entityLabel: string,
  search: string,
): PaletteItem | null {
  const title = ts("Fieldset for %1", { 1: entityLabel });
  const fieldset = meta.gui.elements.fieldset?.element;
  if (!fieldset || (search && !title.toLowerCase().includes(search))) return null;
  return {
    key: `fieldset:${entityName}`,
    title,
    node: toShallowElement(meta, { ...fieldset, "af-fieldset": entityName }),
    element: "fieldset",
    entity: null,
  };
}

/** afGuiSearch's fieldDefaults(): a filter field, made a multi-select or a date range. */
function searchFieldItem(field: GuiField, prefix: string, title: string): PaletteItem {
  const node: ShallowElement = { "#tag": "af-field", name: paletteName(field, prefix) };
  let defn: Record<string, unknown> | null = null;
  if (field.input_type === "Select" || field.input_type === "ChainSelect")
    defn = { input_attrs: { multiple: true } };
  else if (field.input_type === "Date") defn = { input_type: "Select", search_range: true };
  else if (field.options) defn = { input_type: "Select", input_attrs: { multiple: true } };
  if (defn) node.defn = encodeLiteral(toLiteral(defn));
  return { key: `${prefix}:${field.name}`, title, node, field };
}

/** afGuiSearch's palette: calculated fields, then each entity's fields, all blocks. */
export function searchPalette(
  meta: EditorMeta,
  display: SearchDisplayMeta,
  search: string,
): { calculated: PaletteItem[]; groups: FieldGroup[]; blocks: PaletteItem[] } {
  const calculated = (display.calc_fields ?? []).flatMap((field) =>
    matches(search, field.label) ? [searchFieldItem(field, "", field.label)] : [],
  );
  const groups = searchDisplayEntities(meta, display).map((entity) => ({
    entityName: "",
    entityType: entity.name,
    afJoin: null,
    label: ts("%1 Fields", { 1: entity.label }),
    items: Object.values(entity.fields).flatMap((field) =>
      !search || field.name.includes(search) || fieldTitle(field).toLowerCase().includes(search)
        ? [searchFieldItem(field, entity.prefix, fieldTitle(field))]
        : [],
    ),
  }));
  const blocks = Object.entries(meta.blocks).flatMap(([directive, block]) =>
    blockMatches(search, directive, block.name, block.title)
      ? [
          {
            key: `block:${directive}`,
            title: block.title,
            node: { "#tag": directive },
            block: directive,
          },
        ]
      : [],
  );
  return { calculated, groups, blocks };
}

/** afGuiSearch's getElement(): a match below `nodes`, blocks' layouts included. */
function searchContains(
  meta: EditorMeta,
  nodes: ShallowNode[],
  test: (node: ShallowElement) => boolean,
): boolean {
  return nodes.some((node) => {
    if (!isElement(node)) return false;
    if (test(node)) return true;
    if (node["#children"]) return searchContains(meta, node["#children"], test);
    const block = meta.blocks[node["#tag"]];
    return !!block && searchContains(meta, block.layout ?? [], test);
  });
}

/** afGuiSearch.fieldInUse(): a hidden filter, or a field in the search's fieldset. */
export const searchFieldInUse = (
  meta: EditorMeta,
  filters: DisplayFilter[],
  fieldset: ShallowNode[],
  name: string,
) =>
  filters.some((filter) => filter.name === name) ||
  searchContains(
    meta,
    fieldset,
    (node) => node["#tag"] === "af-field" && textAttribute(node, "name") === name,
  );

/** afGuiSearch's blockInUse(). */
export function searchBlockInUse(
  meta: EditorMeta,
  fieldset: ShallowNode[],
  item: ShallowElement,
): boolean {
  const fields = blockFieldNames(meta, item["#tag"]);
  return searchContains(
    meta,
    fieldset,
    (node) => node["#tag"] === "af-field" && fields.includes(textAttribute(node, "name") ?? ""),
  );
}

export interface PlacementEntity {
  key: string;
  entity: string;
  label: string;
  filter?: { name: string; label: string; options: { id: string; text: string }[] };
}

const isPlacementFilter = (value: unknown): value is NonNullable<PlacementEntity["filter"]> =>
  typeof value === "object" &&
  value !== null &&
  "name" in value &&
  typeof value.name === "string" &&
  "options" in value &&
  Array.isArray(value.options);

/** The `{contact_id: "Contact", …}` keys of the given placements. */
function placementKeys(meta: EditorMeta, placements: string[]): Record<string, string> {
  return Object.fromEntries(
    meta.admin.afform_placement
      .filter((item) => placements.includes(item.id))
      .flatMap((item) => Object.entries(meta.admin.placement_entities[item.id] ?? {})),
  );
}

/** editor.getPlacementEntities(): the entities the form's placements show it beside. */
export function placementEntities(meta: EditorMeta, afform: AfformDefinition): PlacementEntity[] {
  return Object.entries(placementKeys(meta, afform.placement ?? [])).map(([key, entity]) => {
    const label = ts("%1 being Viewed", { 1: meta.gui.entities[entity]?.label ?? entity });
    const filter = meta.admin.placement_filters[entity];
    return { key, entity, label, ...(isPlacementFilter(filter) ? { filter } : {}) };
  });
}

/** editor.hasPlacementEntities(): a placement of the form is one that groups by entity. */
export const hasPlacementEntities = (meta: EditorMeta, afform: AfformDefinition) =>
  meta.admin.afform_placement.some(
    (item) => (afform.placement ?? []).includes(item.id) && !!item.grouping,
  );

/** editor.placementRequiresServerRoute(): the last chosen placement needing a route, by name. */
export function placementRequiresRoute(meta: EditorMeta, afform: AfformDefinition): string | null {
  let name: string | null = null;
  for (const placement of afform.placement ?? []) {
    const item = meta.admin.afform_placement.find((each) => each.id === placement);
    if (item?.filter) name = item.text;
  }
  return name;
}

/**
 * editor.onChangePlacement() for one display: filters of placements no longer chosen go, and
 * each chosen placement's entity gets its filter on the search's id or reference field.
 */
export function placementFilters(
  meta: EditorMeta,
  afform: AfformDefinition,
  display: SearchDisplayMeta,
  current: string | undefined,
): string | null {
  const all = placementKeys(
    meta,
    meta.admin.afform_placement.map((item) => item.id),
  );
  const chosen = placementEntities(meta, afform);
  const chosenKeys = new Set(chosen.map((each) => each.key));
  const filters = parseDisplayFilters(current).filter(
    (filter) =>
      !(
        filter.mode === "options" &&
        Object.hasOwn(all, filter.value) &&
        !chosenKeys.has(filter.value)
      ),
  );
  const present = filters.flatMap((filter) => (filter.mode === "options" ? [filter.value] : []));
  const searchEntity = display["saved_search_id.api_entity"];
  for (const { key, entity } of chosen) {
    // deviation:placement-filter-once
    if (present.includes(key)) continue;
    if (entity === searchEntity) {
      filters.push({ mode: "options", name: "id", value: key });
      continue;
    }
    const reference = Object.values(meta.gui.entities[searchEntity]?.fields ?? {}).find(
      (field) => field.fk_entity === entity,
    );
    if (reference) filters.push({ mode: "options", name: reference.name, value: key });
  }
  return stringifyDisplayFilters(filters);
}

/** The search displays whose filters cannot be read, which a placement change would rewrite. */
export const unreadableFilters = (afform: AfformDefinition, meta: EditorMeta) =>
  searchDisplaysOnForm(afform, meta).filter((display) => {
    const node = nodeAt(afform.layout, display.path);
    return isElement(node) && "error" in readDisplayFilters(textAttribute(node, "filters"));
  });

/**
 * The form with `placement` chosen; on a search form, as onChangePlacement(), each display's
 * placement filters follow, and placement_filters stay empty where no placement has entities.
 */
export function withPlacement(
  afform: AfformDefinition,
  meta: EditorMeta,
  placement: string[],
): AfformDefinition {
  let next: AfformDefinition = { ...afform, placement };
  if (next.type !== "search") return next;
  // Afform.save keeps a stored key the record leaves out, so unused filters are emptied.
  // deviation:placement-filters-emptied
  next = {
    ...next,
    placement_filters: placementEntities(meta, next).length ? (next.placement_filters ?? {}) : {},
  };
  for (const display of searchDisplaysOnForm(next, meta)) {
    const settings = meta.searchDisplays[display.key];
    if (!settings) throw new Error(`No settings for search display ${display.key}.`);
    next = editNode(next, meta, display.path, (node) => {
      const filters = placementFilters(meta, next, settings, textAttribute(node, "filters"));
      return filters ? { ...node, filters } : withoutAttributes(node, ["filters"]);
    });
  }
  return next;
}
