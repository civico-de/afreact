/** The pages <afreact-compare> measures, read before its lazy chunk loads. */
export interface ComparedPage {
  label: string;
  url: string;
}
function isComparedPage(page: unknown): page is ComparedPage {
  return (
    typeof page === "object" &&
    page !== null &&
    "label" in page &&
    typeof page.label === "string" &&
    "url" in page &&
    typeof page.url === "string"
  );
}

export function comparedPages(json: string): ComparedPage[] {
  const pages: unknown = JSON.parse(json);
  if (!Array.isArray(pages) || pages.length === 0 || !pages.every(isComparedPage))
    throw new Error("<afreact-compare> needs pages as a JSON list of {label, url}");
  return pages;
}
