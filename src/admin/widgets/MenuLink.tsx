import type { ReactNode } from "react";
import { onButtonKey } from "../../keys";

/**
 * An action in a Bootstrap dropdown: a link with a button's role and keys, as core writes its
 * menu entries, so the theme's `.dropdown-menu > li > a` styles it.
 */
export function MenuLink({
  onClick,
  title,
  pressed,
  checked,
  children,
}: {
  onClick: () => void;
  title?: string;
  /** A toggle's state, as `aria-pressed`. */
  pressed?: boolean;
  /** A switch's state: the entry becomes `role="switch"` with `aria-checked`. */
  checked?: boolean;
  children: ReactNode;
}) {
  return (
    <a
      role={checked === undefined ? "button" : "switch"}
      tabIndex={0}
      // Riverlea lays out the checkbox entries by Angular's binding class.
      className="ng-binding afreact-menu-action"
      title={title}
      aria-pressed={pressed}
      aria-checked={checked}
      onClick={onClick}
      onKeyDown={onButtonKey(onClick)}
    >
      {children}
    </a>
  );
}
