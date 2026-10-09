import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "../test/render";
import { AfreactSearch } from "./AfreactSearch";
import type { DisplaySettings } from "./types";

// A chart's own settings (chartType, format, axes) are not part of DisplaySettings.
const chartOwn = { chartType: "pie" };
const settings: DisplaySettings = {
  columns: [{ type: "field", key: "contact_type", label: "Type" }],
  ...chartOwn,
};
const SCRIPTS = ["/chart_kit.js", "/js/civi-search-display-chart-kit.js"];

/** What core's element saw: its attributes on connecting, then each change. */
const changes: [string, string | null][] = [];
let connected: FakeChart[] = [];
/** Charts whose pending run fired. */
let ran: FakeChart[] = [];

class FakeChart extends HTMLElement {
  static observedAttributes = ["filters", "settings"];
  declare afFieldsetCtrl?: {
    getFormName: () => string | null;
    getFilterValues: () => Record<string, unknown>;
  };
  nextRun?: number;
  connectedCallback() {
    connected.push(this);
    this.nextRun = window.setTimeout(() => {
      ran.push(this);
    }, 50);
  }
  attributeChangedCallback(name: string, _old: string | null, value: string | null) {
    if (this.isConnected) changes.push([name, value]);
  }
}

beforeAll(() => {
  customElements.define("civi-search-display-chart-kit", FakeChart);
});

/** A page that has not loaded chart_kit yet: the element is undefined until its scripts ran. */
let defines = true;
let scriptsRan = false;
function notLoaded(scriptsDefine = true) {
  defines = scriptsDefine;
  vi.spyOn(customElements, "get").mockImplementation((name) =>
    scriptsRan && defines && name === "civi-search-display-chart-kit" ? FakeChart : undefined,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  delete window.CRM.vars;
  changes.length = 0;
  connected = [];
  ran = [];
  scriptsRan = false;
  for (const node of document.head.querySelectorAll("script, link")) node.remove();
});

/** Lets the page's chart_kit scripts finish, the last one defining the element. */
function finishScripts() {
  const scripts = [...document.head.querySelectorAll("script")];
  expect(scripts.map((script) => script.getAttribute("src"))).toEqual(SCRIPTS);
  expect(scripts.every((script) => !script.async)).toBe(true);
  scriptsRan = true;
  for (const script of scripts) script.dispatchEvent(new Event("load"));
}

function chartOf(
  filters: Record<string, unknown> | unknown[],
  enabled = true,
  own: DisplaySettings = settings,
) {
  return (
    <AfreactSearch
      search="Contacts"
      display="Chart"
      type="chart-kit"
      settings={own}
      afform="afsearchContacts"
      filters={filters}
      enabled={enabled}
    />
  );
}

function show(filters: Record<string, unknown> | unknown[], enabled = true) {
  return renderWithQuery(chartOf(filters, enabled));
}

