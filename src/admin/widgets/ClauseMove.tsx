import {
  canMoveClause,
  clauseAt,
  clausePath,
  moveClause,
  movedClausePath,
  type ClausePath,
  type MoveDirection,
} from "./clauseTree";
import { focusMovedItem, useMoveFocus } from "./moveFocus";

const DIRECTIONS: MoveDirection[] = ["up", "down"];

/** The clause tree a group sits in, which a move changes as a whole. */
export interface ClauseTree {
  root: unknown[];
  path: ClausePath;
  /** Leading top-level entries that are not clauses. */
  skip: number;
  /** Applied to the latest tree, so changes queued before a move are kept. */
  onChange: (update: (root: unknown[]) => unknown[]) => void;
}

/**
 * Buttons moving an item one step up or down; `onMove` names the key the item has once moved,
 * whose buttons then keep the focus.
 */
export function MoveButtons({
  focusKey,
  name,
  canMove,
  onMove,
}: {
  focusKey: string;
  name: string;
  canMove: (direction: MoveDirection) => boolean;
  onMove: (direction: MoveDirection) => string | null;
}) {
  const buttons = useMoveFocus(focusKey);
  return (
    <span className="btn-group btn-group-xs afreact-clause-move">
      {DIRECTIONS.map((direction) => (
        <button
          key={direction}
          ref={buttons[direction]}
          type="button"
          className="btn btn-default"
          disabled={!canMove(direction)}
          aria-label={
            direction === "up" ? ts("Move %1 up", { 1: name }) : ts("Move %1 down", { 1: name })
          }
          title={direction === "up" ? ts("Move up") : ts("Move down")}
          onClick={() => {
            const key = onMove(direction);
            if (key !== null) focusMovedItem(key, direction);
          }}
        >
          <i className={`crm-i fa-arrow-${direction}`} role="img" aria-hidden="true" />
        </button>
      ))}
    </span>
  );
}

const clauseKey = (path: ClausePath) => `clause:${path.join(".")}`;

/**
 * Moves a clause one step up or down, into and out of the groups beside it: the keyboard path
 * for what core's builders do by dragging.
 */
export function ClauseMoveButtons({
  tree,
  index,
  name,
}: {
  tree: ClauseTree;
  index: number;
  name: string;
}) {
  const path = [...tree.path, index];
  return (
    <MoveButtons
      focusKey={clauseKey(path)}
      name={name}
      canMove={(direction) => canMoveClause(tree.root, path, direction, tree.skip)}
      onMove={(direction) => {
        const clause = clauseAt(tree.root, path);
        tree.onChange((latest) => {
          // The clause moves from where the latest tree holds it.
          const from = clausePath(latest, clause);
          if (!from) return latest;
          const to = movedClausePath(latest, from, direction, tree.skip);
          if (to) focusMovedItem(clauseKey(to), direction);
          return moveClause(latest, from, direction, tree.skip);
        });
        return null;
      }}
    />
  );
}
