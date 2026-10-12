import { toLiteral } from "../literal";
import { useId } from "react";
import { Dropdown } from "../../widgets/Dropdown";
import { InlineEdit } from "../../widgets/InlineEdit";
import { textAttribute } from "../model";
import { MenuCheck } from "./common";
import type { FieldApi } from "./Field";
import {
  defaultContains,
  getProp,
  getValue,
  toggleDefaultItem,
  type FieldOption,
} from "./fieldModel";
import {
  CHECKOUT_TEMPLATE,
  CORE_INPUT_TEMPLATE,
  inputTypeEditable,
  inputTypeTag,
} from "../editable";
import { PartNotice, PluginElement } from "./plugins";

const text = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";

/** getRangeElements(): the suffixes of the inputs a range search shows. */
function rangeElements(api: FieldApi, type: string): string[] {
  if (
    !getProp(api.state, "search_range") ||
    (type === "Select" && api.state.base.input_type === "Date")
  )
    return [""];
  return type === "Date" ? ["1", "2"] : ["", "2"];
}

/** toggleDefaultValueItem(), its default flag following. */
function toggleItem(api: FieldApi, value: unknown) {
  const literal = toLiteral(value);
  api.setHasDefault(toggleDefaultItem(api.state, literal).hasDefault);
  api.update((state) => toggleDefaultItem(state, literal).state);
}

/** An input holding a placeholder text, as core's previews edit `input_attrs.placeholder…`. */
function PlaceholderInput({
  api,
  prop,
  placeholder,
  className = "form-control",
}: {
  api: FieldApi;
  prop: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      autoComplete="off"
      className={`${className} ${text(getProp(api.state, "input_style"))}`}
      type="text"
      placeholder={placeholder}
      title={ts("Click to add placeholder text")}
      aria-label={ts("Placeholder text")}
      value={text(getValue(api.state, prop))}
      onChange={(event) => {
        api.set(prop, event.target.value);
      }}
    />
  );
}

const rangeSeparator = (suffix: string) => suffix && <span className="af-field-range-sep">-</span>;

function TextPreview({ api }: { api: FieldApi }) {
  return (
    <div className={`form-inline ${text(getProp(api.state, "input_style"))}`}>
      {rangeElements(api, "Text").map((suffix) => (
        <div key={suffix} className="form-group">
          {rangeSeparator(suffix)}
          <PlaceholderInput
            api={api}
            prop={`input_attrs.placeholder${suffix}`}
            placeholder={ts("(no placeholder)")}
          />
        </div>
      ))}
    </div>
  );
}

function NumberPreview({ api }: { api: FieldApi }) {
  return (
    <div className={`form-inline ${text(getProp(api.state, "input_style"))}`}>
      {rangeElements(api, "Number").map((suffix) => (
        <div key={suffix} className="form-group">
          {rangeSeparator(suffix)}
          <PlaceholderInput api={api} prop={`input_attrs.placeholder${suffix}`} />
        </div>
      ))}
    </div>
  );
}

// deviation:date-range-separator-once
function DatePreview({ api }: { api: FieldApi }) {
  const time = !!getProp(api.state, "input_attrs.time");
  return (
    <div className={`form-inline ${text(getProp(api.state, "input_style"))}`}>
      {rangeElements(api, "Date").map((suffix) => (
        <div key={suffix} className="form-group">
          {suffix === "2" && <span className="af-field-range-sep">-</span>}
          <PlaceholderInput
            api={api}
            prop={`input_attrs.placeholder${suffix}`}
            placeholder={""}
            className="form-control crm-form-date crm-placeholder-icon"
          />
          {time && (
            <PlaceholderInput
              api={api}
              prop={`input_attrs.timePlaceholder${suffix}`}
              placeholder={""}
              className="form-control crm-form-time crm-placeholder-icon"
            />
          )}
        </div>
      ))}
    </div>
  );
}

/** Select.html: the placeholder, and the default value in the caret's menu. */
function SelectPreview({ api }: { api: FieldApi }) {
  const options = api.options ?? [];
  return (
    <div className={`form-inline ${text(getProp(api.state, "input_style"))}`}>
      {rangeElements(api, "Select").map((suffix) => (
        <div key={suffix} className="form-group">
          {rangeSeparator(suffix)}
          <div className="input-group">
            <PlaceholderInput
              api={api}
              prop={`input_attrs.placeholder${suffix}`}
              placeholder={ts("Select")}
            />
            <Dropdown
              groupClass="input-group-btn"
              buttonClass="btn btn-default dropdown-toggle"
              title={ts("Set default value")}
              label={<i className="crm-i fa-caret-down" role="img" aria-hidden="true" />}
            >
              {() => (
                <>
                  <li className="disabled">
                    <strong className="afreact-menu-heading">{ts("Default Value:")}</strong>
                  </li>
                  {options.map((option) => (
                    <MenuCheck
                      key={String(option.id)}
                      shape="circle"
                      checked={defaultContains(api.state, option.id)}
                      onClick={() => {
                        toggleItem(api, option.id);
                      }}
                    >
                      {option.label}
                    </MenuCheck>
                  ))}
                </>
              )}
            </Dropdown>
          </div>
        </div>
      ))}
      {!!getProp(api.state, "search_range") && api.state.base.input_type === "Date" && (
        <div className="form-group">
          <DatePreview api={api} />
        </div>
      )}
    </div>
  );
}

