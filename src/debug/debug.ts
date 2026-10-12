import { createContext, useContext, useEffect, useEffectEvent } from "react";

const STORAGE_KEY = "afreact-debug";

/** Whether the user may see debug output, as core's SearchKit asks before it shows its SQL. */
export const debugAllowed = () => window.CRM.checkPerm("view debug output");

/** The viewer's own switch, kept in this browser; false where the browser keeps nothing. */
export function debugSwitchedOn(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Sets the viewer's switch; false where the browser refuses to keep it. */
export function switchDebug(on: boolean): boolean {
  try {
    if (on) window.localStorage.setItem(STORAGE_KEY, "1");
    else window.localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export const debugMode = () => debugAllowed() && debugSwitchedOn();

export type DebugValue = string | string[];

export interface DebugLink {
  label: string;
  href: string;
}

/** What one mounted part adds to a section of the debug panel. */
export interface DebugEntry {
  section: string;
  facts: Record<string, DebugValue>;
  links: DebugLink[];
}

let nextId = 0;
const entries = new Map<number, DebugEntry>();
const listeners = new Set<() => void>();
let snapshot: DebugEntry[] = [];
let mountDock: (() => void) | null = null;

/** Called once by the dock's module, which mounts it when the first entry arrives. */
export function onFirstDebugEntry(mount: () => void) {
  mountDock = mount;
}

function changed() {
  snapshot = [...entries.values()];
  for (const listener of listeners) listener();
}

/** Adds `entry` to the panel until the returned function removes it. */
export function addDebugEntry(entry: DebugEntry): () => void {
  const id = nextId++;
  entries.set(id, entry);
  changed();
  mountDock?.();
  return () => {
    entries.delete(id);
    changed();
  };
}

export function subscribeDebug(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const debugEntries = () => snapshot;

/** The panel section the surrounding form or builder fills. */
export const DebugSection = createContext("");

/** Adds facts and links to the surrounding section while mounted, in debug mode only. */
export function useDebugFacts(facts: Record<string, DebugValue>, links: DebugLink[] = []) {
  const section = useContext(DebugSection);
  const entry = useEffectEvent((): DebugEntry => ({ section, facts, links }));
  const key = JSON.stringify([facts, links]);
  useEffect(() => {
    const remove = section && debugMode() ? addDebugEntry(entry()) : null;
    return () => {
      remove?.();
    };
  }, [section, key]);
}

/** Renders nothing; adds its facts to the surrounding section. */
export function DebugFacts({
  facts,
  links,
}: {
  facts: Record<string, DebugValue>;
  links?: DebugLink[];
}) {
  useDebugFacts(facts, links);
  return null;
}

/** The section's entries merged: a fact's values from all parts, links once each. */
export function debugSections(all: DebugEntry[]) {
  const sections = new Map<string, { facts: Map<string, string[]>; links: DebugLink[] }>();
  for (const { section, facts, links } of all) {
    const merged = sections.get(section) ?? { facts: new Map<string, string[]>(), links: [] };
    sections.set(section, merged);
    for (const [label, value] of Object.entries(facts)) {
      const values = merged.facts.get(label) ?? [];
      for (const item of Array.isArray(value) ? value : [value])
        if (!values.includes(item)) values.push(item);
      merged.facts.set(label, values);
    }
    for (const link of links)
      if (!merged.links.some((known) => known.href === link.href && known.label === link.label))
        merged.links.push(link);
  }
  return [...sections].map(([title, { facts, links }]) => ({ title, facts: [...facts], links }));
}
