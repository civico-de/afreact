import type { EditorApi, FormEntity } from "./context";
import {
  encodeLiteral,
  isLiteralObject,
  parseAttribute,
  RawJs,
  TsCall,
  type Literal,
} from "./literal";
import { getField, type EditorMeta, type GuiField } from "./meta";
import { findElements, textAttribute } from "./model";
import { isElement, type ShallowElement, type ShallowNode } from "./tree";

/** A literal as the editor reads it: `ts()` calls translated, other expressions as their text. */
export function plainLiteral(value: Literal): unknown {
  if (value instanceof TsCall) return ts(value.text);
  if (value instanceof RawJs) return value.raw;
  if (Array.isArray(value)) return value.map(plainLiteral);
  if (isLiteralObject(value))
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, plainLiteral(item)]),
    );
  return value;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** _.merge(): `extra` merged into `base`, plain objects key by key. */
function merge(
  base: Record<string, unknown>,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    const current = out[key];
    out[key] = isRecord(current) && isRecord(value) ? merge(current, value) : value;
  }
  return out;
}

/** A field element's `defn` attribute, read; {} where it is absent or unreadable. */
export function nodeDefn(node: ShallowElement): Record<string, unknown> {
  const text = textAttribute(node, "defn");
  const value = text === undefined ? undefined : parseAttribute(text);
  if (value === undefined) return {};
  const plain = plainLiteral(value);
  return isRecord(plain) ? plain : {};
}

const isOptionList = (value: unknown): value is Record<string, unknown>[] =>
  Array.isArray(value) && value.every(isRecord);

/** The element with `key` gone from its defn, as core deletes it from the evaluated object. */
export function withoutDefnKey(node: ShallowElement, key: string): ShallowElement {
  const text = textAttribute(node, "defn");
  const defn = text === undefined ? undefined : parseAttribute(text);
  if (!isLiteralObject(defn) || !(key in defn)) return node;
  const rest = Object.fromEntries(Object.entries(defn).filter(([name]) => name !== key));
  return { ...node, defn: encodeLiteral(rest) };
}

const optional = (value: unknown, test: (v: unknown) => boolean) =>
  value === undefined || value === null || test(value);
const isText = (value: unknown) => typeof value === "string";

/** A merged defn still shaped as field metadata; a defn overriding a key with another type is not. */
const isGuiField = (value: Record<string, unknown>): value is GuiField =>
  typeof value.name === "string" &&
  optional(value.label, isText) &&
  optional(value.input_type, isText) &&
  optional(value.data_type, isText) &&
  optional(value.fk_entity, isText) &&
  optional(value.required, (v) => typeof v === "boolean") &&
  optional(value.options, (v) => v === false || isOptionList(v));

/**
 * fillFieldDefn(): the field's metadata with the element's own defn over it, its suffix kept. A
 * hidden label still names the field where it is listed, which core leaves blank.
 */
export function fieldDefn(meta: EditorMeta, entityType: string, node: ShallowElement): GuiField {
  const name = textAttribute(node, "name") ?? "";
  const spec = getField(meta, entityType, name);
  const defn = merge(structuredClone(spec ?? { name }), nodeDefn(node));
  // deviation:hidden-label-field-named
  if (defn.label === false) defn.label = spec?.label ?? name;
  const suffix = name.split(":")[1];
  const options = defn.options;
  const merged = suffix
    ? {
        ...defn,
        name,
        options: isOptionList(options)
          ? options.map((option) => ({ ...option, id: option[suffix] }))
          : options,
      }
    : { ...defn, name: spec?.name ?? name };
  if (!isGuiField(merged))
    throw new Error(ts("The definition of field %1 cannot be read.", { 1: name }));
  return merged;
}

const isJoin = (node: ShallowElement) => "af-join" in node;

/**
 * afGui.getFormElements(): the elements under `nodes` passing `test`, blocks' layouts included,
 * not looking inside elements passing `exclude`.
 */
export function formElements(
  nodes: ShallowNode[],
  meta: EditorMeta,
  test: (node: ShallowElement) => boolean,
  exclude: (node: ShallowElement) => boolean = () => false,
): ShallowElement[] {
  return nodes.filter(isElement).flatMap((node) => {
    const own = test(node) ? [node] : [];
    if (exclude(node)) return own;
    const children = node["#children"] ?? meta.blocks[node["#tag"]]?.layout ?? [];
    return [...own, ...formElements(children, meta, test, exclude)];
  });
}

const isNamedField = (node: ShallowElement) =>
  node["#tag"] === "af-field" && !!textAttribute(node, "name");

export interface EntityFields {
  fields: GuiField[];
  /** Every join block, numbered per joined entity over all the entity's fieldsets. */
  joins: { entity: string; joinIndex: number; fields: GuiField[] }[];
}

/** editor.getEntityFields(): the fields placed on the form for an entity, and for its joins. */
export function entityFields(
  editor: Pick<EditorApi, "afform" | "meta">,
  entity: FormEntity,
): EntityFields {
  const { meta } = editor;
  const fieldsets = findElements(
    editor.afform.layout,
    (node) => textAttribute(node, "af-fieldset") === entity.name,
  ).map(({ node }) => node);
  const result: EntityFields = { fields: [], joins: [] };
  const joinCounts = new Map<string, number>();
  for (const fieldset of fieldsets) {
    const children = fieldset["#children"] ?? [];
    for (const field of formElements(children, meta, isNamedField, isJoin))
      result.fields.push(fieldDefn(meta, entity.type, field));
    for (const join of formElements(children, meta, isJoin)) {
      const joinEntity = textAttribute(join, "af-join") ?? "";
      const joinIndex = joinCounts.get(joinEntity) ?? 0;
      joinCounts.set(joinEntity, joinIndex + 1);
      const fields = formElements(join["#children"] ?? [], meta, isNamedField).map((field) =>
        fieldDefn(meta, joinEntity, field),
      );
      result.joins.push({ entity: joinEntity, joinIndex, fields });
    }
  }
  return result;
}
