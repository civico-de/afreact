import { useQuery } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { errorMessage } from "../api/civi";
import type { DisplaySettings } from "./types";

const TAG = "civi-search-display-chart-kit";

/** The timers of core's element, which its disconnectedCallback leaves running. */
interface ChartElement extends HTMLElement {
  nextRun?: number;
  nextReload?: number;
  filterChangeTimeout?: number;
}

interface ChartDisplayProps {
  search: string;
  display: string;
  settings: DisplaySettings;
  afform?: string;
  /** The form's filter values merged with the display's own. */
  filters: Record<string, unknown> | unknown[];
  /** False while the filters are not final or the display's tab is hidden. */
  enabled: boolean;
}

/** crmSearchDisplayChartKit: core's <civi-search-display-chart-kit>, which draws the chart itself. */
export function ChartDisplay({
  search,
  display,
  settings,
  afform,
  filters,
  enabled,
}: ChartDisplayProps) {
  const container = useRef<HTMLDivElement>(null);
  const loaded = useQuery({
    queryKey: ["chart_kit"],
    queryFn: loadChartKit,
    staleTime: Infinity,
    enabled,
  });
  // Drawn once the filters are final; a later pause (hidden tab) keeps the chart.
  const [ready, setReady] = useState(false);
  if (!ready && enabled && loaded.isSuccess) setReady(true);
  const attributes = {
    settings: JSON.stringify(settings),
    // Core reads "[]" as a string and spreads its characters into the filters (see upstream bugs).
    filters: JSON.stringify(Array.isArray(filters) ? {} : filters),
  };
  const current = useEffectEvent(() => attributes);

  useEffect(() => {
    const parent = container.current;
    const chart: ChartElement | null = ready && parent ? document.createElement(TAG) : null;
    if (chart && parent) {
      // civi-search-display asks an Angular afFieldset controller for the form's name; the
      // form's values arrive in `filters`.
      Object.defineProperty(chart, "afFieldsetCtrl", {
        value: { getFormName: () => afform ?? null, getFilterValues: () => ({}) },
      });
      chart.setAttribute("search", search);
      chart.setAttribute("display", display);
      for (const [name, value] of Object.entries(current())) chart.setAttribute(name, value);
      parent.replaceChildren(chart);
    }
    return () => {
      if (!chart) return;
      chart.remove();
      // A removed chart would still run its search and draw into the void (see upstream bugs).
      clearTimeout(chart.nextRun);
      clearTimeout(chart.nextReload);
      clearTimeout(chart.filterChangeTimeout);
    };
  }, [ready, search, display, afform]);

  // The element reruns on a changed attribute, so only a real change is written.
  useEffect(() => {
    const chart = container.current?.firstElementChild;
    if (!chart || !enabled) return;
    for (const [name, value] of Object.entries(attributes))
      if (chart.getAttribute(name) !== value) chart.setAttribute(name, value);
  });

  return (
    <>
      {loaded.error ? (
        <p className="alert alert-danger" role="alert">
          {errorMessage(loaded.error)}
        </p>
      ) : (
        !ready && <p role="status">{ts("Loading…")}</p>
      )}
      <div ref={container} />
    </>
  );
}

export const chartKitMissing = () => ts("Charts need the chart_kit extension.");

/** chart_kit's bundle, once per page: d3 and dc load only where a chart is drawn. */
async function loadChartKit(): Promise<true> {
  if (customElements.get(TAG)) return true;
  const assets = window.CRM.vars?.afreact?.chartKit;
  if (!assets) throw new Error(chartKitMissing());
  if ("error" in assets) throw new Error(assets.error);
  for (const href of assets.styles) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.append(link);
  }
  // Fetched together, run in the bundle's order: each file builds on those before it.
  await Promise.all(assets.scripts.map(loadScript));
  // A script that throws while running still fires its load event.
  if (!customElements.get(TAG)) throw new Error(ts("chart_kit did not define its chart element."));
  return true;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.addEventListener("load", () => {
      resolve();
    });
    script.addEventListener("error", () => {
      reject(new Error(ts("Could not load %1.", { 1: src })));
    });
    document.head.append(script);
  });
}
