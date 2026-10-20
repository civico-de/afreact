import { skipToken, useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import { errorMessage } from "../api/civi";
import { ClearButton } from "../afform/Field";
import {
  itemText,
  resolveIds,
  searchPage,
  valueIds,
  type AutocompleteItem,
  type AutocompleteParams,
  type SearchContext,
} from "../afform/fields/autocomplete";
import type { InputProps } from "./EditableCell";
import { selectPlaceholder } from "../selectPlaceholder";

/** Downshift loads with the first reference editor, as with the first EntityRef field. */
const Combobox = lazy(async () => ({
  default: (await import("../afform/fields/Combobox")).Combobox,
}));

/** entityRef.html: crm-autocomplete on the field's foreign entity, named to the server by field. */
// deviation:inplace-reference-combobox
export function EntityRefInput(props: InputProps & { params?: AutocompleteParams }) {
  const { info, multiple, value, nullable, common, onChange } = props;
  const entity = info.fk_entity ?? info.entity;
  const params = props.params ?? { fieldName: `${info.entity}.${info.value_key}` };
  const [known, setKnown] = useState<ReadonlyMap<string, AutocompleteItem>>(new Map());
  const ids = valueIds(value);
  const missing = ids.filter((id) => !known.has(String(id)));
  const resolved = useQuery({
    queryKey: [entity, "autocomplete", params, missing],
    queryFn: missing.length ? () => resolveIds(entity, params, missing) : skipToken,
  });
  const lookup = new Map(known);
  for (const item of resolved.data ?? []) lookup.set(String(item.id), item);
  const selected = ids.flatMap((id) => lookup.get(String(id)) ?? []);
  const notFound = resolved.isSuccess ? ids.filter((id) => !lookup.has(String(id))) : [];
  const load = async (input: string, context: SearchContext) => {
    try {
      return await searchPage(entity, params, input, context);
    } catch (error) {
      throw new Error(errorMessage(error), { cause: error });
    }
  };
  const errors = [
    resolved.isError ? errorMessage(resolved.error) : null,
    notFound.length ? ts("No record found for %1.", { 1: notFound.join(", ") }) : null,
  ].filter((error) => error !== null);
  return (
    <>
      <Suspense fallback={<input {...common} className="form-control loading" disabled />}>
        <Combobox
          id={common.id}
          label={undefined}
          placeholder={selectPlaceholder()}
          describedBy={common["aria-describedby"]}
          className={undefined}
          disabled={false}
          required={common.required}
          invalid={common["aria-invalid"]}
          multiple={multiple}
          minLength={1}
          selected={selected}
          resolving={resolved.isFetching}
          itemText={itemText}
          load={load}
          onSelect={(item) => {
            setKnown((previous) => new Map(previous).set(String(item.id), item));
            onChange(multiple ? [...ids, item.id] : item.id);
          }}
          onRemove={(item) => {
            const rest = ids.filter((id) => String(id) !== String(item.id));
            onChange(multiple ? rest : null);
          }}
          autoFocus={props.focusWhenLoaded}
        />
      </Suspense>
      {!multiple && nullable && ids.length > 0 && (
        <ClearButton
          onClear={() => {
            // The link leaves with the value; the focus stays in the editor, on the input.
            document.getElementById(common.id)?.focus();
            onChange(null);
          }}
        />
      )}
      {errors.map((error) => (
        <span key={error} className="crm-error" role="alert">
          {error}
        </span>
      ))}
    </>
  );
}
