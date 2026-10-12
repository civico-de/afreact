import { diffPaths } from "../search/roundTrip";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isEmpty = (value: unknown) =>
  value === null ||
  value === undefined ||
  value === "" ||
  (Array.isArray(value) && !value.length) ||
  (isRecord(value) && !Object.keys(value).length);

/** The value at a path diffPaths names, or undefined where the path does not exist. */
function at(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (Array.isArray(current)) return current[Number(key)];
    return isRecord(current) ? current[key] : undefined;
  }, value);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export interface RoundTripContext {
  /** The tags of the site's blocks. */
  blocks: string[];
  /** The first confirmation type, which core's editor sets where none is. */
  confirmationType: string;
}

/**
 * What core's editor does to an unedited form, value included: initializeForm(),
 * backfillEntityDefaults(), initializeBlockContainer() and doSave().
 */
function expected(
  path: string,
  stored: Record<string, unknown>,
  sent: Record<string, unknown>,
  context: RoundTripContext,
): boolean {
  const value = at(sent, path);
  const fills: Record<string, unknown> = {
    icon: "fa-list-alt",
    placement: [],
    placement_filters: {},
    permission_operator: "AND",
    confirmation_type: context.confirmationType,
    server_route: "",
  };
  if (path in fills) return isEmpty(stored[path]) && same(value, fills[path]);
  if (path === "create_submission")
    return (!!stored.manual_processing || !!stored.allow_verification_by_email) && value === true;
  const attribute = /^(layout(?:\.(?:\d+|#children))*)\.(actions|security)$/.exec(path);
  if (!attribute?.[1] || at(stored, path) !== undefined) return false;
  const node = at(stored, attribute[1]);
  if (!isRecord(node)) return false;
  if (node["#tag"] === "af-entity")
    return (
      stored.type === "form" &&
      value === (attribute[2] === "actions" ? "{create: true, update: true}" : "RBAC")
    );
  // React fills in every join and block, core those on the tabs the admin opened.
  const container = "af-join" in node || context.blocks.includes(String(node["#tag"]));
  return container && attribute[2] === "actions" && value === "{update: true, delete: true}";
}

/** Nodes whose attributes the save would write in another order, which changes the file. */
function reordered(stored: unknown, sent: unknown, path: string): string[] {
  if (Array.isArray(stored) && Array.isArray(sent))
    return stored.flatMap((node, i) => reordered(node, sent[i], `${path}.${String(i)}`));
  if (!isRecord(stored) || !isRecord(sent)) return [];
  const keys = Object.keys(stored);
  const kept = Object.keys(sent).filter((key) => keys.includes(key));
  const own = keys.filter((key) => key in sent).join() === kept.join() ? [] : [`${path} order`];
  return [...own, ...reordered(stored["#children"], sent["#children"], `${path}.#children`)];
}

/**
 * A stored form as `Afform.loadAdminData` reads it, against the record React's editor would save
 * unedited: the paths that differ beyond what core's editor also changes. Values never appear.
 */
export function formRoundTrip(
  stored: Record<string, unknown>,
  sent: Record<string, unknown>,
  context: RoundTripContext,
): { differs: string[]; expected: string[] } {
  const paths = diffPaths(stored, sent);
  return {
    differs: [
      ...paths.filter((path) => !expected(path, stored, sent, context)),
      ...reordered(stored.layout, sent.layout, "layout"),
    ],
    expected: paths.filter((path) => expected(path, stored, sent, context)),
  };
}
