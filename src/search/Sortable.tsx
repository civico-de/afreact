import {
  closestCenter,
  DndContext,
  getClientRect,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DroppableContainer,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { createContext, useContext, useRef, type ReactNode } from "react";
// Type imports only: a value import from the entry would make this lazy chunk load it twice.
import type { Row } from "./types";

interface SortableRowsProps {
  /** The keys of the rows shown, in their order. */
  keys: Row["key"][];
  nameOf: (key: UniqueIdentifier) => string;
  /** The position the row would take after a drop on `over`, or null where it stays. */
  landing: (active: UniqueIdentifier, over: UniqueIdentifier) => number | null;
  /** While a move is saved, the weights on the page are not final. */
  disabled: boolean;
  onMove: (active: Row["key"], over: Row["key"]) => void;
  children: ReactNode;
}

/** The rows of a draggable table, moved by pointer or by keyboard, with announcements. */
export function SortableRows({
  keys,
  nameOf,
  landing,
  disabled,
  onMove,
  children,
}: SortableRowsProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const at = (key: UniqueIdentifier) => ({
    1: nameOf(key),
    2: keys.indexOf(key) + 1,
    3: keys.length,
  });
  // Where the row lands, which differs from the place of `over` when sub-rows move along.
  const lands = (active: UniqueIdentifier, over: UniqueIdentifier) => {
    const position = landing(active, over);
    return position === null ? null : { 1: nameOf(active), 2: position, 3: keys.length };
  };
  // A pick-up is over its own place at once; that must not replace the pick-up announcement.
  const pickedUp = useRef(false);
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      pickedUp.current = true;
      return ts("Picked up %1, position %2 of %3.", at(active.id));
    },
    onDragOver: ({ active, over }) => {
      const first = pickedUp.current;
      pickedUp.current = false;
      if (!over || (first && over.id === active.id)) return undefined;
      const to = lands(active.id, over.id);
      return to
        ? ts("%1 moved to position %2 of %3.", to)
        : ts("%1 cannot move there: a row moves among its siblings only.", at(active.id));
    },
    onDragEnd: ({ active, over }) => {
      const to = over && lands(active.id, over.id);
      if (to) return ts("%1 dropped at position %2 of %3.", to);
      return over
        ? ts("%1 stays at position %2 of %3: a row moves among its siblings only.", at(active.id))
        : ts("%1 dropped.", { 1: nameOf(active.id) });
    },
    onDragCancel: ({ active }) =>
      ts("Moving %1 was cancelled; it stays at position %2 of %3.", at(active.id)),
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: ts(
            "To pick up a row, press Space or Enter. Move it with the arrow keys, then press Space or Enter to drop it, or Escape to cancel.",
          ),
        },
        // The live region and instructions cannot sit inside a table body.
        container: document.body,
      }}
      onDragEnd={({ active, over }) => {
        if (over && active.id !== over.id) onMove(active.id, over.id);
      }}
    >
      <SortableContext items={keys} strategy={verticalListSortingStrategy} disabled={disabled}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

type Activator = Pick<
  ReturnType<typeof useDraggable>,
  "setActivatorNodeRef" | "attributes" | "listeners"
>;
const SortableHandle = createContext<Activator | null>(null);

/** A table row that moves while dragged; its handle is a DragHandle inside it. */
export function SortableRow({ rowKey, children }: { rowKey: Row["key"]; children: ReactNode }) {
  const sortable = useSortable({ id: rowKey, attributes: { roleDescription: ts("movable row") } });
  const { setNodeRef, transform, transition, isDragging, isOver } = sortable;
  return (
    <tr
      ref={setNodeRef}
      data-entity-id={rowKey}
      className={isDragging ? "afreact-dragging" : undefined}
      // Set once dnd-kit has measured the rows, which the arrow keys need; the target for styling.
      data-over={isOver || undefined}
      style={{
        transform: transform ? `translateY(${String(transform.y)}px)` : undefined,
        transition,
      }}
    >
      <SortableHandle value={sortable}>{children}</SortableHandle>
    </tr>
  );
}

