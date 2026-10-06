import { convertValue, isMultiple } from "../search/filters";
import { asText, checkConditions, parseConditions } from "./conditions";
import { rangeValue } from "./fields/Range";
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
 * Offset of each non-repeating af-join among its fieldset's joins of the same entity, counted over
 * the layout, shown or not: the server pairs record n with block n's `data` and prefilled record.
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
export const TOKEN = /\[[a-zA-Z0-9_]+\.[0-9]+\.[^\]]+\]/g;

export function hasTokens(value: unknown): value is string {
  return typeof value === "string" && new RegExp(TOKEN.source).test(value);
}

/** afForm's replaceTokens(): each token becomes the referenced field's value as replaceAll() writes it, or "" when unset. */
export function replaceTokens(value: string, data: FormData): string {
  return value.replace(TOKEN, (token) => {
    const [entity = "", index = "", ...field] = token.slice(1, -1).split(".");
    const current = data[entity]?.[Number(index)]?.fields[field.join(".")];
    return current === undefined ? "" : asText(current);
  });
}

/** The distinct values a token default refers to, as afForm's getTokenValues() reads them. */
export function tokenValues(value: string, data: FormData): string[] {
  return [...new Set(value.match(TOKEN))].map((token) => replaceTokens(token, data));
}

/** Whether a token default refers to the field it fills, which would recalculate without end. */
export function refersToItself(value: string, scope: Scope, field: string): boolean {
  return scope.join === undefined && value.includes(`[${scope.entity}.${scope.index}.${field}]`);
}

/** A default without tokens; afField calculates token defaults live, see FieldNode. */
export function staticDefault(defn: FieldDefn | undefined): unknown {
  const value = defn?.afform_default;
  return hasTokens(value) ? undefined : value;
}

/** afField's setValue() for a default: a list split from its text, converted like a filter value. */
export function defaultValue(defn: FieldDefn, value: unknown): unknown {
  const listed = typeof value === "string" && isMultiple(defn) ? value.split(",") : value;
  return convertValue(defn, listed, { userContactId: window.CRM.config?.cid });
}

/** An af-if the renderer cannot read renders nothing, so it initialises nothing either. */
function conditionHolds(attribute: string, data: FormData): boolean {
  try {
    return checkConditions(parseConditions(attribute), data);
  } catch {
    return false;
  }
}

/**
 * Prepares data the way the Angular directives do when they render: creates the item
 * of every fieldset, pads every af-repeat to its initial count, marks a primary record in
 * repeated joins, and fills static defaults into empty fields. Skips what an af-if hides.
 */
export function initialiseNodes(
  nodes: LayoutNode[],
  data: FormData,
  start: Scope | null,
  offsets: WeakMap<ElementNode, number>,
): FormData {
  let next = data;
  const walk = (children: LayoutNode[], scope: Scope | null) => {
    for (const node of children.filter(isElement)) {
      const condition = node["af-if"];
      if (typeof condition === "string" && !conditionHolds(condition, next)) continue;
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
            walk(node["#children"] ?? [], { ...joinScope, joinIndex, repeated: true });
        } else {
          walk(node["#children"] ?? [], { ...joinScope, joinIndex: offsets.get(node) ?? 0 });
        }
      } else if (node["#tag"] === "af-field" && scope) {
        const defn = isFieldDefn(node.defn) ? node.defn : undefined;
        const value = staticDefault(defn);
        const name = String(node.name);
        if (defn && value !== undefined && getValue(next, scope, name) === undefined)
          next = setValue(next, scope, name, defaultValue(defn, value));
        // A slider always holds a value, so an untouched one is not a change.
        const current = getValue(next, scope, name);
        if (defn?.input_type === "Range" && typeof current !== "number")
          next = setValue(next, scope, name, rangeValue(defn, current));
      } else {
        walk(node["#children"] ?? [], scope);
      }
    }
  };
  walk(nodes, start);
  return next;
}

export function initialiseData(layout: LayoutNode[], data: FormData): FormData {
  return initialiseNodes(layout, data, null, joinOffsets(layout));
}
