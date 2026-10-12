import { createContext, useContext, type ReactNode } from "react";
import type { AdminData, AfformDefinition, EditorMeta } from "./meta";
import { canvasPath, childrenAt, filled, findElements, textAttribute } from "./model";
import { materialize, nodeType, shownChildren } from "./nodes";
import {
  insertNode,
  isElement,
  moveNode,
  removeNode,
  updateNode,
  type NodePath,
  type ShallowElement,
  type ShallowNode,
} from "./tree";

/** An entity of the form: its af-entity element, or a block's own entity. */
export interface FormEntity {
  name: string;
  type: string;
  label: string;
  /** The af-entity element's path; null for a block's entity. */
  path: NodePath | null;
  node: ShallowElement;
}

/** The entity a block form is edited for: its join entity, its entity type, or any. */
export function blockEntity(afform: AfformDefinition): string {
  return filled(afform.join_entity) ?? filled(afform.entity_type) ?? "*";
}

/** $scope.entities: the af-entity elements by name, or a block's entity. */
export function formEntities(afform: AfformDefinition, meta: EditorMeta): FormEntity[] {
  if (afform.type === "block") {
    const type = blockEntity(afform);
    return [
      {
        name: type,
        type,
        label: meta.gui.entities[type]?.label ?? type,
        path: null,
        node: { "#tag": "af-entity", type, name: type },
      },
    ];
  }
  if (afform.type !== "form") return [];
  return findElements(afform.layout, (node) => node["#tag"] === "af-entity").flatMap(
    ({ node, path }) => {
      const name = textAttribute(node, "name");
      if (!name) return [];
      const type = textAttribute(node, "type") ?? "";
      return [{ name, type, label: textAttribute(node, "label") ?? name, path, node }];
    },
  );
}

export interface EditorApi {
  meta: EditorMeta;
  afform: AfformDefinition;
  entities: FormEntity[];
  /** One undo step. */
  change: (update: (afform: AfformDefinition) => AfformDefinition) => void;
  selected: string | null;
  select: (name: string | null) => void;
  /** Adds what a later loadAdminData call returned. */
  addMeta: (data: AdminData) => void;
  /** editor.removeEntity(): the entity and its fieldsets gone, the settings tab selected. */
  removeEntity: (name: string) => void;
  /** Opens a dialog outside the menu that asked for it, which closes as the dialog takes focus. */
  openDialog: (render: (close: () => void) => ReactNode) => void;
  /** Why nothing may be saved from this builder, or null. */
  saveBlocked: string | null;
}

export const EditorContext = createContext<EditorApi | null>(null);

export function useEditor(): EditorApi {
  const editor = useContext(EditorContext);
  if (!editor) throw new Error("FormBuilder elements need the editor around them.");
  return editor;
}

/** editor.layout['#children']: the nodes the canvas shows. */
export const canvasNodes = (afform: AfformDefinition): ShallowNode[] =>
  childrenAt(afform.layout, canvasPath(afform));

/** The layout edited at `path`, blocks above it first taken over as the form's own. */
export function editLayout(
  afform: AfformDefinition,
  meta: EditorMeta,
  path: NodePath,
  update: (layout: ShallowNode[]) => ShallowNode[],
): AfformDefinition {
  return { ...afform, layout: update(materialize(afform.layout, path, meta)) };
}

/** The element at `path` replaced by `update`. */
export function editNode(
  afform: AfformDefinition,
  meta: EditorMeta,
  path: NodePath,
  update: (node: ShallowElement) => ShallowElement,
): AfformDefinition {
  return editLayout(afform, meta, path, (layout) =>
    updateNode(layout, path, (node) => {
      if (!isElement(node)) throw new Error("Only elements can be edited.");
      return update(node);
    }),
  );
}

export const removeAt = (afform: AfformDefinition, meta: EditorMeta, path: NodePath) =>
  editLayout(afform, meta, path, (layout) => removeNode(layout, path));

/** `node` inserted at `index` among the children shown under `parent`. */
export function insertAt(
  afform: AfformDefinition,
  meta: EditorMeta,
  parent: NodePath,
  index: number,
  node: ShallowNode,
): AfformDefinition {
  return editLayout(afform, meta, [...parent, index], (layout) =>
    insertNode(layout, parent, index, node),
  );
}

/** The node at `from` moved to `index` under `parent`; null where it would go into itself. */
export function moveTo(
  afform: AfformDefinition,
  meta: EditorMeta,
  from: NodePath,
  parent: NodePath,
  index: number,
): AfformDefinition | null {
  const layout = materialize(materialize(afform.layout, from, meta), [...parent, index], meta);
  const moved = moveNode(layout, from, parent, index);
  return moved ? { ...afform, layout: moved } : null;
}

/** Whether `nodes` hold a node passing `test`, blocks' contents included. */
export function containsNode(
  nodes: ShallowNode[],
  meta: EditorMeta,
  test: (node: ShallowElement) => boolean,
): boolean {
  return nodes.some(
    (node) =>
      isElement(node) && (test(node) || containsNode(shownChildren(node, meta), meta, test)),
  );
}

export const isFieldNode = (node: ShallowElement) => node["#tag"] === "af-field";

export const hasFields = (node: ShallowElement, meta: EditorMeta) =>
  isFieldNode(node) || containsNode(shownChildren(node, meta), meta, isFieldNode);

export const hasFieldset = (node: ShallowElement, meta: EditorMeta) =>
  nodeType(node, meta) === "fieldset" ||
  containsNode(shownChildren(node, meta), meta, (child) => nodeType(child, meta) === "fieldset");
