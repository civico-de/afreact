/** A page link of SearchKit's pager; `label` is "..." for a jump over hidden pages. */
export interface PageLink {
  number: number;
  label: string;
  active: boolean;
}

const MAX_SIZE = 5;

/**
 * The page links SearchKit's pager shows: uib-pagination's getPages() with the settings of
 * crmSearchDisplay/Pager.html (max-size 5, rotate, boundary-link-numbers, force-ellipses).
 */
export function pageLinks(current: number, total: number): PageLink[] {
  const link = (number: number, label = String(number)) => ({
    number,
    label,
    active: number === current,
  });
  if (total <= MAX_SIZE) return Array.from({ length: total }, (_, index) => link(index + 1));
  let start = Math.max(current - Math.floor(MAX_SIZE / 2), 1);
  let end = start + MAX_SIZE - 1;
  if (end > total) {
    end = total;
    start = end - MAX_SIZE + 1;
  }
  const links = Array.from({ length: end - start + 1 }, (_, index) => link(start + index));
  const before = start === 3 ? [link(2)] : start > 3 ? [link(start - 1, "...")] : [];
  const after =
    end === total - 2 ? [link(total - 1)] : end < total - 2 ? [link(end + 1, "...")] : [];
  return [
    ...(start > 1 ? [link(1), ...before] : []),
    ...links,
    ...(end < total ? [...after, link(total)] : []),
  ];
}
