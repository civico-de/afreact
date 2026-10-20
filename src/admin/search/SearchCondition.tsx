import { useEffect, useEffectEvent, useId } from "react";
import { Picker, type PickerOption } from "../widgets/Picker";
import {
  allowedOperators,
  fitOperator,
  fromClauseValue,
  inputModeOf,
  takesInput,
  toClauseValue,
  withInputMode,
  withOperator,
  type ConditionField,
  type Operator,
} from "./condition";
import type { FieldOption } from "./meta";
import { SearchInput } from "./SearchInput";

interface SearchConditionProps {
  /** Names the operator for assistive tech, e.g. the field's label. */
  label: string;
  field: ConditionField | undefined;
  clause: unknown[];
  /** Where the operator sits in the clause: 1 after a field, 0 for a bare [op, value]. */
  offset: number;
  operators: Operator[];
  /** An ON clause: string values JSON-quoted, a field told by its name. */
  format?: "json";
  optionKey?: string;
  options?: FieldOption[];
  /** Fields the value may name instead of a value; without them only values. */
  fields?: PickerOption[];
  onChange: (clause: unknown[]) => void;
  /** Marks the operator and the value inputs as invalid (`aria-invalid`). */
  invalid?: boolean;
  /** The id of the text that describes those inputs, such as their error. */
  describedBy?: string;
}

/** crmSearchCondition: the operator, the value-or-field toggle and the value of one clause. */
export function SearchCondition(props: SearchConditionProps) {
  const { label, field, clause, offset, operators, format, fields, onChange } = props;
  const { invalid, describedBy } = props;
  const id = useId();
  const allowed = allowedOperators(field, operators);
  const allowedKey = allowed.map((o) => o.key).join();
  const op = typeof clause[offset] === "string" ? clause[offset] : "";
  const fitted = fitOperator(clause, offset, allowed);
  // The clause takes an allowed operator when the field changes.
  const fit = useEffectEvent(() => {
    if (fitted !== clause) onChange(fitted);
  });
  useEffect(() => {
    fit();
  }, [allowedKey]);
  const mode = fields ? inputModeOf(clause, offset, format) : "value";
  const value = fromClauseValue(clause[1 + offset], format);
  const setValue = (next: unknown) => {
    const updated = [...clause];
    updated[1 + offset] = mode === "value" ? toClauseValue(next, format) : next;
    onChange(updated);
  };
  return (
    <span className="afreact-search-condition form-group">
      {allowed.length > 1 && (
        <select
          className="form-control api4-operator crm-auto-width"
          aria-label={ts("Operator for %1", { 1: label })}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          value={op}
          onChange={(event) => {
            onChange(withOperator(clause, offset, event.target.value));
          }}
        >
          {allowed.map((operator) => (
            <option key={operator.key} value={operator.key}>
              {operator.value}
            </option>
          ))}
        </select>
      )}
      {fields && (
        <select
          className="form-control crm-search-input-mode crm-auto-width"
          aria-label={ts("Compare %1 with", { 1: label })}
          value={mode}
          onChange={(event) => {
            onChange(
              withInputMode(
                clause,
                offset,
                event.target.value === "field" ? "field" : "value",
                format,
              ),
            );
          }}
        >
          <option value="value">{ts("Value")}</option>
          <option value="field">{ts("Field")}</option>
        </select>
      )}
      {takesInput(op) && mode === "value" && field && (
        <>
          <label htmlFor={`${id}-value`} className="sr-only">
            {ts("Value for %1", { 1: label })}
          </label>
          <SearchInput
            id={`${id}-value`}
            field={field}
            op={op}
            optionKey={props.optionKey}
            options={props.options}
            value={value}
            onChange={setValue}
            invalid={invalid}
            describedBy={describedBy}
          />
        </>
      )}
      {takesInput(op) && mode === "field" && fields && (
        <>
          <label htmlFor={`${id}-field`} className="sr-only">
            {ts("Field to compare %1 with", { 1: label })}
          </label>
          <Picker
            id={`${id}-field`}
            externalLabel
            label={ts("Field")}
            placeholder={ts("Field")}
            options={fields}
            invalid={invalid}
            describedBy={describedBy}
            single
            value={typeof value === "string" && value ? [value] : []}
            onChange={(picked) => {
              setValue(picked[0] ?? "");
            }}
          />
        </>
      )}
    </span>
  );
}
