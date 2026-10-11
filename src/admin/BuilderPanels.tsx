import { useEffect, useRef } from "react";
import { loadPluginElement } from "../search/ElementDisplay";
import { adminVars } from "./vars";

/** The panel elements other extensions name for this builder page, in their order. */
export const builderPanels = () => adminVars().panels ?? [];

/**
 * Other extensions' builder panels as custom elements in light DOM, each given the record being
 * edited on every change; a non-empty `validationMessage` blocks saving, as does a missing element.
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
  const tags = builderPanels();

  useEffect(() => {
    const created = tags.map((tag) => {
      const element = document.createElement(tag);
      element.setAttribute("data-afreact-plugin", "");
      loadPluginElement(tag).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        Reflect.set(element, "validationMessage", message);
        element.className = "messages error no-popup";
        element.setAttribute("role", "alert");
        element.textContent = message;
      });
      return element;
    });
    host.current?.append(...created);
    return () => {
      for (const element of created) element.remove();
    };
  }, [tags]);

  useEffect(() => {
    for (const element of host.current?.querySelectorAll("[data-afreact-plugin]") ?? []) {
      for (const [name, value] of Object.entries(services)) Reflect.set(element, name, value);
      Reflect.set(element, "record", structuredClone(record));
    }
  });

  return tags.length ? <div className="afreact-builder-panels" ref={host} /> : null;
}