/** The handle of crmSearchDisplayTableBody.html or the tree leaf, focusable and named for the keyboard. */
export function DragHandle({ label, tree = false }: { label: string; tree?: boolean }) {
  const sortable = useContext(SortableHandle);
  if (!sortable) throw new Error("DragHandle must be placed inside a SortableRow or TreeItem.");
  return (
    <span
      ref={sortable.setActivatorNodeRef}
      className={tree ? "crm-draggable crm-inline-block" : "crm-draggable"}
      title={ts("Drag to reposition")}
      {...sortable.attributes}
      {...sortable.listeners}
      aria-label={label}
    >
      <i className={tree ? "crm-i fa-arrows" : "crm-i fa-arrows-v"} role="img" aria-hidden="true" />
    </span>
  );
}

interface TreeDndProps {
  nameOf: (key: UniqueIdentifier) => string;
  /** Where `active` would go after a drop on `over`, as text, or null where it cannot. */
  placeOf: (active: UniqueIdentifier, over: UniqueIdentifier) => string | null;
  disabled: boolean;
  onMove: (active: Row["key"], over: string | number) => void;
  children: ReactNode;
}

/** A slot's id starts with treeSlot's FIRST, which the entry chunk holds. */
const isSlot = (id: UniqueIdentifier) => typeof id === "string" && id.startsWith("first:");

/** The last keyboard step's target: the context's `over` lags a render behind quick key presses. */
let stepped: { active: UniqueIdentifier; target: UniqueIdentifier } | null = null;

/** A slot takes no space; as a target it is a band around the edge between two lines. */
const SLOT_ABOVE = 6;
const SLOT_BELOW = 8;

/** An item's own line, without the branch under it, as a drop target and when dragged. */
function lineRect(element: HTMLElement) {
  if (element.classList.contains("afreact-tree-slot")) {
    const { top, left, right, width } = getClientRect(element);
    const height = SLOT_ABOVE + SLOT_BELOW;
    return { top: top - SLOT_ABOVE, bottom: top + SLOT_BELOW, left, right, width, height };
  }
  const parts = [...element.children].filter(
    (child) => child.tagName.toLowerCase() !== "crm-search-display-tree-branch",
  );
  if (!parts.length) return getClientRect(element);
  // Where the item would be without the transform that moves it while dragged.
  const moved = element.getBoundingClientRect();
  const still = getClientRect(element, { ignoreTransform: true });
  const dx = still.left - moved.left;
  const dy = still.top - moved.top;
  const rects = parts.map((part) => part.getBoundingClientRect());
  const top = Math.min(...rects.map((rect) => rect.top)) + dy;
  const left = Math.min(...rects.map((rect) => rect.left)) + dx;
  const bottom = Math.max(...rects.map((rect) => rect.bottom)) + dy;
  const right = Math.max(...rects.map((rect) => rect.right)) + dx;
  return { top, left, bottom, right, width: right - left, height: bottom - top };
}

/** The target on the pointer's line, or the one a keyboard step chose; a slot wins where lines overlap. */
const treeCollision: CollisionDetection = ({
  active,
  collisionRect,
  droppableRects,
  droppableContainers,
  pointerCoordinates,
}) => {
  if (!pointerCoordinates && stepped?.active === active.id) {
    const container = droppableContainers.find((each) => each.id === stepped?.target);
    if (container) return [{ id: container.id, data: { droppableContainer: container, value: 0 } }];
  }
  const y = pointerCoordinates?.y ?? collisionRect.top + collisionRect.height / 2;
  let best: { id: UniqueIdentifier; container: DroppableContainer; rank: number } | undefined;
  for (const container of droppableContainers) {
    const rect = droppableRects.get(container.id);
    if (!rect) continue;
    const away = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
    const rank = away * 2 + (isSlot(container.id) ? 0 : 1);
    if (!best || rank < best.rank) best = { id: container.id, container, rank };
  }
  return best
    ? [{ id: best.id, data: { droppableContainer: best.container, value: best.rank } }]
    : [];
};

