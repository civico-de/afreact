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

interface PickerProps {
  id: string;
  label: string;
  placeholder: string;
  options: PickerOption[];
  value: (string | number)[];
  onChange: (value: (string | number)[]) => void;
  className?: string;
  /** One value: choosing replaces it. */
  single?: boolean;
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

const itemOf = (option: PickerOption): AutocompleteItem => ({
  id: option.id,
  label: option.label,
  icon: option.icon,
  color: option.color,
  description: option.description ? [option.description] : [],
  group: option.group,
});

/** A select over a fixed list, as crm-ui-select over local data: the runtime's combobox. */
export function Picker({
  id,
  label,
  placeholder,
  options,
  value,
  onChange,
  className,
  single = false,
  hiddenLabel = false,
  externalLabel = false,
  clearable = false,
  openOnMount = false,
  disabled = false,
}: PickerProps) {
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
            onChange(single ? [item.id] : [...value, item.id]);
          }}
          onRemove={(item) => {
            onChange(value.filter((v) => String(v) !== String(item.id)));
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
            onChange([]);
          }}
        >
          <i className="crm-i fa-times" role="img" aria-hidden="true" />
        </button>
      )}
    </>
  );
}
