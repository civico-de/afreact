import type { EditorApi } from "../context";
import { getField, type SearchDisplayMeta } from "../meta";
import { textAttribute } from "../model";
import { layoutOf, nodeType, searchKey } from "../nodes";
import type { NodePath, ShallowElement } from "../tree";
import type { ContainerScope } from "./dropRules";

/** The entity a scope's entity name stands for: `Individual1` → Individual, `…-join-Email` → Email. */
export function scopeEntityType(editor: Pick<EditorApi, "entities">, entityName: string): string {
  const [name = "", join] = entityName.split("-join-");
  if (join) return join;
  const entity = editor.entities.find((each) => each.name === name);
  if (!entity) throw new Error(`No entity ${name} on the form.`);
  return entity.type;
}

/** getSearchDisplay(): the display a `search.display` key names. */
export const scopeSearchDisplay = (
  editor: Pick<EditorApi, "meta">,
  scope: ContainerScope,
): SearchDisplayMeta | undefined =>
  scope.entityName ? undefined : editor.meta.searchDisplays[scope.dataEntity];

/**
 * getFieldEntityType(): the entity a field in the scope belongs to: the scope's entity or join,
 * or in a search form the search's entity, a join's by the field's prefix, or a bridge.
 */
export function fieldEntityType(
  editor: Pick<EditorApi, "entities" | "meta">,
  scope: ContainerScope,
  fieldKey = "",
): string {
  const type = knownEntityType(editor, scope, fieldKey);
  if (type === undefined)
    throw new Error(
      `No entity or search display ${scope.entityName ?? scope.dataEntity} on the form.`,
    );
  return type;
}

/** fieldEntityType(), or undefined where the scope's entity or display is not on the form. */
export function knownEntityType(
  editor: Pick<EditorApi, "entities" | "meta">,
  scope: ContainerScope,
  fieldKey = "",
): string | undefined {
  if (scope.entityName) {
    const [name = "", join] = scope.entityName.split("-join-");
    if (join) return join;
    return editor.entities.find((each) => each.name === name)?.type;
  }
  const display = scopeSearchDisplay(editor, scope);
  if (!display) return undefined;
  const dot = fieldKey.indexOf(".");
  const prefix = dot < 0 ? null : fieldKey.slice(0, dot);
  const fieldName = fieldKey.slice(dot + 1);
  for (const join of display["saved_search_id.api_params"].join ?? []) {
    const [entity = "", alias] = String(join[0]).split(" AS ");
    if (prefix === null || alias !== prefix) continue;
    // A field the joined entity lacks belongs to the bridge.
    const bridge = join[2];
    return !getField(editor.meta, entity, fieldName) && typeof bridge === "string"
      ? bridge
      : entity;
  }
  return display["saved_search_id.api_entity"];
}

/** The scope of a container's children, as afGuiContainer passes entity-name and data-entity on. */
export function childScope(
  editor: Pick<EditorApi, "meta" | "entities">,
  parent: ContainerScope,
  path: NodePath,
  node: ShallowElement,
  label: string,
): ContainerScope {
  const type = nodeType(node, editor.meta);
  const axis = layoutOf(node) === "af-layout-rows" ? "y" : "x";
  const base = {
    ...parent,
    path,
    label,
    axis,
    inBlock: false,
    join: null,
  } satisfies ContainerScope;
  if (type === "fieldset") {
    const name = textAttribute(node, "af-fieldset") ?? "";
    return { ...base, entityName: name, dataEntity: name, inFieldset: true, join: null };
  }
  if (type === "searchFieldset")
    return {
      ...base,
      entityName: null,
      dataEntity: searchKey(node, editor.meta) ?? "",
      inFieldset: true,
      join: null,
    };
  if (type === "join") {
    const join = textAttribute(node, "af-join") ?? "";
    const entityName = `${parent.entityName ?? ""}-join-${join}`;
    return { ...base, entityName, dataEntity: entityName, join };
  }
  return base;
}
