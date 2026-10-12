import { useQuery } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { errorMessage } from "../api/civi";
import type { DisplaySettings } from "./types";

const TAG = "civi-search-display-chart-kit";

/** The element another extension defines to render its display type, as chart_kit does. */
export const pluginDisplayTag = (type: string) => `civi-search-display-${type}`;

/** The timers of core's CiviSearchDisplay base, which its disconnectedCallback leaves running. */
interface DisplayElement extends HTMLElement {
  nextRun?: number;
  nextReload?: number;
  filterChangeTimeout?: number;
}

interface ElementDisplayProps {
  tag: string;
  /** Defines the element, once per page. */
  load: () => Promise<true>;
  search: string;
  display: string;
  settings: DisplaySettings;
  afform?: string;
  /** The form's filter values merged with the display's own. */
  filters: Record<string, unknown> | unknown[];
  /** False while the filters are not final or the display's tab is hidden. */
  enabled: boolean;
}

/** A display element on core's CiviSearchDisplay base, such as chart_kit's, which draws itself. */
export function ElementDisplay({
  tag,
  load,
  search,
  display,
  settings,
  afform,
  filters,
  enabled,
}: ElementDisplayProps) {
  const container = useRef<HTMLDivElement>(null);
  const loaded = useQuery({
    queryKey: ["displayElement", tag],
    queryFn: load,
    staleTime: Infinity,
    enabled,
  });
  // deviation:chart-attached-when-runnable
  // Drawn once the filters are final; a later pause (hidden tab) keeps the chart.
  const [ready, setReady] = useState(false);
  if (!ready && enabled && loaded.isSuccess) setReady(true);
  const attributes = {
    settings: JSON.stringify(settings),
    // deviation:chart-empty-filters-object
    // Core reads "[]" as a string and spreads its characters into the filters (see upstream bugs).
    filters: JSON.stringify(Array.isArray(filters) ? {} : filters),
  };
  const current = useEffectEvent(() => attributes);

  useEffect(() => {
    const parent = container.current;
    const chart: DisplayElement | null = ready && parent ? document.createElement(tag) : null;
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
      // deviation:chart-removed-clears-timers
      // A removed element would still run its search and draw into the void (see upstream bugs).
      clearTimeout(chart.nextRun);
      clearTimeout(chart.nextReload);
      clearTimeout(chart.filterChangeTimeout);
    };
  }, [ready, tag, search, display, afform]);

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

/** Another extension's element, defined by its scripts once the page has loaded. */
export async function loadPluginElement(tag: string): Promise<true> {
  if (document.readyState !== "complete")
    await new Promise((resolve) => {
      window.addEventListener("load", resolve, { once: true });
    });
  if (!customElements.get(tag))
    throw new Error(ts("No extension defines the element %1.", { 1: tag }));
  return true;
}

export const chartKitMissing = () => ts("Charts need the chart_kit extension.");

// deviation:chart-scripts-on-demand
/** chart_kit's bundle, once per page: d3 and dc load only where a chart is drawn. */
export async function loadChartKit(): Promise<true> {
  if (customElements.get(TAG)) return true;
  const assets = window.CRM.vars?.afreact?.chartKit;
  // deviation:chart-kit-missing-alert
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
