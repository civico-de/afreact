import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
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

const SortableHandle = createContext<ReturnType<typeof useSortable> | null>(null);

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

/** crmSearchDisplayTableBody.html's handle, focusable and named for the keyboard. */
export function DragHandle({ label }: { label: string }) {
  const sortable = useContext(SortableHandle);
  if (!sortable) throw new Error("DragHandle must be placed inside a SortableRow.");
  return (
    <span
      ref={sortable.setActivatorNodeRef}
      className="crm-draggable"
      title={ts("Drag to reposition")}
      {...sortable.attributes}
      {...sortable.listeners}
      aria-label={label}
    >
      <i className="crm-i fa-arrows-v" role="img" aria-hidden="true" />
    </span>
  );
}
