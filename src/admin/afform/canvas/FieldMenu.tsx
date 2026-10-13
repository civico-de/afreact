import { toLiteral } from "../literal";
import { useId, useState } from "react";
import { EntityRef } from "../../search/SearchInput";
import { Picker } from "../../widgets/Picker";
import { FieldValue } from "../FieldValue";
import { textAttribute } from "../model";
import { searchDisplayFields } from "../searchDisplay";
import { openConditionalDialog } from "./Conditional";
import {
  ConditionalItem,
  DeleteAction,
  MenuAction,
  MenuCheck,
  MenuControls,
  MenuDivider,
} from "./common";
import { guiField, type FieldApi } from "./Field";
import {
  canBeMultiple,
  canBeRange,
  defaultDateType,
  getProp,
  getValue,
  inputTypeCanBe,
  isMultiSelect,
  isReadOnly,
  operatorOf,
  propIsset,
  setValue,
  toggleLabel,
  toggleMultiple,
  toggleSearchRange,
  withLocal,
  withOperator,
  type FieldState,
} from "./fieldModel";
import { FormTokenSelect } from "./TokenSelect";

const text = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A number input's value: a number, or undefined where it is empty. */
const numberOf = (value: string) => (value === "" ? undefined : Number(value));

/**
 * A new input type; a slider without options gets its bounds written out, as core's
 * getRangeProp() writes them on showing it.
 */
function withInputType(state: FieldState, type: string, hasDefault: boolean): FieldState {
  let next = setValue(state, "input_type", type, hasDefault);
  if (type !== "Range" || next.local.options || next.base.options) return next;
  for (const [key, value] of [
    ["min", 0],
    ["max", 99],
    ["step", 1],
  ] as const)
    if (getProp(next, `input_attrs.${key}`) === undefined)
      next = withLocal(next, ["input_attrs", key], value);
  return next;
}

/** The input types the field may take, labelled for a reference as core's $onInit does. */
function inputTypes(api: FieldApi) {
  const entity = api.state.base.input_type === "EntityRef" ? api.fkEntity : undefined;
  const current = text(api.defn.input_type);
  return api.editor.meta.gui.inputTypes
    .filter((type) => inputTypeCanBe(api.state, type.name) || type.name === current)
    .map((type) => {
      if (entity && type.name === "EntityRef")
        return { ...type, label: ts("Autocomplete %1", { 1: entity.label }) };
      if (entity && type.name === "Number")
        return { ...type, label: ts("%1 ID", { 1: entity.label }) };
      if (entity && type.name === "Select")
        return { ...type, label: ts("Select Form %1", { 1: entity.label }) };
      return type;
    });
}

/** getInputStyles(): the styles of the field's input type, "Default" first. */
function inputStyles(api: FieldApi) {
  const type = text(getProp(api.state, "input_type"));
  return [
    { value: "", label: ts("Default") },
    ...api.editor.meta.admin.field_styles
      .filter((style) => style.grouping === type)
      .map(({ value, label }) => ({ value, label })),
  ];
}

function StyleItem({ api }: { api: FieldApi }) {
  const id = useId();
  const [other, setOther] = useState(false);
  const current = text(getValue(api.state, "input_style"));
  const styles = inputStyles(api);
  const selected =
    (current && !styles.some((style) => style.value === current)) || other ? "_other_" : current;
  return (
    <li>
      <div className="af-gui-field-select-in-dropdown">
        <label htmlFor={id}>{ts("Style:")}</label>
        <select
          id={id}
          className="form-control"
          title={ts("Field style")}
          value={selected}
          onChange={(event) => {
            const value = event.target.value;
            setOther(value === "_other_");
            if (value !== "_other_") api.set("input_style", value);
          }}
        >
          {styles.map((style) => (
            <option key={style.value} value={style.value}>
              {style.label}
            </option>
          ))}
          <option value="_other_">{ts("Other")}</option>
        </select>
      </div>
      {selected === "_other_" && (
        <div className="af-gui-field-select-in-dropdown form-inline">
          <input
            key={current}
            type="text"
            className="form-control"
            aria-label={ts("CSS class(es)")}
            placeholder={ts("CSS class(es)")}
            defaultValue={current}
            onBlur={(event) => {
              api.set("input_style", event.target.value);
            }}
          />
        </div>
      )}
    </li>
  );
}

