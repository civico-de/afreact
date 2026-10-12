import { useSyncExternalStore } from "react";

const subscribe = (change: () => void) => {
  window.addEventListener("load", change);
  return () => {
    window.removeEventListener("load", change);
  };
};

const complete = () => document.readyState === "complete";

/**
 * Whether the page's scripts have all run, so other extensions defined their plugin elements:
 * the builders decide on load which parts those edit.
 */
export const usePageLoaded = () => useSyncExternalStore(subscribe, complete);
