import { afterEach, describe, expect, it } from "vitest";
import { addStylesheet, loadScript } from "./scripts";

afterEach(() => {
  document.head.replaceChildren();
});

const sheets = () =>
  [...document.head.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet]")].map((link) =>
    link.getAttribute("href"),
  );

describe("addStylesheet", () => {
  it("leaves out a stylesheet the page has under its absolute URL", () => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = new URL("/core/ang/crmUI.css?r=1", document.baseURI).href;
    document.head.append(link);
    addStylesheet("/core/ang/crmUI.css?r=1");
    addStylesheet("/core/ang/crmUI.css?r=2");
    addStylesheet("/core/ang/crmUI.css?r=2");
    expect(sheets()).toEqual([link.href, "/core/ang/crmUI.css?r=2"]);
  });
});

describe("loadScript", () => {
  const script = (src: string) => {
    const found = document.head.querySelector(`script[src="${src}"]`);
    if (!(found instanceof HTMLScriptElement)) throw new Error(`No script ${src}.`);
    return found;
  };

  it("runs the scripts in the order of the calls", async () => {
    const first = loadScript("/first.js");
    const second = loadScript("/second.js");
    expect([script("/first.js").async, script("/second.js").async]).toEqual([false, false]);
    script("/first.js").dispatchEvent(new Event("load"));
    script("/second.js").dispatchEvent(new Event("load"));
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
  });

  it("names the script that did not load", async () => {
    const loading = loadScript("/missing.js");
    script("/missing.js").dispatchEvent(new Event("error"));
    await expect(loading).rejects.toThrow("Could not load /missing.js.");
  });
});
