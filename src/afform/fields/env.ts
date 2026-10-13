import { createContext, useContext } from "react";
import type { Values } from "../types";

/**
 * Where a field sits, for the widgets that call the server about it: the names afField
 * sends to `<Entity>.autocomplete` and `Afform.getOptions`, and the record it writes into.
 */
export interface FieldEnv {
  formName: string;
  /** The fieldset's entity, or the search display a search fieldset filters. */
  modelName: string;
  joinEntity?: string;
  /** The af-field's name, which can carry a prefix before defn.name ("address_id.country_id"). */
  fieldName: string;
  /** The record the field's value lives in (afField's dataProvider.getFieldData()). */
  values: Values;
  /** The af-entity's fixed `data`, which the checkout reads a fixed option from. */
  entityData?: Values;
  /** In a form: the entity item, and the join record inside it, that the field belongs to. */
  entityIndex?: number;
  joinIndex?: number;
  /** Set for a field that selects a record to load (input_attrs.autofill); resolves once loaded. */
  onSelect?: (id: unknown) => Promise<void>;
}

/** Names the entity item the layout is in by its item key, which a removal leaves unchanged. */
export const ItemPathContext = createContext("");

export const FieldEnvContext = createContext<FieldEnv | null>(null);

export function useFieldEnv(): FieldEnv {
  const env = useContext(FieldEnvContext);
  if (!env) throw new Error("Field rendered outside a FieldEnvContext");
  return env;
}

/** The error text of each field a blocked submit listed, by the field's control id. */
export const FieldErrorsContext = createContext<ReadonlyMap<string, string>>(new Map());

/** aria-invalid for a field's control while a blocked submit lists the field. deviation:field-error-text */
export const useInvalid = (id: string): true | undefined =>
  useContext(FieldErrorsContext).has(id) ? true : undefined;
