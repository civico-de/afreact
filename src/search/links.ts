import { useEffect, useRef, type MouseEvent } from "react";
import type { Link, RunPage } from "./types";

/**
 * onClickLink() of searchDisplayTasksTrait: a task link runs a bulk action instead of
 * navigating. Tasks are not rendered yet (the display lists them as unsupported).
 */
export function onLinkClick(link: Link, event: MouseEvent<HTMLAnchorElement>) {
  if (link.task) event.preventDefault();
}

/** The callback of the last render, for listeners registered once. */
function useLatest(callback: () => void) {
  const latest = useRef(callback);
  useEffect(() => {
    latest.current = callback;
  });
  return latest;
}

const SUCCESS = "crmPopupFormSuccess crmFormSuccess";

/**
 * searchDisplayBaseTrait refreshes a display when a popup form of it, or of the form around
 * it, succeeds. CRM.popup announces that with jQuery events on the link, which bubble up here.
 */
export function useFormSuccess(element: HTMLElement | null, refresh: () => void) {
  const latest = useLatest(refresh);
  useEffect(() => {
    const target = element ? window.CRM.$(element.closest("form") ?? element) : null;
    const handler = () => {
      latest.current();
    };
    target?.on(SUCCESS, handler);
    return () => {
      target?.off(SUCCESS, handler);
    };
  }, [element, latest]);
}

/** A toolbar link marked autoOpen opens its form when the display's first run finds nothing. */
export function useAutoOpen(page: RunPage | undefined, refresh: () => void) {
  const latest = useLatest(refresh);
  const checked = useRef(false);
  useEffect(() => {
    if (!page || checked.current) return;
    checked.current = true;
    if (page.rows.length) return;
    for (const link of page.toolbar) {
      if (link.autoOpen && link.url)
        window.CRM.loadForm(link.url).on("crmFormSuccess", () => {
          latest.current();
        });
    }
  }, [page, latest]);
}
