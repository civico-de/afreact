export interface PageMetrics {
  /** Milliseconds from the page's navigation start until isReady() first held. */
  readyMs: number;
  requests: number;
  /** HTTP requests to the API; one Angular request may carry a batch of calls. */
  apiRequests: number;
  scriptBytes: number;
  styleBytes: number;
  /** Non-API XHR/fetch, e.g. Angular's module and partial payloads. */
  otherXhrBytes: number;
}

export type ResourceMetrics = Omit<PageMetrics, "readyMs">;

type Entry = Pick<PerformanceResourceTiming, "name" | "initiatorType" | "encodedBodySize">;

/** Sizes are encoded (compressed) body bytes, which stay meaningful when the cache served them. */
export function resourceMetrics(entries: Entry[]): ResourceMetrics {
  const bytes = (match: (entry: Entry) => boolean) =>
    entries.filter(match).reduce((sum, entry) => sum + entry.encodedBodySize, 0);
  const isApi = (entry: Entry) => entry.name.includes("/ajax/api4");
  const isXhr = (entry: Entry) =>
    entry.initiatorType === "xmlhttprequest" || entry.initiatorType === "fetch";
  return {
    requests: entries.length,
    apiRequests: entries.filter(isApi).length,
    scriptBytes: bytes((entry) => entry.initiatorType === "script"),
    styleBytes: bytes((entry) => entry.initiatorType === "link" || entry.initiatorType === "css"),
    otherXhrBytes: bytes((entry) => isXhr(entry) && !isApi(entry)),
  };
}

/**
 * Same readiness rule for both renderers: the contact form shows an input and
 * the contact table shows a data row (a linked name, not a loading placeholder).
 */
export function isReady(doc: Document): boolean {
  const [form, search] = doc.querySelectorAll(".facade-demo > section");
  return Boolean(form?.querySelector("input") && search?.querySelector("table tbody tr a[href]"));
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return Number.NaN;
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
