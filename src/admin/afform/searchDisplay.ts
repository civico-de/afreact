import type { PickerOption } from "../widgets/Picker";
import type { EditorMeta, GuiField, SearchDisplayMeta } from "./meta";

export interface DisplayEntity {
  name: string;
  /** The join alias and a dot, "" for the search's own entity. */
  prefix: string;
  label: string;
  fields: Record<string, GuiField>;
}

function entityMeta(meta: EditorMeta, name: string) {
  const entity = meta.gui.entities[name];
  if (!entity) throw new Error(`No metadata for entity ${name}.`);
  return entity;
}

/** afGui.getSearchDisplayEntities(): the search's entity, its joins and their bridges. */
export function searchDisplayEntities(
  meta: EditorMeta,
  display: SearchDisplayMeta,
): DisplayEntity[] {
  const main = entityMeta(meta, display["saved_search_id.api_entity"]);
  const entities: DisplayEntity[] = [
    { name: main.entity, prefix: "", label: main.label, fields: main.fields ?? {} },
  ];
  const labels = display["saved_search_id.form_values"]?.join ?? {};
  for (const join of display["saved_search_id.api_params"].join ?? []) {
    const [name = "", alias = ""] = String(join[0]).split(" AS ");
    const entity = entityMeta(meta, name);
    const label = labels[alias] ?? alias;
    const fields = entity.fields ?? {};
    entities.push({ name: entity.entity, prefix: `${alias}.`, label, fields });
    const bridgeName = join[2];
    const bridge = typeof bridgeName === "string" ? meta.gui.entities[bridgeName] : undefined;
    if (bridge)
      entities.push({
        name: bridge.entity,
        prefix: `${alias}.`,
        label: `${label} ${bridge.label}`,
        fields: Object.fromEntries(
          Object.entries(bridge.fields ?? {}).filter(([key]) => !(key in fields)),
        ),
      });
  }
  return entities;
}

/** afGui.getSearchDisplayFields(): the display's calculated and entity fields, grouped. */
export function searchDisplayFields(meta: EditorMeta, display: SearchDisplayMeta): PickerOption[] {
  const calculated = (display.calc_fields ?? []).map((field) => ({
    id: field.name,
    label: field.label,
    group: ts("Calculated Fields"),
  }));
  return [
    ...calculated,
    ...searchDisplayEntities(meta, display).flatMap((entity) =>
      Object.values(entity.fields).map((field) => ({
        id: entity.prefix + field.name,
        label: `${entity.label} ${field.label ?? field.name}`,
        group: entity.label,
      })),
    ),
  ];
}
