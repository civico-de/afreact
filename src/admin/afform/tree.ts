/**
 * A layout as `Afform.loadAdminData` returns it `shallow`: every attribute is text, and a node
 * core's builder cannot edit arrives as `#markup`.
 */
export interface ShallowElement {
  "#tag": string;
  "#children"?: ShallowNode[];
  "#markup"?: string;
  [attribute: string]: string | ShallowNode[] | undefined;
}
export type ShallowNode = ShallowElement | { "#text": string } | { "#comment": string };

/** Where a node sits: the child indexes from the layout's top level down. */
export type NodePath = readonly number[];

export const isElement = (node: ShallowNode | undefined): node is ShallowElement =>
  node !== undefined && "#tag" in node;

const childrenOf = (node: ShallowNode | undefined): ShallowNode[] =>
  isElement(node) ? (node["#children"] ?? []) : [];

export function nodeAt(layout: ShallowNode[], path: NodePath): ShallowNode | undefined {
  let nodes = layout;
  let node: ShallowNode | undefined;
  for (const index of path) {
    node = nodes[index];
    nodes = childrenOf(node);
  }
  return node;
}

/** The layout with the children of the element at `parent` ([] for the top level) replaced. */
function withChildren(
  layout: ShallowNode[],
  parent: NodePath,
  update: (children: ShallowNode[]) => ShallowNode[],
): ShallowNode[] {
  const [head, ...rest] = parent;
  if (head === undefined) return update(layout);
  const node = layout[head];
  if (!isElement(node)) throw new Error(`No element at index ${String(head)}`);
  const copy = [...layout];
  copy[head] = { ...node, "#children": withChildren(childrenOf(node), rest, update) };
  return copy;
}

export function updateNode(
  layout: ShallowNode[],
  path: NodePath,
  update: (node: ShallowNode) => ShallowNode,
): ShallowNode[] {
  const index = path.at(-1);
  if (index === undefined) throw new Error("updateNode needs a node's path");
  return withChildren(layout, path.slice(0, -1), (children) => {
    const node = children[index];
    if (node === undefined) throw new Error(`No node at index ${String(index)}`);
    const copy = [...children];
    copy[index] = update(node);
    return copy;
  });
}

export function insertNode(
  layout: ShallowNode[],
  parent: NodePath,
  index: number,
  node: ShallowNode,
): ShallowNode[] {
  return withChildren(layout, parent, (children) => [
    ...children.slice(0, index),
    node,
    ...children.slice(index),
  ]);
}

export function removeNode(layout: ShallowNode[], path: NodePath): ShallowNode[] {
  const index = path.at(-1);
  if (index === undefined) throw new Error("removeNode needs a node's path");
  return withChildren(layout, path.slice(0, -1), (children) =>
    children.filter((_, i) => i !== index),
  );
}

const startsWith = (path: NodePath, prefix: NodePath) =>
  prefix.length <= path.length && prefix.every((index, i) => path[i] === index);

/**
 * Moves the node at `from` to `index` among the children of `parent`, both read before the
 * move; null where it would go into itself.
 */
export function moveNode(
  layout: ShallowNode[],
  from: NodePath,
  parent: NodePath,
  index: number,
): ShallowNode[] | null {
  if (startsWith(parent, from)) return null;
  const node = nodeAt(layout, from);
  if (node === undefined) throw new Error("No node to move");
  const removed = removeNode(layout, from);
  // Removing the node shifts later siblings on its own level, and the parent path if it ran past it.
  const level = from.length - 1;
  const fromIndex = from[level] ?? 0;
  const shifted = parent.map((step, i) =>
    i === level && startsWith(parent.slice(0, level), from.slice(0, level)) && step > fromIndex
      ? step - 1
      : step,
  );
  const sameParent = parent.length === level && startsWith(parent, from.slice(0, level));
  return insertNode(removed, shifted, sameParent && index > fromIndex ? index - 1 : index, node);
}
