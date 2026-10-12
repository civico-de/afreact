import { useContext, useEffect, useEffectEvent, useRef, useState } from "react";
import { ClassicContext } from "../../classic";
import { useEditor } from "../context";
import { isElement, isShallowNode, type ShallowElement } from "../tree";

/** Another extension's element for a builder part, where its scripts defined one. */
export const pluginDefined = (tag: string) => customElements.get(tag) !== undefined;

/** A custom element's name part for a type name, which may hold no capitals: `CheckoutBlock` → `checkout-block`. */
export const kebab = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();

const nodeOf = (event: Event, key: string): ShallowElement | null => {
  const detail: unknown = event instanceof CustomEvent ? event.detail : null;
  const node: unknown =
    typeof detail === "object" && detail !== null ? Reflect.get(detail, key) : null;
  return isShallowNode(node) && isElement(node) ? node : null;
};

/**
 * A plugin element in light DOM: it gets `props` as properties and sends `change` with the
 * element in `detail[detailKey]`; a change without one is shown as an error, not dropped.
 */
export function PluginElement({
  tag,
  props,
  detailKey = "node",
  onChange,
}: {
  tag: string;
  props: Record<string, unknown>;
  /** `node` for canvas parts, `entity` for an entity's options and behaviors. */
  detailKey?: "node" | "entity";
  onChange: (node: ShallowElement) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const element = useRef<HTMLElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onNode = useEffectEvent((event: Event) => {
    if (event.target !== element.current) return;
    const node = nodeOf(event, detailKey);
    setError(
      node
        ? null
        : ts("%1 sent a change without an element in detail.%2; it was not applied.", {
            1: tag,
            2: detailKey,
          }),
    );
    if (node) onChange(node);
  });
  useEffect(() => {
    const created = document.createElement(tag);
    created.addEventListener("change", onNode);
    host.current?.append(created);
    element.current = created;
    return () => {
      created.removeEventListener("change", onNode);
      created.remove();
      element.current = null;
    };
  }, [tag]);
  useEffect(() => {
    const created = element.current;
    if (created) for (const [key, value] of Object.entries(props)) Reflect.set(created, key, value);
  });
  return (
    <>
      {error && (
        <div className="messages error no-popup" role="alert">
          {error}
        </div>
      )}
      <div ref={host} />
    </>
  );
}

/** A part React cannot edit: named in place, with the classic builder linked. */
export function PartNotice({ part }: { part: string }) {
  const editor = useEditor();
  const classic = useContext(ClassicContext);
  const name = editor.afform.name;
  return (
    <div className="messages status no-popup" role="status">
      <i className="crm-i fa-info-circle" role="img" aria-hidden="true" />{" "}
      {ts("%1 cannot be edited in the React builder; saving keeps it unchanged.", { 1: part })}{" "}
      {classic && name ? (
        <a href={`${classic}#/edit/${name}`}>{ts("Edit it in the classic builder.")}</a>
      ) : (
        ts("Save the form to edit it in the classic builder.")
      )}
    </div>
  );
}
