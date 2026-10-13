import { lazy, Suspense } from "react";
import type { AutocompleteItem } from "../../afform/fields/autocomplete";

const Combobox = lazy(async () => ({
  default: (await import("../../afform/fields/Combobox")).Combobox,
}));

export interface PickerOption {
  id: string | number;
  label: string;
  icon?: string | null;
  color?: string | null;
  description?: string | null;
  /** The heading the option is listed under, as select2's optgroups. */
  group?: string;
}

type PickerValue = (string | number)[];

interface PickerBase {
  id: string;
  label: string;
  placeholder: string;
  options: PickerOption[];
  value: PickerValue;
  className?: string;
  /** Names the input with an sr-only label, for pickers without a visible one. */
  hiddenLabel?: boolean;
  /** The caller renders its own <label htmlFor={id}>. */
  externalLabel?: boolean;
  /** A single value may be cleared, as select2's allowClear. */
  clearable?: boolean;
  /** Takes the focus and shows the list on mount, for a picker that opens in a menu. */
  openOnMount?: boolean;
  disabled?: boolean;
}

/** One value: choosing replaces it. */
interface SinglePickerProps extends PickerBase {
  single: true;
  onChange: (value: PickerValue) => void;
}

/** Several values: each pick or removal is applied to the caller's latest list. */
interface MultiPickerProps extends PickerBase {
  single?: false;
  onChange: (update: (current: PickerValue) => PickerValue) => void;
}

type PickerProps = SinglePickerProps | MultiPickerProps;

const itemOf = (option: PickerOption): AutocompleteItem => ({
  id: option.id,
  label: option.label,
  icon: option.icon,
  color: option.color,
  description: option.description ? [option.description] : [],
  group: option.group,
});

/** A select over a fixed list, as crm-ui-select over local data: the runtime's combobox. */
export function Picker(props: PickerProps) {
  const {
    id,
    label,
    placeholder,
    options,
    value,
    className,
    hiddenLabel = false,
    externalLabel = false,
    clearable = false,
    openOnMount = false,
    disabled = false,
  } = props;
  const single = props.single === true;
  const byId = new Map(options.map((option) => [String(option.id), option]));
  const selected = value.flatMap((v) => {
    const option = byId.get(String(v));
    return option ? [itemOf(option)] : [];
  });
  return (
    <>
      {!externalLabel && (
        <>
          <label htmlFor={id} className={hiddenLabel ? "sr-only" : undefined}>
            {label}
          </label>{" "}
        </>
      )}
      <Suspense
        fallback={<input id={id} className="form-control" disabled placeholder={placeholder} />}
      >
        <Combobox
          id={id}
          label={label}
          placeholder={placeholder}
          describedBy={undefined}
          className={className}
          disabled={disabled}
          required={false}
          multiple={!single}
          minLength={0}
          autoFocus={openOnMount}
          initialOpen={openOnMount}
          selected={selected}
          resolving={false}
          itemText={(item) => item.label}
          filter={(input) => {
            const term = input.trim().toLowerCase();
            return options
              .filter(
                (o) =>
                  !term ||
                  o.label.toLowerCase().includes(term) ||
                  (o.group ?? "").toLowerCase().includes(term),
              )
              .map(itemOf);
          }}
          onSelect={(item) => {
            if (props.single) props.onChange([item.id]);
            else props.onChange((current) => [...current, item.id]);
          }}
          onRemove={(item) => {
            const keep = (list: PickerValue) => list.filter((v) => String(v) !== String(item.id));
            if (props.single) props.onChange(keep(value));
            else props.onChange(keep);
          }}
        />
      </Suspense>
      {single && clearable && value.length > 0 && (
        <button
          type="button"
          className="btn btn-xs btn-link afreact-picker-clear"
          aria-label={ts("Clear %1", { 1: label })}
          title={ts("Clear")}
          onClick={() => {
            if (props.single) props.onChange([]);
          }}
        >
          <i className="crm-i fa-times" role="img" aria-hidden="true" />
        </button>
      )}
    </>
  );
}
