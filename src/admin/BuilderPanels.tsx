import { useEffect, useEffectEvent, useRef } from "react";
import { loadPluginElement } from "../search/ElementDisplay";
import { adminVars } from "./vars";

/** The panel elements other extensions name for this builder page, in their order. */
export const builderPanels = () => adminVars().panels ?? [];

const plugins = (root: ParentNode) => [...root.querySelectorAll("[data-afreact-plugin]")];

const isNotes = (notes: unknown): notes is string[] =>
  Array.isArray(notes) && notes.every((note) => typeof note === "string");

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * What the plugin editors and panels under `root` say about saving, each read once: messages
 * that block it, a failed one's error among them, and the notes to confirm from `saveNotes`.
 */
export function pluginVerdict(root: ParentNode): { invalid: string[]; notes: string[] } {
  const invalid: string[] = [];
  const notes: string[] = [];
  for (const element of plugins(root)) {
    try {
      const own: unknown = Reflect.get(element, "saveNotes");
      const message: unknown =
        element.getAttribute("data-afreact-error") ?? Reflect.get(element, "validationMessage");
      if (own !== undefined && !isNotes(own))
        invalid.push(
          ts("%1 has save notes that are not a list of texts.", { 1: element.localName }),
        );
      else if (typeof message === "string" && message !== "") invalid.push(message);
      else if (own) notes.push(...own);
    } catch (error: unknown) {
      invalid.push(errorText(error));
    }
  }
  return { invalid, notes };
}

/**
 * Waits out `ready`, and again while the element hands out a newer one for a newer record;
 * between rounds the page runs its tasks, the timeout among them, which ends the asking.
 */
async function settledReady(element: Element, ended: () => boolean): Promise<void> {
  const ready: unknown = Reflect.get(element, "ready");
  await ready;
  if (Reflect.get(element, "ready") === ready) return;
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  if (!ended()) return settledReady(element, ended);
}

/** How long a save waits for a plugin's `ready` before refusing. */
const READY_TIMEOUT = 30_000;

/**
 * Settles once each plugin under `root` with a `ready` promise is done with the record it was
 * given last, so its verdict is about what is saved; a rejection or a timeout is an error.
 */
export async function pluginsReady(root: ParentNode, timeout = READY_TIMEOUT): Promise<string[]> {
  const timers: number[] = [];
  let ended = false;
  const settled = await Promise.allSettled(
    plugins(root).map((element) =>
      Promise.race([
        // A getter that throws rejects too.
        settledReady(element, () => ended),
        new Promise((_, reject) => {
          const message = ts("%1 did not finish its check within %2 seconds.", {
            1: element.localName,
            2: timeout / 1000,
          });
          timers.push(
            window.setTimeout(() => {
              reject(new Error(message));
            }, timeout),
          );
        }),
      ]),
    ),
  );
  ended = true;
  for (const timer of timers) window.clearTimeout(timer);
  return settled.flatMap((result) =>
    result.status === "rejected" ? [errorText(result.reason)] : [],
  );
}

type Panel = {
  element: HTMLElement;
  alert: HTMLElement;
  defined: boolean;
  /** The record last given, as JSON. */
  sent?: string;
};

function fail(panel: Panel, message: string) {
  panel.element.setAttribute("data-afreact-error", message);
  panel.alert.textContent = message;
  panel.alert.className = "messages error no-popup";
  panel.alert.hidden = false;
}

/**
 * Other extensions' builder panels as custom elements in light DOM, each given the record being
 * edited whenever it changes; a non-empty `validationMessage` blocks saving, as does a missing element.
 */
export function BuilderPanels({
  record,
  services = {},
}: {
  record: unknown;
  /** Further properties as they are, such as the search builder's `searchMeta`. */
  services?: Record<string, unknown>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const panels = useRef<Panel[]>([]);
  const tags = builderPanels();

  // Properties set before the element is defined would shadow its class's setters.
  const apply = useEffectEvent((panel: Panel) => {
    if (!panel.defined) return;
    try {
      for (const [name, value] of Object.entries(services)) Reflect.set(panel.element, name, value);
      // An equal record is not given again, so a check of it keeps running.
      const json = JSON.stringify(record);
      if (json !== panel.sent) {
        Reflect.set(panel.element, "record", structuredClone(record));
        panel.sent = json;
      }
      panel.element.removeAttribute("data-afreact-error");
      panel.alert.className = "";
      panel.alert.textContent = "";
      panel.alert.hidden = true;
    } catch (error: unknown) {
      fail(panel, error instanceof Error ? error.message : String(error));
    }
  });

  useEffect(() => {
    const created = tags.map((tag) => {
      const element = document.createElement(tag);
      element.setAttribute("data-afreact-plugin", "");
      element.setAttribute(
        "data-afreact-error",
        ts("The element %1 is still loading.", { 1: tag }),
      );
      const alert = document.createElement("div");
      alert.setAttribute("role", "alert");
      alert.hidden = true;
      const panel = { element, alert, defined: false };
      loadPluginElement(tag).then(
        () => {
          // A constructor that threw during the upgrade leaves a plain element behind.
          if (!(element instanceof (customElements.get(tag) ?? HTMLElement))) {
            fail(panel, ts("The element %1 could not be created.", { 1: tag }));
            return;
          }
          panel.defined = true;
          apply(panel);
        },
        (error: unknown) => {
          fail(panel, error instanceof Error ? error.message : String(error));
        },
      );
      return panel;
    });
    panels.current = created;
    host.current?.append(...created.flatMap((panel) => [panel.element, panel.alert]));
    return () => {
      panels.current = [];
      for (const panel of created) {
        panel.element.remove();
        panel.alert.remove();
      }
    };
  }, [tags]);

  useEffect(() => {
    for (const panel of panels.current) apply(panel);
  });

  return tags.length ? <div className="afreact-builder-panels" ref={host} /> : null;
}
