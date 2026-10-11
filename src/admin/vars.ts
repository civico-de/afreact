import type { SearchAdminSettings } from "./search/meta";

/** What AdminPage hands the builder page from core's settings factories. */
export interface AdminVars {
  searchAdmin?: SearchAdminSettings;
  /** `CRM.crmSearchTasks` (`Civi\Search\Actions::getActionSettings()`). */
  searchTasks?: { dateRanges?: { id: string; text: string }[]; [key: string]: unknown };
  /** `CRM.crmSearchDisplay` (`Civi\Search\Display::getModuleSettings()`). */
  searchDisplay?: { viewableDisplayTypes?: Record<string, string>; [key: string]: unknown };
  afAdmin?: Record<string, unknown>;
  afGuiEditor?: Record<string, unknown>;
  /** Other extensions' search builder modules, whose display editors run as islands. */
  islandModules?: string[];
  /** Core's builder partials other extensions changed (BuilderReport::partials()). */
  changedPartials?: string[];
  /** The panel elements other extensions name in the civi.afreact.assets event. */
  panels?: string[];
}

export function adminVars(): AdminVars {
  return window.CRM.vars?.afreactAdmin ?? {};
}
