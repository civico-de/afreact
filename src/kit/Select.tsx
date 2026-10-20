import type { PickerOption } from "../admin/widgets/Picker";

type OptionId = PickerOption["id"];

interface SelectProps {
  id: string;
  label: string;
  /** Names the select with an sr-only label, for one that sits inside a sentence. */
  hiddenLabel?: boolean;
  /** `id`, `label` and `group` of each option; a `group` lists the option under that heading. */
  options: PickerOption[];
  /** The chosen option's id; `null` shows the placeholder. */
  value: OptionId | null;
  /** The chosen option's id as the option has it, `null` for the placeholder. */
  onChange: (value: OptionId | null) => void;
  /** A first, empty choice; without one the select always holds an option. */
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Marks the select as invalid (`aria-invalid`). */
  invalid?: boolean;
  /** The id of the text that describes the select, such as its error (`aria-describedby`). */
  describedBy?: string;
}

/** Consecutive options of one group, as optgroups take them. */
function runs(options: PickerOption[]) {
  const result: { group: string | undefined; members: PickerOption[] }[] = [];
  for (const option of options) {
    const last = result.at(-1);
    if (last && last.group === option.group) last.members.push(option);
    else result.push({ group: option.group, members: [option] });
  }
  return result;
}

/** A native select over a short fixed list, where typing to search would only be in the way. */
export function Select({
  id,
  label,
  hiddenLabel = false,
  options,
  value,
  onChange,
  placeholder,
  className = "form-control crm-auto-width",
  disabled,
  invalid,
  describedBy,
}: SelectProps) {
  const byValue = new Map(options.map((option) => [String(option.id), option.id]));
  const item = (option: PickerOption) => (
    <option key={String(option.id)} value={String(option.id)}>
      {option.label}
    </option>
  );
  return (
    <>
      <label htmlFor={id} className={hiddenLabel ? "sr-only" : undefined}>
        {label}
      </label>{" "}
      <select
        id={id}
        className={className}
        disabled={disabled}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        value={value === null ? "" : String(value)}
        onChange={(event) => {
          onChange(byValue.get(event.target.value) ?? null);
        }}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {runs(options).map(({ group, members }, index) =>
          group === undefined ? (
            members.map(item)
          ) : (
            <optgroup key={`${group} ${String(index)}`} label={group}>
              {members.map(item)}
            </optgroup>
          ),
        )}
      </select>
    </>
  );
}
