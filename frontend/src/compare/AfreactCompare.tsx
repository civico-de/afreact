import { useRef, useState } from "react";
import { isReady, median, resourceMetrics, type PageMetrics } from "./metrics";

export interface ComparedPage {
  label: string;
  url: string;
}
export function comparedPages(json: string): ComparedPage[] {
  const pages: unknown = JSON.parse(json);
  const valid =
    Array.isArray(pages) &&
    pages.length > 0 &&
    pages.every(
      (page: unknown) =>
        typeof page === "object" &&
        page !== null &&
        typeof (page as ComparedPage).label === "string" &&
        typeof (page as ComparedPage).url === "string",
    );
  if (!valid) throw new Error("<afreact-compare> needs pages as a JSON list of {label, url}");
  return pages as ComparedPage[];
}

interface Run {
  page: number;
  metrics: PageMetrics;
}

const TIMEOUT_MS = 30_000;

/** Loads a page into the iframe and resolves once isReady() holds, measured on the frame's own clock. */
function measure(frame: HTMLIFrameElement, url: string): Promise<PageMetrics> {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    frame.src = `${url}${url.includes("?") ? "&" : "?"}run=${Date.now()}`;
    const poll = () => {
      const win = frame.contentWindow;
      const doc = frame.contentDocument;
      if (
        win &&
        doc &&
        win.location.href !== "about:blank" &&
        doc.readyState !== "loading" &&
        isReady(doc)
      ) {
        const readyMs = win.performance.now();
        resolve({
          readyMs,
          ...resourceMetrics(
            win.performance.getEntriesByType("resource") as PerformanceResourceTiming[],
          ),
        });
        return;
      }
      if (performance.now() - started > TIMEOUT_MS) {
        reject(
          new Error(ts("%1 did not become ready within %2 s.", { 1: url, 2: TIMEOUT_MS / 1000 })),
        );
        return;
      }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  });
}

const rows = (): { key: keyof PageMetrics; label: string; unit: "ms" | "kB" | "" }[] => [
  { key: "readyMs", label: ts("Time until form and table are usable"), unit: "ms" },
  { key: "requests", label: ts("Resource requests"), unit: "" },
  { key: "apiRequests", label: ts("API requests until ready (Angular batches calls)"), unit: "" },
  { key: "scriptBytes", label: ts("JavaScript (encoded)"), unit: "kB" },
  { key: "styleBytes", label: ts("Stylesheets (encoded)"), unit: "kB" },
  { key: "otherXhrBytes", label: ts("Other XHR, e.g. Angular modules (encoded)"), unit: "kB" },
];

function format(value: number, unit: string): string {
  if (Number.isNaN(value)) return "–";
  return unit === "kB"
    ? `${(value / 1024).toFixed(1)} kB`
    : unit === "ms"
      ? `${Math.round(value)} ms`
      : String(Math.round(value));
}

export function AfreactCompare({ pages }: { pages: ComparedPage[] }) {
  const frames = useRef<(HTMLIFrameElement | null)[]>([]);
  const [rounds, setRounds] = useState(5);
  const [runs, setRuns] = useState<Run[]>([]);
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    setError(null);
    setRuns([]);
    try {
      for (let round = 0; round < rounds; round++) {
        // Rotate the order so no page always profits from the one before it.
        const order = pages.map((_, index) => (index + round) % pages.length);
        for (const page of order) {
          setProgress(ts("Round %1 of %2: %3", { 1: round + 1, 2: rounds, 3: pages[page]!.label }));
          const frame = frames.current[page];
          if (!frame) throw new Error("Comparison frame missing");
          const metrics = await measure(frame, pages[page]!.url);
          setRuns((previous) => [...previous, { page, metrics }]);
        }
      }
      setProgress(ts("Done."));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      setProgress("");
    } finally {
      setBusy(false);
    }
  }

  const stat = (page: number, key: keyof PageMetrics) =>
    median(runs.filter((run) => run.page === page).map((run) => run.metrics[key]));
  const count = (page: number) => runs.filter((run) => run.page === page).length;

  return (
    <div className="afreact-compare" id="bootstrap-theme">
      <p>
        {ts(
          "All pages render the same two Afform definitions against the same APIs. The first round loads with a cold cache for whichever page runs first; later rounds are warm. Values are medians.",
        )}
      </p>
      <div className="afreact-compare-controls">
        <label htmlFor="afreact-compare-rounds">{ts("Rounds")}</label>
        <select
          id="afreact-compare-rounds"
          className="form-control"
          value={rounds}
          disabled={busy}
          onChange={(event) => setRounds(Number(event.target.value))}
        >
          {[1, 3, 5, 10].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-primary" onClick={start} disabled={busy}>
          {ts("Measure")}
        </button>
        <span role="status">{progress}</span>
      </div>
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}
      <table className="table afreact-compare-table">
        <caption className="sr-only">{ts("Median metrics per page")}</caption>
        <thead>
          <tr>
            <th scope="col">{ts("Metric")}</th>
            {pages.map((page, index) => (
              <th key={page.url} scope="col">
                {page.label} (n={count(index)})
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows().map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.label}</th>
              {pages.map((page, index) => (
                <td key={page.url}>{format(stat(index, row.key), row.unit)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="afreact-compare-frames">
        {pages.map((page, index) => (
          <figure key={page.url}>
            <figcaption>{page.label}</figcaption>
            <iframe
              ref={(frame) => {
                frames.current[index] = frame;
              }}
              title={page.label}
              src={page.url}
            />
          </figure>
        ))}
      </div>
    </div>
  );
}
