import type { AutocompleteItem } from "../../afform/fields/autocomplete";
import { formatValue, type ConditionField } from "../search/condition";
import { EntityRef, OptionSelect } from "../search/SearchInput";
import { useEditor } from "./context";
import { plainLiteral } from "./fields";
import type { GuiField } from "./meta";
import { jsAttribute } from "./model";

interface FieldValueProps {
  id: string;
  field: GuiField;
  /** The comparison the value is for; without one the value is the field's own. */
  op?: string;
  value: unknown;
  onChange: (value: unknown) => void;
}

const CONTACT_TYPES = ["Individual", "Household", "Organization"];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const scalar = (value: unknown) =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : JSON.stringify(value);

const text = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";

/** The field as the search inputs read it. */
function conditionField(field: GuiField): ConditionField {
  const serialize = field.serialize;
  const entity = field.entity;
  return {
    name: field.name,
    data_type: field.data_type ?? "String",
    label: field.label ?? field.name,
    input_type: field.input_type,
    fk_entity: field.fk_entity,
    options: Array.isArray(field.options) ? field.options : false,
    serialize: typeof serialize === "number" || typeof serialize === "boolean" ? serialize : null,
    entity: typeof entity === "string" ? entity : undefined,
    nullable: true,
  };
}

/** afGuiFieldValue: the value input for a field in the builder. */
export function FieldValue({ id, field, op, value, onChange }: FieldValueProps) {
  const editor = useEditor();
  const multi = op
    ? op === "IN" || op === "NOT IN"
    : !!field.serialize || field.data_type === "Array";
  const condition = conditionField(field);
  const set = (next: unknown) => {
    onChange(formatValue(condition, op, undefined, next));
  };
  const attrs = isRecord(field.input_attrs) ? field.input_attrs : {};

  if (field.input_type === "Date") {
    const time = !!attrs.time;
    const current = text(value);
    return (
      <input
        id={id}
        className="form-control"
        type={time ? "datetime-local" : "date"}
        value={time ? current.replace(" ", "T").slice(0, 16) : current.slice(0, 10)}
        onChange={(event) => {
          const raw = event.target.value;
          onChange(time && raw ? `${raw.replace("T", " ")}:00` : raw);
        }}
      />
    );
  }
  if (field.fk_entity) {
    const fk = field.fk_entity;
    const filters = isRecord(attrs.filter) ? attrs.filter : {};
    const statics: AutocompleteItem[] = [];
    if (
      fk === "Individual" ||
      (fk === "Contact" && (!filters.contact_type || filters.contact_type === "Individual"))
    )
      statics.push({
        id: "user_contact_id",
        label: ts("Select Current User"),
        icon: "fa-user-circle-o",
      });
    for (const entity of editor.entities) {
      const parsed = jsAttribute(entity.node, "data");
      const plain = parsed === undefined ? undefined : plainLiteral(parsed);
      const data = isRecord(plain) ? plain : {};
      const matches =
        (entity.type === fk || (fk === "Contact" && CONTACT_TYPES.includes(entity.type))) &&
        Object.entries(filters).every(
          // Loose as core's `!=`: a filter of 1 matches data of "1".
          ([key, filter]) => !data[key] || scalar(data[key]) === scalar(filter),
        );
      if (matches)
        statics.push({
          id: entity.name,
          label: entity.label,
          icon: editor.meta.gui.entities[entity.type]?.icon ?? null,
        });
    }
    const params =
      typeof field.entity === "string" && field.name
        ? { fieldName: `${field.entity}.${field.name}` }
        : { filters };
    return (
      <EntityRef
        id={id}
        field={condition}
        op={op}
        value={value}
        onChange={set}
        multiple={multi}
        required={false}
        params={params}
        statics={statics}
      />
    );
  }
  if (Array.isArray(field.options))
    return (
      <OptionSelect
        id={id}
        field={condition}
        op={op}
        value={value}
        onChange={set}
        multiple={multi}
        required={false}
      />
    );
  if (field.data_type === "Boolean")
    return (
      <select
        id={id}
        className="form-control"
        value={value === true ? "1" : value === false ? "0" : ""}
        onChange={(event) => {
          onChange(event.target.value === "" ? null : event.target.value === "1");
        }}
      >
        <option value="">{ts("- select -")}</option>
        <option value="1">{ts("Yes")}</option>
        <option value="0">{ts("No")}</option>
      </select>
    );
  return (
    <input
      id={id}
      className="form-control"
      type={field.data_type === "Integer" && !multi ? "number" : "text"}
      value={Array.isArray(value) ? value.join(",") : text(value)}
      onChange={(event) => {
        set(event.target.value);
      }}
    />
  );
}