/** Up and down step through the targets in document order, skipping the dragged item's own line. */
const treeKeyboard: KeyboardCoordinateGetter = (event, { context }) => {
  const { active, over, collisionRect, droppableRects, droppableContainers } = context;
  const direction = event.code === "ArrowDown" ? 1 : event.code === "ArrowUp" ? -1 : 0;
  if (!direction || !active || !collisionRect) return undefined;
  const from = stepped?.active === active.id ? stepped.target : (over?.id ?? active.id);
  const targets = droppableContainers
    .getEnabled()
    .flatMap((container) => {
      const node = container.node.current;
      return node && droppableRects.has(container.id) ? [{ id: container.id, node }] : [];
    })
    .sort((a, b) =>
      a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
  let at = targets.findIndex((container) => container.id === from) + direction;
  if (targets[at]?.id === active.id) at += direction;
  const target = targets[at];
  const rect = target && droppableRects.get(target.id);
  if (!rect) return undefined;
  stepped = { active: active.id, target: target.id };
  return { x: rect.left, y: rect.top + (rect.height - collisionRect.height) / 2 };
};

/** A draggable tree: items drop after another item or first under one, by pointer or keyboard. */
export function TreeDnd({ nameOf, placeOf, disabled, onMove, children }: TreeDndProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: treeKeyboard }),
  );
  const refused = (active: UniqueIdentifier) => ts("%1 cannot move there.", { 1: nameOf(active) });
  const announcements: Announcements = {
    onDragStart: ({ active }) => ts("Picked up %1.", { 1: nameOf(active.id) }),
    onDragOver: ({ active, over }) => {
      if (!over || over.id === active.id) return undefined;
      const place = placeOf(active.id, over.id);
      return place === null
        ? refused(active.id)
        : ts("%1 moved %2.", { 1: nameOf(active.id), 2: place });
    },
    onDragEnd: ({ active, over }) => {
      const place = over && over.id !== active.id ? placeOf(active.id, over.id) : undefined;
      if (place === null) return refused(active.id);
      return place
        ? ts("%1 dropped %2.", { 1: nameOf(active.id), 2: place })
        : ts("%1 dropped.", { 1: nameOf(active.id) });
    },
    onDragCancel: ({ active }) => ts("Moving %1 was cancelled.", { 1: nameOf(active.id) }),
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={treeCollision}
      measuring={{ draggable: { measure: lineRect }, droppable: { measure: lineRect } }}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: ts(
            "To pick up an item, press Space or Enter. Move it with the up and down arrow keys, then press Space or Enter to drop it, or Escape to cancel.",
          ),
        },
        container: document.body,
      }}
      onDragStart={() => {
        stepped = null;
      }}
      onDragEnd={({ active, over }) => {
        if (over && active.id !== over.id && !disabled) onMove(active.id, over.id);
      }}
    >
      {children}
    </DndContext>
  );
}

interface TreeItemProps {
  rowKey: Row["key"];
  className?: string;
  disabled: boolean;
  /** The branch under the item is left out while it is dragged. */
  children: (dragging: boolean) => ReactNode;
}

/** A tree item, dragged whole; a drop on its line puts the dragged item after it. */
export function TreeItem({ rowKey, className, disabled, children }: TreeItemProps) {
  const drag = useDraggable({
    id: rowKey,
    disabled,
    attributes: { roleDescription: ts("movable item") },
  });
  const drop = useDroppable({ id: rowKey, disabled });
  const { transform, isDragging } = drag;
  return (
    <li
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      data-entity-id={rowKey}
      className={
        [className, isDragging ? "afreact-dragging" : ""].filter(Boolean).join(" ") || undefined
      }
      data-over={drop.isOver || undefined}
      style={{
        transform: transform
          ? `translate3d(${String(transform.x)}px, ${String(transform.y)}px, 0)`
          : undefined,
      }}
    >
      <SortableHandle value={drag}>{children(isDragging)}</SortableHandle>
    </li>
  );
}

/** The first place of a branch, where a drop puts the item before the branch's other items. */
export function TreeSlot({ id, disabled }: { id: string; disabled: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  return (
    <li
      ref={setNodeRef}
      aria-hidden="true"
      className="afreact-tree-slot"
      data-over={isOver || undefined}
    />
  );
}
