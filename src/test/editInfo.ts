import type { EditableInfo } from "../search/types";

/** An editable column's info as getEditableInfo() sends it: a nullable text field of a contact. */
export function editInfo(info: Partial<EditableInfo> & { value_key: string }): EditableInfo {
  return {
    entity: "Contact",
    input_type: "Text",
    input_attrs: [],
    data_type: "String",
    options: false,
    serialize: false,
    nullable: true,
    fk_entity: null,
    value_path: info.value_key,
    id_key: "id",
    id_path: "id",
    explicit_join: null,
    control_field: null,
    grouping_fields: [],
    ...info,
  };
}
