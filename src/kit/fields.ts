import { useQuery } from "@tanstack/react-query";
import type { ConditionField, Operator } from "../admin/search/condition";
import type { DateRange } from "../admin/search/dateRanges";
import { api4 } from "../api/civi";

/** A field of one entity as APIv4 getFields lists it; `group` is a custom field's group title. */
export interface KitField extends ConditionField {
  name: string;
  label: string;
  title?: string | null;
  description?: string | null;
  type: "Field" | "Custom";
  custom_field_id?: number | null;
  group?: string;
}

const SELECT = [
  "name",
  "title",
  "label",
  "description",
  "type",
  "data_type",
  "input_type",
  "fk_entity",
  "options",
  "suffixes",
  "serialize",
  "nullable",
  "required",
  "operators",
  "custom_field_id",
];

const groupOf = (field: KitField) => field.name.split(".")[0] ?? "";

/** The entity's own and custom fields, no joins, as SearchKit's admin schema lists them. */
export async function loadEntityFields(entity: string): Promise<KitField[]> {
  const fields = await api4<KitField>(entity, "getFields", {
    action: "get",
    select: SELECT,
    where: [
      ["type", "IN", ["Field", "Custom"]],
      ["deprecated", "=", false],
      ["name", "NOT IN", ["api_key", "hash"]],
    ],
    orderBy: { label: "ASC" },
  });
  const groupNames = [
    ...new Set(fields.flatMap((field) => (field.custom_field_id ? [groupOf(field)] : []))),
  ];
  const groups = groupNames.length
    ? await api4<{ name: string; title: string }>("CustomGroup", "get", {
        select: ["name", "title"],
        where: [["name", "IN", groupNames]],
      })
    : [];
  const titles = new Map(groups.map((group) => [group.name, group.title]));
  const titleOf = (field: KitField) => {
    const title = titles.get(groupOf(field));
    if (title === undefined) throw new Error(`No custom group ${groupOf(field)} for ${field.name}`);
    return title;
  };
  // The entity's own fields first, then each custom group's together, as a picker lists them.
  return fields
    .map((field) => ({
      ...field,
      entity,
      group: field.custom_field_id ? titleOf(field) : undefined,
    }))
    .sort((a, b) =>
      a.group === b.group
        ? 0
        : a.group === undefined
          ? -1
          : b.group === undefined
            ? 1
            : a.group.localeCompare(b.group),
    );
}

export function useEntityFields(entity: string) {
  return useQuery({
    queryKey: ["afreact-kit", "fields", entity],
    queryFn: () => loadEntityFields(entity),
    staleTime: Infinity,
  });
}

/** The active relative_date_filters ("this.month", …) as `CRM_Core_OptionGroup::values()` lists them. */
export function useRelativeDateFilters(enabled = true) {
  return useQuery({
    queryKey: ["afreact-kit", "relativeDateFilters"],
    queryFn: async (): Promise<DateRange[]> =>
      (
        await api4<{ value: string; label: string }>("OptionValue", "get", {
          select: ["value", "label"],
          where: [
            ["option_group_id:name", "=", "relative_date_filters"],
            ["is_active", "=", true],
          ],
          orderBy: { weight: "ASC" },
        })
      ).map((option) => ({ id: option.value, text: option.label })),
    enabled,
    staleTime: Infinity,
  });
}

/** SearchKit's operators with their labels, as `Civi\Search\Admin::getOperators()`. */
export function searchOperators(): Operator[] {
  return [
    { key: "=", value: "=" },
    { key: "!=", value: "≠" },
    { key: ">", value: ">" },
    { key: "<", value: "<" },
    { key: ">=", value: "≥" },
    { key: "<=", value: "≤" },
    { key: "CONTAINS", value: ts("Contains All") },
    { key: "NOT CONTAINS", value: ts("Doesn't Contain All") },
    { key: "CONTAINS ONE OF", value: ts("Contains Any") },
    { key: "NOT CONTAINS ONE OF", value: ts("Doesn't Contain Any") },
    { key: "IN", value: ts("Is One Of") },
    { key: "NOT IN", value: ts("Not One Of") },
    { key: "LIKE", value: ts("Is Like") },
    { key: "NOT LIKE", value: ts("Not Like") },
    { key: "REGEXP", value: ts("Matches Pattern") },
    { key: "NOT REGEXP", value: ts("Doesn't Match Pattern") },
    { key: "REGEXP BINARY", value: ts("Matches Pattern (case-sensitive)") },
    { key: "NOT REGEXP BINARY", value: ts("Doesn't Match Pattern (case-sensitive)") },
    { key: "BETWEEN", value: ts("Is Between") },
    { key: "NOT BETWEEN", value: ts("Not Between") },
    { key: "IS EMPTY", value: ts("Is Empty") },
    { key: "IS NOT EMPTY", value: ts("Not Empty") },
    { key: "IS NOT NULL", value: ts("Any Value") },
    { key: "IS NULL", value: ts("No Value") },
  ];
}
