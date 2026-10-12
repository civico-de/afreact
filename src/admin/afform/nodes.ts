import type { AfformDefinition, EditorMeta } from "./meta";
import { findElements, textAttribute } from "./model";
import { parseDisplayFilters as parseFilterLiteral } from "../../search/displayFilters";
import {
  isElement,
  ORIGINAL_BLOCK,
  updateNode,
  type NodePath,
  type ShallowElement,
  type ShallowNode,
} from "./tree";

/** afGui.splitClass(): a space-separated list without repeats. */
export const splitClass = (text: string | undefined): string[] =>
  text?.trim() ? [...new Set(text.trim().split(/\s+/g))] : [];

export const hasClass = (node: ShallowElement, names: string): boolean => {
  const classes = splitClass(textAttribute(node, "class"));
  return names.split(" ").every((name) => classes.includes(name));
};

/** afGui.modifyClasses(): `remove` taken out and `add` appended; no class attribute when empty. */
export function modifyClasses(
  node: ShallowElement,
  remove: string | string[] | null,
  add: string | string[] | null,
): ShallowElement {
  const list = (value: string | string[] | null) =>
    Array.isArray(value) ? value : splitClass(value ?? undefined);
  const removed = list(remove);
  const classes = [
    ...new Set([
      ...splitClass(textAttribute(node, "class")).filter((name) => !removed.includes(name)),
      ...list(add),
    ]),
  ];
  const rest = withoutAttributes(node, ["class"]);
  return classes.length ? { ...rest, class: classes.join(" ") } : rest;
}

/** afGui.getStyles(): the style attribute as name and value pairs. */
export function getStyles(node: ShallowElement): Record<string, string> {
  const styles: Record<string, string> = {};
  for (const style of (textAttribute(node, "style") ?? "").split(";")) {
    if (!style.trim()) continue;
    const [key = "", value = ""] = style.split(":").map((part) => part.trim());
    if (value) styles[key] = value;
  }
  return styles;
}

/** afGui.setStyle(): one style set, or removed where `value` is empty. */
export function setStyle(node: ShallowElement, name: string, value: string): ShallowElement {
  const styles = getStyles(node);
  if (value) styles[name] = value;
  else delete styles[name];
  const rest = withoutAttributes(node, ["style"]);
  const entries = Object.entries(styles);
  return entries.length
    ? { ...rest, style: entries.map(([key, val]) => `${key}: ${val}`).join("; ") }
    : rest;
}

/** Without the attributes named, as core's `delete node[name]`. */
export function withoutAttributes(node: ShallowElement, names: string[]): ShallowElement {
  const out: ShallowElement = { "#tag": node["#tag"] };
  for (const [name, value] of Object.entries(node))
    if (name !== "#tag" && !names.includes(name)) out[name] = value;
  return out;
}

export type NodeType =
  | "field"
  | "fieldset"
  | "searchFieldset"
  | "join"
  | "tabset"
  | "container"
  | "searchDisplay"
  | "generic"
  | "text"
  | "button"
  | "markup";

/** The tags of other extensions' elements in core's element list, which the canvas shows generically. */
export const genericTags = (meta: EditorMeta): string[] =>
  Object.values(meta.gui.elements).flatMap((element) => element.directive ?? []);

/** afGuiContainer.getNodeType(): which canvas element shows `node`, or null for none. */
export function nodeType(node: ShallowNode, meta: EditorMeta): NodeType | null {
  if (!isElement(node)) return null;
  const tag = node["#tag"];
  if (tag === "af-field") return "field";
  const fieldset = textAttribute(node, "af-fieldset");
  if (fieldset) return "fieldset";
  if (fieldset !== undefined) return "searchFieldset";
  if (textAttribute(node, "af-join")) return "join";
  if (tag === "af-tabset") return "tabset";
  if (tag in meta.blocks) return "container";
  if (meta.gui.searchDisplayTags.includes(tag)) return "searchDisplay";
  if (genericTags(meta).includes(tag)) return "generic";
  const classes = splitClass(textAttribute(node, "class"));
  const type = classes.find((name) =>
    ["af-container", "af-text", "af-button", "af-markup"].includes(name),
  );
  if (!type) return null;
  const short = type.slice(3);
  return short === "container" || short === "text" || short === "button" || short === "markup"
    ? short
    : null;
}

