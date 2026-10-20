import { addStylesheet, loadScript } from "../api/scripts";

/** Calls `method` on an untyped Angular object, failing loudly when it is missing. */
export function call(target: unknown, method: string, ...args: unknown[]): unknown {
  const fn: unknown =
    typeof target === "object" || typeof target === "function"
      ? Reflect.get(Object(target), method)
      : undefined;
  if (typeof fn !== "function") throw new TypeError(`Angular has no ${method}().`);
  return Reflect.apply(fn, target, args);
}

export const angularOf = (): unknown => Reflect.get(window, "angular");

export const asError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

/**
 * An island's own module over `requires`: modules bringing ngRoute and $location would rewrite
 * the page's hash and run their routes; their $browser sees a fixed URL without one.
 */
export function islandModule(ng: unknown, name: string, requires: string[]): string {
  const url = window.location.href.replace(/#.*$/, "");
  const decorate = (browser: Record<string, unknown>) =>
    Object.assign(browser, {
      url: (next?: string) => (next === undefined ? url : browser),
      state: () => null,
      onUrlChange: () => browser,
    });
  call(call(ng, "module", name, requires), "config", [
    "$provide",
    (provide: unknown) => call(provide, "decorator", "$browser", ["$delegate", decorate]),
  ]);
  return name;
}

/** Takes an island down with its scopes; jqLite's remove() runs the elements' $destroy handlers. */
export function destroyIsland(ng: unknown, rootScope: unknown, root: Element): void {
  if (rootScope) call(rootScope, "$destroy");
  call(call(ng, "element", root), "remove");
}

/** CRM.angular as core's AngularLoader sets it: the modules on the page and where their partials are. */
export interface CrmAngular {
  modules: string[];
  requires: Record<string, string[]>;
  bundleUrl: string;
  cacheCode?: string;
  templates?: Record<string, string>;
}

/** What core's AngularLoader would add to a page for a set of modules, loaded on demand instead. */
export interface AngularAssets {
  /** The modules' scripts in order (the asset builder's angular-modules.js). */
  scripts: string[];
  styles: string[];
  /** The loader's settings factory: CRM.angular and each module's settings, merged into CRM. */
  settings: { angular: CrmAngular } & Record<string, unknown>;
}

const loads = new Map<string, Promise<void>>();

/** Loads the assets once per page; after a failure the next call tries again. */
export function loadAngular(assets: AngularAssets): Promise<void> {
  const key = JSON.stringify(assets.scripts);
  const running = loads.get(key);
  if (running) return running;
  const load = loadAssets(assets);
  loads.set(key, load);
  load.catch(() => loads.delete(key));
  return load;
}

const hasModule = (ng: unknown, name: string) => {
  try {
    call(ng, "module", name);
    return true;
  } catch {
    return false;
  }
};

async function loadAssets(assets: AngularAssets): Promise<void> {
  const ng = angularOf();
  const page = window.CRM.angular;
  // CRM_Core_Resources::addCoreResources() puts AngularJS with crmResource on every full page.
  if (ng === undefined || !page) throw new Error("AngularJS is not on this page.");
  for (const href of assets.styles) addStylesheet(href);
  const { angular, ...settings } = assets.settings;
  // Core's settings snippet merges the same way.
  call(window.CRM.$, "extend", true, window.CRM, settings);
  page.modules = [...new Set([...page.modules, ...angular.modules])];
  page.requires = { ...angular.requires, ...page.requires };
  const missing = () => angular.modules.filter((name) => !hasModule(ng, name));
  if (!missing().length) return;
  await Promise.all(assets.scripts.map(loadScript));
  const failed = missing();
  if (failed.length) throw new Error(`The Angular modules ${failed.join(", ")} did not load.`);
}

/**
 * Boots `module` on `root`: crmResource fetches CRM.angular.bundleUrl once its injector starts,
 * which must name the bundle with the island's partials while it does.
 */
export function bootstrapIsland(ng: unknown, root: Element, module: string, bundleUrl: string) {
  const angular = window.CRM.angular;
  if (!angular) throw new Error("AngularJS is not on this page.");
  const pageBundle = angular.bundleUrl;
  angular.bundleUrl = bundleUrl;
  try {
    return call(ng, "bootstrap", root, [module]);
  } finally {
    angular.bundleUrl = pageBundle;
  }
}
