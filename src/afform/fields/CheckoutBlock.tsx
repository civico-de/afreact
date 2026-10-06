import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { api4, errorMessage } from "../../api/civi";
import type { FieldOption } from "../types";
import { Unsupported } from "../Unsupported";
import { useFieldEnv } from "./env";

/** A field of a checkout option, from CheckoutOptionUtils::mapQuickformFieldMetadata(). */
export interface CheckoutField {
  name: string;
  title: string;
  htmlType: "text" | "select" | "checkBox" | "expiryDate" | "chainSelect" | string;
  is_required?: boolean;
  options?: FieldOption[];
}

/** What a checkout option hands afCheckout (AfformCheckoutOptionInterface::getAfformSettings). */
export interface CheckoutOption {
  label?: string;
  description?: string;
  /** An Angular partial to include. */
  template?: string;
  /** A list, or keyed by name as CRM_Core_Payment::getPaymentFormFieldsMetadata() returns them. */
  fields?: CheckoutField[] | Record<string, CheckoutField>;
}

export interface CheckoutSettings {
  checkoutOptions: Record<string, CheckoutOption>;
  testMode: boolean;
}

interface CheckoutBlockProps {
  /** The field's label, naming the group; undefined for a field without one. */
  labelId: string | undefined;
  describedBy: string | undefined;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled: boolean;
}

type Params = Record<string, unknown>;

const isParams = (value: unknown): value is Params =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const COUNTRY = "billing_country_id-";
const STATE = "billing_state_province_id-";

/** afCheckoutBlock reads the option from the field on the form, then from the entity's fixed data. */
function optionKey(values: Params, entityData: Params | undefined): string | null {
  const key = values.checkout_option || entityData?.checkout_option;
  return typeof key === "string" && key ? key : null;
}

