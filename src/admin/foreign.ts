import { adminVars } from "./vars";

/** Calls `method` on an untyped Angular object, failing loudly when it is missing. */
export function call(target: unknown, method: string, ...args: unknown[]): unknown {
  const fn: unknown =
    typeof target === "object" || typeof target === "function"
      ? Reflect.get(Object(target), method)
      : undefined;
  if (typeof fn !== "function") throw new TypeError(`Angular has no ${method}().`);
  return Reflect.apply(fn, target, args);
}

/** Other extensions' modules for core's classic builder, which the page loaded. */
export const foreignModules = () => adminVars().foreignModules ?? [];

export const angularOf = (): unknown => Reflect.get(window, "angular");

/**
 * The foreign modules that decorate services or run config or run blocks, which reach into
 * core's builder rather than adding an editor; AngularJS 1.8 queues those apart from directives.
 */
export function modulesChangingBuilder(): string[] {
  const foreign = foreignModules();
  if (!foreign.length) return [];
  const ng = angularOf();
  if (ng === undefined)
    throw new TypeError("Other extensions' Angular modules came without AngularJS.");
  return foreign.filter((name) => {
    const module: unknown = call(ng, "module", name);
    const config: unknown = Reflect.get(Object(module), "_configBlocks");
    const run: unknown = Reflect.get(Object(module), "_runBlocks");
    if (!Array.isArray(config) || !Array.isArray(run))
      throw new TypeError(`Angular module ${name} has no config or run blocks.`);
    return config.length > 0 || run.length > 0;
  });
}

/** What other extensions change in core's builder beyond what React runs: modules and templates. */
export const classicOnlyChanges = () => [
  ...modulesChangingBuilder(),
  ...(adminVars().changedPartials ?? []),
];
