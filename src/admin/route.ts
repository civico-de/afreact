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
 * The hash path, held while the guard refuses a change: the refused URL is replaced by the one
 * left, so the screen and its unsaved state stay.
 */
export function useGuardedHashPath(): {
  path: string;
  setGuard: (guard: LeaveGuard | null) => void;
} {
  const guard = useRef<LeaveGuard | null>(null);
  const [path, setPath] = useState(() => splitHash(window.location.hash).path);
  useEffect(() => {
    const onChange = (event: HashChangeEvent) => {
      const next = splitHash(window.location.hash).path;
      if (next === path) return;
      if (guard.current && !guard.current()) {
        window.history.replaceState(window.history.state, "", event.oldURL);
        return;
      }
      setPath(next);
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
