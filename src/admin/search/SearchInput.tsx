import { skipToken, useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import { api4, errorMessage } from "../../api/civi";
import {
  itemText,
  resolveIds,
  searchPage,
  valueIds,
  type AutocompleteItem,
} from "../../afform/fields/autocomplete";
import { ListInput } from "../../search/ListInput";
import { adminVars } from "../vars";
import {
  dateTypeOf,
  dateTypeValue,
  formatValue,
  inputKind,
  isMulti,
  relativeParts,
  relativeValue,
  type ConditionField,
  type DateType,
} from "./condition";
import type { FieldOption } from "./meta";

const Combobox = lazy(async () => ({
  default: (await import("../../afform/fields/Combobox")).Combobox,
}));

export interface SearchInputProps {
  id: string;
  field: ConditionField;
  /** Without an operator the input sets a value, as in the update action. */
  op?: string;
  /** The option suffix the value holds (`name`, `label`), `id` by default. */
  optionKey?: string;
  /** The field's options once loaded, for a field whose `options` is true. */
  options?: FieldOption[];
  value: unknown;
  onChange: (value: unknown) => void;
}

const text = (value: unknown) =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : "";

/** crmSearchInput: the value input for a field and operator; BETWEEN takes two. */
export function SearchInput(props: SearchInputProps) {
  const { id, field, op, optionKey, value, onChange } = props;
  const set = (next: unknown) => {
    onChange(formatValue(field, op, optionKey, next));
  };
  if (op === "BETWEEN" || op === "NOT BETWEEN") {
    const pair = Array.isArray(value) ? value : [];
    return (
      <span className="form-group afreact-between">
        <InputVal
          {...props}
          op=">"
          value={pair[0]}
          onChange={(v) => {
            set([v, pair[1]]);
          }}
        />
        {" – "}
        <InputVal
          {...props}
          id={`${id}-to`}
          op="<"
          value={pair[1]}
          onChange={(v) => {
            set([pair[0], v]);
          }}
        />
      </span>
    );
  }
  return <InputVal {...props} onChange={set} />;
}

function InputVal(props: SearchInputProps) {
  const { id, field, op, value, onChange } = props;
  const multiple = isMulti(field, op);
  const required = !field.nullable || !!field.required;
  const common = { id, required, "aria-invalid": undefined, "aria-describedby": undefined };
  const kind = inputKind(field, op);
  if (
    multiple &&
    (kind === "text" ||
      kind === "integer" ||
      kind === "float" ||
      kind === "email" ||
      kind === "textarea")
  )
    return (
      <ListInput
        kind={kind === "integer" || kind === "float" ? kind : "text"}
        value={value}
        common={common}
        onChange={onChange}
      />
    );
  switch (kind) {
    case "location":
      return <LocationInput {...props} />;
    case "date":
      return multiple ? (
        <ListInput kind="date" value={value} common={common} onChange={onChange} />
      ) : (
        <DateInput {...props} required={required} />
      );
    case "boolean":
      return (
        <select
          id={id}
          className="form-control"
          value={value === true ? "1" : value === false ? "0" : ""}
          onChange={(event) => {
            onChange(event.target.value === "" ? null : event.target.value === "1");
          }}
        >
          <option value="">{ts("Select")}</option>
          <option value="1">{ts("Yes")}</option>
          <option value="0">{ts("No")}</option>
        </select>
      );
    case "color":
      return (
        <input
          id={id}
          type="color"
          value={text(value) || "#000000"}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      );
    case "select":
      return <OptionSelect {...props} multiple={multiple} required={required} />;
    case "entityref":
      return <EntityRef {...props} multiple={multiple} required={required} />;
    case "integer":
    case "float":
      return (
        <input
          {...common}
          type="number"
          step={kind === "integer" ? 1 : "any"}
          className="form-control"
          value={text(value)}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      );
    case "textarea":
      return (
        <textarea
          {...common}
          className="form-control"
          value={text(value)}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      );
    case "email":
    case "text":
      return (
        <input
          {...common}
          type={kind}
          className="form-control"
          value={text(value)}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      );
    default:
      return kind satisfies never;
  }
}

const isOption = (value: unknown): value is FieldOption =>
  typeof value === "object" && value !== null && "id" in value && "label" in value;

/** select.html: the field's options by `optionKey`, one or several. */
export function OptionSelect({
  id,
  field,
  optionKey = "id",
  options,
  value,
  onChange,
  multiple,
  required,
}: SearchInputProps & { multiple: boolean; required: boolean }) {
  const list = Array.isArray(field.options) ? field.options.filter(isOption) : options;
  if (!list) return <select id={id} disabled aria-busy className="form-control loading" />;
  const keyOf = (option: FieldOption): string | number => {
    const key: unknown =
      Object.entries(option).find(([name]) => name === optionKey)?.[1] ?? option.id;
    return typeof key === "number" ? key : String(key);
  };
  const byText = (raw: string) => list.map(keyOf).find((key) => String(key) === raw);
  const choices = list.map((option) => (
    <option key={String(keyOf(option))} value={String(keyOf(option))}>
      {option.label}
    </option>
  ));
  if (multiple)
    return (
      <select
        id={id}
        multiple
        className="form-control"
        value={Array.isArray(value) ? value.map(String) : []}
        onChange={(event) => {
          onChange([...event.target.selectedOptions].map((o) => byText(o.value)));
        }}
      >
        {choices}
      </select>
    );
  return (
    <select
      id={id}
      className="form-control"
      required={required}
      value={text(value)}
      onChange={(event) => {
        onChange(event.target.value === "" ? null : byText(event.target.value));
      }}
    >
      <option value="">{field.nullable ? ts("None") : ts("Select")}</option>
      {choices}
    </select>
  );
}

const CURRENT_USER = "user_contact_id";
const CONTACTS = ["Contact", "Individual"];

const currentUserItem = (): AutocompleteItem => ({
  id: CURRENT_USER,
  label: ts("Select Current User"),
  icon: "fa-user-circle-o",
});

/**
 * entityRef.html: autocomplete on the foreign entity; in a search, "Select Current User" for
 * contacts. `statics` replace that with buttons of their own, as crmAutocomplete's `static`.
 */
export function EntityRef({
  id,
  field,
  op,
  optionKey,
  value,
  onChange,
  multiple,
  required,
  params: given,
  statics,
}: SearchInputProps & {
  multiple: boolean;
  required: boolean;
  params?: Record<string, unknown>;
  statics?: AutocompleteItem[];
}) {
  const entity = field.fk_entity ?? field.entity ?? "";
  const params = given ?? {
    fieldName: `${field.entity ?? ""}.${field.name}`,
    key: optionKey ?? null,
  };
  const buttons = statics ?? (!!op && CONTACTS.includes(entity) ? [currentUserItem()] : []);
  const [known, setKnown] = useState<ReadonlyMap<string, AutocompleteItem>>(new Map());
  const ids = valueIds(value);
  const fixed = new Map([currentUserItem(), ...buttons].map((item) => [String(item.id), item]));
  const missing = ids.filter((v) => !fixed.has(String(v)) && !known.has(String(v)));
  const resolved = useQuery({
    queryKey: [entity, "autocomplete", params, missing],
    queryFn: missing.length ? () => resolveIds(entity, params, missing) : skipToken,
  });
  const lookup = new Map([...fixed, ...known]);
  for (const item of resolved.data ?? []) lookup.set(String(item.id), item);
  const selected = ids.flatMap((v) => lookup.get(String(v)) ?? []);
  const choose = (item: AutocompleteItem) => {
    setKnown((previous) => new Map(previous).set(String(item.id), item));
    onChange(multiple ? [...ids, item.id] : item.id);
  };
  return (
    <span className="afreact-entityref">
      <Suspense fallback={<input id={id} className="form-control loading" disabled />}>
        <Combobox
          id={id}
          label={undefined}
          placeholder={ts("Select")}
          describedBy={undefined}
          className={undefined}
          disabled={false}
          required={required}
          multiple={multiple}
          minLength={1}
          selected={selected}
          resolving={resolved.isFetching}
          itemText={itemText}
          load={async (input, context) => {
            try {
              return await searchPage(entity, params, input, context);
            } catch (error) {
              throw new Error(errorMessage(error), { cause: error });
            }
          }}
          onSelect={choose}
          onRemove={(item) => {
            const rest = ids.filter((v) => String(v) !== String(item.id));
            onChange(multiple ? rest : null);
          }}
        />
      </Suspense>
      {buttons
        .filter((item) => !ids.some((v) => String(v) === String(item.id)))
        .map((item) => (
          <button
            key={String(item.id)}
            type="button"
            className="crm-hover-button"
            onClick={() => {
              choose(item);
            }}
          >
            {item.icon && <i className={`crm-i ${item.icon}`} role="img" aria-hidden="true" />}{" "}
            {item.label}
          </button>
        ))}
      {resolved.isError && (
        <span className="crm-error" role="alert">
          {errorMessage(resolved.error)}
        </span>
      )}
    </span>
  );
}

/** Each unit: its value, its label for one and for several, and whether only timestamps take it. */
const units = (one: boolean): [string, string, boolean][] => [
  ["second", one ? ts("Second") : ts("Seconds"), true],
  ["minute", one ? ts("Minute") : ts("Minutes"), true],
  ["hour", one ? ts("Hour") : ts("Hours"), true],
  ["day", one ? ts("Day") : ts("Days"), false],
  ["week", one ? ts("Week") : ts("Weeks"), false],
  ["month", one ? ts("Month") : ts("Months"), false],
  ["year", one ? ts("Year") : ts("Years"), false],
];

const DATE_TYPES: DateType[] = ["fixed", "range", "now", "now -", "now +"];
const isDateType = (value: string): value is DateType => DATE_TYPES.some((type) => type === value);

/** date.html: a fixed date, a named range or a time relative to now. */
function DateInput({
  id,
  field,
  value,
  onChange,
  required,
}: SearchInputProps & { required: boolean }) {
  const ranges = adminVars().searchTasks?.dateRanges ?? [];
  const type = dateTypeOf(value, ranges);
  const timestamp = field.data_type === "Timestamp";
  const current = text(value);
  const relative = relativeParts(current);
  return (
    <span className="form-group afreact-date-input">
      <select
        id={id}
        className="form-control"
        value={type}
        onChange={(event) => {
          const next = event.target.value;
          if (!isDateType(next)) return;
          onChange(dateTypeValue(next, ranges));
        }}
      >
        <option value="fixed">{ts("Pick Date")}</option>
        {ranges.length > 0 && <option value="range">{ts("Date Range")}</option>}
        <option value="now">{ts("Now")}</option>
        <option value="now -">{ts("Before now")}</option>
        <option value="now +">{ts("After now")}</option>
      </select>
      {type === "fixed" && (
        <input
          className="form-control"
          aria-labelledby={id}
          type={timestamp ? "datetime-local" : "date"}
          required={required}
          value={timestamp ? current.replace(" ", "T").slice(0, 16) : current.slice(0, 10)}
          onChange={(event) => {
            const raw = event.target.value;
            onChange(timestamp && raw ? `${raw.replace("T", " ")}:00` : raw);
          }}
        />
      )}
      {type === "range" && (
        <select
          className="form-control"
          aria-labelledby={id}
          value={current}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        >
          {ranges.map((range) => (
            <option key={range.id} value={range.id}>
              {range.text}
            </option>
          ))}
        </select>
      )}
      {(type === "now -" || type === "now +") && (
        <>
          <input
            className="form-control four"
            aria-labelledby={id}
            type="number"
            min={1}
            step={1}
            value={Number.isNaN(relative.number) ? "" : relative.number}
            onChange={(event) => {
              onChange(relativeValue(current, Number(event.target.value), relative.unit));
            }}
          />
          <select
            className="form-control eight"
            aria-labelledby={id}
            value={relative.unit}
            onChange={(event) => {
              onChange(relativeValue(current, relative.number, event.target.value));
            }}
          >
            {units(relative.number === 1)
              .filter(([, , time]) => timestamp || !time)
              .map(([unit, label]) => (
                <option key={unit} value={unit}>
                  {label}
                </option>
              ))}
          </select>
        </>
      )}
    </span>
  );
}

interface LocationValue {
  distance?: number | string | null;
  distance_unit?: string;
  address?: string;
  geo_code_1?: number | null;
  geo_code_2?: number | null;
}

const isLocation = (value: unknown): value is LocationValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** location.html: a distance from an address, geocoded on leaving the address input. */
function LocationInput({ id, value, onChange }: SearchInputProps) {
  const unit = adminVars().searchAdmin?.defaultDistanceUnit ?? "km";
  const location: LocationValue = isLocation(value) ? value : { distance_unit: unit };
  const [address, setAddress] = useState(location.address ?? "");
  const [error, setError] = useState<string | null>(null);
  async function lookup(next: string) {
    const cleared = { ...location, address: next, geo_code_1: null, geo_code_2: null };
    onChange(cleared);
    setError(null);
    if (!next) return;
    try {
      const [found] = await api4<{ geo_code_1: number; geo_code_2: number }>(
        "Address",
        "getCoordinates",
        { address: next },
      );
      if (found)
        onChange({ ...cleared, geo_code_1: found.geo_code_1, geo_code_2: found.geo_code_2 });
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }
  return (
    <span className="form-group afreact-location-input" role="group" aria-labelledby={id}>
      <input
        id={id}
        className="form-control"
        type="number"
        aria-label={ts("Distance")}
        placeholder={ts("Distance")}
        value={text(location.distance)}
        onChange={(event) => {
          onChange({ ...location, distance: event.target.value });
        }}
      />
      <select
        className="form-control"
        aria-label={ts("Unit")}
        value={location.distance_unit ?? unit}
        onChange={(event) => {
          onChange({ ...location, distance_unit: event.target.value });
        }}
      >
        <option value="km">{ts("Km")}</option>
        <option value="miles">{ts("Miles")}</option>
      </select>
      <input
        className="form-control"
        aria-label={ts("Address")}
        placeholder={ts("Street, City, State, Country")}
        value={address}
        onChange={(event) => {
          setAddress(event.target.value);
        }}
        onBlur={() => void lookup(address)}
      />
      {error && (
        <span className="crm-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
