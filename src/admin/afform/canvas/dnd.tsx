import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Active,
  type Announcements,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
  type Modifier,
  type Over,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { createContext, useContext, useState, type ReactNode } from "react";
import { insertAt, moveTo, useEditor, type EditorApi } from "../context";
import type { AfformDefinition } from "../meta";
import type { NodePath, ShallowElement } from "../tree";
import {
  allowed,
  isSource,
  isTarget,
  landedPath,
  landingOf,
  shownAfter,
  shownPlace,
  stays,
  targetOrder,
  type ContainerScope,
  type DragSource,
  type DropTarget,
  type Landing,
} from "./dropRules";

const sourceOf = (active: Active | null): DragSource | undefined => {
  const data: unknown = active?.data.current;
  return isSource(data) ? data : undefined;
};

const targetOf = (over: Over | null): DropTarget | undefined => {
  const data: unknown = over?.data.current;
  return isTarget(data) ? data : undefined;
};

/** The drop applied to the form, or null where it cannot be. */
const applyDrop = (
  afform: AfformDefinition,
  editor: EditorApi,
  source: DragSource,
  landing: Landing,
): AfformDefinition | null =>
  source.kind === "new"
    ? insertAt(afform, editor.meta, landing.scope.path, landing.index, structuredClone(source.node))
    : moveTo(afform, editor.meta, source.path, landing.scope.path, landing.index);

const isAfter = (
  axis: ContainerScope["axis"],
  rect: { left: number; top: number; width: number; height: number } | undefined,
  { x, y }: { x: number; y: number },
) => {
  if (!rect) return false;
  return axis === "y" ? y > rect.top + rect.height / 2 : x > rect.left + rect.width / 2;
};

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const inside = (rect: Box, { x, y }: { x: number; y: number }) =>
  x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

const distance = (rect: Box, { x, y }: { x: number; y: number }) =>
  Math.hypot(
    Math.max(rect.left - x, 0, x - rect.right),
    Math.max(rect.top - y, 0, y - rect.bottom),
  );

/**
 * The target under the pointer: the dragged element itself over its own area, else the innermost
 * item; free space between items counts as the slot by the nearest one. Each slot has one target,
 * the item after it or the list's end, so the line between two items stays put.
 * deviation:canvas-drag-drop
 */
const canvasCollision: CollisionDetection = ({
  active,
  droppableRects,
  droppableContainers,
  pointerCoordinates,
}) => {
  const hit = (id: UniqueIdentifier) => {
    const container = droppableContainers.find((each) => each.id === id);
    return container ? [{ id, data: { droppableContainer: container, value: 0 } }] : [];
  };
  if (!pointerCoordinates && stepped?.active === active.id) return hit(stepped.target);
  if (!pointerCoordinates) return [];
  const own = droppableRects.get(active.id);
  if (own && inside(own, pointerCoordinates)) return hit(active.id);
  let best: { container: (typeof droppableContainers)[number]; area: number } | undefined;
  for (const container of droppableContainers) {
    const rect = droppableRects.get(container.id);
    if (!rect || !inside(rect, pointerCoordinates)) continue;
    const area = rect.width * rect.height;
    if (!best || area < best.area) best = { container, area };
  }
  const data: unknown = best?.container.data.current;
  if (!best || !isTarget(data)) return [];
  const target = data;
  let item = target.kind === "item" ? target.path : undefined;
  if (target.kind === "body") {
    let nearest = Infinity;
    for (const index of target.shown) {
      const rect = droppableRects.get(itemId([...target.scope.path, index]));
      const gap = rect ? distance(rect, pointerCoordinates) : Infinity;
      if (gap < nearest) [nearest, item] = [gap, [...target.scope.path, index]];
    }
  }
  if (!item) return hit(best.container.id);
  if (!isAfter(target.scope.axis, droppableRects.get(itemId(item)), pointerCoordinates))
    return hit(itemId(item));
  const next = shownAfter(target.shown, item.at(-1) ?? 0);
  return hit(
    next === null ? `body:${target.scope.path.join(".")}` : itemId([...target.scope.path, next]),
  );
};

let stepped: { active: UniqueIdentifier; target: UniqueIdentifier } | null = null;

/**
 * Arrow keys step through the targets in the order a drop would place the element, the dragged
 * element's own skipped; past either end they wrap around.
 */
