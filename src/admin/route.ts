import { createContext, useContext, useEffect, useRef, useState } from "react";
import { splitHash } from "../url/hash";

/** A route pattern such as `/edit/:id`; its `:name` parts match one path segment each. */
export type Pattern = `/${string}`;

/** The `:name` values of `pattern` in `path`, or null when it does not match. */
export function matchRoute(pattern: Pattern, path: string): Record<string, string> | null {
  const want = pattern.split("/");
  const have = path.split("/");
  if (want.length !== have.length) return null;
  const params: Record<string, string> = {};
  for (const [i, part] of want.entries()) {
    const value = have[i] ?? "";
    if (part.startsWith(":")) {
      if (!value) return null;
      params[part.slice(1)] = decodeURIComponent(value);
    } else if (part !== value) return null;
  }
  return params;
}

/** The first of `routes` matching `path`, with its values. */
export function firstMatch(
  routes: Record<string, Pattern>,
  path: string,
): { name: string; params: Record<string, string> } | null {
  for (const [name, pattern] of Object.entries(routes)) {
    const params = matchRoute(pattern, path);
    if (params) return { name, params };
  }
  return null;
}

/** Opens `path` as a new history entry, as core's builders' links do. */
export function navigate(path: Pattern): void {
  window.location.hash = path;
}

/** Asked before the screen changes; false keeps it. */
export type LeaveGuard = () => boolean;

export const LeaveGuardContext = createContext<(guard: LeaveGuard | null) => void>(() => undefined);

/**
 * The hash path, held while the guard refuses a change: history steps back to the entry left,
 * so the screen, its unsaved state and the other history entries stay.
 */
export function useGuardedHashPath(): {
  path: string;
  setGuard: (guard: LeaveGuard | null) => void;
} {
  const guard = useRef<LeaveGuard | null>(null);
  const [path, setPath] = useState(() => splitHash(window.location.hash).path);
  // The entries this page visited, to tell Back, Forward and a new entry apart; other scripts
  // on core's pages overwrite history.state, so it cannot carry the position.
  const visited = useRef({ urls: [window.location.href], at: 0 });
  const restoring = useRef(false);
  useEffect(() => {
    const onChange = (event: HashChangeEvent) => {
      if (restoring.current) {
        restoring.current = false;
        return;
      }
      const { urls, at } = visited.current;
      const step = event.newURL === urls[at - 1] ? -1 : event.newURL === urls[at + 1] ? 1 : 0;
      const next = splitHash(window.location.hash).path;
      if (next !== path && guard.current && !guard.current()) {
        restoring.current = true;
        window.history.go(step === -1 ? 1 : -1);
        return;
      }
      visited.current =
        step === 0
          ? { urls: [...urls.slice(0, at + 1), event.newURL], at: at + 1 }
          : { urls, at: at + step };
      if (next !== path) setPath(next);
    };
    window.addEventListener("hashchange", onChange);
    return () => {
      window.removeEventListener("hashchange", onChange);
    };
  }, [path]);
  const [setGuard] = useState(() => (next: LeaveGuard | null) => {
    guard.current = next;
  });
  return { path, setGuard };
}

/** Unsaved changes: leaving the page or the screen asks first. */
export function useLeaveGuard(dirty: boolean): void {
  const setGuard = useContext(LeaveGuardContext);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    setGuard(
      dirty
        ? () => window.confirm(ts("You have unsaved changes. Leave this screen anyway?"))
        : null,
    );
    return () => {
      window.removeEventListener("beforeunload", warn);
      setGuard(null);
    };
  }, [dirty, setGuard]);
}
