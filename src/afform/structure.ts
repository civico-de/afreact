import { convertValue, isMultiple } from "../search/filters";
import { asText, checkConditions, parseConditions } from "./conditions";
import { rangeValue } from "./fields/Range";
import {
  ensurePrimary,
  ensureRepeatItems,
  fieldPlace,
  findElements,
  getValue,
  isExtraScope,
  repeatCount,
  setValue,
} from "./model";
import type { ElementNode, FieldDefn, FormData, LayoutNode, Scope } from "./types";
import { isElement, isFieldDefn } from "./types";

/**
 * Offset of each non-repeating af-join among its fieldset's joins of the same entity, counted over
 * the layout, shown or not: the server pairs record n with block n's `data` and prefilled record.
 * deviation:join-blocks-layout-order
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

/**
 * Initial item count of an af-repeat, as afRepeat computes it, but never past `max`, which
 * afRepeat overshoots. deviation:repeat-default-within-max
 */
export function repeatMinimum(node: ElementNode): number {
  const raw = node["af-repeat-default"];
  const fallback = raw === undefined || raw === "" || Number.isNaN(Number(raw)) ? 1 : Number(raw);
  const min = Number(node.min ?? 0);
  const count = Math.max(fallback, Number.isNaN(min) ? 0 : min);
  // A max of 0 means no limit, as in afRepeat.
  const max = Number(node.max);
  return max > 0 ? Math.min(count, max) : count;
}

/** afForm's identifyTokens(): [Entity.index.field] references in a default. */
export const TOKEN = /\[[a-zA-Z0-9_]+\.[0-9]+\.[^\]]+\]/g;

export function hasTokens(value: unknown): value is string {
  return typeof value === "string" && new RegExp(TOKEN.source).test(value);
}

/** afForm's getTokenValue(): the item's field, else a `Join.index.field` of its join records. */
export function tokenValue(token: string, data: FormData): unknown {
  const [entity = "", index = "", ...path] = token.slice(1, -1).split(".");
  const item = data[entity]?.[Number(index)];
  const own = item?.fields[path.join(".")];
  if (own !== undefined) return own;
  const [join = "", joinIndex = "", ...field] = path;
  return item?.joins?.[join]?.[Number(joinIndex)]?.[field.join(".")];
}

/** afForm's replaceTokens(): each token becomes the referenced value, "" while unset. */
export function replaceTokens(value: string, data: FormData): string {
  return value.replace(TOKEN, (token) => {
    const current = tokenValue(token, data);
    // deviation:token-null-empty
    return current === undefined || current === null ? "" : asText(current);
  });
}

/** The distinct values a token default refers to, as afForm's getTokenValues() reads them. */
export function tokenValues(value: string, data: FormData): string[] {
  return [...new Set(value.match(TOKEN))].map((token) => replaceTokens(token, data));
}

/** Whether a token default refers to the field it fills, which would recalculate without end. */
export function refersToItself(value: string, scope: Scope, field: string): boolean {
  // A token reads an item's fields, never the extra fields it keeps in `extras`.
  if (scope.extras) return false;
  const join = scope.join === undefined ? "" : `${scope.join}.${scope.joinIndex ?? 0}.`;
  return value.includes(`[${scope.entity}.${scope.index}.${join}${field}]`);
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

/**
 * afField's setValueFromRouteParams(): "Entity[.join].field", the entity name followed by
 * number n + 1 from the second item on, else the plain field name; extra fields take only that.
 */
export function routeValue(
  params: Record<string, string>,
  scope: Scope,
  name: string,
): string | undefined {
  const join = scope.join === undefined ? "" : `.${scope.join}`;
  const unique = `${scope.entity}${scope.index ? scope.index + 1 : ""}${join}.${name}`;
  if (!isExtraScope(scope) && Object.hasOwn(params, unique)) return params[unique];
  return Object.hasOwn(params, name) ? params[name] : undefined;
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
 * repeated joins, and fills empty fields from the route, else their static default.
 * Skips what an af-if hides.
 */
export function initialiseNodes(
  nodes: LayoutNode[],
  data: FormData,
  start: Scope | null,
  offsets: WeakMap<ElementNode, number>,
  params: Record<string, string>,
  /** The route before a change: only the fields whose route value changed are set then. */
  previous?: Record<string, string>,
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
        // afRepeat pads on init only: a route change leaves removed items removed.
        if (!previous && repeats) next = ensureRepeatItems(next, base, repeatMinimum(node));
        // afFieldset creates its entity's item on init, so an untouched entity still submits.
        else if (!previous && fieldset) next = ensureRepeatItems(next, base, 1);
        const count = repeats ? repeatCount(next, base) : 1;
        const slot = repeats && { slot: true };
        for (let index = 0; index < count; index++)
          walk(node["#children"] ?? [], { entity: fieldset, index, ...slot });
      } else if (typeof join === "string" && scope) {
        const slot = scope.slot && { slot: true };
        const joinScope = { entity: scope.entity, index: scope.index, join, ...slot };
        if (repeats) {
          const hasPrimary = findElements(node["#children"] ?? [], "af-field").some(
            (field) => field.name === "is_primary",
          );
          if (!previous) next = ensureRepeatItems(next, joinScope, repeatMinimum(node));
          if (!previous && hasPrimary) next = ensurePrimary(next, joinScope);
          for (let joinIndex = 0; joinIndex < repeatCount(next, joinScope); joinIndex++)
            walk(node["#children"] ?? [], { ...joinScope, joinIndex, repeated: true });
        } else {
          walk(node["#children"] ?? [], { ...joinScope, joinIndex: offsets.get(node) ?? 0 });
        }
      } else if (node["#tag"] === "af-field") {
        const place = fieldPlace(node, scope);
        if (!place) continue;
        const { scope: at, name } = place;
        const defn = isFieldDefn(node.defn) ? node.defn : undefined;
        // A search fieldset (no entity) reads the route itself.
        // deviation:route-search-set-skips-entities
        const given = at.entity ? routeValue(params, at, name) : undefined;
        if (previous) {
          // deviation:route-change-sets-changed-fields
          if (defn && given !== undefined && given !== routeValue(previous, at, name))
            next = setValue(next, at, name, defaultValue(defn, given));
          continue;
        }
        const value = given ?? staticDefault(defn);
        // deviation:defaults-keep-loaded-values
        if (defn && value !== undefined && getValue(next, at, name) === undefined)
          next = setValue(next, at, name, defaultValue(defn, value));
        // A slider always holds a value, so an untouched one is not a change.
        const current = getValue(next, at, name);
        if (defn?.input_type === "Range" && typeof current !== "number")
          next = setValue(next, at, name, rangeValue(defn, current));
      } else {
        walk(node["#children"] ?? [], scope);
      }
    }
  };
  walk(nodes, start);
  return next;
}

/** afField's routeParams watcher: a changed route sets the fields it names anew. */
export function followRoute(
  layout: LayoutNode[],
  data: FormData,
  previous: Record<string, string>,
  params: Record<string, string>,
): FormData {
  return initialiseNodes(layout, data, null, joinOffsets(layout), params, previous);
}

export function initialiseData(
  layout: LayoutNode[],
  data: FormData,
  params: Record<string, string> = {},
): FormData {
  return initialiseNodes(layout, data, null, joinOffsets(layout), params);
}
