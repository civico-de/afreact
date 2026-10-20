import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeScope, installAngular, scriptFor } from "../test/angular";
import {
  bootstrapIsland,
  call,
  destroyIsland,
  islandModule,
  loadAngular,
  type AngularAssets,
} from "./island";

let fake: ReturnType<typeof installAngular>;
let served = 0;

beforeEach(() => {
  fake = installAngular({});
});
afterEach(() => {
  fake.uninstall();
  Reflect.deleteProperty(window.CRM, "afCheckout");
});

/** Assets under a URL of their own, as the cache keeps one load per bundle. */
function assets(modules = ["afCheckout"]): AngularAssets {
  served += 1;
  return {
    scripts: [`/bundle-${String(served)}.js`],
    styles: [`/bundle-${String(served)}.css`],
    settings: {
      angular: {
        modules,
        requires: { afCheckout: ["afCore"] },
        bundleUrl: `/bundle-${String(served)}.json`,
      },
      afCheckout: { paymentProcessors: [] },
    },
  };
}

const settle = (asset: AngularAssets, event: "load" | "error") => {
  scriptFor(asset.scripts[0] ?? "").dispatchEvent(new Event(event));
};

describe("loadAngular", () => {
  it("adds the modules' styles, settings and scripts to core's page Angular", async () => {
    const asset = assets();
    const loading = loadAngular(asset);
    fake.define("afCheckout");
    settle(asset, "load");
    await loading;
    expect(document.head.querySelector(`link[href="${asset.styles[0] ?? ""}"]`)).not.toBeNull();
    // Core's AngularLoader gives each module's settings to CRM under the module's name.
    expect(Reflect.get(window.CRM, "afCheckout")).toEqual({ paymentProcessors: [] });
    expect(fake.page.modules).toEqual(["crmResource", "afCheckout"]);
    expect(fake.page.requires).toEqual({ afCheckout: ["afCore"] });
    // The page keeps its own bundle; the island names its bundle while it boots.
    expect(fake.page.bundleUrl).toBe("/page.json");
  });

  it("loads a bundle once, and again after it failed", async () => {
    const asset = assets();
    const first = loadAngular(asset);
    expect(loadAngular(asset)).toBe(first);
    settle(asset, "error");
    await expect(first).rejects.toThrow(`Could not load ${asset.scripts[0] ?? ""}.`);
    const second = loadAngular(asset);
    expect(second).not.toBe(first);
    fake.define("afCheckout");
    for (const script of document.head.querySelectorAll(
      `script[src="${asset.scripts[0] ?? ""}"]`,
    )) {
      script.dispatchEvent(new Event("load"));
    }
    await expect(second).resolves.toBeUndefined();
  });

  it("names the modules a loaded bundle did not define", async () => {
    const asset = assets(["afCheckout", "afreactCheckout"]);
    const loading = loadAngular(asset);
    fake.define("afCheckout");
    settle(asset, "load");
    await expect(loading).rejects.toThrow("The Angular modules afreactCheckout did not load.");
  });

  it("skips the scripts while the page has the modules", async () => {
    fake.define("afCheckout");
    const asset = assets();
    await loadAngular(asset);
    expect(() => scriptFor(asset.scripts[0] ?? "")).toThrow();
  });

  it("fails without core's page Angular", async () => {
    fake.uninstall();
    await expect(loadAngular(assets())).rejects.toThrow("AngularJS is not on this page.");
  });
});

describe("an island's module", () => {
  it("boots with its own bundle and gives the page's back, also when booting fails", () => {
    const ng: unknown = Reflect.get(window, "angular");
    fake.define("afCheckout", ["crmResource"]);
    const module = islandModule(ng, "afreact.test", ["afCheckout"]);
    const root = document.createElement("div");
    bootstrapIsland(ng, root, module, "/island.json");
    expect(() => bootstrapIsland(ng, root, module, "/again.json")).toThrow("already bootstrapped");
    expect(fake.bundleUrls).toEqual(["/island.json"]);
    expect(window.CRM.angular?.bundleUrl).toBe("/page.json");
  });

  it("shows its modules a fixed URL without the page's hash", () => {
    const ng: unknown = Reflect.get(window, "angular");
    window.location.hash = "#/route";
    const injector = bootstrapIsland(
      ng,
      document.createElement("div"),
      islandModule(ng, "afreact.test", []),
      "/island.json",
    );
    const browser = call(injector, "get", "$browser");
    expect(call(browser, "url")).toBe(window.location.href.replace(/#.*$/, ""));
    expect(call(browser, "url", "http://elsewhere/#x")).toBe(browser);
    expect(call(browser, "state")).toBeNull();
    window.location.hash = "";
  });

  it("goes down with its scopes and its element", () => {
    const ng: unknown = Reflect.get(window, "angular");
    const root = document.createElement("div");
    document.body.append(root);
    const scope = new FakeScope(null);
    let destroyed = 0;
    scope.$new().$on("$destroy", () => {
      destroyed += 1;
    });
    destroyIsland(ng, scope, root);
    expect(destroyed).toBe(1);
    expect(root.isConnected).toBe(false);
  });
});
