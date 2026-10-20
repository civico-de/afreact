import { createContext, useContext } from "react";
import { adminVars } from "../vars";

/** An entry of the relative_date_filters option group: its value and label. */
export interface DateRange {
  id: string;
  text: string;
}

/** The date ranges for pages without the builder's `CRM.vars.afreactAdmin.searchTasks`. */
export const DateRanges = createContext<DateRange[] | null>(null);

export function useDateRanges(): DateRange[] {
  return useContext(DateRanges) ?? adminVars().searchTasks?.dateRanges ?? [];
}
