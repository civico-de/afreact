import { renderQueryString } from "nuqs/adapters/custom";

/**
 * The parameters of a URL hash as Angular's $location reads them: `#?a=1` and `#/path?a=1`
 * carry `a`, the part before `?` is a route path that belongs to someone else.
 */
export function splitHash(hash: string): { path: string; params: URLSearchParams } {
  const body = hash.replace(/^#/, "");
  const query = body.indexOf("?");
  return query < 0
    ? { path: body, params: new URLSearchParams() }
    : { path: body.slice(0, query), params: new URLSearchParams(body.slice(query + 1)) };
}

/** The hash for `path` and `params`, empty when both are. */
export function joinHash(path: string, params: URLSearchParams): string {
  const query = renderQueryString(params);
  return path || query ? `#${path}${query}` : "";
}

/** Where the URL state of one custom element lives: the page's hash, or a popup's own copy. */
export interface ParamStore {
  /** A fresh copy on every call, so callers may change it. */
  params: () => URLSearchParams;
  /** Replaces the history entry, or adds one with `push`, as an assigned location.hash does. */
  write: (params: URLSearchParams, options?: { push?: boolean }) => void;
  subscribe: (listener: () => void) => () => void;
  /** Changes made by others (the user, a link, Angular), never this store's own writes. */
  external: (listener: () => void) => () => void;
}

function listenerSet() {
  const listeners = new Set<() => void>();
  return {
    notify: () => {
      listeners.forEach((listener) => {
        listener();
      });
    },
    add: (listener: () => void, onFirst?: () => void, onLast?: () => void) => {
      if (listeners.size === 0) onFirst?.();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) onLast?.();
      };
    },
  };
}

/**
 * The page's hash. Writes replace the history entry and keep the path part and every
 * parameter they do not change; changes by others arrive through hashchange and popstate.
 */
function createPageStore(): ParamStore {
  const { notify, add } = listenerSet();
  const listen = () => {
    window.addEventListener("hashchange", notify);
    window.addEventListener("popstate", notify);
  };
  const unlisten = () => {
    window.removeEventListener("hashchange", notify);
    window.removeEventListener("popstate", notify);
  };
  return {
    params: () => splitHash(window.location.hash).params,
    write(params, options) {
      const { pathname, search, hash } = window.location;
      const next = joinHash(splitHash(hash).path, params);
      if (next === hash || (next === "" && hash === "#")) return;
      const url = `${pathname}${search}${next}`;
      if (options?.push) window.history.pushState(window.history.state, "", url);
      else window.history.replaceState(window.history.state, "", url);
      notify();
    },
    subscribe: (listener) => add(listener, listen, unlisten),
    external(listener) {
      window.addEventListener("hashchange", listener);
      window.addEventListener("popstate", listener);
      return () => {
        window.removeEventListener("hashchange", listener);
        window.removeEventListener("popstate", listener);
      };
    },
  };
}

export const pageStore = createPageStore();

/** A popup's parameters: its URL's hash, as afCore reads the dialog's urlHash; writes stay in the popup. */
export function memoryStore(hash: string): ParamStore {
  const { notify, add } = listenerSet();
  let current = splitHash(hash).params;
  return {
    params: () => new URLSearchParams(current),
    write(params) {
      current = new URLSearchParams(params);
      notify();
    },
    subscribe: (listener) => add(listener),
    external: () => () => undefined,
  };
}
