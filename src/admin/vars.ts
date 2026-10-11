import type { SearchAdminSettings } from "./search/meta";

/** What AdminPage hands the builder page from core's settings factories. */
export interface AdminVars {
  searchAdmin?: SearchAdminSettings;
  /** `CRM.crmSearchTasks` (`Civi\Search\Actions::getActionSettings()`). */
  searchTasks?: { dateRanges?: { id: string; text: string }[]; [key: string]: unknown };
  afAdmin?: Record<string, unknown>;
  afGuiEditor?: Record<string, unknown>;
}

export function adminVars(): AdminVars {
  return window.CRM.vars?.afreactAdmin ?? {};
}
