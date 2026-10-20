import type { CrmAngular } from "../angular/island";

/**
 * A stand-in for the AngularJS an island drives: modules with config blocks and directives,
 * jqLite data, scopes with deep watches and events, and ng-include of `templates`.
 */
export type FakeTemplate = (element: HTMLElement, scope: FakeScope) => void;

/** ngModel's controller as the island's validity bridge reads it. */
export interface FakeModel {
  $invalid: boolean;
  $error: Record<string, boolean>;
}

type Fn = (...args: unknown[]) => unknown;

const isFn = (value: unknown): value is Fn => typeof value === "function";

interface Watcher {
  get: () => unknown;
  listener: (value: unknown) => void;
  deep: boolean;
  last: unknown;
  fresh: boolean;
}

export class FakeScope {
  readonly parent: FakeScope | null;
  readonly root: FakeScope;
  watchers: Watcher[] = [];
  children: FakeScope[] = [];
  listeners = new Map<string, (() => void)[]>();
  destroyed = false;
  digesting = false;
  queued = false;

  constructor(parent: FakeScope | null) {
    this.parent = parent;
    this.root = parent?.root ?? this;
  }

  $new(): FakeScope {
    const child = new FakeScope(this);
    this.children.push(child);
    return child;
  }

  $watch(get: unknown, listener: (value: unknown) => void, deep = false): void {
    if (!isFn(get)) throw new TypeError("The fake watches functions only.");
    this.watchers.push({ get, listener, deep, last: undefined, fresh: true });
  }

  $on(name: string, listener: () => void): void {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }

  $emit(name: string): void {
    for (const listener of this.listeners.get(name) ?? []) listener();
    this.parent?.$emit(name);
  }

  $apply(fn?: () => void): void {
    if (this.root.digesting) throw new Error("$digest already in progress");
    fn?.();
    this.root.$digest();
  }

  $applyAsync(): void {
    if (this.root.queued) return;
    this.root.queued = true;
    setTimeout(() => {
      this.root.queued = false;
      if (!this.root.destroyed) this.root.$apply();
    });
  }

  $digest(): void {
    this.digesting = true;
    try {
      for (let round = 0; round < 10; round++) {
        let dirty = false;
        for (const scope of this.tree()) {
          for (const watcher of [...scope.watchers]) {
            const value = watcher.get();
            const seen = watcher.deep ? JSON.stringify(value) : value;
            if (!watcher.fresh && Object.is(seen, watcher.last)) continue;
            watcher.fresh = false;
            watcher.last = seen;
            watcher.listener(value);
            dirty = true;
          }
        }
        if (!dirty) return;
      }
      throw new Error("10 $digest() iterations reached.");
    } finally {
      this.digesting = false;
    }
  }

  $destroy(): void {
    if (this.destroyed) return;
    // As Angular's $broadcast('$destroy'): this scope and its children, not its parents.
    for (const child of [...this.children]) child.$destroy();
    for (const listener of this.listeners.get("$destroy") ?? []) listener();
    this.destroyed = true;
    this.watchers = [];
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
  }

  private tree(): FakeScope[] {
    return [this, ...this.children.flatMap((child) => child.tree())];
  }
}

interface FakeModule {
  name: string;
  requires: string[];
  configs: unknown[][];
  directives: [string, () => { link: (...args: unknown[]) => void }][];
  config: (block: unknown[]) => FakeModule;
  directive: (name: string, factory: () => { link: (...args: unknown[]) => void }) => FakeModule;
}

