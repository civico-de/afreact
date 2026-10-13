import { useId } from "react";
import { ClauseMoveButtons, type ClauseTree } from "../../widgets/ClauseMove";
import { Picker, type PickerOption } from "../../widgets/Picker";
import type { ConditionField } from "../condition";
import { hasFunction, parseExpr, type SearchInfo } from "../expr";
import { useFieldOptions, type FieldOption, type SearchAdminMetadata } from "../meta";
import { SearchCondition } from "../SearchCondition";
import { FunctionEditor } from "./FunctionEditor";

const conjunctions = (): Record<string, string> => ({
  AND: ts("And"),
  OR: ts("Or"),
  NOT: ts("Not"),
});

interface ClauseEditorProps {
  meta: SearchAdminMetadata;
  search: SearchInfo;
  clauses: unknown[];
  onChange: (clauses: unknown[]) => void;
  fields: PickerOption[];
  op: string;
  label?: string;
  /** Leading entries that are not clauses, such as a join's name, type and fixed conditions. */
  skip?: number;
  allowFunctions?: boolean;
  /** An ON clause, with JSON-quoted values. */
  format?: "json";
  /** The select clause, whose aliases a having clause names. */
  aliases?: string[];
  placeholder?: string;
  onDeleteGroup?: () => void;
  /** Set for a nested group: the clauses it sits in. */
  tree?: ClauseTree;
}

/** crmSearchClause: a group of conditions joined by one conjunction, with nested groups. */
export function ClauseEditor(props: ClauseEditorProps) {
  const { clauses, onChange, op, skip = 0, onDeleteGroup } = props;
  const tree = props.tree ?? {
    root: clauses,
    path: [],
    skip,
    onChange: (update: (root: unknown[]) => unknown[]) => {
      onChange(update(clauses));
    },
  };
  const id = useId();
  const names = conjunctions();
  const groupLabel = props.label ?? ts("%1 group", { 1: names[op] ?? op });
  const setClause = (index: number, clause: unknown) => {
    onChange(clauses.map((c, i) => (i === index ? clause : c)));
  };
  const deleteRow = (index: number) => {
    onChange(clauses.filter((_, i) => i !== index));
  };
  const placeholder = props.placeholder ?? ts("Select field");
  return (
    <fieldset className="api4-clause-fieldset afreact-clause-group">
      <legend className={onDeleteGroup || props.label === undefined ? "" : "sr-only"}>
        {groupLabel}
      </legend>
      {onDeleteGroup && (
        <button
          type="button"
          className="btn btn-xs btn-danger-outline"
          aria-label={ts("Remove %1", { 1: groupLabel })}
          onClick={onDeleteGroup}
        >
          <i className="crm-i fa-trash" role="img" aria-hidden="true" />
        </button>
      )}
      {clauses.map((clause, index) => {
        if (index < skip || !Array.isArray(clause)) return null;
        const first = index === skip && !onDeleteGroup;
        const badge = first ? (props.label ?? names[op]) : names[op];
        const head: unknown = clause[0];
        const isGroup = typeof head === "string" && head in names;
        const name = isGroup
          ? ts("%1 group", { 1: names[head] ?? head })
          : ts("condition %1", { 1: index - skip + 1 });
        return (
          <div className="api4-input form-inline clearfix" key={index}>
            <span className="api4-clause-badge">
              <span className="badge badge-info">{badge}</span>
            </span>
            {/* deviation:builder-reorder-buttons */}
            <ClauseMoveButtons tree={tree} index={index} name={name} />
            {isGroup ? (
              <ClauseEditor
                {...props}
                label={undefined}
                skip={0}
                placeholder={undefined}
                clauses={Array.isArray(clause[1]) ? clause[1] : []}
                tree={{ ...tree, path: [...tree.path, index] }}
                op={head}
                onChange={(sub) => {
                  setClause(index, [head, sub]);
                }}
                onDeleteGroup={() => {
                  deleteRow(index);
                }}
              />
            ) : (
              <ClauseRow
                {...props}
                clause={clause}
                position={index - skip + 1}
                onChange={(next) => {
                  setClause(index, next);
                }}
                onRemove={() => {
                  deleteRow(index);
                }}
              />
            )}
          </div>
        );
      })}
      <div className="api4-input form-inline">
        <select
          className="form-control crm-auto-width btn-info"
          aria-label={
            onDeleteGroup ? ts("Add a subgroup of clauses") : ts("Add a group of clauses")
          }
          value=""
          onChange={(event) => {
            if (event.target.value) onChange([...clauses, [event.target.value, []]]);
          }}
        >
          <option value="">{names[op]}</option>
          {Object.entries(names)
            .filter(([key]) => key !== op)
            .map(([key, label]) => (
              <option key={key} value={key}>
                {ts("%1 group", { 1: label })}
              </option>
            ))}
        </select>
        <Picker
          id={`${id}-add`}
          label={placeholder}
          hiddenLabel
          placeholder={placeholder}
          className="crm-auto-width"
          single
          options={props.fields}
          value={[]}
          onChange={(picked) => {
            const field = picked[0];
            if (field !== undefined) onChange([...clauses, [String(field), "=", ""]]);
          }}
        />
      </div>
    </fieldset>
  );
}

