import { createQueryClient } from "../api/query";
import type { BundleVars } from "./bundle";
import { layoutSource, loadDefinition } from "./source";

const bundle: BundleVars = {
  url: "/bundle.json",
  forms: { afformA: { module: "afformA", title: "A", type: "form", autosave_draft: false } },
  blocks: {},
  attributeTypes: { "*": { "*": "text" } },
};

afterEach(() => {
  delete window.CRM.vars;
  vi.unstubAllGlobals();
});

describe("layoutSource", () => {
  it("defaults to the API and rejects unknown sources", () => {
    expect(layoutSource(null)).toBe("api");
    expect(layoutSource("bundle")).toBe("bundle");
    expect(() => layoutSource("file")).toThrow('Unknown layout source "file"');
  });
});

describe("loadDefinition", () => {
  it("reads layouts the page embedded and reports the ones it left out", async () => {
    const form = { name: "afformA", title: "A", type: "form", layout: [], strings: [] as [] };
    window.CRM.vars = { afreact: { layouts: { afformA: form } } };
    await expect(loadDefinition("afformA", "page", createQueryClient())).resolves.toBe(form);
    await expect(loadDefinition("afformB", "page", createQueryClient())).rejects.toThrow(
      'Form "afformB" does not exist or you may not open it.',
    );
    expect(window.CRM.api4).not.toHaveBeenCalled();
  });

  it("fails when the page provides nothing for the source", async () => {
    await expect(loadDefinition("afformA", "bundle", createQueryClient())).rejects.toThrow(
      'The page provides no layouts for source="bundle"',
    );
  });

  it("loads the module file once for every form on the page", async () => {
    window.CRM.vars = { afreact: { bundle } };
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ afformA: { partials: { "~/afformA/afformA.aff.html": "<p>x</p>" } } }),
        ),
      );
    vi.stubGlobal("fetch", fetch);
    const client = createQueryClient();
    const [first, second] = await Promise.all([
      loadDefinition("afformA", "bundle", client),
      loadDefinition("afformA", "bundle", client),
    ]);
    expect(first.layout).toEqual([{ "#tag": "p", "#children": [{ "#text": "x" }] }]);
    expect(second).toEqual(first);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("loads no module file for forms the user may not open", async () => {
    window.CRM.vars = { afreact: { bundle: { ...bundle, url: null, forms: {} } } };
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(loadDefinition("afformA", "bundle", createQueryClient())).rejects.toThrow(
      'Form "afformA" does not exist or you may not open it.',
    );
    window.CRM.vars = { afreact: { bundle } };
    await expect(loadDefinition("afformB", "bundle", createQueryClient())).rejects.toThrow(
      'Form "afformB" does not exist or you may not open it.',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports a failed module file request", async () => {
    window.CRM.vars = { afreact: { bundle } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 403 })));
    await expect(loadDefinition("afformA", "bundle", createQueryClient())).rejects.toThrow(
      "Loading /bundle.json failed: 403",
    );
  });

  it("rejects a module file of the wrong shape", async () => {
    window.CRM.vars = { afreact: { bundle } };
    const file = JSON.stringify({ afformA: { partials: "<af-form></af-form>" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(file)));
    await expect(loadDefinition("afformA", "bundle", createQueryClient())).rejects.toThrow(
      "/bundle.json is no Angular module file.",
    );
  });
});
