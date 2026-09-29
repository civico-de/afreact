import {
  ensurePrimary,
  ensureRepeatItems,
  findElements,
  getValue,
  repeatCount,
  setValue,
} from "./model";
import type { ElementNode, FieldDefn, FormData, LayoutNode, Scope } from "./types";
import { isElement, isFieldDefn } from "./types";

/**
 * Offset of each non-repeating af-join among the joins of the same entity in
 * its fieldset: two Email blocks in one fieldset write to joins.Email[0] and [1].
 */
export function joinOffsets(layout: LayoutNode[]): WeakMap<ElementNode, number> {
  const offsets = new WeakMap<ElementNode, number>();
  const walk = (nodes: LayoutNode[], counters: Map<string, number>) => {
    for (const node of nodes.filter(isElement)) {
      if (typeof node["af-fieldset"] === "string") {
        walk(node["#children"] ?? [], new Map());
        continue;
      }
      const join = node["af-join"];
      if (typeof join === "string" && node["af-repeat"] === undefined) {
        const offset = counters.get(join) ?? 0;
        offsets.set(node, offset);
        counters.set(join, offset + 1);
      }
      walk(node["#children"] ?? [], counters);
    }
  };
  walk(layout, new Map());
  return offsets;
}

/** Initial item count of an af-repeat, as afRepeat computes it. */
export function repeatMinimum(node: ElementNode): number {
  const raw = node["af-repeat-default"];
  const fallback = raw === undefined || raw === "" || Number.isNaN(Number(raw)) ? 1 : Number(raw);
  const min = Number(node.min ?? 0);
  return Math.max(fallback, Number.isNaN(min) ? 0 : min);
}

/** afForm's identifyTokens(): [Entity.index.field] references in a default. */
const TOKEN = /\[[a-zA-Z0-9_]+\.[0-9]+\.[^\]]+\]/g;

export function hasTokens(value: unknown): value is string {
  return typeof value === "string" && new RegExp(TOKEN.source).test(value);
}

/** afForm's replaceTokens(): each token becomes the referenced field's value, or "" when unset. */
export function replaceTokens(value: string, data: FormData): string {
  return value.replace(TOKEN, (token) => {
    const [entity = "", index = "", ...field] = token.slice(1, -1).split(".");
    const current = data[entity]?.[Number(index)]?.fields[field.join(".")];
    return current === undefined ? "" : tokenText(current);
  });
}

/** How String.replaceAll() writes a field value: a list comma-joined, its empty items blank. */
function tokenText(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((item) => (item === null || item === undefined ? "" : tokenText(item)))
      .join(",");
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value === null) return "null";
  throw new TypeError(`A token refers to a ${typeof value}, not a field value`);
}

/** A default without tokens; afField calculates token defaults live, see FieldNode. */
export function staticDefault(defn: FieldDefn | undefined): unknown {
  const value = defn?.afform_default;
  return hasTokens(value) ? undefined : value;
}

/**
 * Prepares loaded data the way the Angular directives do on init: creates the
 * item of every fieldset, pads every af-repeat to its initial count, marks a primary record in repeated joins,
 * and fills static defaults into empty fields.
 */
export function initialiseData(layout: LayoutNode[], data: FormData): FormData {
  let next = data;
  const offsets = joinOffsets(layout);
  const walk = (nodes: LayoutNode[], scope: Scope | null) => {
    for (const node of nodes.filter(isElement)) {
      const fieldset = node["af-fieldset"];
      const join = node["af-join"];
      const repeats = node["af-repeat"] !== undefined;
      if (typeof fieldset === "string") {
        const base = { entity: fieldset, index: 0 };
        if (repeats) next = ensureRepeatItems(next, base, repeatMinimum(node));
        // afFieldset creates its entity's item on init, so an untouched entity still submits.
        else if (fieldset) next = ensureRepeatItems(next, base, 1);
        const count = repeats ? repeatCount(next, base) : 1;
        for (let index = 0; index < count; index++)
          walk(node["#children"] ?? [], { entity: fieldset, index });
      } else if (typeof join === "string" && scope) {
        const joinScope = { entity: scope.entity, index: scope.index, join };
        if (repeats) {
          next = ensureRepeatItems(next, joinScope, repeatMinimum(node));
          const hasPrimary = findElements(node["#children"] ?? [], "af-field").some(
            (field) => field.name === "is_primary",
          );
          if (hasPrimary) next = ensurePrimary(next, joinScope);
          for (let joinIndex = 0; joinIndex < repeatCount(next, joinScope); joinIndex++)
            walk(node["#children"] ?? [], { ...joinScope, joinIndex });
        } else {
          walk(node["#children"] ?? [], { ...joinScope, joinIndex: offsets.get(node) ?? 0 });
        }
      } else if (node["#tag"] === "af-field" && scope) {
        const value = staticDefault(isFieldDefn(node.defn) ? node.defn : undefined);
        const name = String(node.name);
        if (value !== undefined && getValue(next, scope, name) === undefined)
          next = setValue(next, scope, name, value);
      } else {
        walk(node["#children"] ?? [], scope);
      }
    }
  };
  walk(layout, null);
  return next;
}
