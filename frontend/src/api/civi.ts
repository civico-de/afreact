import type { Entities } from "./entities.gen";

export type ApiResult<R> = R[] & { count?: number; rowCount?: number; countMatched?: number };

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
      /** Page variables from Civi::resources()->addVars(), by extension. */
      vars?: Record<string, unknown>;
    };
  }
}

/** Untyped APIv4 call through core's AJAX endpoint (session auth + CSRF handled by CRM.api4). */
export function api4<R>(
  entity: string,
  action: string,
  params: object = {},
): Promise<ApiResult<R>> {
  return window.CRM.api4(entity, action, params) as Promise<ApiResult<R>>;
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
    typeof (error as ApiError).error_message === "string"
  );
}

export function errorMessage(error: unknown): string {
  if (isApiError(error)) return error.error_message;
  if (error instanceof Error) return error.message;
  // CRM.api4 rejects with responseJSON, which is undefined when the server sent no JSON.
  return error === undefined ? "The server sent no readable answer." : String(error);
}
