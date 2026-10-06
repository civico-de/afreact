import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { LinkContent } from "./LinkContent";
import type { Link } from "./types";

export interface MenuProps {
  /** Classes of the wrapping `.btn-group`; Bootstrap's `open` is added while the menu shows. */
  groupClass?: string;
  /** Row menus mark their group as core does. */
  groupRole?: "group";
  buttonClass: string;
  /** Button content before the caret. */
  label: ReactNode;
  /** Screen-reader text after the caret. */
  srLabel?: string;
  links: Link[];
  alignRight: boolean;
  itemClass?: (link: Link) => string | undefined;
  /** Items that stay in the menu, focusable, but do nothing. */
  isDisabled?: (link: Link) => boolean;
  onLinkClick?: (link: Link, event: MouseEvent<HTMLAnchorElement>) => void;
  /** Called as the menu opens, before it shows. */
  onOpen?: () => void;
  disabled?: boolean;
  buttonTitle?: string;
  /** Controls in the same `.btn-group` before the menu button. */
  prefix?: ReactNode;
}

/**
 * A Bootstrap dropdown as the menu button pattern: a native popover (light dismiss, top layer),
 * opened by click, Enter, Space or the arrow keys, closed by Escape with focus back on the button.
 * Handled keys stop at the menu, so Bootstrap's own dropdown keys on an open group stay out.
 */
export function Menu({
  groupClass = "btn-group",
  groupRole,
  buttonClass,
  label,
  srLabel,
  links,
  alignRight,
  itemClass,
  isDisabled,
  onLinkClick,
  onOpen,
  disabled,
  buttonTitle,
  prefix,
}: MenuProps) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const focusOnOpen = useRef<"first" | "last">("first");
  const [open, setOpen] = useState(false);

  const items = () => [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];

  useEffect(() => {
    const list = menu.current;
    const onToggle = (event: Event) => {
      setOpen(event instanceof ToggleEvent && event.newState === "open");
    };
    list?.addEventListener("toggle", onToggle);
    return () => {
      list?.removeEventListener("toggle", onToggle);
    };
  }, []);

  // The theme shows the menu only inside an open btn-group, so focus moves once that renders.
  useLayoutEffect(() => {
    if (!open) return;
    const all = items();
    (focusOnOpen.current === "last" ? all.at(-1) : all[0])?.focus();
    focusOnOpen.current = "first";
  }, [open]);

  // The top layer ignores the btn-group's position, so the menu follows its button by hand.
  useLayoutEffect(() => {
    const list = menu.current;
    const anchor = button.current;
    const following = open && list && anchor ? window : null;
    const place = () => {
      if (!list || !anchor) return;
      const box = anchor.getBoundingClientRect();
      const height = document.documentElement.clientHeight;
      // A long menu scrolls within the viewport; one that fits better above its button goes there.
      const below = height - box.bottom - 8;
      const above = box.top - 8;
      const flip = list.scrollHeight > below && above > below;
      list.style.top = flip ? "auto" : `${String(box.bottom)}px`;
      list.style.bottom = flip ? `${String(height - box.top)}px` : "auto";
      list.style.maxHeight = `${String(Math.max(flip ? above : below, 0))}px`;
      list.style.left = alignRight ? "auto" : `${String(box.left)}px`;
      list.style.right = alignRight
        ? `${String(document.documentElement.clientWidth - box.right)}px`
        : "auto";
    };
    if (following) place();
    following?.addEventListener("scroll", place, true);
    following?.addEventListener("resize", place);
    return () => {
      following?.removeEventListener("scroll", place, true);
      following?.removeEventListener("resize", place);
    };
  }, [open, alignRight]);

  const openWith = (focus: "first" | "last") => {
    focusOnOpen.current = focus;
    if (open) {
      (focus === "last" ? items().at(-1) : items()[0])?.focus();
      return;
    }
    onOpen?.();
    menu.current?.showPopover();
  };

  const onButtonKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    event.stopPropagation();
    openWith(event.key === "ArrowUp" ? "last" : "first");
  };

  const close = () => {
    menu.current?.hidePopover();
    button.current?.focus();
  };

  const onMenuKeyDown = (event: KeyboardEvent) => {
    const all = items();
    const current = all.findIndex((item) => item === document.activeElement);
    const move = (index: number) => {
      event.preventDefault();
      event.stopPropagation();
      all[(index + all.length) % all.length]?.focus();
    };
    if (event.key === "ArrowDown") move(current + 1);
    else if (event.key === "ArrowUp") move(current - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(all.length - 1);
    else if ((event.key === "Enter" || event.key === " ") && !all[current]?.hasAttribute("href")) {
      // Items without a link (bulk actions) activate like buttons.
      event.preventDefault();
      event.stopPropagation();
      all[current]?.click();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Tab") menu.current?.hidePopover();
  };

  return (
    <div className={open ? `${groupClass} open` : groupClass} role={groupRole}>
      {prefix}
      <button
        ref={button}
        type="button"
        className={buttonClass}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={id}
        popoverTarget={id}
        disabled={disabled}
        title={buttonTitle}
        onClick={onOpen}
        onKeyDown={onButtonKeyDown}
      >
        {label}
        <span className="caret" />
        {srLabel && <span className="sr-only">{srLabel}</span>}
      </button>
      <ul
        ref={menu}
        id={id}
        popover="auto"
        role="menu"
        className={`dropdown-menu afreact-menu${alignRight ? " dropdown-menu-right" : ""}`}
        onKeyDown={onMenuKeyDown}
      >
        {links.map((link, index) => (
          <li key={index} role="none" className={itemClass?.(link)}>
            <a
              role="menuitem"
              tabIndex={-1}
              href={link.url}
              target={link.target}
              title={link.title}
              aria-disabled={isDisabled?.(link) ? true : undefined}
              onClick={(event) => {
                onLinkClick?.(link, event);
                menu.current?.hidePopover();
              }}
            >
              <LinkContent link={link} />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
