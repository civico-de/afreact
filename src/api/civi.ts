import type { AfreactVars } from "../afform/source";
import type { Entities } from "./entities.gen";

export type ApiResult<R> = R[] & { count?: number; rowCount?: number; countMatched?: number };

/** The part of a jQuery object the renderer uses. */
export interface JQueryEvents {
  on: (events: string, handler: () => void) => JQueryEvents;
  off: (events: string, handler: () => void) => JQueryEvents;
}

/** Rejection payload of CRM.api4 (see CRM/Api4/Page/AJAX.php). */
export interface ApiError {
  error_code?: string | number;
  error_message: string;
}

declare global {
  /** CiviCRM's global translator (js/Common.js); core extracts ts("…") literals from the bundle. */
  function ts(text: string, params?: Record<string | number, unknown>): string;
  interface Window {
    CRM: {
      api4: (entity: string, action: string, params?: object) => Promise<unknown>;
      url: (path: string, query?: string | Record<string, unknown>) => string;
      /** CiviCRM's jQuery; popups announce success with jQuery events only. */
      $: (target: Element) => JQueryEvents;
      /** Opens a form in a popup (js/crm.ajax.js). */
      loadForm: (url: string) => JQueryEvents;
      utils: { colorContrast: (color: string) => string };
      /** Page variables from Civi::resources()->addVars(), by extension. */
      vars?: { afreact?: AfreactVars };
    };
  }
}

/** Checks that APIv4 answered with a list; the row type is the caller's claim, as in entities.gen.ts. */
export function asRows<R>(value: unknown, call: string): ApiResult<R> {
  const isRows = (candidate: unknown): candidate is ApiResult<R> => Array.isArray(candidate);
  if (!isRows(value)) throw new Error(`${call} answered without a list of rows.`);
  return value;
}

/** Untyped APIv4 call through core's AJAX endpoint (session auth + CSRF handled by CRM.api4). */
export async function api4<R>(
  entity: string,
  action: string,
  params: object = {},
): Promise<ApiResult<R>> {
  return asRows<R>(await window.CRM.api4(entity, action, params), `${entity}.${action}`);
}

type Operator =
  | "="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "IN"
  | "NOT IN"
  | "LIKE"
  | "NOT LIKE"
  | "IS NULL"
  | "IS NOT NULL";
/** Implicit joins ("saved_search_id.name") are not in the generated types, so they stay untyped. */
type WhereField<T> = Extract<keyof T, string> | `${string}.${string}`;

export interface GetParams<T, S extends keyof T> {
  select: S[];
  where?: [WhereField<T>, Operator, unknown?][];
  orderBy?: Partial<Record<Extract<keyof T, string>, "ASC" | "DESC">>;
  limit?: number;
}

/** Typed APIv4 get: field names are checked and the row type follows `select`. */
export function get<E extends keyof Entities, S extends keyof Entities[E]>(
  entity: E,
  params: GetParams<Entities[E], S>,
): Promise<ApiResult<Pick<Entities[E], S>>> {
  return api4<Pick<Entities[E], S>>(entity, "get", params);
}

export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === "object" &&
    error !== null &&
    "error_message" in error &&
    typeof error.error_message === "string"
  );
}

export function errorMessage(error: unknown): string {
  if (isApiError(error)) return error.error_message;
  if (error instanceof Error) return error.message;
  // CRM.api4 rejects with responseJSON, which is undefined when the server sent no JSON.
  if (error === undefined) return "The server sent no readable answer.";
  return typeof error === "string" ? error : JSON.stringify(error);
}