/**
 * Min and max: a number's bounds, or how many options a multi-select takes. A bound is met
 * with the other when its input is left, not per keystroke. deviation:field-bounds-on-blur
 */
export function MinMaxItem({ api }: { api: FieldApi }) {
  const attrs = api.state.local.input_attrs;
  const own = (key: string) => (isRecord(attrs) ? text(attrs[key]) : "");
  const set = (key: "min" | "max", value: number | undefined) => {
    api.update((state) => withLocal(state, ["input_attrs", key], value));
  };
  // onChangeMin()/onChangeMax(): a bound past the other one takes the other's value.
  const meet = (key: "min" | "max") => {
    const value = getProp(api.state, `input_attrs.${key}`);
    const other = getProp(api.state, key === "min" ? "input_attrs.max" : "input_attrs.min");
    if (typeof value !== "number" || typeof other !== "number") return;
    if (key === "min" ? value > other : value < other) set(key, other);
  };
  return (
    <li>
      {(["min", "max"] as const).map((key) => (
        <div key={key} className="form-inline">
          <label>
            {key === "min" ? ts("Minimum:") : ts("Maximum:")}{" "}
            <input
              type="number"
              className="form-control four"
              value={own(key)}
              onChange={(event) => {
                set(key, numberOf(event.target.value));
              }}
              onBlur={() => {
                meet(key);
              }}
            />
          </label>
        </div>
      ))}
    </li>
  );
}

const STEPS = [1, 0.1, 0.01, 0.001, 0.0001, 0.00001, 0.000001, 0.0000001, 0.00000001, 0.000000001];

function EntityRefItems({ api }: { api: FieldApi }) {
  const searchId = useId();
  const displayId = useId();
  const securityId = useId();
  const quickAddId = useId();
  const fk = text(api.defn.fk_entity);
  const savedSearch = text(api.defn.saved_search);
  const fkType = api.fkEntity?.entity;
  const allowed = fkType === "Contact" ? ["Individual", "Household", "Organization"] : [fkType];
  const quickAdd = (window.CRM.config?.quickAdd ?? [])
    .filter((link) => allowed.includes(link.entity))
    .map((link) => ({ id: link.path, label: link.title, icon: link.icon }));
  const chosen = getValue(api.state, "input_attrs.quickAdd");
  return (
    <>
      <li title={ts("Use a saved search to filter the autocomplete results")}>
        <div className="af-gui-field-select-in-dropdown">
          <label htmlFor={searchId} className="sr-only">
            {ts("Saved Search")}
          </label>
          <EntityRef
            id={searchId}
            field={{ name: "saved_search", data_type: "String", fk_entity: "SavedSearch" }}
            value={savedSearch || null}
            multiple={false}
            required={false}
            params={{
              key: "name",
              filters: { api_entity: fk },
              formName: "afformAdmin",
              fieldName: "autocompleteSavedSearch",
            }}
            onChange={(value) => {
              api.update((state) =>
                setValue(
                  setValue(
                    state,
                    "saved_search",
                    value === null ? undefined : toLiteral(value),
                    api.hasDefault,
                  ),
                  "search_display",
                  undefined,
                  api.hasDefault,
                ),
              );
            }}
          />
        </div>
      </li>
      {savedSearch && (
        <li title={ts("Use a saved search to filter the autocomplete results")}>
          <div className="af-gui-field-select-in-dropdown">
            <label htmlFor={displayId} className="sr-only">
              {ts("Default Display")}
            </label>
            <EntityRef
              id={displayId}
              field={{ name: "search_display", data_type: "String", fk_entity: "SearchDisplay" }}
              value={text(api.defn.search_display) || null}
              multiple={false}
              required={false}
              params={{
                key: "name",
                filters: { "saved_search_id.name": savedSearch },
                formName: "afformAdmin",
                fieldName: "autocompleteDisplay",
              }}
              onChange={(value) => {
                api.set("search_display", value === null ? undefined : toLiteral(value));
              }}
            />
          </div>
        </li>
      )}
      <li title={ts("Should permissions be checked when autocompleting existing entities")}>
        <div className="af-gui-field-select-in-dropdown">
          <Picker
            id={securityId}
            label={ts("Security")}
            hiddenLabel
            placeholder={ts("Security")}
            single
            options={[
              {
                id: "RBAC",
                icon: "fa-user",
                label: ts("User-Based"),
                description: ts("Inherit permissions based on the current user or role"),
              },
              {
                id: "FBAC",
                icon: "fa-file-text",
                label: ts("Form-Based"),
                description: ts("Allow access to any fields listed on the form"),
              },
            ]}
            value={
              text(getValue(api.state, "security")) ? [text(getValue(api.state, "security"))] : []
            }
            onChange={(picked) => {
              api.set("security", picked[0]);
            }}
          />
        </div>
      </li>
      <li title={ts("Allow a new entity to be created via quick-add popup")}>
        <div className="af-gui-field-select-in-dropdown">
          <Picker
            id={quickAddId}
            label={ts("Quick Add")}
            hiddenLabel
            placeholder={ts("Quick Add")}
            options={quickAdd}
            value={Array.isArray(chosen) ? chosen.map(text) : []}
            onChange={(pick) => {
              const picked = pick(Array.isArray(chosen) ? chosen.map(text) : []);
              api.set("input_attrs.quickAdd", picked.length ? picked.map(String) : undefined);
            }}
          />
        </div>
      </li>
      <MenuCheck
        checked={!!getProp(api.state, "input_attrs.autoOpen")}
        title={ts("Show autocomplete results without typing")}
        onClick={() => {
          api.set("input_attrs.autoOpen", !getValue(api.state, "input_attrs.autoOpen"));
        }}
      >
        {ts("Auto Open")}
      </MenuCheck>
    </>
  );
}

