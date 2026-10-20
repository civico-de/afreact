import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useContext, useEffect, useId, useRef, useState } from "react";
import type { AngularAssets } from "../../angular/island";
import { api4, errorMessage } from "../../api/civi";
import { FormContext } from "../Layout";
import type { FieldOption } from "../types";
import { Unsupported } from "../Unsupported";
import { useFieldEnv } from "./env";

/** A field of a checkout option, from CheckoutOptionUtils::mapQuickformFieldMetadata(). */
export interface CheckoutField {
  name: string;
  title: string;
  /** "text", "select", "checkBox", "expiryDate", "chainSelect" or another core input type. */
  htmlType: string;
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

/** What the options' Angular templates need, loaded once one of them is chosen. */
export interface CheckoutIslands {
  /** The modules an island boots: afCore, afCheckout and the options' own. */
  modules: string[];
  /** Each templated option's label and own module (getAfformModule()). */
  options: Record<string, { label: string; module: string | null }>;
  assets: AngularAssets;
}

export interface CheckoutSettings {
  checkoutOptions: Record<string, CheckoutOption>;
  testMode: boolean;
  /** Set by Civi\Afreact\Checkout while an option has a template. */
  islands?: CheckoutIslands;
}

// The island's chunk and the options' Angular modules load once a templated option is chosen.
const CheckoutIsland = lazy(() => import("./CheckoutIsland"));

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

/**
 * A contribution value as the submit saves it, null while unset: the af-entity's fixed data
 * overrides the field on the form (AbstractProcessor::preprocessSubmittedValues).
 */
export function contributionValue(
  key: string,
  values: Params,
  entityData: Params | undefined,
): unknown {
  // deviation:checkout-value-as-saved
  // afCheckoutBlock reads the field first and takes a 0 or false for unset (upstream bug).
  const value = entityData && Object.hasOwn(entityData, key) ? entityData[key] : values[key];
  return value === undefined || value === null || value === "" ? null : value;
}

function optionKey(values: Params, entityData: Params | undefined): string | null {
  const key = contributionValue("checkout_option", values, entityData);
  return typeof key === "string" ? key : null;
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
        // deviation:billing-state-follows-country
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
 * deviation:checkout-labels-tied
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
 * afCheckoutBlock: the selected checkout option's description, its Angular template as an
 * island, and its fields, written into checkout_params; a change of option empties them.
 */
export function CheckoutBlock({
  labelId,
  describedBy,
  value,
  onChange,
  disabled,
}: CheckoutBlockProps) {
  const env = useFieldEnv();
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
    // deviation:billing-state-follows-country
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
      {key !== null && option?.template && (
        <CheckoutTemplate
          optionKey={key}
          template={option.template}
          settings={settings}
          params={params}
          values={env.values}
          entityData={env.entityData}
          onChange={onChange}
          disabled={disabled}
        />
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

function CheckoutTemplate({
  settings,
  ...props
}: {
  optionKey: string;
  template: string;
  settings: CheckoutSettings;
  params: Params;
  values: Params;
  entityData: Params | undefined;
  onChange: (value: unknown) => void;
  disabled: boolean;
}) {
  const { islands } = settings;
  const holdKey = useId();
  const hold = useContext(FormContext)?.hold;
  const [phase, setPhase] = useState<"loading" | "ready" | "failed">("loading");
  const current = islands ? phase : "failed";
  // As the island names it: the option's label from the server, which the settings may lack.
  const label =
    islands?.options[props.optionKey]?.label ??
    settings.checkoutOptions[props.optionKey]?.label ??
    props.optionKey;
  // The submit waits for the template, whose controls and checks are not there before it boots.
  const reason =
    current === "ready"
      ? null
      : current === "loading"
        ? ts("Loading %1…", { 1: label })
        : ts("%1 could not load, so the form cannot be submitted.", { 1: label });
  useEffect(() => {
    hold?.(holdKey, reason);
  }, [hold, holdKey, reason]);
  useEffect(
    () => () => {
      hold?.(holdKey, null);
    },
    [hold, holdKey],
  );
  if (!islands)
    return (
      <p className="crm-error" role="alert">
        {ts("The page lists no Angular assets for the template of %1.", { 1: props.optionKey })}
      </p>
    );
  return (
    <Suspense fallback={<p role="status">{ts("Loading…")}</p>}>
      {/* deviation:checkout-island-per-option */}
      {/* A change of option or template boots a fresh island with empty details. */}
      <CheckoutIsland
        key={`${props.optionKey} ${props.template}`}
        {...props}
        settings={settings}
        islands={islands}
        onPhase={setPhase}
      />
    </Suspense>
  );
}
