import type { SearchAdminSettings } from "./search/meta";

/** What AdminPage hands the builder page from core's settings factories. */
export interface AdminVars {
  searchAdmin?: SearchAdminSettings;
  afAdmin?: Record<string, unknown>;
  afGuiEditor?: Record<string, unknown>;
}

export function adminVars(): AdminVars {
  return window.CRM.vars?.afreactAdmin ?? {};
}