/** The default value: how a date's is given, and the value itself. */
export function DefaultItems({ api }: { api: FieldApi }) {
  const typeId = useId();
  const valueId = useId();
  const offsetId = useId();
  const { state } = api;
  const inputType = text(api.defn.input_type);
  const dateType = defaultDateType(state);
  const relative = text(getValue(state, "afform_default")).split(" ");
  const offset = Number.parseInt(relative[1] ?? "0", 10);
  const plural = Math.abs(offset) !== 1;
  // The text typed, while the stored offset is still the one it was typed over or gave.
  const [offsetDraft, setOffsetDraft] = useState<{ text: string; at?: string } | null>(null);
  const signed = (typed: string) => {
    const value = Number(typed);
    return value < 0 ? String(value) : `+${String(value)}`;
  };
  const setRelative = (index: number, value: string) => {
    const next = [...relative];
    next[index] = value;
    api.set("afform_default", next.join(" "));
  };
  const showInput = api.hasDefault && state.base.data_type !== "Boolean" && dateType === "fixed";
  const tokens =
    api.editor.afform.type === "form" &&
    ["Text", "TextArea", "Hidden", "DisplayOnly"].includes(inputType);
  return (
    <>
      {inputType === "Date" && api.hasDefault && (
        <MenuControls>
          <label htmlFor={typeId} className="sr-only">
            {ts("Default date")}
          </label>
          <select
            id={typeId}
            className="form-control"
            value={dateType}
            onChange={(event) => {
              const value = event.target.value;
              api.set(
                "afform_default",
                value === "relative" ? "now +0 day" : value === "now" ? "now" : "",
              );
            }}
          >
            <option value="fixed">{ts("Pick Date")}</option>
            <option value="now">{ts("Now")}</option>
            <option value="relative">{ts("Relative")}</option>
          </select>
        </MenuControls>
      )}
      {api.hasDefault && dateType === "relative" && (
        <MenuControls>
          <label htmlFor={offsetId}>{ts("Now") + (offset < 0 ? "" : " +")}</label>{" "}
          <input
            id={offsetId}
            className="form-control"
            type="number"
            value={
              offsetDraft && offsetDraft.at === relative[1]
                ? offsetDraft.text
                : Number.isNaN(offset)
                  ? ""
                  : offset
            }
            onChange={(event) => {
              const typed = event.target.value;
              // A lone "-" reads as empty; it stays on show until a digit follows.
              // deviation:date-offset-minus
              setOffsetDraft({ text: typed, at: typed === "" ? relative[1] : signed(typed) });
              if (typed !== "") setRelative(1, signed(typed));
            }}
            onBlur={() => {
              setOffsetDraft(null);
            }}
          />{" "}
          <select
            className="form-control"
            aria-label={ts("Unit")}
            value={relative[2] ?? ""}
            onChange={(event) => {
              setRelative(2, event.target.value);
            }}
          >
            <option value="day">{plural ? ts("Days") : ts("Day")}</option>
            <option value="week">{plural ? ts("Weeks") : ts("Week")}</option>
            <option value="year">{plural ? ts("Years") : ts("Year")}</option>
          </select>
        </MenuControls>
      )}
      {showInput && (
        <li>
          <div className="af-gui-field-select-in-dropdown form-inline">
            <label htmlFor={valueId} className="sr-only">
              {ts("Default value")}
            </label>
            <FieldValue
              id={valueId}
              field={guiField(api.defn, state.fieldName)}
              op={state.isSearch ? operatorOf(state) || "IN" : undefined}
              value={getValue(state, "afform_default")}
              onChange={(value) => {
                api.set("afform_default", value === undefined ? undefined : toLiteral(value));
              }}
            />
          </div>
          {tokens && (
            <FormTokenSelect
              value={text(getValue(state, "afform_default"))}
              onChange={(value) => {
                api.set("afform_default", value);
              }}
            />
          )}
        </li>
      )}
    </>
  );
}

