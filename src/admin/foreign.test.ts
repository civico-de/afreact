import { afterEach, describe, expect, it } from "vitest";
import { classicOnlyChanges, modulesChangingBuilder } from "./foreign";

const setVars = (foreignModules: string[], changedPartials: string[] = []) => {
  window.CRM.vars = { ...window.CRM.vars, afreactAdmin: { foreignModules, changedPartials } };
};

/** AngularJS 1.8's module objects, as far as the check reads them. */
const setAngular = (modules: Record<string, { config: unknown[]; run: unknown[] }>) => {
  Reflect.set(window, "angular", {
    module: (name: string) => {
      const module = modules[name];
      if (!module) throw new Error(`No module ${name}.`);
      return { _configBlocks: module.config, _runBlocks: module.run };
    },
  });
};

afterEach(() => {
  setVars([]);
  Reflect.deleteProperty(window, "angular");
});

describe("foreign modules", () => {
  it("names the modules with config or run blocks, and changed partials", () => {
    setVars(["plain", "decorating", "running"], ["~/afGuiEditor/afGuiEditor.html"]);
    setAngular({
      plain: { config: [], run: [] },
      decorating: { config: [["$provide", "decorator", []]], run: [] },
      running: { config: [], run: [() => undefined] },
    });
    expect(classicOnlyChanges()).toEqual([
      "decorating",
      "running",
      "~/afGuiEditor/afGuiEditor.html",
    ]);
  });

  it("needs no AngularJS without foreign modules, and fails loudly with them but without it", () => {
    setVars([]);
    expect(modulesChangingBuilder()).toEqual([]);
    setVars(["decorating"]);
    expect(() => modulesChangingBuilder()).toThrow(/without AngularJS/);
  });
});
