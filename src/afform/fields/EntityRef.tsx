import { skipToken, useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import { errorMessage } from "../../api/civi";
import { ClearButton } from "../Field";
import type { FieldDefn } from "../types";
import { Unsupported } from "../Unsupported";
import {
  autocompleteParams,
  createdId,
  entityRefProblem,
  hasQuickAdd,
  itemText,
  modelValue,
  quickAddLinks,
  resolveIds,
  searchedEntity,
  searchPage,
  valueIds,
  type AutocompleteItem,
  type SearchContext,
} from "./autocomplete";
import { useFieldEnv, useInvalid } from "./env";

/** Downshift loads with the first EntityRef on a page. */
const Combobox = lazy(async () => ({ default: (await import("./Combobox")).Combobox }));

interface EntityRefProps {
  id: string;
  defn: FieldDefn;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled: boolean;
  describedBy: string | undefined;
}

/** fields/EntityRef.html: crm-autocomplete on the field's entity, single or multiple. */
export function EntityRef({ id, defn, value, onChange, disabled, describedBy }: EntityRefProps) {
  const env = useFieldEnv();
  const [known, setKnown] = useState<ReadonlyMap<string, AutocompleteItem>>(new Map());
  const [failed, setFailed] = useState<string | null>(null);
  const target = searchedEntity(defn, env);
  const entity = "entity" in target ? target.entity : null;
  const attrs = defn.input_attrs ?? {};
  const multiple = !!attrs.multiple;
  const ids = valueIds(value);
  // A dynamic reference keeps its id when its entity changes, so a label is known per entity.
  const keyOf = (item: unknown) => `${entity ?? ""}:${String(item)}`;
  const missing = ids.filter((item) => !known.has(keyOf(item)));
  const resolved = useQuery({
    queryKey: [
      entity,
      "autocomplete",
      env.formName,
      env.modelName,
      env.joinEntity,
      env.fieldName,
      missing,
    ],
    queryFn:
      entity !== null && missing.length
        ? () => resolveIds(entity, autocompleteParams(env), missing)
        : skipToken,
  });
  const lookup = new Map(known);
  for (const item of resolved.data ?? []) lookup.set(keyOf(item.id), item);
  const selected = ids.flatMap((item) => lookup.get(keyOf(item)) ?? []);
  const notFound = resolved.isSuccess ? ids.filter((item) => !lookup.has(keyOf(item))) : [];

  const change = (next: (string | number)[]) => {
    const model = modelValue(defn, next);
    onChange(model);
    setFailed(null);
    // afField's onSelectEntity(): an autofill field loads the chosen record into the form.
    env.onSelect?.(model).catch((error: unknown) => {
      setFailed(errorMessage(error));
    });
  };
  const load = async (input: string, context: SearchContext) => {
    if (entity === null) throw new Error(`${defn.name} has no entity to search`);
    try {
      return await searchPage(entity, autocompleteParams(env), input, context);
    } catch (error) {
      throw new Error(errorMessage(error), { cause: error });
    }
  };
  const links = entity === null ? [] : quickAddLinks(defn, entity, env);
  // deviation:quick-add-links-reachable
  // $.fn.crmAutocomplete's quick-add click: the popup's submit response names the new record.
  const quickAdd = (url: string) => {
    window.CRM.loadForm(url).on("crmFormSuccess", (_event, data) => {
      const created = createdId(data);
      if (created === undefined) setFailed(ts("The form saved no record to select."));
      else change(multiple ? [...ids, created] : [created]);
    });
  };
  const problem = entityRefProblem(defn);
  const off = disabled || entity === null;
  const props = {
    id,
    label: defn.label === false ? undefined : (defn.label ?? defn.name),
    placeholder: attrs.placeholder,
    describedBy,
    className: defn.input_style ?? undefined,
    disabled: off,
    required: defn.required === true,
    invalid: useInvalid(id),
    multiple,
    // crmAutocomplete: autoOpen lists results before typing, unless quick-add links take the space.
    minLength: attrs.autoOpen && !hasQuickAdd(defn) ? 0 : 1,
    selected,
    resolving: resolved.isFetching,
    itemText,
    load,
    onSelect: (item: AutocompleteItem) => {
      setKnown((previous) => new Map(previous).set(keyOf(item.id), item));
      change(multiple ? [...ids, item.id] : [item.id]);
    },
    onRemove: (item: AutocompleteItem) => {
      change(ids.filter((other) => String(other) !== String(item.id)));
    },
  };
  const errors = [
    "error" in target ? target.error : null,
    resolved.isError ? errorMessage(resolved.error) : null,
    // deviation:missing-ids-noted
    notFound.length ? ts("No record found for %1.", { 1: notFound.join(", ") }) : null,
    links === null ? ts("The page lists no quick-add forms.") : null,
    failed,
  ].filter((error) => error !== null);
  return (
    <>
      {problem && <Unsupported what={problem} />}
      <Suspense
        fallback={
          <input id={id} className="form-control" disabled placeholder={attrs.placeholder} />
        }
      >
        <Combobox {...props} />
      </Suspense>
      {!multiple && ids.length > 0 && !off && (
        <ClearButton
          onClear={() => {
            change([]);
          }}
        />
      )}
      {/* Beside the field rather than in its dropdown, so the keyboard reaches them. */}
      {links && links.length > 0 && !off && (
        <div className="crm-entityref-links crm-entityref-quick-add">
          {links.map((link) => {
            const url = window.CRM.url(link.path);
            return (
              <a
                key={link.path}
                className="crm-hover-button"
                href={url}
                onClick={(event) => {
                  event.preventDefault();
                  quickAdd(url);
                }}
              >
                <i className={`crm-i ${link.icon}`.trim()} role="img" aria-hidden="true" />{" "}
                {link.title}
              </a>
            );
          })}
        </div>
      )}
      {errors.map((error) => (
        <span key={error} className="crm-error" role="alert">
          {error}
        </span>
      ))}
    </>
  );
}
