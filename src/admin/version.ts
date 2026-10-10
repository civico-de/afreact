import { createContext, useContext } from "react";

/** The running core's version, which the builder page hands the element. */
export const CoreVersion = createContext<string | null>(null);

/** coreHas() for the running core. */
export function useCoreHas(firstOnBranch: Record<string, string>): boolean {
  const version = useContext(CoreVersion);
  if (version === null) throw new Error("useCoreHas needs the builder's core version");
  return coreHas(version, firstOnBranch);
}

/**
 * Whether the running core has a change that reached each branch in a release of its own:
 * `firstOnBranch` maps a minor (`6.19`) to the first patch carrying it (`6.19.2`). A minor
 * missing from the map has it when it is newer than every listed one.
 */
export function coreHas(version: string, firstOnBranch: Record<string, string>): boolean {
  const running = parse(version);
  const minor = `${String(running[0])}.${String(running[1])}`;
  const first = firstOnBranch[minor];
  if (first !== undefined) return compare(running, parse(first)) >= 0;
  return Object.keys(firstOnBranch).every((listed) => compare(running, parse(`${listed}.0`)) > 0);
}

/** Major, minor, patch; an alpha or beta counts as before its .0. */
function parse(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(?:(\d+)|(alpha|beta)\d*)/.exec(version);
  if (!match) throw new Error(`Unreadable CiviCRM version "${version}"`);
  return [Number(match[1]), Number(match[2]), match[3] === undefined ? -1 : Number(match[3])];
}

function compare(a: [number, number, number], b: [number, number, number]): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}
