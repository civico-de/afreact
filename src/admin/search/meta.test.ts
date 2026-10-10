import { loadSearchMetadata } from "./meta";

const metadata = { schema: [{ name: "Contact" }], joins: {} };

describe("loadSearchMetadata", () => {
  beforeEach(() => {
    const store = new Map<string, unknown>();
    window.CRM.vars = {
      afreactAdmin: {
        searchAdmin: { defaultPagerSize: 50, modules: {}, cacheKey: "k1", tags: [] },
      },
    };
    window.CRM.config = { cid: 2, lcMessages: "en_US" };
    window.CRM.cache = {
      get: (name) => store.get(name),
      set: (name, value) => {
        store.set(name, value);
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(metadata)))),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete window.CRM.vars;
    delete window.CRM.cache;
  });

  it("fetches once and serves core's cache while its key matches", async () => {
    expect((await loadSearchMetadata()).schema[0]?.name).toBe("Contact");
    expect(window.CRM.cache?.get("searchMeta2en_US")).toMatchObject({ cacheKey: "k1" });
    await loadSearchMetadata();
    expect(fetch).toHaveBeenCalledTimes(1);
    window.CRM.vars = {
      afreactAdmin: {
        searchAdmin: { defaultPagerSize: 50, modules: {}, cacheKey: "k2", tags: [] },
      },
    };
    await loadSearchMetadata();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("refuses an answer without a schema", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("[]"))),
    );
    await expect(loadSearchMetadata()).rejects.toThrow(/without a schema/);
  });
});
