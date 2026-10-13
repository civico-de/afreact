import { nodeDefn } from "../fields";
import { getField, type BlockMeta, type EditorMeta, type GuiField } from "../meta";
import { findElements, textAttribute } from "../model";
import type { ShallowElement } from "../tree";

/** Font Awesome icons for the input types, for which CiviCRM has none. */
const INPUT_ICONS: Record<string, string> = {
  Text: "fa-font",
  TextArea: "fa-paragraph",
  RichTextEditor: "fa-pen-to-square",
  Number: "fa-hashtag",
  Email: "fa-at",
  Url: "fa-link",
  Date: "fa-calendar-days",
  Select: "fa-square-caret-down",
  ChainSelect: "fa-square-caret-down",
  Radio: "fa-circle-dot",
  CheckBox: "fa-square-check",
  Toggle: "fa-toggle-on",
  EntityRef: "fa-magnifying-glass",
  File: "fa-paperclip",
  Hidden: "fa-eye-slash",
  DisplayOnly: "fa-eye",
  Location: "fa-location-dot",
  CheckoutBlock: "fa-credit-card",
};
const SHOWN_OPTIONS = 3;

export interface FieldSummary {
  icon: string;
  /** The input type's label, else the data type. */
  kind: string;
  details: string[];
}

/** What a palette tile tells about its field: how it is entered and what it holds. */
export function fieldSummary(meta: EditorMeta, field: GuiField): FieldSummary {
  const type = field.input_type ?? "";
  const target = field.fk_entity ? meta.gui.entities[field.fk_entity] : undefined;
  const details: string[] = [];
  if (field.required) details.push(ts("Required"));
  if (field.serialize) details.push(ts("Several values"));
  if (field.readonly) details.push(ts("Read only"));
  if (target) details.push(ts("Refers to %1", { 1: target.label }));
  const options = Array.isArray(field.options) ? field.options : [];
  if (options.length) {
    const labels = options.slice(0, SHOWN_OPTIONS).map((option) => option.label);
    if (options.length > SHOWN_OPTIONS) labels.push("…");
    details.push(labels.join(", "));
  }
  const attrs = field.input_attrs;
  const maxlength =
    typeof attrs === "object" && attrs !== null && "maxlength" in attrs ? attrs.maxlength : null;
  if (typeof maxlength === "number") details.push(ts("Up to %1 characters", { 1: maxlength }));
  return {
    icon: target?.icon ?? INPUT_ICONS[type] ?? "fa-square",
    kind: meta.gui.inputTypes.find((each) => each.name === type)?.label ?? field.data_type ?? type,
    details,
  };
}

/** Icons and descriptions of core's elements, which the element metadata lacks. */
const ELEMENTS: Record<string, { icon: string; text: () => string }> = {
  container: { icon: "fa-object-group", text: () => ts("Groups elements, with an optional title") },
  text: { icon: "fa-heading", text: () => ts("A heading or a paragraph") },
  markup: { icon: "fa-code", text: () => ts("Formatted text with links and images") },
  tabset: { icon: "fa-folder", text: () => ts("Tabs, each holding its own elements") },
  pages: { icon: "fa-file-lines", text: () => ts("Splits the form into steps with Next and Back") },
  search_param_sets: { icon: "fa-filter", text: () => ts("Picks a saved set of search filters") },
  submit: { icon: "fa-check", text: () => ts("Submits the form") },
  save_draft: { icon: "fa-floppy-disk", text: () => ts("Saves the entries to finish later") },
  reset: { icon: "fa-undo", text: () => ts("Clears the entries") },
  fieldset: { icon: "fa-list", text: () => ts("Holds the entity's fields and settings") },
};

/** An element's icon (a button's own `crm-icon` first) and what it does; extensions' get none. */
export function elementSummary(
  name: string,
  node: ShallowElement,
): { icon: string; text: string | null } {
  const known = ELEMENTS[name];
  return {
    icon: textAttribute(node, "crm-icon") ?? known?.icon ?? "fa-puzzle-piece",
    text: known ? known.text() : null,
  };
}

/** A block's entity icon: its join's, its type's, else that of `dropInto`, the palette's entity. */
export function blockIcon(
  meta: EditorMeta,
  block: BlockMeta,
  dropInto: string | undefined,
): string {
  for (const entity of [block.join_entity, block.entity_type, dropInto]) {
    const icon = entity ? meta.gui.entities[entity]?.icon : undefined;
    if (icon) return icon;
  }
  return "fa-cubes";
}

/** The labels of a block's fields and inner blocks, in their order; `entityOf` finds a field's. */
export function blockContents(
  meta: EditorMeta,
  block: BlockMeta,
  entityOf: (name: string) => string | undefined,
): string[] {
  return findElements(
    block.layout ?? [],
    (node) => node["#tag"] === "af-field" || node["#tag"] in meta.blocks,
  ).map(({ node }) => {
    if (node["#tag"] !== "af-field") return meta.blocks[node["#tag"]]?.title ?? node["#tag"];
    const own = nodeDefn(node).label;
    if (typeof own === "string" && own) return own;
    const name = textAttribute(node, "name") ?? "";
    const entity = entityOf(name);
    return (entity ? getField(meta, entity, name)?.label : undefined) ?? name;
  });
}