function CheckBoxPreview({ api }: { api: FieldApi }) {
  const id = useId();
  const style = text(getProp(api.state, "input_style"));
  if (api.state.base.data_type !== "Boolean")
    return (
      <ul className={`crm-checkbox-list ${style}`} title={ts("Set default value")}>
        {(api.options ?? []).map((option, index) => (
          <li key={String(option.id)}>
            <input
              id={`${id}-${String(index)}`}
              type="checkbox"
              checked={defaultContains(api.state, option.id)}
              onChange={() => {
                toggleItem(api, option.id);
              }}
            />{" "}
            <label htmlFor={`${id}-${String(index)}`}>{option.label}</label>
          </li>
        ))}
      </ul>
    );
  return (
    <div className={`form-inline ${style}`}>
      <input
        type="checkbox"
        aria-label={ts("Default value")}
        title={ts("Set default value")}
        checked={defaultContains(api.state, true)}
        onChange={() => {
          toggleItem(api, true);
        }}
      />{" "}
      {api.state.local.label !== false && (
        <span className="afreact-field-label">
          <InlineEdit
            label={ts("Field label")}
            value={text(getProp(api.state, "label"))}
            defaultValue={text(api.state.base.label)}
            onChange={(value) => {
              api.set("label", value);
            }}
          />
          {!!getProp(api.state, "required") && (
            <span className="crm-marker" title={ts("Required")}>
              *
            </span>
          )}
        </span>
      )}
    </div>
  );
}