export const LAYOUTS = {
  "af-layout-rows": "Contents display as rows",
  "af-layout-cols": "Contents are evenly-spaced columns",
  "af-layout-inline": "Contents are arranged inline",
} as const;
export type LayoutClass = keyof typeof LAYOUTS;

const isLayout = (name: string): name is LayoutClass => name in LAYOUTS;

/** The container's layout class; rows where it has none. */
export const layoutOf = (node: ShallowElement): LayoutClass =>
  splitClass(textAttribute(node, "class")).find(isLayout) ?? "af-layout-rows";

/** setLayout(): af-container with the layout class, rows being the default without one. */
export const withLayout = (node: ShallowElement, layout: LayoutClass): ShallowElement =>
  modifyClasses(
    node,
    Object.keys(LAYOUTS),
    layout === "af-layout-rows" ? ["af-container"] : ["af-container", layout],
  );

/** getSearchKey(): the first search display under `node`, as `search` or `search.display`. */
export function searchKey(node: ShallowElement, meta: EditorMeta): string | undefined {
  const [display] = findElements(
    node["#children"] ?? [],
    (item) =>
      meta.gui.searchDisplayTags.includes(item["#tag"]) && !!textAttribute(item, "search-name"),
  );
  if (!display) return undefined;
  const search = textAttribute(display.node, "search-name") ?? "";
  const name = textAttribute(display.node, "display-name");
  return search + (name ? `.${name}` : "");
}

/** getBlockNode(): the node naming the block: a join's only child, else the node itself. */
function blockNode(node: ShallowElement): ShallowNode | undefined {
  if (!textAttribute(node, "af-join")) return node;
  const children = node["#children"] ?? [];
  return children.length === 1 ? children[0] : undefined;
}

/** The block `node` shows, by directive name, or null for its own children. */
export function blockOf(node: ShallowElement, meta: EditorMeta): string | null {
  const inner = blockNode(node);
  return isElement(inner) && inner["#tag"] in meta.blocks ? inner["#tag"] : null;
}

/** What the canvas shows under `node`: its block's layout or its own children. */
export function shownChildren(node: ShallowElement, meta: EditorMeta): ShallowNode[] {
  const block = blockOf(node, meta);
  if (block) return meta.blocks[block]?.layout ?? [];
  return node["#children"] ?? [];
}

/**
 * overrideBlockContents(): the block's layout copied in, so it can be edited as the form's own.
 * The copy remembers its block, which "Save..." offers to update.
 */
export function overrideBlock(node: ShallowElement, meta: EditorMeta): ShallowElement {
  const block = blockOf(node, meta);
  if (!block) return node;
  const layout = structuredClone(meta.blocks[block]?.layout ?? []);
  if (textAttribute(node, "af-join"))
    return { ...node, [ORIGINAL_BLOCK]: block, "#children": layout };
  return {
    ...node,
    "#tag": "div",
    class: "af-container",
    [ORIGINAL_BLOCK]: block,
    "#children": layout,
  };
}

/** The block a container shows or was copied from, as core's block.original. */
export const originalBlock = (node: ShallowElement, meta: EditorMeta): string | null =>
  blockOf(node, meta) ?? textAttribute(node, ORIGINAL_BLOCK) ?? null;

/**
 * The layout with every block above `path` turned into its contents, so `path` addresses a node
 * of the layout itself: core overrides a block once its contents change.
 */
export function materialize(
  layout: ShallowNode[],
  path: NodePath,
  meta: EditorMeta,
): ShallowNode[] {
  let out = layout;
  for (let depth = 1; depth < path.length; depth++) {
    const ancestor = path.slice(0, depth);
    let nodes = out;
    let node: ShallowNode | undefined;
    for (const index of ancestor) {
      node = nodes[index];
      nodes = isElement(node) ? (node["#children"] ?? []) : [];
    }
    if (isElement(node) && blockOf(node, meta))
      out = updateNode(out, ancestor, (found) =>
        isElement(found) ? overrideBlock(found, meta) : found,
      );
  }
  return out;
}

/** The node at `path` as the canvas shows it, blocks' contents included. */
export function shownNodeAt(
  layout: ShallowNode[],
  path: NodePath,
  meta: EditorMeta,
): ShallowNode | undefined {
  let nodes = layout;
  let node: ShallowNode | undefined;
  for (const index of path) {
    node = nodes[index];
    nodes = isElement(node) ? shownChildren(node, meta) : [];
  }
  return node;
}

