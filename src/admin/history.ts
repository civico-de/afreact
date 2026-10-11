import { useReducer } from "react";

/** An editor's state with its undo and redo stacks, and the state last saved. */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  saved: T;
}

export type HistoryAction<T> =
  | { type: "change"; update: (state: T) => T }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "saved"; state?: T }
  /** A save of `sent` finished; `merge` adds what the server assigned, and later edits stay unsaved. */
  | { type: "savedFrom"; sent: T; merge: (state: T) => T }
  | { type: "reset"; state: T }
  /** A normalization, as core's editors apply on opening: no undo step, and a clean state stays clean. */
  | { type: "adopt"; update: (state: T) => T };

/** Snapshots kept for undo; core's FormBuilder keeps 20 states, the present included. */
export const UNDO_LIMIT = 19;

export function historyReducer<T>(history: History<T>, action: HistoryAction<T>): History<T> {
  switch (action.type) {
    case "change": {
      const next = action.update(history.present);
      if (Object.is(next, history.present)) return history;
      return {
        ...history,
        past: [...history.past, history.present].slice(-UNDO_LIMIT),
        present: next,
        future: [],
      };
    }
    case "undo": {
      const previous = history.past.at(-1);
      if (previous === undefined) return history;
      return {
        ...history,
        past: history.past.slice(0, -1),
        present: previous,
        future: [history.present, ...history.future],
      };
    }
    case "redo": {
      const [next, ...future] = history.future;
      if (next === undefined) return history;
      return { ...history, past: [...history.past, history.present], present: next, future };
    }
    case "saved": {
      const state = action.state ?? history.present;
      return { ...history, present: state, saved: state };
    }
    case "savedFrom": {
      const saved = action.merge(action.sent);
      const present = Object.is(history.present, action.sent)
        ? saved
        : action.merge(history.present);
      return { ...history, present, saved };
    }
    case "adopt": {
      const present = action.update(history.present);
      return { ...history, present, saved: isDirty(history) ? history.saved : present };
    }
    default:
      return { past: [], present: action.state, future: [], saved: action.state };
  }
}

export const initialHistory = <T>(state: T): History<T> => ({
  past: [],
  present: state,
  future: [],
  saved: state,
});

/** Whether the state differs from the one saved, by value. */
export const isDirty = <T>(history: History<T>) =>
  !Object.is(history.present, history.saved) &&
  JSON.stringify(history.present) !== JSON.stringify(history.saved);

export function useHistory<T>(initial: T) {
  return useReducer(historyReducer<T>, initial, initialHistory);
}
