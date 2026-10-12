import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

export interface TabItem {
  key: string;
  label: ReactNode;
  title?: string;
  /** Classes of the tab's list item. */
  className?: string;
}

const tabId = (base: string, key: string) => `${base}-tab-${key}`;
const panelId = (base: string, key: string) => `${base}-panel-${key}`;

/** Selects without following the link: tabs are links so the theme's `nav-tabs > li > a` styles them. */
export const tabClick = (select: () => void) => (event: MouseEvent) => {
  event.preventDefault();
  select();
};

/**
 * Bootstrap `nav-tabs` as an ARIA tablist: arrow keys, Home and End move between the tabs. A
 * tablist owns tabs only, so controls of a tab go beside the list, not into it.
 */
export function TabList({
  base,
  items,
  active,
  onSelect,
  label,
  className = "nav nav-tabs",
}: {
  /** Prefixes the ids of the tabs and their panels. */
  base: string;
  items: TabItem[];
  active: string;
  onSelect: (key: string) => void;
  label?: string;
  className?: string;
}) {
  const onKeyDown = (event: KeyboardEvent) => {
    const index = items.findIndex((item) => item.key === active);
    const last = items.length - 1;
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % items.length
        : event.key === "ArrowLeft"
          ? (index - 1 + items.length) % items.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    const item = next === null ? undefined : items[next];
    if (!item) return;
    event.preventDefault();
    onSelect(item.key);
    document.getElementById(tabId(base, item.key))?.focus();
  };
  return (
    <ul role="tablist" aria-label={label} className={className}>
      {items.map((item) => (
        <li
          key={item.key}
          role="presentation"
          className={
            [item.className, item.key === active && "active"].filter(Boolean).join(" ") || undefined
          }
        >
          <a
            href="#"
            role="tab"
            id={tabId(base, item.key)}
            aria-selected={item.key === active}
            aria-controls={panelId(base, item.key)}
            tabIndex={item.key === active ? 0 : -1}
            title={item.title}
            onClick={tabClick(() => {
              onSelect(item.key);
            })}
            onKeyDown={onKeyDown}
          >
            {item.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** The panel of tab `key`, hidden unless it is active. */
export function TabPanel({
  base,
  tab,
  active,
  className,
  children,
}: {
  base: string;
  tab: string;
  active: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={panelId(base, tab)}
      aria-labelledby={tabId(base, tab)}
      hidden={tab !== active}
      className={className}
    >
      {children}
    </div>
  );
}