function StateSelect({
  id,
  field,
  params,
  disabled,
  onChange,
}: {
  id: string;
  field: CheckoutField;
  params: Params;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const country = params[field.name.replace(STATE, COUNTRY)];
  const countryId = typeof country === "string" && country ? country : null;
  const states = useQuery({
    queryKey: ["afreact", "checkout", "states", countryId],
    queryFn: () =>
      api4<{ id: number; name: string }>("StateProvince", "get", {
        where: [["country_id", "=", countryId]],
      }),
    enabled: countryId !== null,
  });
  const value = params[field.name];
  const empty =
    countryId === null
      ? ts("- select country first -")
      : states.isPending
        ? ts("- please wait -")
        : ts("- select -");
  return (
    <>
      <select
        id={id}
        name={field.name}
        value={typeof value === "string" ? value : ""}
        // A country without states offers nothing to choose (upstream bug: Angular waits forever).
        required={!!field.is_required && states.data?.length !== 0}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        <option value="">{empty}</option>
        {(states.data ?? []).map((state) => (
          <option key={state.id} value={String(state.id)}>
            {state.name}
          </option>
        ))}
      </select>
      {states.isError && (
        <span className="crm-error" role="alert">
          {errorMessage(states.error)}
        </span>
      )}
    </>
  );
}

interface TrimmedInputProps {
  id?: string;
  name: string;
  label?: string;
  placeholder?: string;
  pattern?: string;
  model: string;
  required: boolean;
  disabled: boolean;
  onChange: (value: string | undefined) => void;
}

/**
 * A text input as ngModel keeps it: the value trimmed, and dropped while required and empty.
 * The raw text stays in the control so a typed space survives.
 */
function TrimmedInput({
  id,
  name,
  label,
  placeholder,
  pattern,
  model,
  required,
  disabled,
  onChange,
}: TrimmedInputProps) {
  const [shown, setShown] = useState(model);
  if (shown.trim() !== model) setShown(model);
  return (
    <input
      id={id}
      type="text"
      name={name}
      aria-label={label}
      placeholder={placeholder}
      pattern={pattern}
      value={shown}
      required={required}
      disabled={disabled}
      onChange={(event) => {
        const text = event.target.value;
        setShown(text);
        const trimmed = text.trim();
        onChange(trimmed === "" && required ? undefined : trimmed);
      }}
    />
  );
}

/**
 * afCheckout/checkoutFields/<htmlType>.html, with each label tied to its control (upstream bug);
 * an expiry date is two inputs under fixed names.
 */
function CheckoutInput({
  id,
  field,
  params,
  disabled,
  set,
}: {
  id: string;
  field: CheckoutField;
  params: Params;
  disabled: boolean;
  set: (name: string, value: unknown) => void;
}) {
  const value = params[field.name];
  const text = typeof value === "string" || typeof value === "number" ? String(value) : "";
  const required = !!field.is_required;
  switch (field.htmlType) {
    case "text":
      return (
        <>
          <label htmlFor={id}>{field.title}</label>
          <TrimmedInput
            id={id}
            name={field.name}
            model={text}
            required={required}
            disabled={disabled}
            onChange={(next) => {
              set(field.name, next);
            }}
          />
        </>
      );
    case "select":
      return (
        <>
          <label htmlFor={id}>{field.title}</label>
          <select
            id={id}
            name={field.name}
            value={text}
            required={required}
            disabled={disabled}
            onChange={(event) => {
              set(field.name, event.target.value);
            }}
          >
            {/* The blank Angular shows before a choice, unless the options bring their own. */}
            {text === "" && !(field.options ?? []).some((option) => option.id === "") && (
              <option value="" />
            )}
            {(field.options ?? []).map((option) => (
              <option key={String(option.id)} value={String(option.id)}>
                {option.label}
              </option>
            ))}
          </select>
        </>
      );
    case "checkBox":
      return (
        <>
          <label htmlFor={id}>{field.title}</label>
          <input
            type="checkbox"
            id={id}
            name={field.name}
            checked={value === true}
            required={required}
            disabled={disabled}
            onChange={(event) => {
              set(field.name, event.target.checked);
            }}
          />
        </>
      );
    case "expiryDate": {
      const month = params.expiry_month;
      const year = params.expiry_year;
      return (
        <>
          <label id={id}>{field.title}</label>
          <div className="crm-flex-box af-checkout-field-date" role="group" aria-labelledby={id}>
            <TrimmedInput
              name={`${field.name}.month`}
              placeholder="MM"
              label={ts("Expiration month")}
              model={typeof month === "string" ? month : ""}
              pattern="0[1-9]|1[0-2]"
              required={required}
              disabled={disabled}
              onChange={(next) => {
                set("expiry_month", next);
              }}
            />
            <TrimmedInput
              name={`${field.name}.year`}
              placeholder="YY"
              label={ts("Expiration year")}
              model={typeof year === "string" ? year : ""}
              pattern="[0-9]{2}"
              required={required}
              disabled={disabled}
              onChange={(next) => {
                set("expiry_year", next);
              }}
            />
          </div>
        </>
      );
    }
    case "chainSelect":
      if (!field.name.startsWith(STATE)) {
        return <Unsupported what={`checkout field ${field.name} (${field.title})`} />;
      }
      return (
        <>
          <label htmlFor={id}>{field.title}</label>
          <StateSelect
            id={id}
            field={field}
            params={params}
            disabled={disabled}
            onChange={(next) => {
              set(field.name, next);
            }}
          />
        </>
      );
    default:
      return <Unsupported what={`checkout field ${field.name} (${field.title})`} />;
  }
}

/**
 * afCheckoutBlock: the selected checkout option's description and fields, written into
 * checkout_params; a change of option empties them. An option's Angular template is not shown.
 */
export function CheckoutBlock({
  labelId,
  describedBy,
  value,
  onChange,
  disabled,
}: CheckoutBlockProps) {
  const env = useFieldEnv("CheckoutBlock");
  const baseId = useId();
  const settings = window.CRM.vars?.afreact?.afCheckout;
  const key = optionKey(env.values, env.entityData);
  const previous = useRef<string | null | undefined>(undefined);
  // The details start empty, as afCheckoutBlock's watch empties them on init and on every switch.
  useEffect(() => {
    if (previous.current === key) return;
    previous.current = key;
    onChange({});
  }, [key, onChange]);
  if (!settings) {
    return (
      <span className="crm-error" role="alert">
        {ts("The page provides no checkout options.")}
      </span>
    );
  }
  const option = key === null ? undefined : settings.checkoutOptions[key];
  const params = isParams(value) ? value : {};
  const set = (name: string, next: unknown) => {
    const changed = { ...params, [name]: next };
    if (next === undefined) delete changed[name];
    // A new country empties the state chosen for the old one (upstream bug: Angular keeps it).
    if (name.startsWith(COUNTRY)) delete changed[name.replace(COUNTRY, STATE)];
    onChange(changed);
  };
  return (
    <div role="group" aria-labelledby={labelId} aria-describedby={describedBy}>
      {settings.testMode && (
        <div className="alert alert-warning" role="status">
          <i className="crm-i fa-cogs" role="img" aria-hidden="true" />{" "}
          {ts("Checkout is in Test Mode.")}
        </div>
      )}
      {option?.description && <span>{option.description}</span>}
      {option?.template && (
        <Unsupported what={`checkout template ${option.template} (${option.label ?? key})`} />
      )}
      {Object.values(option?.fields ?? {}).map((field) => (
        <div
          key={field.name}
          className={`form-group af-checkout-field af-checkout-field_${field.name}`}
        >
          <CheckoutInput
            id={`${baseId}-${field.name}`}
            field={field}
            params={params}
            disabled={disabled}
            set={set}
          />
        </div>
      ))}
    </div>
  );
}
