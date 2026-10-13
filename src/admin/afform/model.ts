import { attributeType, type AttributeTypes } from "../../afform/bundle";
import {
  encodeLiteral,
  isLiteralObject,
  parseAttribute,
  RawJs,
  toLiteral,
  type Literal,
} from "./literal";
import type { AfformDefinition, AdminData, DeepNode, EditorMeta, GuiEntity } from "./meta";
import {
  isElement,
  withoutMarks,
  type NodePath,
  type ShallowElement,
  type ShallowNode,
} from "./tree";

export type EditorMode = "create" | "edit" | "clone";

/** CRM_Afform_ArrayHtml's text for a `deep` attribute value: JS notation or plain text. */
function attributeText(types: AttributeTypes, tag: string, name: string, value: unknown) {
  if (value === null || value === undefined) return undefined;
  if (attributeType(types, tag, name) === "js") return encodeLiteral(toLiteral(value));
  if (typeof value === "boolean") return value ? "1" : "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  throw new Error(`Cannot write the ${name} attribute of <${tag}> as text.`);
}

/** The element with attribute `name` set as the server writes it, or removed for null. */
export function withAttribute(
  types: AttributeTypes,
  node: ShallowElement,
  name: string,
  value: unknown,
): ShallowElement {
  const text = attributeText(types, node["#tag"], name, value);
  if (text !== undefined) return { ...node, [name]: text };
  const out: ShallowElement = { ...node };
  delete out[name];
  return out;
}

const isDeepNodes = (value: unknown): value is DeepNode[] =>
  Array.isArray(value) && value.every((item) => typeof item === "object" && item !== null);

/** A node of core's element metadata as the editor holds it: attributes as the server writes them. */
export function toShallow(types: AttributeTypes, node: DeepNode): ShallowNode {
  if (!("#tag" in node)) return { ...node };
  const tag = node["#tag"];
  const out: ShallowElement = { "#tag": tag };
  for (const [name, value] of Object.entries(node)) {
    if (name === "#tag") continue;
    if (name === "#children") {
      if (!isDeepNodes(value)) throw new Error(`The children of <${tag}> are not nodes.`);
      out["#children"] = value.map((child) => toShallow(types, child));
    } else if (name === "#markup") {
      out["#markup"] = typeof value === "string" ? value : "";
    } else if (!name.startsWith("#")) {
      const text = attributeText(types, tag, name, value);
      if (text !== undefined) out[name] = text;
    }
  }
  return out;
}

/** The index of the last node passing `test`, or -1. */
function lastIndex(nodes: ShallowNode[], test: (node: ShallowNode) => boolean): number {
  for (let index = nodes.length - 1; index >= 0; index--) {
    const node = nodes[index];
    if (node !== undefined && test(node)) return index;
  }
  return -1;
}

/** A value core's `||` keeps: empty text, 0 and false count as missing. */
export const filled = <T>(value: T): T | undefined => (value ? value : undefined);

export const textAttribute = (node: ShallowElement, name: string): string | undefined => {
  const value = node[name];
  return typeof value === "string" ? value : undefined;
};

/** Every element in `nodes` and below matching `test`, with its path, in document order. */
export function findElements(
  nodes: ShallowNode[],
  test: (node: ShallowElement) => boolean,
  base: NodePath = [],
): { node: ShallowElement; path: NodePath }[] {
  return nodes.flatMap((node, index) => {
    if (!isElement(node)) return [];
    const path = [...base, index];
    const own = test(node) ? [{ node, path }] : [];
    return [...own, ...findElements(node["#children"] ?? [], test, path)];
  });
}

/** Where the canvas starts: inside `af-form` for a form, the layout's top level otherwise. */
export function canvasPath(afform: AfformDefinition): NodePath {
  if (afform.type !== "form") return [];
  const [form] = findElements(afform.layout, (node) => node["#tag"] === "af-form");
  // deviation:form-without-af-form
  if (!form)
    throw new Error(ts("This form has no af-form element, so the builder cannot edit it."));
  return form.path;
}

/** The children of the element at `path`, [] being the layout's top level. */
export function childrenAt(layout: ShallowNode[], path: NodePath): ShallowNode[] {
  let nodes = layout;
  for (const index of path) {
    const node = nodes[index];
    if (!isElement(node)) throw new Error(`No element at index ${String(index)}`);
    nodes = node["#children"] ?? [];
  }
  return nodes;
}

function withChildrenAt(
  layout: ShallowNode[],
  path: NodePath,
  update: (children: ShallowNode[]) => ShallowNode[],
): ShallowNode[] {
  const [head, ...rest] = path;
  if (head === undefined) return update(layout);
  return layout.map((node, index) =>
    index === head && isElement(node)
      ? { ...node, "#children": withChildrenAt(node["#children"] ?? [], rest, update) }
      : node,
  );
}