const canvasKeyboard: KeyboardCoordinateGetter = (event, { context }) => {
  const { active, over, collisionRect, droppableRects, droppableContainers } = context;
  const direction =
    event.code === "ArrowDown" || event.code === "ArrowRight"
      ? 1
      : event.code === "ArrowUp" || event.code === "ArrowLeft"
        ? -1
        : 0;
  const own = context.activeNode;
  if (!direction || !active || !collisionRect || !own) return undefined;
  const targets = droppableContainers
    .getEnabled()
    .flatMap((container) => {
      const node = container.node.current;
      return node && droppableRects.has(container.id) && !own.contains(node)
        ? [{ id: container.id, node }]
        : [];
    })
    .sort(targetOrder);
  if (!targets.length) return undefined;
  const from = stepped?.active === active.id ? stepped.target : over?.id;
  const index = targets.findIndex((target) => target.id === from);
  // The first step starts at the element's own place, not at the top of the canvas.
  const after = targets.findIndex(
    (target) => targetOrder({ id: active.id, node: own }, target) < 0,
  );
  const pivot = after < 0 ? targets.length : after;
  const start = index >= 0 ? index + direction : direction > 0 ? pivot : pivot - 1;
  const at = (start + targets.length) % targets.length;
  const target = targets[at];
  const rect = target && droppableRects.get(target.id);
  if (!rect) return undefined;
  stepped = { active: active.id, target: target.id };
  return { x: rect.left, y: rect.top };
};

interface DropState {
  /** The item or body showing where the drop lands, or that it cannot. */
  mark: UniqueIdentifier | null;
  how: "before" | "after" | "end" | "refused";
  /** The dragged element's label while a drag runs. */
  dragging: string;
}

const idle: DropState = { mark: null, how: "before", dragging: "" };

const DropContext = createContext<DropState>(idle);

/** The overlay's corner just below and right of the pointer, wherever the drag was picked up. */
const besidePointer: Modifier = ({ transform, activatorEvent, activeNodeRect }) =>
  activatorEvent instanceof PointerEvent && activeNodeRect
    ? {
        ...transform,
        x: transform.x + activatorEvent.clientX - activeNodeRect.left + 12,
        y: transform.y + activatorEvent.clientY - activeNodeRect.top + 12,
      }
    : transform;

