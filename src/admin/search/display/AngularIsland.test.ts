import { beforeAll, describe, expect, it } from "vitest";
import type { EditorSearch } from "../editor";
import { structuralRisk } from "../SearchEditor";
import { hasIslandEditor } from "./AngularIsland";

// AngularJS 1.8 queues `component()` and `directive()` as [provider, method, arguments].
const queued = (method: string, ...args: unknown[]) => ["$compileProvider", method, args];
const modules: Record<string, { requires: string[]; _invokeQueue: unknown[] }> = {
  islandAdmin: {
    requires: ["islandShared"],
    _invokeQueue: [queued("component", "searchAdminDisplayChartPie", {}), ["$provide", "factory"]],
  },
  islandShared: {
    requires: ["islandAdmin"],
    _invokeQueue: [queued("directive", { searchAdminDisplayMapPins: () => ({}) })],
  },
};

beforeAll(() => {
  Reflect.set(window, "angular", {
    module: (name: string) => {
      const module = modules[name];
      if (!module) throw new Error(`No module ${name}.`);
      return module;
    },
  });
  window.CRM.vars = { afreactAdmin: { islandModules: ["islandAdmin"] } };
});

describe("island editors", () => {
  it("finds editors registered by the island modules and the modules they require", () => {
    expect(hasIslandEditor("chart-pie")).toBe(true);
    expect(hasIslandEditor("map-pins")).toBe(true);
    expect(hasIslandEditor("table-x")).toBe(false);
  });

  it("asks nothing about a display whose island rebuilds with the new columns", () => {
    const search = (select: string[]): EditorSearch => ({
      id: 5,
      label: "S",
      api_entity: "Contact",
      api_params: { version: 4, select },
      is_template: false,
      form_values: { join: {} },
      tag_id: [],
      groups: [],
      displays: [
        { id: 1, label: "Island", type: "chart-pie" },
        { id: 2, label: "Unknown", type: "table-x" },
      ],
    });
    expect(structuralRisk(search(["id", "label"]), search(["id"])).map((d) => d.label)).toEqual([
      "Unknown",
    ]);
  });
});
