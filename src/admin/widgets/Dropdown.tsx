import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useFollowButton } from "../../search/Menu";

interface DropdownProps {
  buttonClass: string;
  /** The button's accessible name and tooltip. */
  title: string;
  label: ReactNode;
  alignRight?: boolean;
  groupClass?: string;
  onOpen?: () => void;
  /** The list items, rendered only while open, as core's af-gui-menu does. */
  children: (close: () => void) => ReactNode;
}

/**
 * A Bootstrap dropdown holding controls, as a disclosure: a native popover (light dismiss, top
 * layer) that Escape closes with focus back on its button.
 */
export function Dropdown({
  buttonClass,
  title,
  label,
  alignRight = false,
  groupClass = "btn-group",
  onOpen,
  children,
}: DropdownProps) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  useFollowButton(open, alignRight, list, button);

  useEffect(() => {
    const popover = list.current;
    const onToggle = (event: Event) => {
      setOpen(event instanceof ToggleEvent && event.newState === "open");
    };
    popover?.addEventListener("toggle", onToggle);
    return () => {
      popover?.removeEventListener("toggle", onToggle);
    };
  }, []);

  const close = () => {
    list.current?.hidePopover();
    button.current?.focus();
  };

  return (
    <div className={open ? `${groupClass} open` : groupClass}>
      <button
        ref={button}
        type="button"
        className={buttonClass}
        title={title}
        aria-label={title}
        aria-expanded={open}
        aria-controls={id}
        popoverTarget={id}
        onClick={onOpen}
      >
        {label}
      </button>
      <ul
        ref={list}
        id={id}
        popover="auto"
        className={`dropdown-menu afreact-menu${alignRight ? " dropdown-menu-right" : ""}`}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          close();
        }}
      >
        {open && children(close)}
      </ul>
    </div>
  );
}
