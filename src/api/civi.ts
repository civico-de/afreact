import type { AdminVars } from "../admin/vars";
import type { AfreactVars } from "../afform/source";
import type { Entities } from "./entities.gen";

export type ApiResult<R> = R[] & {
  count?: number;
  rowCount?: number;
  countMatched?: number;
  countFetched?: number;
  action?: string;
};

/** The part of a jQuery object the renderer uses to cooperate with CiviCRM's popups (js/crm.ajax.js). */
export interface JQueryObject {
  length: number;
  on: (events: string, handler: (event: unknown, data?: unknown) => void) => JQueryObject;
  off: (events: string, handler: (event: unknown, data?: unknown) => void) => JQueryObject;
  data: (key: string) => unknown;
  closest: (selector: string) => JQueryObject;
  trigger: (event: string, data?: unknown) => JQueryObject;
  dialog: (method: "close" | "option", key?: string, value?: unknown) => JQueryObject;
}

/** The jQuery Deferred CRM.status returns; settling it ends the status box (js/Common.js). */
export interface StatusBox {
  resolve: () => unknown;
  reject: () => unknown;
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
      url: (path: string, query?: string | Record<string, unknown>, mode?: string) => string;
      /** Whether the user holds a permission the page added (js/Common.js). */
      checkPerm: (permission: string) => boolean;
      /** CiviCRM's jQuery; popups announce success with jQuery events and keep their urlHash in data(). */
      $: (target: Element) => JQueryObject;
      /** Opens a form in a popup (js/crm.ajax.js); `post` sends data on its first load. */
      loadForm: (url: string, options?: { post?: unknown }) => JQueryObject;
      /** A notification on CiviCRM screens, a dialog elsewhere; `text` is HTML (js/Common.js). */
      alert: (
        text: string,
        title?: string,
        type?: "alert" | "success" | "info" | "error" | "warning",
      ) => unknown;
      /** Core's help popup for a `.hlp` file's entry (js/Common.js). */
      help?: (title: string, params: { id: string; file: string }) => unknown;
      /** The admin menu bar (js/crm.menubar.js); a new cacheCode makes initialize() reload it. */
      menubar?: { cacheCode: unknown; destroy: () => void; initialize: () => void };
      /** The status box in the corner (js/Common.js): a text, or a box the caller settles. */
      status: (options: string | { start?: string; success?: string; error?: string }) => StatusBox;
      utils: {
        colorContrast: (color: string) => string;
        /** A date in the site's input format, with the time when `time` is true (js/Common.js). */
        formatDate: (input: unknown, format: string | null, time: boolean) => string;
        /** Runs of other characters become `char`, cut to `len` (js/Common.js). */
        munge: (name: string, char?: string, len?: number) => string;
      };
      /** Page variables from Civi::resources()->addVars(), by extension. */
      vars?: { afreact?: AfreactVars; afreactAdmin?: AdminVars };
      /** localStorage under a "CRM" prefix, with an in-memory fallback (js/Common.js). */
      cache?: {
        get: (name: string, defaultValue?: unknown) => unknown;
        set: (name: string, value: unknown) => void;
      };
      config?: {
        cid?: number;
        lcMessages?: string;
        /** URL of civicrm-core's files, ending in a slash. */
        resourceBase?: string;
        /** CKEditor 4's configuration URL, set only where it is the site's rich text editor. */
        CKEditorCustomConfig?: string;
        /** The quick-add forms the user may open (CRM_Core_Resources::getQuickAddForms). */
        quickAdd?: { path: string; entity: string; title: string; icon?: string | null }[];
      };
      /** The site's rich text editor on a textarea (js/wysiwyg/crm.wysiwyg.js); create() resolves once it is ready. */
      wysiwyg?: {
        create: (item: Element) => { done: (callback: () => void) => unknown };
        destroy: (item: Element) => void;
        getVal: (item: Element) => string;
        setVal: (item: Element, value: string) => void;
      };
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
// deviation:api-call-per-request
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
