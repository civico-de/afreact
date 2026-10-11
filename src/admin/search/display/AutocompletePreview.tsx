import { lazy, Suspense, useId, useState } from "react";
import { itemText, searchPage, type AutocompleteItem } from "../../../afform/fields/autocomplete";
import { getEntity, type SearchInfo } from "../expr";
import { useSearchMetadata } from "../meta";
import type { Draft } from "./model";

const Combobox = lazy(async () => ({
  default: (await import("../../../afform/fields/Combobox")).Combobox,
}));

/** crmSearchDisplayAutocomplete: the entity's autocomplete with the unsaved search and display. */
export function AutocompletePreview({
  search,
  draft,
}: {
  search: SearchInfo & { name?: string };
  draft: Draft;
}) {
  const id = useId();
  const meta = useSearchMetadata();
  const [selected, setSelected] = useState<AutocompleteItem[]>([]);
  const title = meta.data ? getEntity(meta.data, search.api_entity)?.title : undefined;
  const placeholder = ts("Select %1", { 1: title ?? search.api_entity });
  const params = {
    savedSearch: {
      name: search.name,
      api_entity: search.api_entity,
      api_params: search.api_params,
    },
    display: draft,
  };
  return (
    <fieldset>
      <legend className="sr-only">{ts("Preview")}</legend>
      <label htmlFor={id} className="sr-only">
        {placeholder}
      </label>
      <Suspense fallback={<input id={id} className="form-control loading" disabled />}>
        <Combobox
          id={id}
          label={placeholder}
          placeholder={placeholder}
          describedBy={undefined}
          className={undefined}
          disabled={false}
          required={false}
          multiple={false}
          minLength={0}
          selected={selected}
          resolving={false}
          itemText={itemText}
          load={(input, context) => searchPage(search.api_entity, params, input, context)}
          onSelect={(item) => {
            setSelected([item]);
          }}
          onRemove={() => {
            setSelected([]);
          }}
        />
      </Suspense>
    </fieldset>
  );
}
