import { normalize, savePayload } from "./editor";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The paths at which two JSON values differ; values never appear in the result. */
export function diffPaths(a: unknown, b: unknown, path = ""): string[] {
  const at = (key: string | number) => (path ? `${path}.${String(key)}` : String(key));
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return [path || "."];
    return a.flatMap((item, i) => diffPaths(item, b[i], at(i)));
  }
  if (isRecord(a) && isRecord(b))
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((key) =>
      diffPaths(a[key], b[key], at(key)),
    );
  return JSON.stringify(a) === JSON.stringify(b) ? [] : [path || "."];
}

const asList = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const isEmpty = (value: unknown) =>
  value === null ||
  value === undefined ||
  (Array.isArray(value) && !value.length) ||
  (isRecord(value) && !Object.keys(value).length);

/** What core's editor does to an unedited search: an empty `form_values.join` and `{}` for an empty pager. */
function expected(path: string, stored: Record<string, unknown>): boolean {
  if (path === "form_values" || path === "form_values.join") {
    const formValues = stored.form_values;
    return isEmpty(formValues) || (isRecord(formValues) && formValues.join === undefined);
  }
  return /^displays\.\d+\.settings\.pager$/.test(path);
}

/**
 * A stored search as `loadParams("edit")` reads it, against the save the editor would send
 * unedited: the paths that differ beyond what core's editor also changes.
 */
export function searchRoundTrip(stored: Record<string, unknown>): {
  differs: string[];
  expected: string[];
} {
  const search = normalize(stored);
  const calls = savePayload(search, search.groups.length > 0);
  const saved = calls.saved?.[2];
  const record: unknown = isRecord(saved) ? asList(saved.records)[0] : undefined;
  const chain = isRecord(saved) && isRecord(saved.chain) ? saved.chain : {};
  const records = (call: unknown) =>
    Array.isArray(call) && isRecord(call[2]) ? call[2].records : undefined;
  const sent = {
    ...(isRecord(record) ? record : {}),
    groups: asList(records(chain.groups)),
    displays: asList(records(chain.displays)),
    tag_id: asList(records(chain.tag_id)).map((tag) => (isRecord(tag) ? tag.tag_id : tag)),
  };
  const before = {
    ...stored,
    groups: asList(stored.groups),
    displays: asList(stored.displays),
    tag_id: asList(stored.tag_id).map(Number),
  };
  const paths = diffPaths(before, sent);
  return {
    differs: paths.filter((path) => !expected(path, stored)),
    expected: paths.filter((path) => expected(path, stored)),
  };
}
