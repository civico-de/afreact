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
  /** `CRM.crmMonaco` (CRM_Utils_Monaco::getSettings()): where Monaco's AMD modules are served. */
  monaco?: { paths: { vs: string } };
  /** CRM_Afform_ArrayHtml's attribute types, for the FormBuilder editor's new elements. */
  attributeTypes?: Record<string, Record<string, string>>;
  /** Other extensions' modules for core's classic builder (ForeignModules::of()), loaded on the page. */
  foreignModules?: string[];
  /** Core's builder partials other extensions changed (BuilderReport::partials()). */
  changedPartials?: string[];
  /** The panel elements other extensions name in the civi.afreact.assets event. */
  panels?: string[];
}

export function adminVars(): AdminVars {
  return window.CRM.vars?.afreactAdmin ?? {};
}
