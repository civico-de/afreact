import { angularOf, call } from "../angular/island";
import { adminVars } from "./vars";

/** Other extensions' modules for core's classic builder, which the page loaded. */
export const foreignModules = () => adminVars().foreignModules ?? [];

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
