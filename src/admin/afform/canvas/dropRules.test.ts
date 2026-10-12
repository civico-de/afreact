import { META } from "../testMeta";
import type { ShallowElement } from "../tree";
import {
  allowed,
  shownAfter,
  shownPlace,
  stays,
  targetOrder,
  type ContainerScope,
  type DragSource,
  type Landing,
} from "./dropRules";

const scope = (path: number[], overrides: Partial<ContainerScope> = {}): ContainerScope => ({
  path,
  entityName: null,
  dataEntity: "",
  inFieldset: false,
  inBlock: false,
  join: null,
  label: "Form",
  axis: "y",
  ...overrides,
});

const moving = (path: number[], node: ShallowElement, from = scope(path.slice(0, -1))) =>
  ({ kind: "node", path, node, scope: from, label: "Moved" }) satisfies DragSource;

const into = (target: ContainerScope, index = 0, shown: number[] = []): Landing => ({
  scope: target,
  index,
  shown,
});

const container = (...children: ShallowElement[]): ShallowElement => ({
  "#tag": "div",
  class: "af-container",
  "#children": children,
});

describe("drop rules", () => {
  const entityFieldset = scope([0], { inFieldset: true, dataEntity: "Individual1" });

  it("keeps a search fieldset out of an entity fieldset, as core does", () => {
    const search = moving([1], { "#tag": "div", "af-fieldset": "", "#children": [] });
    expect(allowed(search, into(entityFieldset), META)).toBe(false);
    expect(allowed(search, into(scope([2])), META)).toBe(true);
  });

  it("keeps a container out of a fieldset when a fieldset sits anywhere inside it", () => {
    const nested = container(container({ "#tag": "fieldset", "af-fieldset": "Individual1" }));
    expect(allowed(moving([1], nested), into(entityFieldset), META)).toBe(false);
    expect(allowed(moving([1], container(container())), into(entityFieldset), META)).toBe(true);
  });

  it("counts the drawn siblings only for the place it names", () => {
    // Children: af-entity (0, not drawn), First Name (1), Last Name (2), Email (3).
    const shown = [1, 2, 3];
    const source = moving([0, 1], { "#tag": "af-field", name: "first_name" });
    expect(shownPlace(source, into(scope([0]), 4, shown))).toBe(3);
    const fresh = { kind: "new", node: { "#tag": "p" }, entity: null, label: "Text" } as const;
    expect(shownPlace(fresh, into(scope([0]), 1, shown))).toBe(1);
  });

  it("names the next drawn sibling, skipping what the canvas does not draw", () => {
    expect(shownAfter([0, 2, 4], 0)).toBe(2);
    expect(shownAfter([0, 2, 4], 4)).toBeNull();
  });

  it("leaves an element in place where no drawn sibling lies between", () => {
    const source = moving([0, 1], { "#tag": "af-field", name: "first_name" });
    // An undrawn af-entity at 2 lies between the element and Last Name at 3.
    expect(stays(source, into(scope([0]), 3, [1, 3]))).toBe(true);
    expect(stays(source, into(scope([0]), 4, [1, 3]))).toBe(false);
    expect(stays(source, into(scope([1]), 1, [1, 3]))).toBe(false);
  });

  it("orders keyboard targets as drops land: an item before its contents, a list's end after them", () => {
    document.body.innerHTML =
      '<div id="a"><div id="body-a"><div id="b"></div></div></div><div id="c"></div>';
    const of = (id: string) => {
      const node = document.getElementById(id);
      if (!node) throw new Error(id);
      return node;
    };
    const targets = [
      { id: "body:0", node: of("body-a") },
      { id: "node:1", node: of("c") },
      { id: "node:0.0", node: of("b") },
      { id: "node:0", node: of("a") },
    ];
    expect(targets.sort(targetOrder).map((target) => target.id)).toEqual([
      "node:0",
      "node:0.0",
      "body:0",
      "node:1",
    ]);
  });
});
