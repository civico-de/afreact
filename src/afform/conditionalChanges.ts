import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

/** How long af-if changes gather before one announcement, so typing does not chatter. */
export const SETTLE_MS = 1000;

// deviation:af-if-focus-kept
/**
 * When an af-if removes the focused element, focus goes to the control the user just changed,
 * else the nearest remaining ancestor; `toggled` gathers shown and hidden content for one message.
 */
export function useConditionalChanges(
  host: RefObject<HTMLElement | null>,
  data: unknown,
  ts: (text: string) => string,
) {
  const trail = useRef<HTMLElement[]>([]);
  const trigger = useRef<HTMLElement | null>(null);
  const counts = useRef({ shown: 0, hidden: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const element = host.current;
    if (!element) return () => undefined;
    const focused = (event: FocusEvent) => {
      trigger.current = null;
      const path: HTMLElement[] = [];
      for (let node = event.target; node instanceof HTMLElement; node = node.parentElement) {
        path.push(node);
        if (node === element) break;
      }
      trail.current = path;
    };
    const changed = (event: Event) => {
      if (event.target instanceof HTMLElement) trigger.current = event.target;
    };
    element.addEventListener("focusin", focused);
    element.addEventListener("change", changed);
    element.addEventListener("input", changed);
    return () => {
      element.removeEventListener("focusin", focused);
      element.removeEventListener("change", changed);
      element.removeEventListener("input", changed);
      clearTimeout(timer.current);
    };
  }, [host]);

  useLayoutEffect(() => {
    const lost = trail.current[0];
    const active = document.activeElement;
    if (!lost || lost.isConnected || (active !== null && active !== document.body)) return;
    const target = trigger.current?.isConnected
      ? trigger.current
      : trail.current.find((node) => node.isConnected);
    if (!target) return;
    if (target.tabIndex < 0 && !target.hasAttribute("tabindex"))
      target.setAttribute("tabindex", "-1");
    target.focus();
  }, [data]);

  const toggled = useCallback(
    (shown: boolean) => {
      counts.current[shown ? "shown" : "hidden"]++;
      setAnnouncement("");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const { shown: more, hidden } = counts.current;
        counts.current = { shown: 0, hidden: 0 };
        setAnnouncement(
          more && hidden
            ? ts("Some fields were shown and others hidden.")
            : more
              ? ts("More fields are shown.")
              : ts("Some fields are hidden."),
        );
      }, SETTLE_MS);
    },
    [ts],
  );

  return { announcement, toggled };
}
