import { EntityRef } from "../admin/search/SearchInput";

interface EntityPickerProps {
  id: string;
  /** The APIv4 entity whose `autocomplete` action is searched, e.g. `Contact` or `Group`. */
  entity: string;
  label: string;
  /** The chosen ids; at most one unless `multiple`. */
  value: (string | number)[];
  onChange: (ids: (string | number)[]) => void;
  multiple?: boolean;
  /** Further `autocomplete` parameters, such as `filters`. */
  params?: Record<string, unknown>;
  /** Names the input with an sr-only label. */
  hiddenLabel?: boolean;
  /** Marks the input as invalid (`aria-invalid`). */
  invalid?: boolean;
  /** The id of the text that describes the input, such as its error (`aria-describedby`). */
  describedBy?: string;
}

/** Records of one entity, searched with its `autocomplete` action as core's entity references are. */
export function EntityPicker({
  id,
  entity,
  label,
  value,
  onChange,
  multiple = false,
  params = {},
  hiddenLabel = false,
  invalid,
  describedBy,
}: EntityPickerProps) {
  return (
    <span className="afreact-entity-picker">
      <label htmlFor={id} className={hiddenLabel ? "sr-only" : undefined}>
        {label}
      </label>
      <EntityRef
        id={id}
        field={{ name: "id", data_type: "Integer", fk_entity: entity, entity }}
        value={multiple ? value : (value[0] ?? null)}
        onChange={(picked) => {
          const ids = (Array.isArray(picked) ? picked : [picked]).filter(
            (item): item is string | number => typeof item === "string" || typeof item === "number",
          );
          onChange(ids);
        }}
        multiple={multiple}
        required={false}
        params={params}
        statics={[]}
        invalid={invalid}
        describedBy={describedBy}
      />
    </span>
  );
}
