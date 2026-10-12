/**
 * Clause lists as the builders keep them: a clause is `[field, op, value]`, a group
 * `[conjunction, clauses]`. A clause is moved one step at a time, into and out of groups.
 */

export type ClausePath = readonly number[];
export type MoveDirection = "up" | "down";

const CONJUNCTIONS = ["AND", "OR", "NOT"];

export const isClauseGroup = (clause: unknown): clause is [string, unknown[]] =>
  Array.isArray(clause) &&
  typeof clause[0] === "string" &&
  CONJUNCTIONS.includes(clause[0]) &&
  Array.isArray(clause[1]);

function groupAt(clauses: unknown[], group: ClausePath): unknown[] {
  let list = clauses;
  for (const index of group) {
    const clause = list[index];
    if (!isClauseGroup(clause)) throw new Error(`No clause group at ${group.join(".")}`);
    list = clause[1];
  }
  return list;
}

function withGroup(
  clauses: unknown[],
  group: ClausePath,
  update: (list: unknown[]) => unknown[],
): unknown[] {
  const [head, ...rest] = group;
  if (head === undefined) return update(clauses);
  return clauses.map((clause, index) =>
    index === head && isClauseGroup(clause)
      ? [clause[0], withGroup(clause[1], rest, update)]
      : clause,
  );
}

/** Where a step from `path` lands: a group, and the index the clause goes before as counted while it is still in place. */
function target(
  clauses: unknown[],
  path: ClausePath,
  direction: MoveDirection,
  skip: number,
): { group: ClausePath; index: number } | null {
  const parent = path.slice(0, -1);
  const index = path.at(-1);
  if (index === undefined) return null;
  const list = groupAt(clauses, parent);
  const first = parent.length ? 0 : skip;
  const neighbour = direction === "up" ? index - 1 : index + 1;
  if (neighbour >= first && neighbour < list.length) {
    const next = list[neighbour];
    // A neighbouring group takes the clause in at its near end.
    if (isClauseGroup(next))
      return direction === "up"
        ? { group: [...parent, neighbour], index: next[1].length }
        : { group: [...parent, index], index: 0 };
    return { group: parent, index: direction === "up" ? neighbour : neighbour + 1 };
  }
  // Past the end of a group the clause leaves it, before or after the group.
  const outer = parent.at(-1);
  if (outer === undefined) return null;
  return { group: parent.slice(0, -1), index: direction === "up" ? outer : outer + 1 };
}

export const canMoveClause = (
  clauses: unknown[],
  path: ClausePath,
  direction: MoveDirection,
  skip = 0,
) => target(clauses, path, direction, skip) !== null;

/** Where a step from `path` puts the clause: its group and its index there after the move. */
function destination(
  clauses: unknown[],
  path: ClausePath,
  direction: MoveDirection,
  skip: number,
): { group: ClausePath; at: number } | null {
  const to = target(clauses, path, direction, skip);
  const index = path.at(-1);
  if (!to || index === undefined) return null;
  const parent = path.slice(0, -1);
  const sameGroup = to.group.length === parent.length && parent.every((v, i) => to.group[i] === v);
  // Indices counted before the removal shift where the target sits after the moved clause.
  const at = sameGroup && to.index > index ? to.index - 1 : to.index;
  return { group: to.group, at };
}

/** The clauses with the one at `path` moved one step; unchanged where it cannot move. */
export function moveClause(
  clauses: unknown[],
  path: ClausePath,
  direction: MoveDirection,
  skip = 0,
): unknown[] {
  const to = destination(clauses, path, direction, skip);
  const index = path.at(-1);
  if (!to || index === undefined) return clauses;
  const parent = path.slice(0, -1);
  const moved = groupAt(clauses, parent)[index];
  const removed = withGroup(clauses, parent, (list) => list.filter((_, i) => i !== index));
  return withGroup(removed, to.group, (list) => [
    ...list.slice(0, to.at),
    moved,
    ...list.slice(to.at),
  ]);
}

/** The path of the clause at `path` after moveClause(), or null where it cannot move. */
export function movedClausePath(
  clauses: unknown[],
  path: ClausePath,
  direction: MoveDirection,
  skip = 0,
): ClausePath | null {
  const to = destination(clauses, path, direction, skip);
  const index = path.at(-1);
  if (!to || index === undefined) return null;
  const depth = path.length - 1;
  // A group after the clause in its own list moves up by one once the clause is out.
  const group = to.group.map((step, level) =>
    level === depth && path.slice(0, depth).every((v, i) => to.group[i] === v) && step > index
      ? step - 1
      : step,
  );
  return [...group, to.at];
}
