import { createParser, parseAsInteger } from "nuqs";

/**
 * URL keys of a display's state in the hash. `prefix` is "" when the page shows one
 * display, else the display name and a dot (see useUrlPrefix):
 *   `_sort=title,-created_date` (a leading "-" sorts descending), `_page=2`, `_limit=50`.
 * Filters use the keys afField reads: `<field>`, or `<fieldset>.<field>` with a prefix.
 */
export function displayKeys(prefix: string) {
  return { sort: `${prefix}_sort`, page: `${prefix}_page`, limit: `${prefix}_limit` };
}

export type Sort = [string, "ASC" | "DESC"][];

export function sortText(sort: Sort): string {
  return sort.map(([key, direction]) => (direction === "DESC" ? `-${key}` : key)).join(",");
}

export function parseSort(text: string): Sort | null {
  const sort: Sort = text
    .split(",")
    .filter(Boolean)
    .map((item) => (item.startsWith("-") ? [item.slice(1), "DESC"] : [item, "ASC"]));
  return sort.length ? sort : null;
}

export const sortParser = createParser({
  parse: parseSort,
  serialize: sortText,
  eq: (a, b) => sortText(a) === sortText(b),
});

/** Page numbers and sizes below 1 mean nothing, so the URL cannot ask for them. */
export const positiveInteger = createParser({
  parse: (text) => {
    const number = parseAsInteger.parse(text);
    return number !== null && number >= 1 ? number : null;
  },
  serialize: String,
});