function SearchItems({ api }: { api: FieldApi }) {
  const operatorId = useId();
  const defaultId = useId();
  const joinId = useId();
  const fieldsId = useId();
  const { state, ops } = api;
  const name = textAttribute(ops.node, "name") ?? "";
  const [combining, setCombining] = useState(false);
  const multiField = name.includes(",") || combining;
  const all = api.editor.meta.admin.search_operators;
  const allowed =
    Array.isArray(api.defn.operators) && api.defn.operators.length
      ? api.defn.operators.map(text)
      : null;
  const operators = Object.entries(all).filter(([key]) => !allowed || allowed.includes(key));
  const joins = Object.entries(api.display?.["saved_search_id.form_values"]?.join ?? {});
  const others = name.split(",").slice(1);
  return (
    <>
      <MenuDivider />
      {canBeMultiple(state) && (
        <MenuCheck
          checked={!!getProp(state, "input_attrs.multiple")}
          title={ts("Search multiple values")}
          onClick={() => {
            api.update((current) => toggleMultiple(current, api.hasDefault));
          }}
        >
          {ts("Multi-Select")}
        </MenuCheck>
      )}
      {canBeRange(state) && (
        <MenuCheck
          checked={!!getProp(state, "search_range")}
          title={ts("Search between low & high values")}
          onClick={() => {
            // A default goes with the change, a range and a single value not fitting each other.
            api.update((current) => {
              const next = toggleSearchRange(current, api.hasDefault);
              return api.hasDefault ? setValue(next, "afform_default", undefined, true) : next;
            });
            api.setHasDefault(false);
          }}
        >
          {ts("Search by range")}
        </MenuCheck>
      )}
      <MenuCheck
        checked={multiField}
        title={ts("Filter search results based on multiple fields")}
        onClick={() => {
          setCombining(!multiField);
          if (multiField) ops.edit((node) => ({ ...node, name: state.fieldName }));
        }}
      >
        {ts("Combine multiple fields")}
      </MenuCheck>
      {multiField && api.display && (
        <li>
          <div className="af-gui-field-select-in-dropdown">
            <Picker
              id={fieldsId}
              label={ts("Filter search results based on multiple fields")}
              hiddenLabel
              placeholder={ts("Fields")}
              options={searchDisplayFields(api.editor.meta, api.display).filter(
                (option) => option.id !== state.fieldName,
              )}
              value={others}
              onChange={(pick) => {
                ops.edit((node) => {
                  const current = (textAttribute(node, "name") ?? "").split(",").slice(1);
                  return { ...node, name: [state.fieldName, ...pick(current)].join(",") };
                });
              }}
            />
          </div>
        </li>
      )}
      <li>
        <div className="af-gui-field-select-in-dropdown">
          <label htmlFor={operatorId}>{ts("Operator:")}</label>
          <select
            id={operatorId}
            className="form-control"
            title={ts(
              "Set the search operator for this field or allow the user to select it on the form",
            )}
            value={operatorOf(state)}
            onChange={(event) => {
              const operator = event.target.value;
              api.update((current) =>
                withOperator(
                  current,
                  operator,
                  operators.map(([key]) => key),
                  api.hasDefault,
                ),
              );
            }}
          >
            <option value="">{ts("Auto")}</option>
            <option value="_EXPOSE_">{ts("User Select")}</option>
            {operators.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {!!getValue(state, "expose_operator") && (
          <div className="af-gui-field-select-in-dropdown">
            <label htmlFor={defaultId}>{ts("Default:")}</label>
            <select
              id={defaultId}
              className="form-control"
              title={ts("Default search operator for the user to select")}
              value={text(getValue(state, "search_operator"))}
              onChange={(event) => {
                api.set("search_operator", event.target.value);
              }}
            >
              {operators.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        )}
        {joins.length > 0 && (
          <div className="af-gui-field-select-in-dropdown">
            <label htmlFor={joinId}>{ts("Filter by:")}</label>
            <select
              id={joinId}
              className="form-control"
              title={ts("Apply this filter to the entire search or just one joined entity.")}
              value={text(getValue(state, "join_clause"))}
              onChange={(event) => {
                api.set("join_clause", event.target.value);
              }}
            >
              <option value="">{ts("Entire Search")}</option>
              {joins.map(([alias, label]) => (
                <option key={alias} value={alias}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        )}
      </li>
    </>
  );
}

/** afGuiField-menu.html. */
export function FieldMenu({ api, close }: { api: FieldApi; close: () => void }) {
  const typeId = useId();
  const lengthId = useId();
  const stepId = useId();
  const { state, ops, editor } = api;
  const defn = api.defn;
  const inputType = text(defn.input_type);
  const dataType = text(defn.data_type);
  const autofill = isRecord(defn.input_attrs) && !!defn.input_attrs.autofill;
  const readOnly = isReadOnly(state);
  const hasOptions =
    (getProp(state, "input_type") === "Range" && !!api.options) ||
    (["CheckBox", "Toggle", "Radio", "Select"].includes(text(getProp(state, "input_type"))) &&
      !(getProp(state, "input_type") === "CheckBox" && state.base.data_type === "Boolean"));
  const toggleHelp = (position: "pre" | "post") => {
    const prop = `help_${position}`;
    const base = state.base[prop];
    api.set(
      prop,
      propIsset(state, prop) ? null : typeof base === "string" && base ? base : ts("Enter text"),
    );
  };
  return (
    <>
      {textAttribute(ops.node, "name") && !autofill && (
        <li>
          <div className="af-gui-field-select-in-dropdown">
            <label htmlFor={typeId}>{ts("Type:")}</label>
            <select
              id={typeId}
              className="form-control"
              title={ts("Field type")}
              value={text(getValue(state, "input_type"))}
              onChange={(event) => {
                const value = event.target.value;
                api.update((current) => withInputType(current, value, api.hasDefault));
              }}
            >
              {inputTypes(api).map((type) => (
                <option key={type.name} value={type.name}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
        </li>
      )}
      <StyleItem api={api} />
      {inputType === "Date" && !!state.base.input_attrs.time && (
        <MenuCheck
          checked={!!getProp(state, "input_attrs.time")}
          title={ts("Input date + time")}
          onClick={() => {
            api.set("input_attrs.time", !getValue(state, "input_attrs.time"));
          }}
        >
          {ts("Show Time")}
        </MenuCheck>
      )}
      {(inputType === "Text" || inputType === "TextArea") && (
        <MenuControls inline={false}>
          <label htmlFor={lengthId}>{ts("Max Length:")}</label>
          <input
            id={lengthId}
            type="number"
            min="1"
            step="1"
            className="form-control"
            value={text(getValue(state, "input_attrs.maxlength"))}
            onChange={(event) => {
              api.set("input_attrs.maxlength", numberOf(event.target.value));
            }}
          />
        </MenuControls>
      )}
      {(isMultiSelect(state) ||
        inputType === "Number" ||
        (inputType === "Range" && !hasOptions)) && <MinMaxItem api={api} />}
      {["Number", "Range"].includes(inputType) &&
        ["Float", "Money"].includes(dataType) &&
        !hasOptions && (
          <MenuControls inline={false}>
            <label htmlFor={stepId}>{ts("Decimal places:")}</label>
            <select
              id={stepId}
              className="form-control"
              title={ts("Decimal places")}
              value={text(getValue(state, "input_attrs.step"))}
              onChange={(event) => {
                api.set("input_attrs.step", Number(event.target.value));
              }}
            >
              {STEPS.map((step, places) => (
                <option key={step} value={String(step)}>
                  {places}
                </option>
              ))}
            </select>
          </MenuControls>
        )}
      {inputType === "EntityRef" && <EntityRefItems api={api} />}
      {textAttribute(ops.node, "af-required") ? (
        <MenuAction
          icon="fa-code-fork"
          onClick={() => {
            close();
            openConditionalDialog(editor, ops, readOnly, "af-required");
          }}
        >
          {ts("Conditionally Required")}
        </MenuAction>
      ) : (
        <MenuCheck
          checked={!!getProp(state, "required")}
          title={ts("Require this field")}
          onClick={() => {
            api.set("required", !getValue(state, "required"));
          }}
        >
          {ts("Required")}
        </MenuCheck>
      )}
      {!readOnly &&
        (textAttribute(ops.node, "af-disabled") ? (
          <MenuAction
            icon="fa-code-fork"
            onClick={() => {
              close();
              openConditionalDialog(editor, ops, readOnly, "af-disabled");
            }}
          >
            {ts("Conditionally Disabled")}
          </MenuAction>
        ) : (
          <MenuCheck
            checked={!!getProp(state, "disabled")}
            title={ts("Disable this field")}
            onClick={() => {
              api.set("disabled", !getValue(state, "disabled"));
            }}
          >
            {ts("Disabled")}
          </MenuCheck>
        ))}
      {!autofill && (
        <MenuCheck
          checked={api.hasDefault}
          title={ts("Pre-fill this field with a value")}
          onClick={api.toggleDefault}
        >
          {ts("Default value")}
        </MenuCheck>
      )}
      <DefaultItems api={api} />
      <MenuCheck
        checked={state.local.label !== false}
        title={ts("Show field label")}
        onClick={() => {
          api.update(toggleLabel);
        }}
      >
        {ts("Label")}
      </MenuCheck>
      <MenuCheck
        checked={propIsset(state, "help_pre")}
        title={ts("Show help text above this field")}
        onClick={() => {
          toggleHelp("pre");
        }}
      >
        {ts("Pre help text")}
      </MenuCheck>
      <MenuCheck
        checked={propIsset(state, "help_post")}
        title={ts("Show help text below this field")}
        onClick={() => {
          toggleHelp("post");
        }}
      >
        {ts("Post help text")}
      </MenuCheck>
      {state.isSearch && <SearchItems api={api} />}
      <ConditionalItem ops={ops} readOnlyField={readOnly} />
      {hasOptions && (
        <>
          <MenuDivider />
          <MenuCheck
            shape="circle"
            checked={!state.local.options}
            title={ts("Reset the option list for this field")}
            onClick={() => {
              api.set("options", undefined);
            }}
          >
            {ts("Default option list")}
          </MenuCheck>
          <MenuCheck
            shape="circle"
            checked={!!state.local.options}
            title={ts("Customize the option list for this field")}
            onClick={() => {
              close();
              api.editOptions();
            }}
          >
            {ts("Customize options")}
          </MenuCheck>
        </>
      )}
      <MenuDivider />
      <DeleteAction ops={ops} label={ts("Remove field")} />
    </>
  );
}