/** A function's own option list, such as MONTH's month names. */
function fnOptions(options: unknown): FieldOption[] | undefined {
  if (!Array.isArray(options)) return undefined;
  return options.flatMap((option: unknown) =>
    typeof option === "object" &&
    option !== null &&
    "id" in option &&
    "label" in option &&
    (typeof option.id === "string" || typeof option.id === "number") &&
    typeof option.label === "string"
      ? [{ id: option.id, label: option.label }]
      : [],
  );
}

interface ClauseRowProps extends Omit<ClauseEditorProps, "onChange" | "clauses"> {
  clause: unknown[];
  position: number;
  onChange: (clause: unknown[]) => void;
  onRemove: () => void;
}

/** One condition: its field or function, then the operator and value. */
function ClauseRow(props: ClauseRowProps) {
  const { meta, search, clause, onChange, onRemove } = props;
  const id = useId();
  const head = typeof clause[0] === "string" ? clause[0] : "";
  // A having clause names a column by alias; its expression comes from the select clause.
  const expr = props.aliases?.find((item) => item.endsWith(` AS ${head}`)) ?? head;
  const info = parseExpr(meta, expr, search);
  const fieldArg = info.args.find((arg) => arg.type === "field");
  const field = fieldArg?.field;
  const options = useFieldOptions(field?.entity ?? undefined);
  const fn = hasFunction(expr) ? info.fn : null;
  const conditionField: ConditionField | undefined = fn
    ? {
        name: fn.name,
        label: fn.title,
        data_type: fn.data_type ?? info.data_type ?? "String",
        options: fnOptions(fn.options),
      }
    : field && { ...field, entity: field.entity ?? search.api_entity };
  const label = field?.label ?? head;
  const functions = !!props.allowFunctions && field?.type !== "Filter";
  return (
    <span className="api4-input-group">
      {functions && (
        <FunctionEditor
          meta={meta}
          search={search}
          expr={head}
          mode="clause"
          onChange={(next) => {
            onChange([next, ...clause.slice(1)]);
          }}
        />
      )}
      {!hasFunction(head) && (
        <Picker
          id={`${id}-field`}
          label={ts("Field of condition %1", { 1: props.position })}
          hiddenLabel
          placeholder={ts("Field")}
          className="crm-auto-width"
          single
          options={props.fields}
          value={head ? [head] : []}
          onChange={(picked) => {
            const next = picked[0];
            if (next === undefined) onRemove();
            else onChange([String(next), ...clause.slice(1)]);
          }}
        />
      )}
      <SearchCondition
        label={label}
        field={conditionField}
        clause={clause}
        offset={1}
        operators={meta.operators}
        format={props.format}
        optionKey={fieldArg?.suffix ? fieldArg.suffix.slice(1) : "id"}
        options={fn ? fnOptions(fn.options) : field ? options.data?.[field.name] : undefined}
        fields={props.fields}
        onChange={onChange}
      />
      <button
        type="button"
        className="btn btn-xs btn-danger-outline"
        aria-label={ts("Remove condition on %1", { 1: label })}
        onClick={onRemove}
      >
        <i className="crm-i fa-times" role="img" aria-hidden="true" />
      </button>
    </span>
  );
}