/** The canvas children replaced by `update`. */
export function updateCanvas(
  afform: AfformDefinition,
  update: (children: ShallowNode[]) => ShallowNode[],
): AfformDefinition {
  return { ...afform, layout: withChildrenAt(afform.layout, canvasPath(afform), update) };
}

/** A JS attribute's value, or undefined where it is absent or unreadable. */
export function jsAttribute(node: ShallowElement, name: string): Literal | undefined {
  const text = textAttribute(node, name);
  return text === undefined ? undefined : parseAttribute(text);
}

/** backfillEntityDefaults(): the values core's runtime infers for an older af-entity. */
export function backfillEntity(node: ShallowElement): ShallowElement {
  return {
    ...node,
    actions: textAttribute(node, "actions") ?? "{create: true, update: true}",
    security: textAttribute(node, "security") ?? "RBAC",
  };
}

/** An entity's `defaults` evaluated as core's $parse does on the editor: `afform.<key>` read. */
export function entityDefaults(
  entity: GuiEntity,
  afform: AfformDefinition,
): Record<string, unknown> {
  if (!entity.defaults) return {};
  const parsed = parseAttribute(entity.defaults);
  const resolve = (value: Literal): unknown => {
    if (value instanceof RawJs) {
      const key = /^afform\.(\w+)$/.exec(value.raw)?.[1];
      if (key === undefined)
        throw new Error(`Cannot evaluate "${value.raw}" in the defaults of ${entity.entity}.`);
      return afform[key];
    }
    if (Array.isArray(value)) return value.map(resolve);
    if (isLiteralObject(value))
      return Object.fromEntries(Object.entries(value).map(([k, item]) => [k, resolve(item)]));
    return value;
  };
  if (!isLiteralObject(parsed))
    throw new Error(`The defaults of ${entity.entity} are not an object.`);
  return Object.fromEntries(Object.entries(parsed).map(([key, item]) => [key, resolve(item)]));
}

const afEntities = (afform: AfformDefinition) =>
  findElements(afform.layout, (node) => node["#tag"] === "af-entity");

export const entityNames = (afform: AfformDefinition): string[] =>
  afEntities(afform).flatMap(({ node }) => textAttribute(node, "name") ?? []);

/** The name addEntity() gives the next entity of `type`: the type and the first free number. */
export function newEntityName(afform: AfformDefinition, type: string): string {
  const taken = entityNames(afform);
  let num = 1;
  while (taken.includes(`${type}${String(num)}`)) num++;
  return `${type}${String(num)}`;
}

/** editor.addEntity(): a new af-entity after the last, with a fieldset after the last one. */
export function addEntity(
  afform: AfformDefinition,
  meta: EditorMeta,
  type: string,
): { afform: AfformDefinition; name: string } {
  const entity = meta.gui.entities[type];
  if (!entity) throw new Error(`Unknown entity ${type}`);
  const name = newEntityName(afform, type);
  const label = `${entity.label} ${name.slice(type.length)}`;
  // Core's key order: the defaults, the identity, then the backfilled actions and security.
  const deep: Record<string, unknown> = {
    ...entityDefaults(entity, afform),
    type: entity.entity,
    name,
    label,
  };
  deep.actions ??= { create: true, update: true };
  deep.security ??= "RBAC";
  for (const behavior of meta.behaviors[entity.entity] ?? [])
    if (behavior.default_mode) deep[behavior.key] = behavior.default_mode;
  const element = toShallow(meta.types, { ...deep, "#tag": "af-entity" });
  const next = updateCanvas(afform, (children) => {
    const lastEntity = lastIndex(
      children,
      (node) => isElement(node) && node["#tag"] === "af-entity",
    );
    let out = [...children.slice(0, lastEntity + 1), element, ...children.slice(lastEntity + 1)];
    if (entity.boilerplate !== false) {
      const fieldset = meta.gui.elements.fieldset?.element;
      if (!fieldset) throw new Error("No fieldset element in the FormBuilder settings.");
      const boilerplate = toShallow(meta.types, {
        ...structuredClone(fieldset),
        "af-fieldset": name,
        "af-title": label,
        "#children": [...(fieldset["#children"] ?? []), ...(entity.boilerplate ?? [])],
      });
      // After the last fieldset; core reads `'af-fieldset'` as truthy, so search fieldsets do not count.
      const lastFieldset = lastIndex(
        out,
        (node) => isElement(node) && !!textAttribute(node, "af-fieldset"),
      );
      out =
        lastFieldset >= 0
          ? [...out.slice(0, lastFieldset + 1), boilerplate, ...out.slice(lastFieldset + 1)]
          : [...out, boilerplate];
    }
    return out;
  });
  return { afform: next, name };
}

