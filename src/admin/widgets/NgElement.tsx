import { createElement, type HTMLAttributes, type ReactNode } from "react";

/** One of core's Angular elements, rendered by its name because the theme's selectors name it. */
export function NgElement({
  tag,
  children,
  ...attributes
}: { tag: `af-gui-${string}`; children?: ReactNode } & HTMLAttributes<HTMLElement>) {
  return createElement(tag, attributes, children);
}