/** The canvas and the palette as one drag-and-drop area, by pointer or keyboard. */
export function CanvasDnd({ children }: { children: ReactNode }) {
  const editor = useEditor();
  const [state, setState] = useState<DropState>(idle);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: canvasKeyboard }),
  );

  const resolve = (active: Active, over: Over | null) => {
    const source = sourceOf(active);
    const target = targetOf(over);
    if (!source || !target || !over) return null;
    const landing = landingOf(target);
    return {
      source,
      landing,
      stays: stays(source, landing),
      ok: allowed(source, landing, editor.meta),
    };
  };

  const place = (source: DragSource, landing: Landing) =>
    ts("to place %1 in %2", {
      1: shownPlace(source, landing),
      2: landing.scope.label,
    });
  const refused = (source: DragSource) => ts("%1 cannot move there.", { 1: source.label });
  const kept = (source: DragSource) => ts("%1 stays in its place.", { 1: source.label });
  const announcements: Announcements = {
    onDragStart: ({ active }) => ts("Picked up %1.", { 1: sourceOf(active)?.label ?? "" }),
    onDragOver: ({ active, over }) => {
      const drop = resolve(active, over);
      if (!drop) return undefined;
      if (drop.stays) return kept(drop.source);
      return drop.ok
        ? ts("%1 moved %2.", { 1: drop.source.label, 2: place(drop.source, drop.landing) })
        : refused(drop.source);
    },
    onDragEnd: ({ active, over }) => {
      const drop = resolve(active, over);
      if (!drop) return ts("%1 dropped.", { 1: sourceOf(active)?.label ?? "" });
      if (drop.stays) return kept(drop.source);
      return drop.ok
        ? ts("%1 dropped %2.", { 1: drop.source.label, 2: place(drop.source, drop.landing) })
        : refused(drop.source);
    },
    onDragCancel: ({ active }) =>
      ts("Moving %1 was cancelled.", { 1: sourceOf(active)?.label ?? "" }),
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={canvasCollision}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: ts(
            "To pick up an element, press Space or Enter. Move it with the arrow keys, then press Space or Enter to drop it, or Escape to cancel.",
          ),
        },
        container: document.body,
        // A move hands the old place to another element; onDragEnd focuses the moved one.
        restoreFocus: false,
      }}
      onDragStart={({ active }) => {
        stepped = null;
        document.body.classList.add("af-gui-dragging");
        setState({ ...idle, dragging: sourceOf(active)?.label ?? "" });
      }}
      onDragOver={({ active, over }) => {
        const drop = resolve(active, over);
        const target = targetOf(over);
        const dragging = sourceOf(active)?.label ?? "";
        const last = target?.shown.at(-1);
        if (!drop || !target || !over || drop.stays) setState({ ...idle, dragging });
        else if (!drop.ok) setState({ mark: over.id, how: "refused", dragging });
        else if (target.kind === "item") setState({ mark: over.id, how: "before", dragging });
        // The end of a list shows as a line after its last drawn item.
        else if (last === undefined) setState({ mark: over.id, how: "end", dragging });
        else setState({ mark: itemId([...target.scope.path, last]), how: "after", dragging });
      }}
      onDragEnd={({ active, over, activatorEvent }) => {
        document.body.classList.remove("af-gui-dragging");
        setState(idle);
        const drop = resolve(active, over);
        if (!drop?.ok || drop.stays) return;
        editor.change((afform) => applyDrop(afform, editor, drop.source, drop.landing) ?? afform);
        // The grip that kept the focus now belongs to whatever took the old place.
        if (activatorEvent instanceof KeyboardEvent) {
          const path = landedPath(drop.source, drop.landing).join(".");
          requestAnimationFrame(() => {
            document
              .querySelector<HTMLElement>(`.afreact-drag-handle[data-path="${path}"]`)
              ?.focus();
          });
        }
      }}
      onDragCancel={() => {
        document.body.classList.remove("af-gui-dragging");
        setState(idle);
      }}
    >
      <DropContext value={state}>{children}</DropContext>
      <DragOverlay dropAnimation={null} modifiers={[besidePointer]}>
        {state.dragging && (
          <div className="afreact-drag-chip" aria-hidden="true">
            <i className="crm-i fa-arrows" role="img" />
            {state.dragging}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

const itemId = (path: NodePath) => `node:${path.join(".")}`;

/** A canvas element: dragged by its bar, a drop target for before or after it. */
export function useCanvasItem(
  path: NodePath,
  node: ShallowElement,
  scope: ContainerScope,
  label: string,
  shown: number[],
) {
  const id = itemId(path);
  const source: DragSource = { kind: "node", path, node, scope, label };
  const target: DropTarget = { kind: "item", path, scope, shown };
  const drag = useDraggable({
    id,
    data: source,
    attributes: { roleDescription: ts("movable element") },
  });
  const drop = useDroppable({ id, data: target });
  const state = useContext(DropContext);
  return {
    ref: (element: HTMLElement | null) => {
      drag.setNodeRef(element);
      drop.setNodeRef(element);
    },
    handle: {
      ref: drag.setActivatorNodeRef,
      "data-path": path.join("."),
      ...drag.attributes,
      ...drag.listeners,
    },
    dragging: drag.isDragging,
    dropClass: state.mark === id ? `afreact-drop-${state.how}` : "",
  };
}

/** A container's list: a drop on its free space puts the element last. */
export function useCanvasBody(scope: ContainerScope, count: number, shown: number[]) {
  const id = `body:${scope.path.join(".")}`;
  const drop = useDroppable({
    id,
    data: { kind: "body", scope, count, shown } satisfies DropTarget,
  });
  const state = useContext(DropContext);
  return {
    ref: drop.setNodeRef,
    dropClass:
      state.mark === id
        ? state.how === "refused"
          ? "afreact-drop-refused"
          : "af-gui-dragtarget"
        : "",
  };
}

/** A palette entry dragged onto the canvas. */
export function usePaletteItem(
  id: string,
  source: Extract<DragSource, { kind: "new" }>,
  disabled = false,
) {
  const drag = useDraggable({
    id: `new:${id}`,
    data: source,
    disabled,
    attributes: { roleDescription: ts("draggable element") },
  });
  return {
    ref: drag.setNodeRef,
    props: { ...drag.attributes, ...drag.listeners },
    dragging: drag.isDragging,
  };
}