/** editor.removeEntity(): the af-entity and its fieldsets, wherever they are. */
export function removeEntity(afform: AfformDefinition, name: string): AfformDefinition {
  const prune = (nodes: ShallowNode[]): ShallowNode[] =>
    nodes
      .filter(
        (node) =>
          !isElement(node) ||
          !(
            (node["#tag"] === "af-entity" && textAttribute(node, "name") === name) ||
            textAttribute(node, "af-fieldset") === name
          ),
      )
      .map((node) =>
        isElement(node) && node["#children"]
          ? { ...node, "#children": prune(node["#children"]) }
          : node,
      );
  return { ...afform, layout: prune(afform.layout) };
}

/**
 * Where a form still names entity `name` once it is removed: entity data, conditions, tokens.
 * deviation:remove-entity-references
 */
export function entityReferences(afform: AfformDefinition, name: string): string[] {
  const word = new RegExp(`(^|[^\\w])${name}($|[^\\w])`);
  const found: string[] = [];
  const visit = (nodes: ShallowNode[]) => {
    for (const node of nodes) {
      if (!isElement(node)) {
        if ("#text" in node && word.test(node["#text"])) found.push(ts("text"));
        continue;
      }
      const where =
        node["#tag"] === "af-entity" || node["#tag"] === "af-field"
          ? `${node["#tag"]} ${textAttribute(node, "name") ?? ""}`
          : node["#tag"];
      for (const [key, value] of Object.entries(node)) {
        if (key !== "#children" && typeof value === "string" && word.test(value))
          found.push(key === "#markup" ? where : `${where} ${key}`);
      }
      if (node["#children"]) visit(node["#children"]);
    }
  };
  visit(removeEntity(afform, name).layout);
  return [...new Set(found)];
}

/** A form's af-entity elements with the values core's runtime infers backfilled. */
export function backfillEntities(afform: AfformDefinition): AfformDefinition {
  const backfilled = (nodes: ShallowNode[]): ShallowNode[] =>
    nodes.map((node) => {
      if (!isElement(node)) return node;
      const children = node["#children"] ? { "#children": backfilled(node["#children"]) } : {};
      return node["#tag"] === "af-entity"
        ? { ...backfillEntity(node), ...children }
        : { ...node, ...children };
    });
  return updateCanvas(afform, (children) => backfilled(children));
}

/** initializeForm(): the form as core's editor opens it in `mode`. */
export function initialForm(
  data: AdminData,
  meta: EditorMeta,
  mode: EditorMode,
  entity?: string,
): AfformDefinition {
  let afform: AfformDefinition = structuredClone(data.definition);
  if (mode === "clone") {
    const { name: _name, server_route: _route, navigation: _nav, ...rest } = afform;
    afform = { ...rest, title: `${afform.title} ${ts("(copy)")}` };
  }
  afform.icon = filled(afform.icon) ?? "fa-list-alt";
  afform.placement ??= [];
  // An empty object arrives as [] from json_encode; a filled list stays until a filter is chosen.
  // deviation:placement-filters-list
  const filters = afform.placement_filters;
  if (!filters || (Array.isArray(filters) && !filters.length)) afform.placement_filters = {};
  if (afform.type === "form") {
    afform = backfillEntities(afform);
    if (mode === "create" && entity) {
      afform = addEntity(afform, meta, entity).afform;
      afform.submit_enabled = true;
      afform.create_submission = true;
      const submit = meta.gui.elements.submit?.element;
      if (!submit) throw new Error("No submit element in the FormBuilder settings.");
      afform = updateCanvas(afform, (children) => [...children, toShallow(meta.types, submit)]);
    }
  }
  afform.permission_operator = filled(afform.permission_operator) ?? "AND";
  const confirmation = meta.admin.afform_fields.confirmation_type?.options?.[0];
  if (!afform.confirmation_type && confirmation) afform.confirmation_type = confirmation.id;
  return afform;
}

/** The data.source of the form's entities follows the title, where it was the old title. */
export function retitle(afform: AfformDefinition, title: string): AfformDefinition {
  const old = afform.title;
  const update = (nodes: ShallowNode[]): ShallowNode[] =>
    nodes.map((node) => {
      if (!isElement(node)) return node;
      let next = node;
      if (node["#tag"] === "af-entity") {
        const data = jsAttribute(node, "data");
        if (isLiteralObject(data) && "source" in data && (data.source ?? "") === old)
          next = { ...node, data: encodeLiteral({ ...data, source: title }) };
      }
      return next["#children"] ? { ...next, "#children": update(next["#children"]) } : next;
    });
  return { ...afform, title, layout: update(afform.layout) };
}

/** doSave(): the record Afform.save gets, its layout written back unchanged. */
export function savePayload(afform: AfformDefinition): Record<string, unknown> {
  const record: Record<string, unknown> = { ...afform, layout: withoutMarks(afform.layout) };
  record.server_route = filled(record.server_route) ?? "";
  if (record.manual_processing || record.allow_verification_by_email)
    record.create_submission = true;
  return record;
}
