import { useSyncExternalStore } from "react";
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

const subscribe = (listener: () => void) => {
  window.addEventListener("hashchange", listener);
  return () => {
    window.removeEventListener("hashchange", listener);
  };
};

/** The route path of the page's hash (`#/edit/5?x=1` gives `/edit/5`). */
export function useHashPath(): string {
  return useSyncExternalStore(subscribe, () => splitHash(window.location.hash).path);
}

/** Opens `path` as a new history entry, as core's builders' links do. */
export function navigate(path: Pattern): void {
  window.location.hash = path;
}
