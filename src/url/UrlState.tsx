import {
  unstable_createAdapterProvider,
  type unstable_AdapterInterface,
} from "nuqs/adapters/custom";
import { createContext, useContext, useRef, useSyncExternalStore, type ReactNode } from "react";
import { memoryStore, pageStore, type ParamStore } from "./hash";

const StoreContext = createContext<ParamStore>(pageStore);
/** False when other afreact elements share the page. */
const OnlyElementContext = createContext(true);
/** Search displays inside one element; a form provides its own count. */
export const DisplayCountContext = createContext(1);

/** Elements whose URL keys can meet on one page. */
const ELEMENTS = "afreact-form, afreact-search";

/** A popup reads the dialog's urlHash like afCore; anywhere else the page's hash. */
export function storeFor(element: Element): ParamStore {
  const dialog = element.closest(".ui-dialog-content");
  if (!dialog) return pageStore;
  const hash = window.CRM.$(dialog).data("urlHash");
  return memoryStore(typeof hash === "string" ? hash : "");
}

/** Whether `element` is the only afreact element on its page when it connects. */
export function isOnlyElement(element: Element): boolean {
  return [...element.ownerDocument.querySelectorAll(ELEMENTS)].every((other) => other === element);
}

/** A snapshot getter that returns the same object while the parameters stay the same. */
function useCachedParams(store: ParamStore, keys: string[]): URLSearchParams {
  const cache = useRef<{ key: string; params: URLSearchParams } | null>(null);
  const snapshot = () => {
    const all = store.params();
    const params = keys.length
      ? new URLSearchParams([...all].filter(([key]) => keys.includes(key)))
      : all;
    const key = params.toString();
    if (cache.current?.key !== key) cache.current = { key, params };
    return cache.current.params;
  };
  return useSyncExternalStore(store.subscribe, snapshot);
}

function useHashAdapter(watchKeys: string[]): unstable_AdapterInterface {
  const store = useContext(StoreContext);
  return {
    searchParams: useCachedParams(store, watchKeys),
    updateUrl: (params) => {
      store.write(params);
    },
    getSearchParamsSnapshot: () => store.params(),
    // nuqs queues writes of all roots together; user-paced writes need no throttle, and
    // flushing on the next tick keeps one store's pending write out of another's.
    rateLimitFactor: 0,
  };
}

/** nuqs over the hash. One provider type for every element, and every root shares its store. */
const HashAdapter = unstable_createAdapterProvider(useHashAdapter);

interface UrlStateProps {
  store: ParamStore;
  onlyElement: boolean;
  children: ReactNode;
}

export function UrlState({ store, onlyElement, children }: UrlStateProps) {
  return (
    <StoreContext.Provider value={store}>
      <OnlyElementContext.Provider value={onlyElement}>
        <HashAdapter>{children}</HashAdapter>
      </OnlyElementContext.Provider>
    </StoreContext.Provider>
  );
}

/** The element's parameter store, for state computed from the parameters as they are now. */
export function useParamStore(): ParamStore {
  return useContext(StoreContext);
}

/** Live hash parameters (all, or only `keys`), for values read like Angular's routeParams. */
export function useHashParams(keys: string[] = []): URLSearchParams {
  return useCachedParams(useContext(StoreContext), keys);
}

/**
 * The URL key prefix of a display or of the filters around it: its name and a dot when
 * the page shows more than one display, nothing otherwise.
 */
export function useUrlPrefix(name: string): string {
  const onlyElement = useContext(OnlyElementContext);
  const displays = useContext(DisplayCountContext);
  return onlyElement && displays <= 1 ? "" : `${name}.`;
}
