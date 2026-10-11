import { useEffect, useEffectEvent, useRef, useState } from "react";
import { adminVars } from "../../vars";
import type { EditorDisplay } from "../editor";

/** Calls `method` on an untyped Angular object, failing loudly when it is missing. */
function call(target: unknown, method: string, ...args: unknown[]): unknown {
  const fn: unknown =
    typeof target === "object" || typeof target === "function"
      ? Reflect.get(Object(target), method)
      : undefined;
  if (typeof fn !== "function") throw new TypeError(`Angular has no ${method}().`);
  return Reflect.apply(fn, target, args);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The other extensions' modules for core's search builder, which the page loaded. */
const islandModules = () => adminVars().islandModules ?? [];

const angularOf = (): unknown => Reflect.get(window, "angular");

/** The editor's element for a display type, and its directive name as Angular normalizes it. */
const editorTag = (type: string) => `search-admin-display-${type}`;
const directiveName = (tag: string) =>
  tag.replace(/[:\-_]+(.)/g, (_, letter: string, offset: number) =>
    offset ? letter.toUpperCase() : letter,
  );

/** Directives the island modules and the modules they require register, from AngularJS 1.8's queue. */
function islandDirectives(): Set<string> {
  const ng = angularOf();
  const names = new Set<string>();
  const seen = new Set<string>();
  const visit = (name: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    const module: unknown = call(ng, "module", name);
    const requires: unknown = Reflect.get(Object(module), "requires");
    const queue: unknown = Reflect.get(Object(module), "_invokeQueue");
    if (!Array.isArray(requires) || !Array.isArray(queue))
      throw new TypeError(`Angular module ${name} has no requires or invoke queue.`);
    const entries: unknown[] = queue;
    for (const entry of entries) {
      if (!Array.isArray(entry) || entry[0] !== "$compileProvider") continue;
      const first: unknown = Reflect.get(Object(entry[2]), 0);
      if (typeof first === "string") names.add(first);
      else if (isRecord(first)) for (const key of Object.keys(first)) names.add(key);
    }
    for (const required of requires) if (typeof required === "string") visit(required);
  };
  for (const name of islandModules()) visit(name);
  return names;
}

/**
 * The island modules that also decorate services or run config or run blocks, which reach into
 * core's builder rather than adding an editor; AngularJS 1.8 queues those apart from directives.
 */
export function modulesChangingBuilder(): string[] {
  const ng = angularOf();
  if (ng === undefined) return [];
  return islandModules().filter((name) => {
    const module: unknown = call(ng, "module", name);
    const config: unknown = Reflect.get(Object(module), "_configBlocks");
    const run: unknown = Reflect.get(Object(module), "_runBlocks");
    if (!Array.isArray(config) || !Array.isArray(run))
      throw new TypeError(`Angular module ${name} has no config or run blocks.`);
    return config.length > 0 || run.length > 0;
  });
}

let directives: Set<string> | undefined;

/** Whether an island module on the page has an Angular editor for the display type. */
export function hasIslandEditor(type: string): boolean {
  if (angularOf() === undefined || islandModules().length === 0) return false;
  directives ??= islandDirectives();
  return directives.has(directiveName(editorTag(type)));
}

/**
 * The island's own module: the builder modules bring ngRoute and $location, which would rewrite
 * the page's hash and run the builder's routes; their $browser sees a fixed URL without one.
 */
function islandModule(ng: unknown): string {
  // A dotted name no extension module takes, as redefining a module replaces it.
  const name = "afreact.islandHost";
  const url = window.location.href.replace(/#.*$/, "");
  const decorate = (browser: Record<string, unknown>) =>
    Object.assign(browser, {
      url: (next?: string) => (next === undefined ? url : browser),
      state: () => null,
      onUrlChange: () => browser,
    });
  call(call(ng, "module", name, islandModules()), "config", [
    "$provide",
    (provide: unknown) => call(provide, "decorator", "$browser", ["$delegate", decorate]),
  ]);
  return name;
}

interface AngularIslandProps {
  type: string;
  display: EditorDisplay;
  search: {
    name?: string;
    api_entity: string;
    api_params: { select: string[] };
  };
  typeInfo: { name: string; description: string; icon: string } | undefined;
  viewable: boolean;
  searchDisplayPath: string;
  onChange: (display: EditorDisplay) => void;
}

/**
 * Another extension's Angular display editor, booted on its own element with stand-ins for the
 * controllers it requires; rebuilt when the search's columns change, as it reads them once.
 */
export function AngularIsland(props: AngularIslandProps) {
  const { type, display, search, onChange } = props;
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | Error>("loading");
  // The display as both sides last agreed on, so neither echoes the other's change back.
  const agreed = useRef("");
  // The display as last handed to React, which may differ from the editor's (an empty label).
  const forwarded = useRef("");
  const scope = useRef<unknown>(null);
  const preview = useRef<HTMLDivElement>(null);
  const injected = useRef<unknown>(null);
  const [shown, setShown] = useState<string | null>(null);
  const [previewScope, setPreviewScope] = useState<unknown>(null);
  const sent = useEffectEvent((json: string) => {
    if (json === agreed.current) return;
    const next: unknown = JSON.parse(json);
    if (!isRecord(next) || typeof next.type !== "string")
      throw new TypeError(`The ${type} editor changed the display into something else.`);
    agreed.current = json;
    // ngModel leaves a required field empty as undefined; React's label check stops the save.
    const edited = {
      ...next,
      type: next.type,
      label: typeof next.label === "string" ? next.label : "",
    };
    forwarded.current = JSON.stringify(edited);
    onChange(edited);
  });
  const boot = useEffectEvent(() => ({
    display: structuredClone(display),
    search: { ...search, api_params: structuredClone(search.api_params) },
    typeInfo: props.typeInfo,
  }));
  // What core's display header reads on every digest, which a save changes.
  const live = useRef({
    name: search.name,
    viewable: props.viewable,
    path: props.searchDisplayPath,
  });
  const columns = JSON.stringify(search.api_params.select);

  useEffect(() => {
    const parent = host.current;
    if (!parent) throw new Error("The island's host element is not mounted.");
    const ng = angularOf();
    const start = boot();
    const root = document.createElement("div");
    parent.replaceChildren(root);
    let disposed = false;
    let rootScope: unknown = null;
    const fail = (error: unknown) => {
      if (!disposed) setState(error instanceof Error ? error : new Error(String(error)));
    };
    try {
      const element = call(ng, "element", root);
      call(
        call(element, "data", "$crmSearchAdminDisplayController", {
          displayType: start.typeInfo,
          savedSearch: {
            get name() {
              return live.current.name;
            },
          },
          isSuperAdmin: window.CRM.checkPerm("all CiviCRM permissions and ACLs"),
          aclBypassHelp: ts(
            'Only users with "all CiviCRM permissions and ACLs" can disable permission checks.',
          ),
          crmSearchAdmin: {
            displayIsViewable: () => live.current.viewable,
            get searchDisplayPath() {
              return live.current.path;
            },
          },
        }),
        "data",
        "$crmSearchAdminController",
        {},
      );
      const injector = call(ng, "bootstrap", root, [islandModule(ng)]);
      if (call(injector, "has", `${directiveName(editorTag(type))}Directive`) !== true)
        throw new Error(`No Angular editor for the ${type} display type.`);
      rootScope = call(injector, "get", "$rootScope");
      const link = () => {
        const child = call(rootScope, "$new");
        Object.assign(Object(child), {
          display: start.display,
          apiEntity: start.search.api_entity,
          apiParams: start.search.api_params,
        });
        scope.current = child;
        injected.current = injector;
        agreed.current = JSON.stringify(start.display);
        forwarded.current = agreed.current;
        const editor = document.createElement(editorTag(type));
        editor.setAttribute("display", "display");
        editor.setAttribute("api-entity", "apiEntity");
        editor.setAttribute("api-params", "apiParams");
        root.append(editor);
        call(call(call(injector, "get", "$compile"), "call", null, editor), "call", null, child);
        call(
          child,
          "$watch",
          "display",
          (value: unknown) => {
            sent(String(call(ng, "toJson", value)));
          },
          true,
        );
        // $q runs this callback inside a digest, which then picks up the new watchers.
        setState("ready");
      };
      const loaded = call(call(injector, "get", "searchMeta"), "loadMetadata");
      call(
        loaded,
        "then",
        () => {
          if (disposed) return;
          // $q hands a throw in here only to $exceptionHandler, not to the rejection handler.
          try {
            link();
          } catch (error) {
            fail(error);
          }
        },
        fail,
      );
    } catch (error) {
      fail(error);
    }
    return () => {
      disposed = true;
      scope.current = null;
      // A rebuild shows neither the old editor's state nor a preview from its injector.
      injected.current = null;
      preview.current?.replaceChildren();
      setShown(null);
      setPreviewScope(null);
      setState("loading");
      if (rootScope) call(rootScope, "$destroy");
      // jqLite's remove() runs the elements' $destroy handlers, which take down popups and widgets.
      call(call(ng, "element", root), "remove");
    };
  }, [type, columns]);

  useEffect(() => {
    live.current = {
      name: search.name,
      viewable: props.viewable,
      path: props.searchDisplayPath,
    };
  });

  // A React change, such as the id and name a save gives the display, reaches the editor.
  useEffect(() => {
    const child = scope.current;
    const json = JSON.stringify(display);
    if (!child || json === agreed.current || json === forwarded.current) return;
    agreed.current = json;
    forwarded.current = json;
    Reflect.set(Object(child), "display", JSON.parse(json));
    call(child, "$apply");
  });

  const current = JSON.stringify([search.api_params, display]);
  const stale = shown !== current;
  // crmSearchAdminDisplay's preview: the type's runtime element with the settings as clicked.
  const showPreview = () => {
    const injector = injected.current;
    const into = preview.current;
    const name = props.typeInfo?.name;
    if (!injector || !into || !name) return;
    if (previewScope) call(previewScope, "$destroy");
    const child = call(call(injector, "get", "$rootScope"), "$new");
    Object.assign(Object(child), {
      search: {
        name: search.name,
        api_entity: search.api_entity,
        api_params: structuredClone(search.api_params),
      },
      display: structuredClone(display),
    });
    const element = document.createElement(name);
    element.setAttribute("api-entity", search.api_entity);
    element.setAttribute("search", "search");
    element.setAttribute("display", "display");
    element.setAttribute("settings", "display.settings");
    into.replaceChildren(element);
    call(call(call(injector, "get", "$compile"), "call", null, element), "call", null, child);
    call(child, "$apply");
    setPreviewScope(child);
    setShown(current);
  };

  return (
    <>
      {state === "loading" && <p role="status">{ts("Loading…")}</p>}
      {state instanceof Error && (
        <p className="crm-error" role="alert">
          {state.message}
        </p>
      )}
      <div ref={host} />
      {state === "ready" && props.typeInfo && (
        <>
          <hr />
          <button
            type="button"
            className={`btn btn-${!stale ? "success" : shown ? "warning" : "primary"}`}
            disabled={!stale}
            onClick={showPreview}
          >
            <i className={`crm-i ${props.typeInfo.icon}`} role="img" aria-hidden="true" />{" "}
            {shown && stale ? ts("Refresh") : ts("Preview")}
          </button>
          <hr />
          <div ref={preview} />
        </>
      )}
    </>
  );
}
