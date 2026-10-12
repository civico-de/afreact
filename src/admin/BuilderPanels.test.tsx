import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuilderPanels, pluginsReady, pluginVerdict } from "./BuilderPanels";

class ProbePanel extends HTMLElement {
  record: unknown;
  searchMeta: unknown;
  validationMessage = "";
}
customElements.define("afreact-probe-panel", ProbePanel);

const setPanels = (panels: string[] | undefined) => {
  window.CRM.vars = { ...window.CRM.vars, afreactAdmin: { panels } };
};

afterEach(() => {
  setPanels(undefined);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("builder panels", () => {
  it("renders nothing when no extension names a panel", () => {
    const { container } = render(<BuilderPanels record={{ label: "S" }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("hands each panel a copy of the record when it changes, and its message blocks saving", async () => {
    setPanels(["afreact-probe-panel"]);
    const record = { label: "S", displays: [{ type: "table" }] };
    const searchMeta = { parseExpr: () => undefined };
    const { container, rerender } = render(
      <BuilderPanels record={record} services={{ searchMeta }} />,
    );
    const panel = container.querySelector("afreact-probe-panel");
    if (!(panel instanceof ProbePanel)) throw new Error("The panel element is missing.");
    await waitFor(() => {
      expect(panel.record).toEqual(record);
    });
    expect(panel.record).not.toBe(record);
    expect(panel.searchMeta).toBe(searchMeta);

    const given = panel.record;
    rerender(<BuilderPanels record={{ ...record }} services={{ searchMeta }} />);
    expect(panel.record).toBe(given);

    const changed = { ...record, label: "T" };
    rerender(<BuilderPanels record={changed} />);
    expect(container.querySelector("afreact-probe-panel")).toBe(panel);
    expect(panel.record).toEqual(changed);

    expect(pluginVerdict(container).invalid).toEqual([]);
    panel.validationMessage = "Pick a chart.";
    expect(pluginVerdict(container).invalid).toEqual(["Pick a chart."]);
  });

  it("reaches the setters of a panel defined after it mounts, and blocks saving until then", async () => {
    setPanels(["afreact-late-panel"]);
    vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
    const { container } = render(<BuilderPanels record={{ label: "late" }} />);
    expect(pluginVerdict(container).invalid).toEqual([
      "The element afreact-late-panel is still loading.",
    ]);
    const seen: unknown[] = [];
    customElements.define(
      "afreact-late-panel",
      class extends HTMLElement {
        set record(record: unknown) {
          seen.push(record);
        }
        get validationMessage() {
          return "Late check ran.";
        }
      },
    );
    vi.restoreAllMocks();
    window.dispatchEvent(new Event("load"));
    await waitFor(() => {
      expect(seen).toEqual([{ label: "late" }]);
    });
    expect(pluginVerdict(container).invalid).toEqual(["Late check ran."]);
  });

  it("shows a panel whose setter throws as an error that blocks saving, until it stops", async () => {
    customElements.define(
      "afreact-throwing-panel",
      class extends HTMLElement {
        set record(record: { label: string }) {
          if (record.label === "bad") throw new Error("The panel broke.");
        }
        get validationMessage() {
          return "";
        }
      },
    );
    setPanels(["afreact-throwing-panel"]);
    const { container, rerender } = render(<BuilderPanels record={{ label: "bad" }} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("The panel broke.");
    expect(pluginVerdict(container).invalid).toEqual(["The panel broke."]);
    rerender(<BuilderPanels record={{ label: "good" }} />);
    expect(pluginVerdict(container).invalid).toEqual([]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("names a panel no extension defines and blocks saving", async () => {
    setPanels(["afreact-undefined-panel"]);
    const { container } = render(<BuilderPanels record={{ label: "S" }} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No extension defines the element afreact-undefined-panel.",
    );
    expect(pluginVerdict(container).invalid).toEqual([
      "No extension defines the element afreact-undefined-panel.",
    ]);
  });

  it("collects the panels' save notes, and refuses notes that are not a list of texts", () => {
    const element = document.createElement("div");
    element.setAttribute("data-afreact-plugin", "");
    const root = document.createElement("div");
    root.append(element);
    expect(pluginVerdict(root).notes).toEqual([]);
    Reflect.set(element, "saveNotes", ["Check the join."]);
    expect(pluginVerdict(root).notes).toEqual(["Check the join."]);
    expect(pluginVerdict(root).invalid).toEqual([]);
    Reflect.set(element, "saveNotes", "Check the join.");
    expect(pluginVerdict(root).notes).toEqual([]);
    expect(pluginVerdict(root).invalid).toEqual([
      "div has save notes that are not a list of texts.",
    ]);
  });

  it("blocks saving with the error of a panel getter that throws", () => {
    const element = document.createElement("div");
    element.setAttribute("data-afreact-plugin", "");
    Object.defineProperty(element, "validationMessage", {
      get() {
        throw new Error("The getter broke.");
      },
    });
    const root = document.createElement("div");
    root.append(element);
    expect(pluginVerdict(root).invalid).toEqual(["The getter broke."]);
  });

  it("blocks saving when the panel's constructor throws", async () => {
    customElements.define(
      "afreact-broken-panel",
      class extends HTMLElement {
        constructor() {
          super();
          throw new Error("No panel today.");
        }
      },
    );
    // The browser reports the constructor's error on window and creates a plain element.
    const reported: unknown[] = [];
    const report = (event: ErrorEvent) => {
      reported.push(event.error);
      event.preventDefault();
    };
    window.addEventListener("error", report);
    setPanels(["afreact-broken-panel"]);
    const { container } = render(<BuilderPanels record={{ label: "S" }} />);
    window.removeEventListener("error", report);
    expect(reported).toEqual([new Error("No panel today.")]);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The element afreact-broken-panel could not be created.",
    );
    expect(pluginVerdict(container).invalid).toEqual([
      "The element afreact-broken-panel could not be created.",
    ]);
  });

  it("waits for each panel's ready promise, and a rejected one is an error", async () => {
    const root = document.createElement("div");
    const panel = (ready: unknown) => {
      const element = document.createElement("div");
      element.setAttribute("data-afreact-plugin", "");
      Reflect.set(element, "ready", ready);
      root.append(element);
    };
    let finish: () => void = () => undefined;
    panel(undefined);
    panel(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    panel(Promise.reject(new Error("The check could not be run.")));
    let settled = false;
    const ready = pluginsReady(root).then((errors) => {
      settled = true;
      return errors;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    finish();
    expect(await ready).toEqual(["The check could not be run."]);
  });

  it("waits again while a panel hands out a newer ready promise", async () => {
    const root = document.createElement("div");
    const element = document.createElement("div");
    element.setAttribute("data-afreact-plugin", "");
    root.append(element);
    let first: () => void = () => undefined;
    let second: () => void = () => undefined;
    Reflect.set(
      element,
      "ready",
      new Promise<void>((resolve) => {
        first = resolve;
      }),
    );
    let settled = false;
    const ready = pluginsReady(root).then((errors) => {
      settled = true;
      return errors;
    });
    Reflect.set(
      element,
      "ready",
      new Promise<void>((resolve) => {
        second = resolve;
      }),
    );
    first();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(settled).toBe(false);
    second();
    expect(await ready).toEqual([]);
  });

  it("refuses a save whose panel never settles its ready promise, naming the panel", async () => {
    vi.useFakeTimers();
    const root = document.createElement("div");
    const element = document.createElement("afreact-stuck-panel");
    element.setAttribute("data-afreact-plugin", "");
    Reflect.set(
      element,
      "ready",
      new Promise(() => {
        // Never settles.
      }),
    );
    root.append(element);
    const ready = pluginsReady(root, 5000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await ready).toEqual(["afreact-stuck-panel did not finish its check within 5 seconds."]);
  });

  it("stops asking a panel whose ready getter hands out a new promise each time once the wait ends", async () => {
    vi.useFakeTimers();
    const root = document.createElement("div");
    const element = document.createElement("afreact-restless-panel");
    element.setAttribute("data-afreact-plugin", "");
    let asked = 0;
    Object.defineProperty(element, "ready", {
      get: () => {
        asked++;
        return Promise.resolve();
      },
    });
    root.append(element);
    const ready = pluginsReady(root, 5000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await ready).toEqual([
      "afreact-restless-panel did not finish its check within 5 seconds.",
    ]);
    const after = asked;
    await vi.advanceTimersByTimeAsync(1000);
    expect(asked).toBe(after);
  });
});