/** Installs the fake as window.angular over core's page Angular, which knows crmResource only. */
export function installAngular(templates: Record<string, FakeTemplate>) {
  const modules = new Map<string, FakeModule>();
  const data = new WeakMap<Element, Map<string, unknown>>();
  const models = new WeakMap<Element, FakeModel>();
  const bundleUrls: (string | undefined)[] = [];

  const module = (name: string, requires?: string[]): FakeModule => {
    const known = modules.get(name);
    if (!requires) {
      if (!known) throw new Error(`[$injector:nomod] Module '${name}' is not available!`);
      return known;
    }
    const created: FakeModule = {
      name,
      requires,
      configs: [],
      directives: [],
      config: (block) => {
        created.configs.push(block);
        return created;
      },
      directive: (directive, factory) => {
        created.directives.push([directive, factory]);
        return created;
      },
    };
    modules.set(name, created);
    return created;
  };

  const store = (target: Element) => {
    const own = data.get(target) ?? new Map<string, unknown>();
    data.set(target, own);
    return own;
  };
  const element = (target: Element) => {
    const wrapper = {
      0: target,
      data: (key: string, value?: unknown): unknown => {
        if (value === undefined) return store(target).get(key);
        store(target).set(key, value);
        return wrapper;
      },
      remove: () => {
        data.delete(target);
        target.remove();
        return wrapper;
      },
    };
    return wrapper;
  };

  const bootstrap = (root: Element, names: string[]) => {
    if (store(root).has("$injector")) throw new Error("[ng:btstrpd] App already bootstrapped.");
    const closure: FakeModule[] = [];
    const visit = (name: string) => {
      if (closure.some((known) => known.name === name)) return;
      const found = module(name);
      for (const required of found.requires) visit(required);
      closure.push(found);
    };
    for (const name of names) visit(name);
    // crmResource reads CRM.angular.bundleUrl once its injector starts.
    if (closure.some((found) => found.name === "crmResource")) {
      bundleUrls.push(window.CRM.angular?.bundleUrl);
    }
    const decorators: ((delegate: Record<string, unknown>) => unknown)[] = [];
    const provide = {
      decorator: (_name: string, injectable: unknown[]) => {
        const fn = injectable.at(-1);
        if (isFn(fn)) decorators.push((delegate) => fn(delegate));
      },
    };
    for (const block of closure.flatMap((found) => found.configs)) {
      const fn = block.at(-1);
      if (isFn(fn)) fn(provide);
    }
    const browser: Record<string, unknown> = { url: () => window.location.href };
    for (const decorate of decorators) decorate(browser);
    const links = closure
      .flatMap((found) => found.directives)
      .filter(([name]) => name === "ngModel")
      .map(([, factory]) => factory().link);
    const rootScope = new FakeScope(null);

    const include = (target: HTMLElement, scope: FakeScope) => {
      const expression = target.getAttribute("ng-include") ?? "";
      const read = (): unknown => {
        const url: unknown = Reflect.get(scope, expression);
        return url;
      };
      scope.$watch(read, (url) => {
        const template = typeof url === "string" ? templates[url] : undefined;
        if (!template) {
          scope.$emit("$includeContentError");
          return;
        }
        template(target, scope);
        for (const control of target.querySelectorAll("[ng-model]")) {
          const model: FakeModel = { $invalid: false, $error: {} };
          models.set(control, model);
          for (const link of links) link(scope, element(control), {}, model);
        }
        scope.$emit("$includeContentLoaded");
      });
    };
    const compile = (target: HTMLElement) => (scope: FakeScope) => {
      if (target.hasAttribute("ng-include")) include(target, scope);
    };
    const injector = {
      get: (name: string): unknown => {
        if (name === "$rootScope") return rootScope;
        if (name === "$compile") return compile;
        if (name === "$browser") return browser;
        throw new Error(`[$injector:unpr] Unknown provider: ${name}Provider`);
      },
    };
    store(root).set("$injector", injector);
    return injector;
  };

  /** Angular's toJson leaves out its own $$-prefixed keys. */
  const toJson = (value: unknown) =>
    JSON.stringify(value, (key, item: unknown) => (key.startsWith("$$") ? undefined : item));

  const angular = { module, element, bootstrap, toJson };
  module("crmResource", []);
  Reflect.set(window, "angular", angular);
  const page: CrmAngular = { modules: ["crmResource"], requires: {}, bundleUrl: "/page.json" };
  window.CRM.angular = page;
  Reflect.set(window.CRM, "ts", () => globalThis.ts);
  Reflect.set(window.CRM.$, "extend", (_deep: boolean, target: object, source: object) =>
    Object.assign(target, source),
  );

  return {
    page,
    bundleUrls,
    /** Defines a module, as a loaded bundle does. */
    define: (name: string, requires: string[] = []) => module(name, requires),
    modelOf: (control: Element) => {
      const model = models.get(control);
      if (!model) throw new Error("The control has no ng-model.");
      return model;
    },
    /** A controller a template requires with '^^', from the jqLite data of an ancestor. */
    controller: (from: Element, name: string): unknown => {
      for (let node: Element | null = from; node; node = node.parentElement) {
        const found = data.get(node)?.get(`$${name}Controller`);
        if (found !== undefined) return found;
      }
      throw new Error(`[$compile:ctreq] Controller '${name}' is required.`);
    },
    uninstall: () => {
      Reflect.deleteProperty(window, "angular");
      delete window.CRM.angular;
      Reflect.deleteProperty(window.CRM, "ts");
    },
  };
}

/** The classic script the island appended for `src`, to settle as the browser would. */
export function scriptFor(src: string): HTMLScriptElement {
  const found = [...document.head.querySelectorAll("script")].find(
    (script) => script.getAttribute("src") === src,
  );
  if (!found) throw new Error(`No script ${src} on the page.`);
  return found;
}