/** A hidden filter: a fixed value of any JSON type, or the key of a URL or placement value. */
export type DisplayFilter =
  | { name: string; mode: "val"; value: unknown }
  | { name: string; mode: "options" | "routeParams"; value: string };

/** Core's encode(): JSON, a plain string in single quotes. */
function encodeFilterValue(value: unknown): string {
  const encoded = JSON.stringify(value);
  const split = encoded.split('"');
  if (split.length === 3 && split[0] === "" && split[2] === "" && !encoded.includes("'"))
    return `'${split[1] ?? ""}'`;
  return encoded;
}

/** A name AngularJS reads bare; core also writes one starting with a digit bare, which it cannot. */
// deviation:display-filter-digit-names
const isIdentifier = (name: string) => /^[A-Za-z_]\w*$/.test(name);

/** afGui.stringifyDisplayFilters(). */
export function stringifyDisplayFilters(filters: DisplayFilter[]): string | null {
  if (!filters.length) return null;
  const parts = filters.map((filter) => {
    const key = isIdentifier(filter.name) ? filter.name : encodeFilterValue(filter.name);
    if (filter.mode === "val") return `${key}: ${encodeFilterValue(filter.value)}`;
    if (isIdentifier(filter.value)) return `${key}: ${filter.mode}.${filter.value}`;
    return `${key}: ${filter.mode}[${encodeFilterValue(filter.value)}]`;
  });
  return `{${parts.join(", ")}}`;
}

/**
 * afGui.parseDisplayFilters(), reading back everything stringifyDisplayFilters() writes: core
 * splits on every comma and colon and keeps escapes as they are, so lists, times and some
 * quoted values fail there.
 */
// deviation:display-filters-read-back
export function parseDisplayFilters(text: string | undefined): DisplayFilter[] {
  if (!text?.trim()) return [];
  return parseFilterLiteral(text).map(
    ([name, term]): DisplayFilter =>
      "literal" in term
        ? { name, mode: "val", value: term.literal }
        : { name, mode: term.scope, value: term.key },
  );
}

/** parseDisplayFilters(), or why the text cannot be read. */
export function readDisplayFilters(
  text: string | undefined,
): { filters: DisplayFilter[] } | { error: string } {
  try {
    return { filters: parseDisplayFilters(text) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export interface FormSearchDisplay {
  key: string;
  /** The display element's path in the layout. */
  path: NodePath;
  fieldsetPath: NodePath;
}

/** getSearchDisplaysOnForm(): each search fieldset's first display, by `search.display` key. */
export function searchDisplaysOnForm(
  afform: AfformDefinition,
  meta: EditorMeta,
): FormSearchDisplay[] {
  return findElements(afform.layout, (node) => textAttribute(node, "af-fieldset") === "").flatMap(
    ({ node, path }) => {
      const [display] = findElements(
        node["#children"] ?? [],
        (item) =>
          !!textAttribute(item, "search-name") && meta.gui.searchDisplayTags.includes(item["#tag"]),
        path,
      );
      if (!display) return [];
      const search = textAttribute(display.node, "search-name") ?? "";
      const name = textAttribute(display.node, "display-name");
      return [{ key: search + (name ? `.${name}` : ""), path: display.path, fieldsetPath: path }];
    },
  );
}

const RENDERS_CHILDREN = new Set<NodeType | null>([
  "container",
  "fieldset",
  "searchFieldset",
  "join",
  "tabset",
]);

/**
 * initializeBlockContainer(): joins and blocks on the canvas allow update and delete unless they
 * say otherwise. A join showing a block holds only the block's tag, which is no container.
 */
// deviation:block-join-kept
export function withBlockActions(nodes: ShallowNode[], meta: EditorMeta): ShallowNode[] {
  return nodes.map((node) => {
    if (!isElement(node)) return node;
    const type = nodeType(node, meta);
    let next = node;
    if ((type === "join" || node["#tag"] in meta.blocks) && !("actions" in node))
      next = { ...node, actions: "{update: true, delete: true}" };
    const children = next["#children"];
    if (
      children &&
      (RENDERS_CHILDREN.has(type) || node["#tag"] === "af-tab") &&
      !blockOf(next, meta)
    )
      next = { ...next, "#children": withBlockActions(children, meta) };
    return next;
  });
}
