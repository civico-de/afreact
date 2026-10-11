import { useId } from "react";
import { Picker } from "../../widgets/Picker";
import { getAllFields, type SearchInfo } from "../expr";
import {
  addArg,
  availableFunctions,
  canAddArg,
  canRemoveArg,
  changeArgType,
  fnState,
  getParam,
  removeArg,
  selectFunction,
  setArg,
  SQL_EXPR_TYPES,
  writeExpr,
  type FnMode,
  type FnState,
} from "../fn";
import type { FunctionParam, SearchAdminMetadata } from "../meta";

interface FunctionEditorProps {
  meta: SearchAdminMetadata;
  search: SearchInfo;
  expr: string;
  mode: FnMode;
  /** Shows the field's label next to a bare field, as the columns list does. */
  showLabel?: boolean;
  onChange: (expr: string) => void;
}

/** crmSearchFunction: picks a function for a field and edits its arguments and flags. */
export function FunctionEditor({
  meta,
  search,
  expr,
  mode,
  showLabel,
  onChange,
}: FunctionEditorProps) {
  const id = useId();
  const state = fnState(meta, expr, search);
  const fieldArg = state.args[state.fieldIndex];
  const commit = (next: FnState) => {
    onChange(writeExpr(next, mode));
  };
  const functions = availableFunctions(meta, state, expr, mode, search);
  const fieldLabel = fieldArg?.field?.label ?? "";
  const fieldOptions = () => getAllFields(meta, search, ":label", ["Field", "Custom", "Extra"]);
  const allowedTypes = (param: FunctionParam | undefined) =>
    SQL_EXPR_TYPES.filter((type) => param?.must_be?.includes(type.type));
  return (
    <span className="afreact-search-function form-group">
      <span title={ts("Transform field using a function")}>
        <Picker
          id={`${id}-fn`}
          label={ts("Function for %1", { 1: fieldLabel })}
          hiddenLabel
          placeholder={ts("Function")}
          className="crm-auto-width"
          single
          options={functions}
          value={state.fn ? [state.fn.name] : []}
          onChange={(picked) => {
            commit(selectFunction(meta, state, String(picked[0] ?? "")));
          }}
        />
      </span>
      {(!!showLabel || state.fn) && <label htmlFor={`${id}-fn`}>{fieldLabel}</label>}
      {state.args.map((arg, index) => {
        const param = getParam(state, index);
        const isField = index === state.fieldIndex;
        const argLabel = param?.label ?? ts("Function Argument");
        return (
          <span className="form-group" key={index}>
            {state.fn && (
              <FunctionFlag
                flags={param?.flag_before}
                value={arg.flag_before}
                label={ts("Flag for %1", { 1: argLabel })}
                onChange={(flag) => {
                  commit(setArg(state, index, { flag_before: flag }));
                }}
              />
            )}
            {!isField && arg.type !== null && (
              <span className="input-group" title={argLabel}>
                <span className="input-group-btn">
                  <select
                    className="form-control crm-auto-width"
                    aria-label={ts("Type of %1", { 1: argLabel })}
                    value={arg.type}
                    onChange={(event) => {
                      const type = SQL_EXPR_TYPES.find((t) => t.name === event.target.value);
                      if (type) commit(changeArgType(state, index, type.name));
                    }}
                  >
                    {allowedTypes(param).map((type) => (
                      <option key={type.name} value={type.name}>
                        {type.label()}
                      </option>
                    ))}
                  </select>
                </span>
                {arg.type === "field" ? (
                  <Picker
                    id={`${id}-arg-${String(index)}`}
                    label={argLabel}
                    hiddenLabel
                    placeholder={argLabel}
                    single
                    options={fieldOptions()}
                    value={arg.value === "" ? [] : [arg.value]}
                    onChange={(picked) => {
                      commit(setArg(state, index, { value: String(picked[0] ?? "") }));
                    }}
                  />
                ) : (
                  <input
                    className={`form-control${arg.type === "number" ? " six" : ""}`}
                    type={arg.type === "number" ? "number" : "text"}
                    aria-label={argLabel}
                    placeholder={argLabel}
                    required={!param?.can_be_empty && !param?.optional}
                    key={String(arg.value)}
                    defaultValue={String(arg.value)}
                    // Core writes the expression on blur, so typing does not rerun the preview.
                    onBlur={(event) => {
                      const raw = event.target.value;
                      const value = arg.type === "number" && raw !== "" ? Number(raw) : raw;
                      if (value !== arg.value) commit(setArg(state, index, { value }));
                    }}
                  />
                )}
                {canRemoveArg(state, index) && (
                  <span className="input-group-btn">
                    <button
                      type="button"
                      className="btn btn-danger"
                      aria-label={ts("Remove %1", { 1: argLabel })}
                      onClick={() => {
                        commit(removeArg(state, index));
                      }}
                    >
                      ×
                    </button>
                  </span>
                )}
              </span>
            )}
            {state.fn && arg.value !== "" && (
              <FunctionFlag
                flags={param?.flag_after}
                value={arg.flag_after}
                label={ts("Order of %1", { 1: argLabel })}
                onChange={(flag) => {
                  commit(setArg(state, index, { flag_after: flag }));
                }}
              />
            )}
          </span>
        );
      })}
      {canAddArg(state) && (
        <select
          className="form-control crm-auto-width"
          aria-label={ts("Add argument")}
          value=""
          onChange={(event) => {
            if (event.target.value) commit(addArg(state, event.target.value));
          }}
        >
          <option value="">{ts("Add argument")}</option>
          {allowedTypes(getParam(state, state.args.length)).map((type) => (
            <option key={type.type} value={type.type}>
              {type.label()}
            </option>
          ))}
        </select>
      )}
    </span>
  );
}

interface FunctionFlagProps {
  flags: Record<string, string> | undefined;
  value: string | undefined;
  label: string;
  onChange: (flag: string | undefined) => void;
}

/** crmSearchFunctionFlag: a checkbox for one optional flag, a select for a choice of several. */
function FunctionFlag({ flags, value, label, onChange }: FunctionFlagProps) {
  if (!flags) return null;
  const keys = Object.keys(flags);
  if (keys.length === 2 && keys.includes(""))
    return (
      <>
        {keys.filter(Boolean).map((key) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={value === key}
              onChange={() => {
                onChange(value === key ? undefined : key);
              }}
            />{" "}
            {flags[key]}
          </label>
        ))}
      </>
    );
  return (
    <select
      className="form-control crm-auto-width"
      aria-label={label}
      value={value ?? ""}
      onChange={(event) => {
        onChange(event.target.value || undefined);
      }}
    >
      {keys.map((key) => (
        <option key={key} value={key}>
          {flags[key]}
        </option>
      ))}
    </select>
  );
}
