import { Picker } from "../admin/widgets/Picker";
import { errorMessage } from "../api/civi";
import { useEntityFields, type KitField } from "./fields";
import { Notice } from "./Notice";

interface FieldPickerProps {
  id: string;
  /** The APIv4 entity whose own and custom fields are offered. */
  entity: string;
  label: string;
  /** The chosen field's name. */
  value: string | null;
  onChange: (field: KitField | null) => void;
  /** Names the input with an sr-only label. */
  hiddenLabel?: boolean;
  /** Leaves fields out, e.g. those without a filter. */
  filter?: (field: KitField) => boolean;
}

/** One field of an entity, custom fields under their group's title. */
export function FieldPicker({
  id,
  entity,
  label,
  value,
  onChange,
  hiddenLabel = false,
  filter,
}: FieldPickerProps) {
  const fields = useEntityFields(entity);
  if (fields.isError) return <Notice type="error">{errorMessage(fields.error)}</Notice>;
  const list = (fields.data ?? []).filter((field) => !filter || filter(field));
  const byName = new Map(list.map((field) => [field.name, field]));
  return (
    <Picker
      id={id}
      label={label}
      hiddenLabel={hiddenLabel}
      placeholder={fields.isPending ? ts("Loading...") : ts("Select field")}
      disabled={fields.isPending}
      single
      clearable
      options={list.map((field) => ({
        id: field.name,
        label: field.label,
        description: field.description,
        group: field.group,
      }))}
      value={value ? [value] : []}
      onChange={(picked) => {
        onChange(byName.get(String(picked[0] ?? "")) ?? null);
      }}
    />
  );
}