describe("chart display", () => {
  it("loads chart_kit once and hands core's element the display, the form and its filters", async () => {
    notLoaded();
    window.CRM.vars = {
      afreact: { chartKit: { scripts: SCRIPTS, styles: ["/chart_kit.css", "/crmChartKit.css"] } },
    };
    const { container, rerender } = show({ contact_type: "Individual" });
    expect(
      [...document.head.querySelectorAll("link")].map((link) => link.getAttribute("href")),
    ).toEqual(["/chart_kit.css", "/crmChartKit.css"]);
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
    finishScripts();
    const chart = await waitFor(() => {
      const found = container.querySelector("civi-search-display-chart-kit");
      expect(found).not.toBeNull();
      return found;
    });
    expect(connected).toHaveLength(1);
    expect(screen.queryByRole("status")).toBeNull();
    expect(chart?.getAttribute("search")).toBe("Contacts");
    expect(chart?.getAttribute("display")).toBe("Chart");
    expect(JSON.parse(chart?.getAttribute("settings") ?? "")).toEqual(settings);
    expect(chart?.getAttribute("filters")).toBe('{"contact_type":"Individual"}');
    expect(connected[0]?.afFieldsetCtrl?.getFormName()).toBe("afsearchContacts");
    // The form's values are in the filters attribute already, so the element must not add them.
    expect(connected[0]?.afFieldsetCtrl?.getFilterValues()).toEqual({});
    expect(changes).toEqual([]);

    rerender(
      <AfreactSearch
        search="Contacts"
        display="Chart"
        type="chart-kit"
        settings={{ ...settings }}
        afform="afsearchContacts"
        filters={{ contact_type: "Organization" }}
      />,
    );
    await waitFor(() => {
      expect(changes).toEqual([["filters", '{"contact_type":"Organization"}']]);
    });
    expect(connected).toHaveLength(1);
  });

  it("uses an element the page defined already, without loading chart_kit again", async () => {
    const { container } = show({});
    await waitFor(() => {
      expect(container.querySelector("civi-search-display-chart-kit")).not.toBeNull();
    });
    expect(document.head.querySelector("script")).toBeNull();
  });

  it("waits for its filters before it draws", () => {
    notLoaded();
    window.CRM.vars = { afreact: { chartKit: { scripts: SCRIPTS, styles: [] } } };
    const { container } = show({}, false);
    expect(document.head.querySelector("script")).toBeNull();
    expect(container.querySelector("civi-search-display-chart-kit")).toBeNull();
  });

  it("draws only once its filters are final, and keeps the chart while paused", async () => {
    const { container, rerender } = show({}, false);
    expect(container.querySelector("civi-search-display-chart-kit")).toBeNull();
    rerender(chartOf({ contact_type: "Individual" }));
    await waitFor(() => {
      expect(connected).toHaveLength(1);
    });
    rerender(chartOf({ contact_type: "Organization" }, false));
    expect(container.querySelector("civi-search-display-chart-kit")).toBe(connected[0]);
    expect(changes).toEqual([]);
    rerender(chartOf({ contact_type: "Organization" }));
    await waitFor(() => {
      expect(changes).toEqual([["filters", '{"contact_type":"Organization"}']]);
    });
  });

  it("waits for its filters while another chart has loaded chart_kit", async () => {
    const { container } = renderWithQuery(
      <>
        {chartOf({})}
        {chartOf({}, false)}
      </>,
    );
    await waitFor(() => {
      expect(connected).toHaveLength(1);
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(container.querySelectorAll("civi-search-display-chart-kit")).toHaveLength(1);
  });

  it("writes changed settings, which make the element reload", async () => {
    const { rerender } = show({});
    await waitFor(() => {
      expect(connected).toHaveLength(1);
    });
    const bar = { ...settings, chartType: "bar" };
    rerender(chartOf({}, true, bar));
    await waitFor(() => {
      expect(changes).toEqual([["settings", JSON.stringify(bar)]]);
    });
  });

  it("stops a removed chart's pending run", async () => {
    const { unmount } = show({});
    await waitFor(() => {
      expect(connected).toHaveLength(1);
    });
    unmount();
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    expect(ran).toEqual([]);
  });

  it("loads chart_kit once for several charts", async () => {
    notLoaded();
    window.CRM.vars = { afreact: { chartKit: { scripts: SCRIPTS, styles: [] } } };
    const { container } = renderWithQuery(
      <>
        {chartOf({})}
        {chartOf({ contact_type: "Individual" })}
      </>,
    );
    finishScripts();
    await waitFor(() => {
      expect(container.querySelectorAll("civi-search-display-chart-kit")).toHaveLength(2);
    });
  });

  it("says when chart_kit's scripts ran without defining the element", async () => {
    notLoaded(false);
    window.CRM.vars = { afreact: { chartKit: { scripts: SCRIPTS, styles: [] } } };
    show({});
    finishScripts();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "chart_kit did not define its chart element.",
    );
  });

  it("hands an empty filter list over as an empty object", async () => {
    const { container } = show([]);
    await waitFor(() => {
      expect(connected).toHaveLength(1);
    });
    expect(container.querySelector("civi-search-display-chart-kit")?.getAttribute("filters")).toBe(
      "{}",
    );
  });

  it("shows why the server could not list chart_kit's assets", async () => {
    notLoaded();
    window.CRM.vars = { afreact: { chartKit: { error: "chart_kit's bundle has an ES module." } } };
    show({});
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "chart_kit's bundle has an ES module.",
    );
    expect(document.head.querySelector("script")).toBeNull();
  });

  it("says that chart_kit is missing", async () => {
    notLoaded();
    show({});
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Charts need the chart_kit extension.",
    );
  });

  it("says which script failed to load", async () => {
    notLoaded();
    window.CRM.vars = { afreact: { chartKit: { scripts: SCRIPTS, styles: [] } } };
    show({});
    document.head.querySelector("script")?.dispatchEvent(new Event("error"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load /chart_kit.js.");
  });
});