function RadioPreview({ api }: { api: FieldApi }) {
  const style = text(getProp(api.state, "input_style"));
  return (
    <div className="form-inline" role="radiogroup" aria-label={ts("Set default value")}>
      {(api.options ?? []).map((option) => {
        const checked = defaultContains(api.state, option.id);
        const className = style ? `${style}${checked ? " active" : ""}` : "radio";
        return (
          <label key={String(option.id)} className={className}>
            <input
              className="crm-form-radio"
              type="radio"
              name={api.fieldId}
              checked={checked}
              onChange={() => {
                toggleItem(api, option.id);
              }}
            />{" "}
            {option.label}
          </label>
        );
      })}
      {!getProp(api.state, "required") && (
        <button
          type="button"
          className="btn btn-link crm-hover-button"
          title={ts("Clear Default")}
          aria-label={ts("Clear Default")}
          onClick={() => {
            toggleItem(api, getValue(api.state, "afform_default"));
          }}
        >
          <i className="crm-i fa-times" role="img" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** getRangeProp(): a slider's bounds, from its options or its own settings. */
function rangeProp(api: FieldApi, options: FieldOption[] | null, prop: "min" | "max" | "step") {
  if (!options) {
    const value = getProp(api.state, `input_attrs.${prop}`);
    if (value !== undefined) return text(value);
    // deviation:slider-defaults-not-written
    return { min: "0", max: "99", step: "1" }[prop];
  }
  const values = options.map((option) => Number(option.id)).sort((a, b) => a - b);
  if (prop === "min") return String(Math.min(...values));
  if (prop === "max") return String(Math.max(...values));
  const [first = 0, second] = values;
  return String(second === undefined ? 1 : second - first);
}

function RangePreview({ api }: { api: FieldApi }) {
  const options = api.options;
  const value = getValue(api.state, "afform_default");
  const shown = options?.find((option) => String(option.id) === text(value));
  return (
    <div className="crm-af-field">
      <label>
        <input
          id={`${api.fieldId}-range`}
          type="range"
          aria-label={ts("Default value")}
          min={rangeProp(api, options, "min")}
          max={rangeProp(api, options, "max")}
          step={rangeProp(api, options, "step")}
          list={`${api.fieldId}-list`}
          value={text(value)}
          onChange={(event) => {
            api.set("afform_default", Number(event.target.value));
            api.setHasDefault(true);
          }}
        />{" "}
        {shown && <span>{shown.label}</span>}
      </label>
      <datalist id={`${api.fieldId}-list`}>
        {options?.map((option) => (
          <option key={String(option.id)} value={text(option.id)} />
        ))}
      </datalist>
    </div>
  );
}

function TogglePreview({ api }: { api: FieldApi }) {
  return (
    <div className={`crm-form-toggle-container ${text(getProp(api.state, "input_style"))}`}>
      <input
        type="checkbox"
        className="crm-form-toggle"
        aria-label={ts("Default value")}
        checked={defaultContains(api.state, true)}
        onChange={() => {
          toggleItem(api, true);
        }}
      />
      {(api.options ?? []).map((option) => (
        <span
          key={String(option.id)}
          className={`crm-form-toggle-text crm-form-toggle-text-${option.id ? "on" : "off"}`}
        >
          {option.label}
        </span>
      ))}
    </div>
  );
}

function EntityRefPreview({ api }: { api: FieldApi }) {
  const label = api.fkEntity?.label ?? text(api.state.base.label);
  return (
    <div className={`form-inline ${text(getProp(api.state, "input_style"))}`}>
      <div className="input-group">
        <PlaceholderInput
          api={api}
          prop="input_attrs.placeholder"
          placeholder={ts("Select %1", { 1: label })}
        />
        <div className="input-group-btn">
          <button type="button" className="btn btn-default" disabled aria-label={ts("Search")}>
            <i className="crm-i fa-search" role="img" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ChainSelectPreview({ api }: { api: FieldApi }) {
  return (
    <div className={`form-inline ${text(getProp(api.state, "input_style"))}`}>
      <div className="input-group">
        <PlaceholderInput api={api} prop="input_attrs.placeholder" placeholder={ts("Select")} />
        <div className="input-group-btn">
          <button
            type="button"
            className="btn btn-default disabled dropdown-toggle"
            disabled
            aria-label={ts("Select")}
          >
            <i className="crm-i fa-caret-down" role="img" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Location.html, the site's default distance unit first, as core's ChangeSet orders it. */
function LocationPreview() {
  const units = [
    ["km", ts("Km")],
    ["miles", ts("Miles")],
  ];
  if (window.CRM.vars?.afreact?.distanceUnit === "miles") units.reverse();
  return (
    <div className="form-inline">
      <input
        className="form-control"
        type="number"
        readOnly
        placeholder={ts("Distance")}
        aria-label={ts("Distance")}
      />{" "}
      <select className="form-control crm-auto-width" disabled aria-label={ts("Distance unit")}>
        {units.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>{" "}
      <input
        className="form-control"
        readOnly
        placeholder={ts("Street, City, State, Country")}
        aria-label={ts("Address")}
      />
    </div>
  );
}

function MissingPreview({ api }: { api: FieldApi }) {
  return (
    <div className="form-inline">
      <span className="crm-error">
        {ts('Error: missing field "%1"', { 1: textAttribute(api.ops.node, "name") ?? "" })}
      </span>
    </div>
  );
}

function CorePreview({ api, name }: { api: FieldApi; name: string }) {
  const style = text(getProp(api.state, "input_style"));
  switch (name) {
    case "Text":
    case "Email":
      return <TextPreview api={api} />;
    case "Url":
      return (
        <div className={`form-inline ${style}`}>
          <PlaceholderInput
            api={api}
            prop="input_attrs.placeholder"
            placeholder={ts("(no placeholder)")}
          />
        </div>
      );
    case "Number":
      return <NumberPreview api={api} />;
    case "Date":
      return <DatePreview api={api} />;
    case "Select":
      return <SelectPreview api={api} />;
    case "CheckBox":
      return <CheckBoxPreview api={api} />;
    case "Radio":
      return <RadioPreview api={api} />;
    case "Range":
      return <RangePreview api={api} />;
    case "Toggle":
      return <TogglePreview api={api} />;
    case "EntityRef":
      return <EntityRefPreview api={api} />;
    case "ChainSelect":
      return <ChainSelectPreview api={api} />;
    case "TextArea":
    case "RichTextEditor":
      return (
        <textarea
          autoComplete="off"
          className={`crm-form-textarea ${style}`}
          disabled
          aria-label={ts("Text")}
        />
      );
    case "DisplayOnly":
      return (
        <div className="form-inline">
          <input
            className="form-control"
            type="text"
            title={ts("Field value will be shown on the form")}
            aria-label={ts("Field value will be shown on the form")}
            disabled
          />
        </div>
      );
    case "File":
      return (
        <div className="form-inline">
          <input type="file" disabled aria-label={ts("File")} />
        </div>
      );
    case "Hidden":
      return <div className="form-inline" />;
    case "Location":
      return <LocationPreview />;
    default:
      return <MissingPreview api={api} />;
  }
}

/** getInputTypeTemplate(): the field's input on the canvas, by its input type. */
export function InputPreview({ api }: { api: FieldApi }) {
  const type = text(getProp(api.state, "input_type"));
  const meta = api.editor.meta.gui.inputTypes.find((each) => each.name === type);
  const template = meta?.admin_template;
  if (!meta || !template) return <MissingPreview api={api} />;
  const core = CORE_INPUT_TEMPLATE.exec(template)?.[1];
  if (core) return <CorePreview api={api} name={core} />;
  if (template === CHECKOUT_TEMPLATE)
    return (
      <div className="form-inline">
        <p>
          {ts(
            "Payment details will be shown here depending on the selected Checkout Option. For payment to be taken you must either set a Checkout Option value on the Contribution or add a user input to select one.",
          )}
        </p>
      </div>
    );
  if (inputTypeEditable(type, template))
    return (
      <PluginElement
        tag={inputTypeTag(type)}
        props={{ node: api.ops.node, defn: api.defn }}
        onChange={(node) => {
          api.ops.edit(() => node);
        }}
      />
    );
  return <PartNotice part={ts("The canvas controls of input type %1", { 1: meta.label })} />;
}
