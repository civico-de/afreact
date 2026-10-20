import { isDateField } from "../admin/search/condition";
import { DateRanges } from "../admin/search/dateRanges";
import { useFieldOptions } from "../admin/search/meta";
import { SearchCondition } from "../admin/search/SearchCondition";
import { errorMessage } from "../api/civi";
import { searchOperators, useRelativeDateFilters, type KitField } from "./fields";
import { Notice } from "./Notice";

interface FieldConditionProps {
  field: KitField;
  /** An APIv4 where clause on the field: [name, operator, value]. */
  clause: unknown[];
  onChange: (clause: unknown[]) => void;
  /** Names the operator and value inputs; the field's label by default. */
  label?: string;
  /** The option suffix the value holds for a field with options (`name`, `label`); `id` by default. */
  optionKey?: string;
  /** Marks the operator and the value inputs as invalid (`aria-invalid`). */
  invalid?: boolean;
  /** The id of the text that describes those inputs, such as their error (`aria-describedby`). */
  describedBy?: string;
}

/** The operator and value of one clause, with the input the field's data type takes. */
export function FieldCondition({
  field,
  clause,
  onChange,
  label,
  optionKey,
  invalid,
  describedBy,
}: FieldConditionProps) {
  const options = useFieldOptions(field.options === true ? field.entity : undefined);
  const date = isDateField(field);
  const ranges = useRelativeDateFilters(date);
  const failed = options.error ?? ranges.error;
  if (failed) return <Notice type="error">{errorMessage(failed)}</Notice>;
  // A stored range such as "this.month" reads as a fixed date until the ranges are known.
  if (date && !ranges.data)
    return (
      <p className="afreact-search-condition" role="status">
        {ts("Loading...")}
      </p>
    );
  return (
    <DateRanges value={ranges.data ?? null}>
      <SearchCondition
        label={label ?? field.label}
        field={field}
        clause={clause}
        offset={1}
        operators={searchOperators()}
        optionKey={optionKey}
        options={options.data?.[field.name]}
        onChange={onChange}
        invalid={invalid}
        describedBy={describedBy}
      />
    </DateRanges>
  );
}
