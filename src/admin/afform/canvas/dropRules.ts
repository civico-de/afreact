import { containsNode, hasFields } from "../context";
import type { EditorMeta } from "../meta";
import { nodeType, shownChildren } from "../nodes";
import { movedPath, type NodePath, type ShallowElement, type ShallowNode } from "../tree";

/** Where a container sits, as core's afGuiContainer knows it. */
export interface ContainerScope {
  /** The container's path; its children are below it. */
  path: NodePath;
  /** ctrl.entityName: `Individual1`, `Individual1-join-Email`, or null. */
  entityName: string | null;
  /** The data-entity attribute, which drops of entity fields match. */
  dataEntity: string;
  /** Inside an entity's or a search's fieldset. */
  inFieldset: boolean;
  /** Its contents are a block's: core's parentContainer.isBlock(). */
  inBlock: boolean;
  join: string | null;
  label: string;
  /** Rows stack down; columns and inline contents run across. */
  axis: "x" | "y";
}

export type DragSource =
  | { kind: "node"; path: NodePath; node: ShallowElement; scope: ContainerScope; label: string }
  /** From the palette: `entity` restricts the drop to that entity's containers. */
  | { kind: "new"; node: ShallowNode; entity: string | null; label: string };

/** `shown` lists the indexes of the siblings the canvas draws; af-entity and text it does not. */
export type DropTarget =
  | { kind: "item"; path: NodePath; scope: ContainerScope; shown: number[] }
  | { kind: "body"; scope: ContainerScope; count: number; shown: number[] };

export interface Landing {
  scope: ContainerScope;
  index: number;
  shown: number[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isSource = (value: unknown): value is DragSource =>
  isRecord(value) && (value.kind === "node" || value.kind === "new");

export const isTarget = (value: unknown): value is DropTarget =>
  isRecord(value) && (value.kind === "item" || value.kind === "body");

const isFieldsetLike = (node: ShallowElement, meta: EditorMeta) => {
  const type = nodeType(node, meta);
  return type === "fieldset" || type === "searchFieldset";
};

/**
 * editor.onDrop(): fields stay in their entity, fieldsets of either kind stay out of fieldsets.
 */
export function allowed(source: DragSource, landing: Landing, meta: EditorMeta): boolean {
  if (source.kind === "new")
    return source.entity === null || landing.scope.dataEntity === source.entity;
  if (source.scope.path.join() === landing.scope.path.join()) return true;
  if (hasFields(source.node, meta) && source.scope.dataEntity !== landing.scope.dataEntity)
    return false;
  const fieldset =
    isFieldsetLike(source.node, meta) ||
    containsNode(shownChildren(source.node, meta), meta, (node) => isFieldsetLike(node, meta));
  return !(fieldset && landing.scope.inFieldset);
}

/** Whether the landing leaves the dragged element where it shows: no drawn sibling in between. */
export function stays(source: DragSource, landing: Landing): boolean {
  if (source.kind !== "node" || source.path.slice(0, -1).join() !== landing.scope.path.join())
    return false;
  const from = source.path.at(-1) ?? 0;
  const [low, high] = landing.index > from ? [from + 1, landing.index] : [landing.index, from];
  return !landing.shown.some((index) => index >= low && index < high);
}

/** Where a drop on `target` lands: before an item, at a body's end. */
export const landingOf = (target: DropTarget): Landing =>
  target.kind === "body"
    ? { scope: target.scope, index: target.count, shown: target.shown }
    : { scope: target.scope, index: target.path.at(-1) ?? 0, shown: target.shown };

/** The path the dropped element has afterwards. */
export const landedPath = (source: DragSource, landing: Landing): NodePath =>
  source.kind === "node"
    ? movedPath(source.path, landing.scope.path, landing.index)
    : [...landing.scope.path, landing.index];

/** The dropped element's place among the drawn siblings, from 1. */
export function shownPlace(source: DragSource, landing: Landing): number {
  const own = source.kind === "node" ? source.path.join() : null;
  return (
    landing.shown.filter(
      (index) => index < landing.index && [...landing.scope.path, index].join() !== own,
    ).length + 1
  );
}

/** The drawn sibling after `index`, or null at the end. */
export const shownAfter = (shown: number[], index: number): number | null =>
  shown.find((each) => each > index) ?? null;

export const isBodyId = (id: string | number) => String(id).startsWith("body:");

/**
 * The keyboard's order of drop targets: an item where it starts, a list's end after the last
 * element in it.
 */
export function targetOrder(
  a: { id: string | number; node: Node },
  b: { id: string | number; node: Node },
): number {
  if (a.node === b.node) return 0;
  const position = a.node.compareDocumentPosition(b.node);
  if (isBodyId(a.id) && position & Node.DOCUMENT_POSITION_CONTAINED_BY) return 1;
  if (isBodyId(b.id) && position & Node.DOCUMENT_POSITION_CONTAINS) return -1;
  return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}
